import {
  CreateSecretCommand,
  DeleteSecretCommand,
  DescribeSecretCommand,
  GetSecretValueCommand,
  ListSecretsCommand,
  TagResourceCommand,
  UntagResourceCommand,
  UpdateSecretCommand,
} from "@aws-sdk/client-secrets-manager"
import { ServiceError, toOperationFailed } from "../../errors"
import { secretsManager } from "../../infrastructure/floci-clients"
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

export interface SecretSummary {
  name: string
  arn: string
  description: string
  kmsKeyId: string
  lastChangedDate?: Date
}

export interface SecretDetail extends SecretSummary {
  secretString: string
  isBinary: boolean
  versionId: string
  versionStages: string[]
  createdDate?: Date
  tags: ResourceTag[]
}

export interface CreateSecretInput {
  name: string
  secretString: string
  description?: string
  kmsKeyId?: string
  tags?: ResourceTag[]
}

export interface UpdateSecretInput {
  secretString: string
  description?: string
  kmsKeyId?: string
  tags?: ResourceTag[]
}

function toSecretError(error: unknown, name?: string): never {
  if (error instanceof ServiceError) throw error

  if (error instanceof Error) {
    if (error.name === "ResourceNotFoundException") {
      throw new ServiceError(
        "NotFound",
        `Secret ${name ?? ""} not found`,
        error,
      )
    }

    if (error.name === "ResourceExistsException") {
      throw new ServiceError(
        "AlreadyExists",
        `Secret ${name ?? ""} already exists`,
        error,
      )
    }

    if (
      error.name === "ValidationException" ||
      error.name === "InvalidRequestException"
    ) {
      throw new ServiceError("InvalidInput", error.message, error)
    }
  }

  toOperationFailed(error)
}

async function listSecretSummaries(): Promise<SecretSummary[]> {
  const secrets: SecretSummary[] = []
  let nextToken: string | undefined

  do {
    const result = await secretsManager.send(
      new ListSecretsCommand({
        MaxResults: 100,
        NextToken: nextToken,
      }),
    )

    for (const secret of result.SecretList ?? []) {
      secrets.push({
        name: secret.Name ?? "",
        arn: secret.ARN ?? "",
        description: secret.Description ?? "",
        kmsKeyId: secret.KmsKeyId ?? "",
        lastChangedDate: secret.LastChangedDate,
      })
    }

    nextToken = result.NextToken
  } while (nextToken)

  secrets.sort((left, right) => left.name.localeCompare(right.name))

  return secrets
}

async function describeSecret(
  name: string,
): Promise<SecretSummary & { tags: ResourceTag[] }> {
  const normalizedName = requireTrimmed(name, "Secret name")

  try {
    const result = await secretsManager.send(
      new DescribeSecretCommand({
        SecretId: normalizedName,
      }),
    )

    return {
      name: result.Name ?? normalizedName,
      arn: result.ARN ?? "",
      description: result.Description ?? "",
      kmsKeyId: result.KmsKeyId ?? "",
      lastChangedDate: result.LastChangedDate,
      tags: fromAwsTags(result.Tags).sort((left, right) =>
        left.key.localeCompare(right.key),
      ),
    }
  } catch (error) {
    toSecretError(error, normalizedName)
  }
}

async function syncSecretTags(
  name: string,
  nextTags: ResourceTag[],
): Promise<void> {
  const normalizedName = requireTrimmed(name, "Secret name")
  const currentTags = (await describeSecret(normalizedName)).tags
  const { removeKeys, upsertTags } = diffTags(currentTags, nextTags)

  try {
    if (removeKeys.length > 0) {
      await secretsManager.send(
        new UntagResourceCommand({
          SecretId: normalizedName,
          TagKeys: removeKeys,
        }),
      )
    }

    if (upsertTags.length > 0) {
      await secretsManager.send(
        new TagResourceCommand({
          SecretId: normalizedName,
          Tags: upsertTags,
        }),
      )
    }
  } catch (error) {
    toSecretError(error, normalizedName)
  }
}

export async function listSecrets(): Promise<SecretSummary[]> {
  try {
    return await listSecretSummaries()
  } catch (error) {
    toSecretError(error)
  }
}

export async function getSecretDetail(name: string): Promise<SecretDetail> {
  const normalizedName = requireTrimmed(name, "Secret name")

  try {
    const [metadata, valueResult] = await Promise.all([
      describeSecret(normalizedName),
      secretsManager.send(
        new GetSecretValueCommand({
          SecretId: normalizedName,
        }),
      ),
    ])

    return {
      ...metadata,
      secretString: valueResult.SecretString ?? "",
      isBinary: valueResult.SecretBinary !== undefined,
      versionId: valueResult.VersionId ?? "",
      versionStages: valueResult.VersionStages ?? [],
      createdDate: valueResult.CreatedDate,
      tags: metadata.tags,
    }
  } catch (error) {
    toSecretError(error, normalizedName)
  }
}

export async function createSecret(input: CreateSecretInput): Promise<void> {
  const name = requireTrimmed(input.name, "Secret name")
  const description = normalizeDescription(input.description, {
    allowBlank: false,
  })
  const kmsKeyId = optionalTrimmed(input.kmsKeyId)
  const tags = normalizeTags(input.tags)

  try {
    await secretsManager.send(
      new CreateSecretCommand({
        Name: name,
        SecretString: input.secretString,
        Description: description,
        KmsKeyId: kmsKeyId,
        Tags: toAwsTags(tags),
      }),
    )
  } catch (error) {
    toSecretError(error, name)
  }
}

export async function updateSecret(
  name: string,
  input: UpdateSecretInput,
): Promise<void> {
  const normalizedName = requireTrimmed(name, "Secret name")
  const description = normalizeDescription(input.description, {
    allowBlank: true,
  })
  const kmsKeyId = optionalTrimmed(input.kmsKeyId)
  const tags = normalizeTags(input.tags)

  try {
    await secretsManager.send(
      new UpdateSecretCommand({
        SecretId: normalizedName,
        SecretString: input.secretString,
        Description: description,
        KmsKeyId: kmsKeyId,
      }),
    )
  } catch (error) {
    toSecretError(error, normalizedName)
  }

  try {
    await syncSecretTags(normalizedName, tags)
  } catch (error) {
    console.warn(`[Secrets] Tag sync failed for ${normalizedName}:`, error)
  }
}

export async function deleteSecret(name: string): Promise<void> {
  const normalizedName = requireTrimmed(name, "Secret name")

  try {
    await secretsManager.send(
      new DeleteSecretCommand({
        SecretId: normalizedName,
        ForceDeleteWithoutRecovery: true,
      }),
    )
  } catch (error) {
    toSecretError(error, normalizedName)
  }
}
