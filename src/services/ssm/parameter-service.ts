import {
  AddTagsToResourceCommand,
  DeleteParameterCommand,
  DescribeParametersCommand,
  GetParameterCommand,
  ListTagsForResourceCommand,
  PutParameterCommand,
  RemoveTagsFromResourceCommand,
  type ParameterMetadata,
  type Tag,
} from "@aws-sdk/client-ssm"
import { ServiceError } from "../../errors"
import { ssm } from "../../infrastructure/floci-clients"

export type ParameterType = "String" | "StringList" | "SecureString"
export type ParameterTier = "Standard" | "Advanced" | "Intelligent-Tiering"

export interface ParameterTag {
  key: string
  value: string
}

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
  tags: ParameterTag[]
}

export interface CreateParameterInput {
  name: string
  type: ParameterType
  value: string
  description?: string
  tier?: string
  keyId?: string
  tags?: ParameterTag[]
}

export interface UpdateParameterInput {
  type: ParameterType
  value: string
  description?: string
  tier?: string
  keyId?: string
  tags?: ParameterTag[]
}

function normalizeName(name: string): string {
  const normalized = name.trim()
  if (!normalized) {
    throw new ServiceError("InvalidInput", "Parameter name is required")
  }
  return normalized
}

function normalizeDescription(
  value: string | undefined,
  { allowBlank }: { allowBlank: boolean },
): string | undefined {
  const normalized = value?.trim() ?? ""
  if (!normalized) return allowBlank ? "" : undefined
  return normalized
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

function normalizeKeyId(value: string | undefined): string | undefined {
  const normalized = value?.trim()
  return normalized || undefined
}

function normalizeTags(tags: ParameterTag[] | undefined): ParameterTag[] {
  const map = new Map<string, string>()

  for (const tag of tags ?? []) {
    const key = tag.key.trim()
    if (!key) continue
    map.set(key, tag.value.trim())
  }

  return [...map.entries()].map(([key, value]) => ({ key, value }))
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

function toAwsTags(tags: ParameterTag[]): Tag[] | undefined {
  if (tags.length === 0) return undefined
  return tags.map((tag) => ({ Key: tag.key, Value: tag.value }))
}

function toTagMap(tags: ParameterTag[]): Map<string, string> {
  return new Map(tags.map((tag) => [tag.key, tag.value]))
}

function toParameterError(error: unknown, name?: string): never {
  if (error instanceof ServiceError) throw error

  if (error instanceof Error) {
    if (error.name === "ParameterNotFound") {
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

  throw new ServiceError(
    "OperationFailed",
    error instanceof Error ? error.message : String(error),
    error,
  )
}

async function listParameterMetadata(): Promise<ParameterSummary[]> {
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
}

async function getParameterMetadata(name: string): Promise<ParameterSummary> {
  const normalizedName = normalizeName(name)

  try {
    const result = await ssm.send(
      new DescribeParametersCommand({
        ParameterFilters: [{ Key: "Name", Values: [normalizedName] }],
        MaxResults: 10,
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

async function listParameterTags(name: string): Promise<ParameterTag[]> {
  const normalizedName = normalizeName(name)

  try {
    const result = await ssm.send(
      new ListTagsForResourceCommand({
        ResourceType: "Parameter",
        ResourceId: normalizedName,
      }),
    )

    return (result.TagList ?? [])
      .map((tag) => ({
        key: tag.Key ?? "",
        value: tag.Value ?? "",
      }))
      .filter((tag) => tag.key)
      .sort((left, right) => left.key.localeCompare(right.key))
  } catch (error) {
    if (error instanceof Error && error.name === "ParameterNotFound") {
      throw new ServiceError(
        "NotFound",
        `Parameter ${normalizedName} not found`,
      )
    }

    return []
  }
}

async function syncParameterTags(
  name: string,
  nextTags: ParameterTag[],
): Promise<void> {
  const normalizedName = normalizeName(name)
  const currentTags = await listParameterTags(normalizedName)
  const current = toTagMap(currentTags)
  const next = toTagMap(nextTags)

  const removeKeys = [...current.keys()].filter((key) => !next.has(key))
  const upsertTags = [...next.entries()]
    .filter(([key, value]) => current.get(key) !== value)
    .map(([key, value]) => ({ Key: key, Value: value }))

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
    return await listParameterMetadata()
  } catch (error) {
    toParameterError(error)
  }
}

export async function getParameterDetail(
  name: string,
): Promise<ParameterDetail> {
  const normalizedName = normalizeName(name)

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
  const name = normalizeName(input.name)
  const type = input.type
  const description = normalizeDescription(input.description, {
    allowBlank: false,
  })
  const tier = normalizeTier(input.tier)
  const keyId =
    type === "SecureString" ? normalizeKeyId(input.keyId) : undefined
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
  const normalizedName = normalizeName(name)
  const description = normalizeDescription(input.description, {
    allowBlank: true,
  })
  const tier = normalizeTier(input.tier)
  const keyId =
    input.type === "SecureString" ? normalizeKeyId(input.keyId) : undefined
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
    await syncParameterTags(normalizedName, tags)
  } catch (error) {
    toParameterError(error, normalizedName)
  }
}

export async function deleteParameter(name: string): Promise<void> {
  const normalizedName = normalizeName(name)

  try {
    await ssm.send(new DeleteParameterCommand({ Name: normalizedName }))
  } catch (error) {
    toParameterError(error, normalizedName)
  }
}
