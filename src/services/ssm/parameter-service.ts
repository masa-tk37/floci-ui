import {
  AddTagsToResourceCommand,
  DeleteParameterCommand,
  DescribeParametersCommand,
  GetParameterCommand,
  ListTagsForResourceCommand,
  type ParameterMetadata,
  PutParameterCommand,
  RemoveTagsFromResourceCommand,
} from "@aws-sdk/client-ssm"
import { ServiceError, toOperationFailed } from "../../errors"
import { ssm } from "../../infrastructure/floci-clients"
import {
  diffTags,
  fromAwsTags,
  normalizeDescription,
  normalizeTags,
  optionalTrimmed,
  type ResourceTag,
  requireTrimmed,
  toAwsTags,
} from "../resource-tags"

export type ParameterType = "String" | "StringList" | "SecureString"
export type ParameterTier = "Standard" | "Advanced" | "Intelligent-Tiering"

export interface ParameterSummary {
  name: string
  type: ParameterType
  tier: ParameterTier
  description: string
  keyId: string
  lastModifiedDate?: Date
}

export interface ParameterDetail extends ParameterSummary {
  value: string
  version: number
  arn: string
  dataType: string
  tags: ResourceTag[]
}

export interface CreateParameterInput {
  name: string
  type: ParameterType
  value: string
  description?: string
  tier?: string
  keyId?: string
  tags?: ResourceTag[]
}

export interface UpdateParameterInput {
  type: ParameterType
  value: string
  description?: string
  tier?: string
  keyId?: string
  tags?: ResourceTag[]
}

function normalizeTier(value: string | undefined): ParameterTier | undefined {
  const normalized = value?.trim()
  if (!normalized) return undefined

  if (
    normalized === "Standard" ||
    normalized === "Advanced" ||
    normalized === "Intelligent-Tiering"
  ) {
    return normalized
  }

  throw new ServiceError("InvalidInput", `Unsupported parameter tier: ${value}`)
}

function mapMetadata(metadata: ParameterMetadata): ParameterSummary {
  return {
    name: metadata.Name ?? "",
    type: (metadata.Type as ParameterType | undefined) ?? "String",
    tier: (metadata.Tier as ParameterTier | undefined) ?? "Standard",
    description: metadata.Description ?? "",
    keyId: metadata.KeyId ?? "",
    lastModifiedDate: metadata.LastModifiedDate,
  }
}

function toParameterError(error: unknown, name?: string): never {
  if (error instanceof ServiceError) throw error

  if (error instanceof Error) {
    // Tag APIs report a missing parameter as InvalidResourceId.
    if (
      error.name === "ParameterNotFound" ||
      error.name === "InvalidResourceId"
    ) {
      throw new ServiceError(
        "NotFound",
        `Parameter ${name ?? ""} not found`,
        error,
      )
    }

    if (error.name === "ParameterAlreadyExists") {
      throw new ServiceError(
        "AlreadyExists",
        `Parameter ${name ?? ""} already exists`,
        error,
      )
    }

    if (
      error.name === "ValidationException" ||
      error.name === "ValidationError"
    ) {
      throw new ServiceError("InvalidInput", error.message, error)
    }
  }

  toOperationFailed(error)
}

async function getParameterMetadata(
  normalizedName: string,
): Promise<ParameterSummary> {
  try {
    const result = await ssm.send(
      new DescribeParametersCommand({
        ParameterFilters: [
          { Key: "Name", Option: "Equals", Values: [normalizedName] },
        ],
        MaxResults: 1,
      }),
    )

    const metadata = (result.Parameters ?? []).find(
      (parameter) => parameter.Name === normalizedName,
    )

    if (!metadata) {
      throw new ServiceError(
        "NotFound",
        `Parameter ${normalizedName} not found`,
      )
    }

    return mapMetadata(metadata)
  } catch (error) {
    toParameterError(error, normalizedName)
  }
}

async function listParameterTags(
  normalizedName: string,
): Promise<ResourceTag[]> {
  try {
    const result = await ssm.send(
      new ListTagsForResourceCommand({
        ResourceType: "Parameter",
        ResourceId: normalizedName,
      }),
    )

    return fromAwsTags(result.TagList).sort((left, right) =>
      left.key.localeCompare(right.key),
    )
  } catch (error) {
    toParameterError(error, normalizedName)
  }
}

