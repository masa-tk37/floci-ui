import {
  ListBucketsCommand,
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteBucketCorsCommand,
  DeleteBucketEncryptionCommand,
  DeleteBucketLifecycleCommand,
  ListObjectsV2Command,
  GetObjectCommand,
  HeadObjectCommand,
  type HeadObjectCommandOutput,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  CopyObjectCommand,
  PutObjectCommand,
  PutBucketVersioningCommand,
  PutBucketEncryptionCommand,
  PutBucketTaggingCommand,
  PutPublicAccessBlockCommand,
  PutBucketOwnershipControlsCommand,
  PutBucketCorsCommand,
  PutBucketLifecycleConfigurationCommand,
  GetBucketVersioningCommand,
  GetBucketEncryptionCommand,
  GetBucketTaggingCommand,
  GetPublicAccessBlockCommand,
  GetBucketOwnershipControlsCommand,
  GetBucketCorsCommand,
  GetBucketLifecycleConfigurationCommand,
} from "@aws-sdk/client-s3"
import mime from "mime-types"
import { posix as path } from "node:path"
import { s3 } from "../../infrastructure/floci-clients"
import { ServiceError } from "../../errors"
import type { S3SettingsInitial } from "../../views/s3/settings-form-state"

const PREVIEW_TEXT_LIMIT = 50 * 1024

export interface BucketSummary {
  name: string
}

export interface ObjectSummary {
  key: string
  size: number
  lastModified: Date | undefined
}

export interface FolderSummary {
  prefix: string
}

export interface ObjectListResult {
  objects: ObjectSummary[]
  folders: FolderSummary[]
}

export interface DownloadResult {
  stream: ReadableStream
  contentType: string
  filename: string
}

export interface PreviewResult {
  contentType: string
  mode: "text" | "image" | "pdf" | "binary"
  text?: string
  truncated?: boolean
}

export interface UpdateSettingsResult {
  warnings: string[]
}

export interface ObjectDetailsResult {
  key: string
  contentType: string
  size: number
  lastModified: Date | undefined
  eTag: string | undefined
  metadata: Record<string, string>
}

export interface UploadObjectsResult {
  uploadedCount: number
  errors: { name: string; message: string }[]
}

export interface DeleteSelectedObjectsResult {
  deletedCount: number
  errors: { target: string; message: string }[]
}

export interface RenameFolderResult {
  copiedCount: number
  deletedCount: number
  errors: { target: string; message: string }[]
  prefix: string
}

export interface UpdateObjectPropertiesInput {
  contentType: string
}

export interface BucketSettingsInput {
  versioning?: string
  encryption?: { type: string; kmsKeyId?: string } | null
  ownership?: string
  publicAccessBlock?: {
    blockPublicAcls: boolean
    ignorePublicAcls: boolean
    blockPublicPolicy: boolean
    restrictPublicBuckets: boolean
  }
  tags?: { key: string; value: string }[]
  corsRules?: {
    allowedMethods: string[]
    allowedOrigins: string[]
    allowedHeaders: string[]
    maxAge: number
  }[]
  lifecycleRules?: { id: string; prefix: string; expirationDays: number }[]
}

export type CreateBucketOptions = Pick<
  BucketSettingsInput,
  "versioning" | "encryption" | "ownership" | "publicAccessBlock" | "tags"
>

async function runOps(
  ops: { label: string; promise: Promise<unknown> }[],
): Promise<string[]> {
  const results = await Promise.allSettled(ops.map((op) => op.promise))
  return ops
    .map((op, i) => {
      const r = results[i]
      return r.status === "rejected"
        ? `${op.label}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`
        : null
    })
    .filter(Boolean) as string[]
}

function isTextContentType(contentType: string): boolean {
  if (!contentType) return false
  if (contentType.startsWith("text/")) return true
  if (contentType === "application/json") return true
  if (contentType.startsWith("application/json;")) return true
  return false
}

function isImageContentType(contentType: string): boolean {
  return contentType.startsWith("image/")
}

function isPdfContentType(contentType: string): boolean {
  return (
    sanitizeContentType(contentType).split(";")[0].trimEnd() ===
    "application/pdf"
  )
}

