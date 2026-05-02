import { posix as path } from "node:path"
import {
  DeleteObjectsCommand,
  HeadObjectCommand,
  type HeadObjectCommandOutput,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3"
import mime from "mime-types"
import { ServiceError } from "../../errors"
import { s3 } from "../../infrastructure/floci-clients"

export const PREVIEW_TEXT_LIMIT = 50 * 1024

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

export async function runOps(
  ops: { label: string; promise: Promise<unknown> }[],
): Promise<string[]> {
  const results = await Promise.allSettled(ops.map((op) => op.promise))
  return ops
    .map((op, i) => {
      const result = results[i]
      return result?.status === "rejected"
        ? `${op.label}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`
        : null
    })
    .filter((warning): warning is string => warning !== null)
}

export function isTextContentType(contentType: string): boolean {
  if (!contentType) return false
  if (contentType.startsWith("text/")) return true
  if (contentType === "application/json") return true
  if (contentType.startsWith("application/json;")) return true
  return false
}

export function isImageContentType(contentType: string): boolean {
  return contentType.startsWith("image/")
}

export function isPdfContentType(contentType: string): boolean {
  return (
    sanitizeContentType(contentType).split(";")[0].trimEnd() ===
    "application/pdf"
  )
}

export function sanitizeContentType(contentType: string | undefined): string {
  return (contentType ?? "application/octet-stream").trim().toLowerCase()
}

export function normalizePrefix(prefix: string): string {
  const trimmed = prefix.trim().replace(/^\/+/, "")
  if (!trimmed) return ""
  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`
}

export function normalizeObjectKey(key: string): string {
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

export function normalizeFolderPrefix(
  prefix: string,
  fieldName = "Folder prefix",
): string {
  const normalized = normalizePrefix(prefix)
  if (!normalized) {
    throw new ServiceError("InvalidInput", `${fieldName} is required`)
  }
  return normalized
}

export function normalizeFolderKey(prefix: string, folderName: string): string {
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

export function objectKeyFromPrefix(prefix: string, name: string): string {
  const normalizedPrefix = normalizePrefix(prefix)
  return `${normalizedPrefix}${name}`
}

export function directChildRemainder(
  key: string,
  prefix: string,
): string | null {
  if (!key || (prefix && !key.startsWith(prefix))) return null
  const remainder = prefix ? key.slice(prefix.length) : key
  if (!remainder) return null
  return remainder
}

export function folderPrefixFromKey(
  key: string,
  prefix: string,
): string | null {
  const remainder = directChildRemainder(key, prefix)
  if (!remainder) return null
  const slashIndex = remainder.indexOf("/")
  if (slashIndex === -1) return null
  return `${prefix}${remainder.slice(0, slashIndex + 1)}`
}

function hasFileExtension(filename: string): boolean {
  return path.extname(filename).length > 0
}

export function inferredFilename(key: string, contentType: string): string {
  const filename = path.basename(key) || key
  if (!filename || hasFileExtension(filename)) return filename

  const extension = mime.extension(sanitizeContentType(contentType))
  return extension ? `${filename}.${extension}` : filename
}

export function uniqueNonEmpty(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

export function isNotFoundError(error: unknown): boolean {
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

export function copySource(bucket: string, key: string): string {
  return `${bucket}/${encodeURIComponent(key).replace(/%2F/g, "/")}`
}

export async function getHeadObject(
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

export async function objectExists(
  bucket: string,
  key: string,
): Promise<boolean> {
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

export async function listKeysForPrefix(
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

export async function deleteKeysInBatches(
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