async function syncParameterTags(
  normalizedName: string,
  nextTags: ResourceTag[],
): Promise<void> {
  const currentTags = await listParameterTags(normalizedName)
  const { removeKeys, upsertTags } = diffTags(currentTags, nextTags)

  // Sequential: SSM rejects concurrent updates to one parameter with TooManyUpdates.
  try {
    if (removeKeys.length > 0) {
      await ssm.send(
        new RemoveTagsFromResourceCommand({
          ResourceType: "Parameter",
          ResourceId: normalizedName,
          TagKeys: removeKeys,
        }),
      )
    }

    if (upsertTags.length > 0) {
      await ssm.send(
        new AddTagsToResourceCommand({
          ResourceType: "Parameter",
          ResourceId: normalizedName,
          Tags: upsertTags,
        }),
      )
    }
  } catch (error) {
    toParameterError(error, normalizedName)
  }
}

export async function listParameters(): Promise<ParameterSummary[]> {
  try {
    const parameters: ParameterSummary[] = []
    let nextToken: string | undefined

    do {
      const result = await ssm.send(
        new DescribeParametersCommand({
          MaxResults: 50,
          NextToken: nextToken,
        }),
      )

      for (const parameter of result.Parameters ?? []) {
        parameters.push(mapMetadata(parameter))
      }

      nextToken = result.NextToken
    } while (nextToken)

    return parameters.sort((left, right) => left.name.localeCompare(right.name))
  } catch (error) {
    toParameterError(error)
  }
}

export async function getParameterDetail(
  name: string,
): Promise<ParameterDetail> {
  const normalizedName = requireTrimmed(name, "Parameter name")

  try {
    const [metadata, parameter, tags] = await Promise.all([
      getParameterMetadata(normalizedName),
      ssm.send(
        new GetParameterCommand({
          Name: normalizedName,
          WithDecryption: true,
        }),
      ),
      listParameterTags(normalizedName),
    ])

    const current = parameter.Parameter
    if (!current) {
      throw new ServiceError(
        "NotFound",
        `Parameter ${normalizedName} not found`,
      )
    }

    return {
      ...metadata,
      value: current.Value ?? "",
      version: current.Version ?? 0,
      arn: current.ARN ?? "",
      dataType: current.DataType ?? "text",
      tags,
    }
  } catch (error) {
    toParameterError(error, normalizedName)
  }
}

export async function createParameter(
  input: CreateParameterInput,
): Promise<void> {
  const name = requireTrimmed(input.name, "Parameter name")
  const type = input.type
  const description = normalizeDescription(input.description, {
    allowBlank: false,
  })
  const tier = normalizeTier(input.tier)
  const keyId =
    type === "SecureString" ? optionalTrimmed(input.keyId) : undefined
  const tags = normalizeTags(input.tags)

  try {
    await ssm.send(
      new PutParameterCommand({
        Name: name,
        Type: type,
        Value: input.value,
        Description: description,
        Tier: tier,
        KeyId: keyId,
        Tags: toAwsTags(tags),
      }),
    )
  } catch (error) {
    toParameterError(error, name)
  }
}

export async function updateParameter(
  name: string,
  input: UpdateParameterInput,
): Promise<void> {
  const normalizedName = requireTrimmed(name, "Parameter name")
  const description = normalizeDescription(input.description, {
    allowBlank: true,
  })
  const tier = normalizeTier(input.tier)
  const keyId =
    input.type === "SecureString" ? optionalTrimmed(input.keyId) : undefined
  const tags = normalizeTags(input.tags)

  try {
    await ssm.send(
      new PutParameterCommand({
        Name: normalizedName,
        Type: input.type,
        Value: input.value,
        Description: description,
        Tier: tier,
        KeyId: keyId,
        Overwrite: true,
      }),
    )
  } catch (error) {
    toParameterError(error, normalizedName)
  }

  try {
    await syncParameterTags(normalizedName, tags)
  } catch (tagError) {
    if (!(tagError instanceof ServiceError)) throw tagError
    throw new ServiceError(
      tagError.code,
      `Parameter value was saved, but tags were not updated: ${tagError.message}`,
      tagError,
      tagError.awsCode,
    )
  }
}

export async function deleteParameter(name: string): Promise<void> {
  const normalizedName = requireTrimmed(name, "Parameter name")

  try {
    await ssm.send(new DeleteParameterCommand({ Name: normalizedName }))
  } catch (error) {
    toParameterError(error, normalizedName)
  }
}