function sanitizeContentType(contentType: string | undefined): string {
  return (contentType ?? "application/octet-stream").trim().toLowerCase()
}

function normalizePrefix(prefix: string): string {
  const trimmed = prefix.trim().replace(/^\/+/, "")
  if (!trimmed) return ""
  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`
}

function normalizeObjectKey(key: string): string {
  const normalized = key.trim().replace(/^\/+/, "")
  if (!normalized) {
    throw new ServiceError("InvalidInput", "Object key is required")
  }
  if (normalized.endsWith("/")) {
    throw new ServiceError(
      "InvalidInput",
      "Object key must not end with a slash",
    )
  }
  return normalized
}

function normalizeFolderPrefix(
  prefix: string,
  fieldName = "Folder prefix",
): string {
  const normalized = normalizePrefix(prefix)
  if (!normalized) {
    throw new ServiceError("InvalidInput", `${fieldName} is required`)
  }
  return normalized
}

function normalizeFolderKey(prefix: string, folderName: string): string {
  const normalizedPrefix = normalizePrefix(prefix)
  let normalizedName = folderName.trim().replace(/^\/+/, "")

  if (normalizedPrefix && normalizedName.startsWith(normalizedPrefix)) {
    normalizedName = normalizedName.slice(normalizedPrefix.length)
  }

  normalizedName = normalizedName.replace(/\/+$/, "")

  if (!normalizedName) {
    throw new ServiceError("InvalidInput", "Folder name is required")
  }

  return `${normalizedPrefix}${normalizedName}/`
}

function objectKeyFromPrefix(prefix: string, name: string): string {
  const normalizedPrefix = normalizePrefix(prefix)
  return `${normalizedPrefix}${name}`
}

function directChildRemainder(key: string, prefix: string): string | null {
  if (!key || (prefix && !key.startsWith(prefix))) return null
  const remainder = prefix ? key.slice(prefix.length) : key
  if (!remainder) return null
  return remainder
}

function folderPrefixFromKey(key: string, prefix: string): string | null {
  const remainder = directChildRemainder(key, prefix)
  if (!remainder) return null
  const slashIndex = remainder.indexOf("/")
  if (slashIndex === -1) return null
  return `${prefix}${remainder.slice(0, slashIndex + 1)}`
}

function hasFileExtension(filename: string): boolean {
  return path.extname(filename).length > 0
}

function inferredFilename(key: string, contentType: string): string {
  const filename = path.basename(key) || key
  if (!filename || hasFileExtension(filename)) return filename

  const extension = mime.extension(sanitizeContentType(contentType))
  return extension ? `${filename}.${extension}` : filename
}

function uniqueNonEmpty(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

function isNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const statusCode = (error as { $metadata?: { httpStatusCode?: number } })
    .$metadata?.httpStatusCode
  return (
    error.name === "NotFound" ||
    error.name === "NoSuchKey" ||
    error.name === "NotFoundException" ||
    statusCode === 404
  )
}

function copySource(bucket: string, key: string): string {
  return `${bucket}/${encodeURIComponent(key).replace(/%2F/g, "/")}`
}

async function getHeadObject(
  bucket: string,
  key: string,
): Promise<HeadObjectCommandOutput> {
  try {
    return await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
  } catch (error: unknown) {
    if (isNotFoundError(error)) {
      throw new ServiceError(
        "NotFound",
        `Object ${key} not found in bucket ${bucket}`,
        error,
      )
    }
    throw new ServiceError(
      "OperationFailed",
      error instanceof Error ? error.message : String(error),
      error,
    )
  }
}

async function objectExists(bucket: string, key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
    return true
  } catch (error: unknown) {
    if (isNotFoundError(error)) {
      return false
    }
    throw new ServiceError(
      "OperationFailed",
      error instanceof Error ? error.message : String(error),
      error,
    )
  }
}

async function listKeysForPrefix(
  bucket: string,
  prefix: string,
): Promise<string[]> {
  const normalizedPrefix = normalizePrefix(prefix)
  if (!normalizedPrefix) {
    throw new ServiceError("InvalidInput", "Folder prefix is required")
  }

  const keys: string[] = []
  let continuationToken: string | undefined

  do {
    const result = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: normalizedPrefix,
        ContinuationToken: continuationToken,
      }),
    )

    for (const object of result.Contents ?? []) {
      if (object.Key) keys.push(object.Key)
    }

    continuationToken = result.NextContinuationToken
  } while (continuationToken)

  return keys
}

async function deleteKeysInBatches(
  bucket: string,
  keys: string[],
): Promise<DeleteSelectedObjectsResult> {
  if (keys.length === 0) {
    return { deletedCount: 0, errors: [] }
  }

  let deletedCount = 0
  const errors: { target: string; message: string }[] = []

  for (let index = 0; index < keys.length; index += 1000) {
    const chunk = keys.slice(index, index + 1000)

    try {
      const result = await s3.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: {
            Objects: chunk.map((key) => ({ Key: key })),
            Quiet: false,
          },
        }),
      )

      const deletedKeys = (result.Deleted ?? [])
        .map((item) => item.Key)
        .filter((key): key is string => Boolean(key))
      const chunkErrors = (result.Errors ?? []).map((item) => ({
        target: item.Key ?? "unknown",
        message: item.Message ?? item.Code ?? "Delete failed",
      }))

      deletedCount +=
        deletedKeys.length > 0
          ? deletedKeys.length
          : Math.max(chunk.length - chunkErrors.length, 0)
      errors.push(...chunkErrors)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      errors.push(...chunk.map((key) => ({ target: key, message })))
    }
  }

  return { deletedCount, errors }
}

export async function listBuckets(): Promise<BucketSummary[]> {
  const { Buckets } = await s3.send(new ListBucketsCommand({}))
  return (Buckets ?? []).map((b) => ({ name: b.Name ?? "" }))
}

export async function createBucket(
  name: string,
  options: CreateBucketOptions,
): Promise<{ warnings: string[] }> {
  try {
    await s3.send(new CreateBucketCommand({ Bucket: name }))
  } catch (e: unknown) {
    throw new ServiceError(
      "OperationFailed",
      e instanceof Error ? e.message : String(e),
      e,
    )
  }

  const ops: { label: string; promise: Promise<unknown> }[] = []

  if (options.versioning && options.versioning !== "Suspended") {
    ops.push({
      label: "Versioning",
      promise: s3.send(
        new PutBucketVersioningCommand({
          Bucket: name,
          VersioningConfiguration: {
            Status: options.versioning as "Enabled" | "Suspended",
          },
        }),
      ),
    })
  }

  if (options.encryption && options.encryption.type !== "none") {
    ops.push({
      label: "Encryption",
      promise: s3.send(
        new PutBucketEncryptionCommand({
          Bucket: name,
          ServerSideEncryptionConfiguration: {
            Rules: [
              {
                ApplyServerSideEncryptionByDefault: {
                  SSEAlgorithm: options.encryption.type as "AES256" | "aws:kms",
                  KMSMasterKeyID:
                    options.encryption.type === "aws:kms" &&
                    options.encryption.kmsKeyId
                      ? options.encryption.kmsKeyId
                      : undefined,
                },
              },
            ],
          },
        }),
      ),
    })
  }

  if (options.ownership) {
    ops.push({
      label: "Ownership",
      promise: s3.send(
        new PutBucketOwnershipControlsCommand({
          Bucket: name,
          OwnershipControls: {
            Rules: [
              {
                ObjectOwnership: options.ownership as
                  | "BucketOwnerEnforced"
                  | "BucketOwnerPreferred"
                  | "ObjectWriter",
              },
            ],
          },
        }),
      ),
    })
  }

  if (options.publicAccessBlock) {
    ops.push({
      label: "PublicAccessBlock",
      promise: s3.send(
        new PutPublicAccessBlockCommand({
          Bucket: name,
          PublicAccessBlockConfiguration: {
            BlockPublicAcls: options.publicAccessBlock.blockPublicAcls,
            IgnorePublicAcls: options.publicAccessBlock.ignorePublicAcls,
            BlockPublicPolicy: options.publicAccessBlock.blockPublicPolicy,
            RestrictPublicBuckets:
              options.publicAccessBlock.restrictPublicBuckets,
          },
        }),
      ),
    })
  }

  if (options.tags && options.tags.length > 0) {
    ops.push({
      label: "Tagging",
      promise: s3.send(
        new PutBucketTaggingCommand({
          Bucket: name,
          Tagging: {
            TagSet: options.tags.map((t) => ({ Key: t.key, Value: t.value })),
          },
        }),
      ),
    })
  }

  return { warnings: await runOps(ops) }
}

export async function deleteBucket(name: string): Promise<void> {
  try {
    await s3.send(new DeleteBucketCommand({ Bucket: name }))
  } catch (e: unknown) {
    if (e instanceof Error && e.name === "NoSuchBucket") {
      throw new ServiceError("NotFound", `Bucket ${name} not found`, e)
    }
    throw new ServiceError(
      "OperationFailed",
      e instanceof Error ? e.message : String(e),
      e,
    )
  }
}

export async function getBucketSettings(
  bucket: string,
): Promise<S3SettingsInitial> {
  const [
    versioningResult,
    encryptionResult,
    taggingResult,
    pabResult,
    ownershipResult,
    corsResult,
    lifecycleResult,
  ] = await Promise.all([
    s3
      .send(new GetBucketVersioningCommand({ Bucket: bucket }))
      .catch(() => ({})),
    s3
      .send(new GetBucketEncryptionCommand({ Bucket: bucket }))
      .catch(() => ({ ServerSideEncryptionConfiguration: null })),
    s3
      .send(new GetBucketTaggingCommand({ Bucket: bucket }))
      .catch(() => ({ TagSet: [] })),
    s3
      .send(new GetPublicAccessBlockCommand({ Bucket: bucket }))
      .catch(() => ({ PublicAccessBlockConfiguration: null })),
    s3
      .send(new GetBucketOwnershipControlsCommand({ Bucket: bucket }))
      .catch(() => ({ OwnershipControls: null })),
    s3
      .send(new GetBucketCorsCommand({ Bucket: bucket }))
      .catch(() => ({ CORSRules: [] })),
    s3
      .send(new GetBucketLifecycleConfigurationCommand({ Bucket: bucket }))
      .catch(() => ({ Rules: [] })),
  ])

  const encryptionRule = (encryptionResult as any)
    .ServerSideEncryptionConfiguration?.Rules?.[0]
    ?.ApplyServerSideEncryptionByDefault
  const pab = (pabResult as any).PublicAccessBlockConfiguration ?? {}
  const ownershipRule = (ownershipResult as any).OwnershipControls?.Rules?.[0]

  return {
    bucket,
    versioning: (versioningResult as any).Status ?? "Suspended",
    encryption: encryptionRule?.SSEAlgorithm ?? "none",
    kmsKeyId: encryptionRule?.KMSMasterKeyID ?? "",
    ownership: ownershipRule?.ObjectOwnership ?? "BucketOwnerEnforced",
    blockPublicAcls: pab.BlockPublicAcls ?? false,
    ignorePublicAcls: pab.IgnorePublicAcls ?? false,
    blockPublicPolicy: pab.BlockPublicPolicy ?? false,
    restrictPublicBuckets: pab.RestrictPublicBuckets ?? false,
    tags: ((taggingResult as any).TagSet ?? []).map(
      (t: { Key: string; Value: string }) => ({ key: t.Key, value: t.Value }),
    ),
    corsRules: ((corsResult as any).CORSRules ?? []).map((r: any) => ({
      allowedMethods: (r.AllowedMethods ?? []).join(", "),
      allowedOrigins: (r.AllowedOrigins ?? []).join(", "),
      allowedHeaders: (r.AllowedHeaders ?? []).join(", "),
      maxAge: r.MaxAgeSeconds ?? 0,
    })),
    lifecycleRules: ((lifecycleResult as any).Rules ?? [])
      .filter((r: any) => r.Status === "Enabled")
      .map((r: any) => ({
        id: r.ID ?? "",
        prefix: r.Filter?.Prefix ?? r.Prefix ?? "",
        expirationDays: r.Expiration?.Days ?? 30,
      })),
  }
}

export async function updateBucketSettings(
  bucket: string,
  settings: BucketSettingsInput,
): Promise<UpdateSettingsResult> {
  const ops: { label: string; promise: Promise<unknown> }[] = []

  ops.push({
    label: "Versioning",
    promise: s3.send(
      new PutBucketVersioningCommand({
        Bucket: bucket,
        VersioningConfiguration: {
          Status:
            (settings.versioning as "Enabled" | "Suspended") ?? "Suspended",
        },
      }),
    ),
  })

  if (settings.encryption && settings.encryption.type !== "none") {
    ops.push({
      label: "Encryption",
      promise: s3.send(
        new PutBucketEncryptionCommand({
          Bucket: bucket,
          ServerSideEncryptionConfiguration: {
            Rules: [
              {
                ApplyServerSideEncryptionByDefault: {
                  SSEAlgorithm: settings.encryption.type as
                    | "AES256"
                    | "aws:kms",
                  KMSMasterKeyID:
                    settings.encryption.type === "aws:kms" &&
                    settings.encryption.kmsKeyId
                      ? settings.encryption.kmsKeyId
                      : undefined,
                },
              },
            ],
          },
        }),
      ),
    })
  } else if (settings.encryption === null) {
    ops.push({
      label: "Encryption",
      promise: s3.send(
        new DeleteBucketEncryptionCommand({
          Bucket: bucket,
        }),
      ),
    })
  }

  if (settings.ownership) {
    ops.push({
      label: "Ownership",
      promise: s3.send(
        new PutBucketOwnershipControlsCommand({
          Bucket: bucket,
          OwnershipControls: {
            Rules: [
              {
                ObjectOwnership: settings.ownership as
                  | "BucketOwnerEnforced"
                  | "BucketOwnerPreferred"
                  | "ObjectWriter",
              },
            ],
          },
        }),
      ),
    })
  }

  if (settings.publicAccessBlock) {
    ops.push({
      label: "PublicAccessBlock",
      promise: s3.send(
        new PutPublicAccessBlockCommand({
          Bucket: bucket,
          PublicAccessBlockConfiguration: {
            BlockPublicAcls: settings.publicAccessBlock.blockPublicAcls,
            IgnorePublicAcls: settings.publicAccessBlock.ignorePublicAcls,
            BlockPublicPolicy: settings.publicAccessBlock.blockPublicPolicy,
            RestrictPublicBuckets:
              settings.publicAccessBlock.restrictPublicBuckets,
          },
        }),
      ),
    })
  }

  if (settings.tags !== undefined) {
    ops.push({
      label: "Tagging",
      promise: s3.send(
        new PutBucketTaggingCommand({
          Bucket: bucket,
          Tagging: {
            TagSet: (settings.tags ?? []).map((t) => ({
              Key: t.key,
              Value: t.value,
            })),
          },
        }),
      ),
    })
  }

  if (settings.corsRules !== undefined) {
    if (settings.corsRules.length > 0) {
      ops.push({
        label: "CORS",
        promise: s3.send(
          new PutBucketCorsCommand({
            Bucket: bucket,
            CORSConfiguration: {
              CORSRules: settings.corsRules.map((r) => ({
                AllowedMethods: r.allowedMethods as (
                  | "GET"
                  | "PUT"
                  | "POST"
                  | "DELETE"
                  | "HEAD"
                )[],
                AllowedOrigins: r.allowedOrigins,
                AllowedHeaders:
                  r.allowedHeaders.length > 0 ? r.allowedHeaders : undefined,
                MaxAgeSeconds: r.maxAge || undefined,
              })),
            },
          }),
        ),
      })
    } else {
      ops.push({
        label: "CORS",
        promise: s3.send(
          new DeleteBucketCorsCommand({
            Bucket: bucket,
          }),
        ),
      })
    }
  }

  if (settings.lifecycleRules !== undefined) {
    if (settings.lifecycleRules.length > 0) {
      ops.push({
        label: "Lifecycle",
        promise: s3.send(
          new PutBucketLifecycleConfigurationCommand({
            Bucket: bucket,
            LifecycleConfiguration: {
              Rules: settings.lifecycleRules.map((r) => ({
                ID: r.id,
                Status: "Enabled",
                Filter: r.prefix ? { Prefix: r.prefix } : { Prefix: "" },
                Expiration: { Days: r.expirationDays },
              })),
            },
          }),
        ),
      })
    } else {
      ops.push({
        label: "Lifecycle",
        promise: s3.send(
          new DeleteBucketLifecycleCommand({
            Bucket: bucket,
          }),
        ),
      })
    }
  }

  return { warnings: await runOps(ops) }
}

export async function listObjects(
  bucket: string,
  prefix: string,
): Promise<ObjectListResult> {
  const { Contents, CommonPrefixes } = await s3.send(
    new ListObjectsV2Command({
      Bucket: bucket,
      Delimiter: "/",
      Prefix: prefix,
    }),
  )

  const folderSet = new Set(
    (CommonPrefixes ?? [])
      .map((item) => item.Prefix ?? "")
      .filter((folderPrefix) => folderPrefix && folderPrefix !== prefix),
  )

  for (const object of Contents ?? []) {
    const key = object.Key ?? ""
    const folderPrefix = folderPrefixFromKey(key, prefix)
    if (folderPrefix && folderPrefix !== prefix) {
      folderSet.add(folderPrefix)
    }
  }

  return {
    objects: (Contents ?? [])
      .filter((object) => {
        const key = object.Key ?? ""
        const remainder = directChildRemainder(key, prefix)
        return Boolean(remainder && !remainder.includes("/"))
      })
      .map((object) => ({
        key: object.Key ?? "",
        size: object.Size ?? 0,
        lastModified: object.LastModified,
      })),
    folders: [...folderSet].map((folderPrefix) => ({
      prefix: folderPrefix,
    })),
  }
}

export async function getObjectForDownload(
  bucket: string,
  key: string,
): Promise<DownloadResult> {
  const result = await s3.send(
    new GetObjectCommand({ Bucket: bucket, Key: key }),
  )
  if (!result.Body) {
    throw new ServiceError(
      "NotFound",
      `Object ${key} not found in bucket ${bucket}`,
    )
  }
  const stream = result.Body.transformToWebStream()
  const contentType = sanitizeContentType(result.ContentType)
  return {
    stream,
    contentType,
    filename: inferredFilename(key, contentType),
  }
}

export async function getObjectPreview(
  bucket: string,
  key: string,
): Promise<PreviewResult> {
  const head = await getHeadObject(bucket, key)
  const contentType = sanitizeContentType(head.ContentType)

  if (isImageContentType(contentType)) {
    return { contentType, mode: "image" }
  }

  if (isPdfContentType(contentType)) {
    return { contentType, mode: "pdf" }
  }

  if (!isTextContentType(contentType)) {
    return { contentType, mode: "binary" }
  }

  const result = await s3.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      Range: `bytes=0-${PREVIEW_TEXT_LIMIT}`,
    }),
  )
  if (!result.Body) {
    throw new ServiceError(
      "NotFound",
      `Object ${key} not found in bucket ${bucket}`,
    )
  }
  const text = await result.Body.transformToString()
  const truncated = result.ContentRange !== undefined
  return { contentType, mode: "text", text, truncated }
}

export async function deleteObject(bucket: string, key: string): Promise<void> {
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
  } catch (e: unknown) {
    throw new ServiceError(
      "OperationFailed",
      e instanceof Error ? e.message : String(e),
      e,
    )
  }
}

export async function createFolderObject(
  bucket: string,
  prefix: string,
  folderName: string,
): Promise<{ key: string }> {
  const key = normalizeFolderKey(prefix, folderName)

  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: "",
        ContentType: "application/x-directory",
      }),
    )
  } catch (error: unknown) {
    throw new ServiceError(
      "OperationFailed",
      error instanceof Error ? error.message : String(error),
      error,
    )
  }

  return { key }
}

export async function getObjectDetails(
  bucket: string,
  key: string,
): Promise<ObjectDetailsResult> {
  const normalizedKey = normalizeObjectKey(key)
  const head = await getHeadObject(bucket, normalizedKey)

  return {
    key: normalizedKey,
    contentType: sanitizeContentType(head.ContentType),
    size: head.ContentLength ?? 0,
    lastModified: head.LastModified,
    eTag: head.ETag,
    metadata: head.Metadata ?? {},
  }
}

export async function renameObject(
  bucket: string,
  fromKey: string,
  toKey: string,
): Promise<{ key: string }> {
  const normalizedFromKey = normalizeObjectKey(fromKey)
  const normalizedToKey = normalizeObjectKey(toKey)

  if (normalizedFromKey === normalizedToKey) {
    throw new ServiceError(
      "InvalidInput",
      "New object key must be different from the current key",
    )
  }

  await getHeadObject(bucket, normalizedFromKey)

  if (await objectExists(bucket, normalizedToKey)) {
    throw new ServiceError(
      "AlreadyExists",
      `Object ${normalizedToKey} already exists in bucket ${bucket}`,
    )
  }

  try {
    await s3.send(
      new CopyObjectCommand({
        Bucket: bucket,
        Key: normalizedToKey,
        CopySource: copySource(bucket, normalizedFromKey),
      }),
    )
  } catch (error: unknown) {
    throw new ServiceError(
      "OperationFailed",
      error instanceof Error ? error.message : String(error),
      error,
    )
  }

  try {
    await s3.send(
      new DeleteObjectCommand({ Bucket: bucket, Key: normalizedFromKey }),
    )
  } catch (deleteError: unknown) {
    // Rollback: remove the copy to avoid leaving objects at both keys
    try {
      await s3.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: normalizedToKey }),
      )
    } catch {
      // Rollback failed; object exists at both keys — caller should retry
    }
    throw new ServiceError(
      "OperationFailed",
      deleteError instanceof Error ? deleteError.message : String(deleteError),
      deleteError,
    )
  }

  return { key: normalizedToKey }
}

export async function renameFolder(
  bucket: string,
  fromPrefix: string,
  toPrefix: string,
): Promise<RenameFolderResult> {
  const normalizedFromPrefix = normalizeFolderPrefix(
    fromPrefix,
    "Source prefix",
  )
  const normalizedToPrefix = normalizeFolderPrefix(toPrefix, "Target prefix")

  if (normalizedFromPrefix === normalizedToPrefix) {
    throw new ServiceError(
      "InvalidInput",
      "New folder prefix must be different from the current prefix",
    )
  }

  if (normalizedToPrefix.startsWith(normalizedFromPrefix)) {
    throw new ServiceError(
      "InvalidInput",
      "Cannot rename a folder into one of its descendants",
    )
  }

  const sourceKeys = await listKeysForPrefix(bucket, normalizedFromPrefix)
  if (sourceKeys.length === 0) {
    throw new ServiceError(
      "NotFound",
      `Folder ${normalizedFromPrefix} not found in bucket ${bucket}`,
    )
  }

  const sourceKeySet = new Set(sourceKeys)
  const renamePairs = sourceKeys.map((sourceKey) => ({
    from: sourceKey,
    to: `${normalizedToPrefix}${sourceKey.slice(normalizedFromPrefix.length)}`,
  }))

  for (const pair of renamePairs) {
    if (sourceKeySet.has(pair.to)) {
      throw new ServiceError(
        "AlreadyExists",
        `Object ${pair.to} already exists in bucket ${bucket}`,
      )
    }
  }

  const existenceResults = await Promise.all(
    renamePairs.map(async (pair) => ({
      pair,
      exists: await objectExists(bucket, pair.to),
    })),
  )
  const conflict = existenceResults.find((r) => r.exists)
  if (conflict) {
    throw new ServiceError(
      "AlreadyExists",
      `Object ${conflict.pair.to} already exists in bucket ${bucket}`,
    )
  }

  const copyResults = await Promise.allSettled(
    renamePairs.map(async (pair) => {
      await s3.send(
        new CopyObjectCommand({
          Bucket: bucket,
          Key: pair.to,
          CopySource: copySource(bucket, pair.from),
        }),
      )
      return pair
    }),
  )

  const copyErrors = copyResults.flatMap((result, index) =>
    result.status === "rejected"
      ? [
          {
            target: renamePairs[index]?.from ?? `object-${index + 1}`,
            message:
              result.reason instanceof Error
                ? result.reason.message
                : String(result.reason),
          },
        ]
      : [],
  )

  if (copyErrors.length > 0) {
    const copiedTargets = copyResults
      .filter(
        (
          result,
        ): result is PromiseFulfilledResult<{ from: string; to: string }> =>
          result.status === "fulfilled",
      )
      .map((result) => result.value.to)
    if (copiedTargets.length > 0) {
      await deleteKeysInBatches(bucket, copiedTargets)
    }
    return {
      copiedCount: 0,
      deletedCount: 0,
      errors: copyErrors,
      prefix: normalizedToPrefix,
    }
  }

  const deleteResult = await deleteKeysInBatches(bucket, sourceKeys)
  return {
    copiedCount: renamePairs.length,
    deletedCount: deleteResult.deletedCount,
    errors: deleteResult.errors,
    prefix: normalizedToPrefix,
  }
}

export async function updateObjectProperties(
  bucket: string,
  key: string,
  input: UpdateObjectPropertiesInput,
): Promise<ObjectDetailsResult> {
  const normalizedKey = normalizeObjectKey(key)
  const requestedContentType = input.contentType.trim()

  if (!requestedContentType) {
    throw new ServiceError("InvalidInput", "Content-Type is required")
  }

  const normalizedContentType = sanitizeContentType(requestedContentType)

  const head = await getHeadObject(bucket, normalizedKey)

  try {
    await s3.send(
      new CopyObjectCommand({
        Bucket: bucket,
        Key: normalizedKey,
        CopySource: copySource(bucket, normalizedKey),
        MetadataDirective: "REPLACE",
        ContentType: normalizedContentType,
        CacheControl: head.CacheControl,
        ContentDisposition: head.ContentDisposition,
        ContentEncoding: head.ContentEncoding,
        ContentLanguage: head.ContentLanguage,
        Expires: head.Expires,
        Metadata: head.Metadata,
      }),
    )
  } catch (error: unknown) {
    throw new ServiceError(
      "OperationFailed",
      error instanceof Error ? error.message : String(error),
      error,
    )
  }

  const updatedHead = await getHeadObject(bucket, normalizedKey)

  return {
    key: normalizedKey,
    contentType: normalizedContentType,
    size: updatedHead.ContentLength ?? 0,
    lastModified: updatedHead.LastModified,
    eTag: updatedHead.ETag,
    metadata: updatedHead.Metadata ?? {},
  }
}

export async function uploadObjects(
  bucket: string,
  prefix: string,
  files: File[],
): Promise<UploadObjectsResult> {
  if (files.length === 0) {
    throw new ServiceError("InvalidInput", "At least one file is required")
  }

  const normalizedPrefix = normalizePrefix(prefix)
  const results = await Promise.allSettled(
    files.map(async (file) => {
      const buffer = new Uint8Array(await file.arrayBuffer())
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: objectKeyFromPrefix(normalizedPrefix, file.name),
          Body: buffer,
          ContentType: file.type || "application/octet-stream",
        }),
      )
    }),
  )

  return {
    uploadedCount: results.filter((result) => result.status === "fulfilled")
      .length,
    errors: results.flatMap((result, index) =>
      result.status === "rejected"
        ? [
            {
              name: files[index]?.name ?? `file-${index + 1}`,
              message:
                result.reason instanceof Error
                  ? result.reason.message
                  : String(result.reason),
            },
          ]
        : [],
    ),
  }
}

export async function deleteSelectedObjects(
  bucket: string,
  input: { files?: string[]; folders?: string[] },
): Promise<DeleteSelectedObjectsResult> {
  const fileKeys = uniqueNonEmpty(input.files ?? [])
  const folderPrefixes = uniqueNonEmpty(input.folders ?? [])

  if (fileKeys.length === 0 && folderPrefixes.length === 0) {
    throw new ServiceError("InvalidInput", "No objects selected for deletion")
  }

  const keysToDelete = new Set(fileKeys)
  const errors: { target: string; message: string }[] = []

  const listResults = await Promise.allSettled(
    folderPrefixes.map((folderPrefix) =>
      listKeysForPrefix(bucket, folderPrefix),
    ),
  )
  for (const [i, result] of listResults.entries()) {
    if (result.status === "fulfilled") {
      for (const key of result.value) {
        keysToDelete.add(key)
      }
    } else {
      errors.push({
        target: folderPrefixes[i]!,
        message:
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason),
      })
    }
  }

  const deleteResult = await deleteKeysInBatches(bucket, [...keysToDelete])
  return {
    deletedCount: deleteResult.deletedCount,
    errors: [...errors, ...deleteResult.errors],
  }
}
