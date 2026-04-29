import {
  CreateSecretCommand,
  DeleteSecretCommand,
  DescribeSecretCommand,
  GetSecretValueCommand,
  ListSecretsCommand,
  type Tag,
  TagResourceCommand,
  UntagResourceCommand,
  UpdateSecretCommand,
} from "@aws-sdk/client-secrets-manager"
import { ServiceError } from "../../errors"
import { secretsManager } from "../../infrastructure/floci-clients"

export interface SecretTag {
  key: string
  value: string
}

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
  tags: SecretTag[]
}

export interface CreateSecretInput {
  name: string
  secretString: string
  description?: string
  kmsKeyId?: string
  tags?: SecretTag[]
}

export interface UpdateSecretInput {
  secretString: string
  description?: string
  kmsKeyId?: string
  tags?: SecretTag[]
}

function normalizeName(name: string): string {
  const normalized = name.trim()
  if (!normalized) {
    throw new ServiceError("InvalidInput", "Secret name is required")
  }
  return normalized
}

function normalizeDescription(
  value: string | undefined,
  { allowBlank }: { allowBlank: boolean },
): string | undefined {
  if (value === undefined) {
    return allowBlank ? "" : undefined
  }

  const normalized = value.trim()
  if (!normalized) {
    return allowBlank ? "" : undefined
  }

  return normalized
}

function normalizeKmsKeyId(value: string | undefined): string | undefined {
  const normalized = value?.trim()
  return normalized || undefined
}

function normalizeTags(tags: SecretTag[] | undefined): SecretTag[] {
  const map = new Map<string, string>()

  for (const tag of tags ?? []) {
    const key = tag.key.trim()
    if (!key) continue
    map.set(key, tag.value.trim())
  }

  return [...map.entries()].map(([key, value]) => ({ key, value }))
}

function toAwsTags(tags: SecretTag[]): Tag[] | undefined {
  if (tags.length === 0) return undefined
  return tags.map((tag) => ({ Key: tag.key, Value: tag.value }))
}

function toTagMap(tags: SecretTag[]): Map<string, string> {
  return new Map(tags.map((tag) => [tag.key, tag.value]))
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

  throw new ServiceError(
    "OperationFailed",
    error instanceof Error ? error.message : String(error),
    error,
  )
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

  return secrets.sort((left, right) => left.name.localeCompare(right.name))
}

async function describeSecret(
  name: string,
): Promise<SecretSummary & { tags: SecretTag[] }> {
  const normalizedName = normalizeName(name)

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
      tags: (result.Tags ?? [])
        .map((tag) => ({
          key: tag.Key ?? "",
          value: tag.Value ?? "",
        }))
        .filter((tag) => tag.key)
        .sort((left, right) => left.key.localeCompare(right.key)),
    }
  } catch (error) {
    toSecretError(error, normalizedName)
  }
}

async function syncSecretTags(
  name: string,
  nextTags: SecretTag[],
): Promise<void> {
  const normalizedName = normalizeName(name)
  const currentTags = (await describeSecret(normalizedName)).tags
  const current = toTagMap(currentTags)
  const next = toTagMap(nextTags)

  const removeKeys = [...current.keys()].filter((key) => !next.has(key))
  const upsertTags = [...next.entries()]
    .filter(([key, value]) => current.get(key) !== value)
    .map(([key, value]) => ({ Key: key, Value: value }))

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
  const normalizedName = normalizeName(name)

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
  const name = normalizeName(input.name)
  const description = normalizeDescription(input.description, {
    allowBlank: false,
  })
  const kmsKeyId = normalizeKmsKeyId(input.kmsKeyId)
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
  const normalizedName = normalizeName(name)
  const description = normalizeDescription(input.description, {
    allowBlank: true,
  })
  const kmsKeyId = normalizeKmsKeyId(input.kmsKeyId)
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
    await syncSecretTags(normalizedName, tags)
  } catch (error) {
    toSecretError(error, normalizedName)
  }
}

export async function deleteSecret(name: string): Promise<void> {
  const normalizedName = normalizeName(name)

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
