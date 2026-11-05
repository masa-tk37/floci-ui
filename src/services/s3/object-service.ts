import {
  type _Object,
  type CommonPrefix,
  CopyObjectCommand,
  type DeleteMarkerEntry,
  DeleteObjectCommand,
  GetBucketVersioningCommand,
  GetObjectCommand,
  type GetObjectCommandOutput,
  GetObjectTaggingCommand,
  ListObjectsV2Command,
  type ListObjectsV2CommandOutput,
  ListObjectVersionsCommand,
  type ObjectVersion,
  PutObjectCommand,
  PutObjectTaggingCommand,
} from "@aws-sdk/client-s3"
import { ServiceError, toOperationFailed } from "../../errors"
import { s3 } from "../../infrastructure/floci-clients"
import { fromAwsTags, normalizeTags, toAwsTags } from "../resource-tags"
import { normalizePrefix } from "./prefix"
import type {
  DeleteSelectedObjectsResult,
  DownloadResult,
  ObjectDetailsResult,
  ObjectListResult,
  ObjectTagsResult,
  ObjectVersionSummary,
  PreviewResult,
  RenameFolderResult,
  UpdateObjectPropertiesInput,
  UpdateObjectTagsInput,
  UploadObjectsResult,
  VersionListResult,
} from "./shared"
import {
  copySource,
  deleteKeysInBatches,
  directChildRemainder,
  errorMessageOf,
  folderPrefixFromKey,
  getHeadObject,
  inferredFilename,
  isImageContentType,
  isNotFoundError,
  isPdfContentType,
  isTextContentType,
  listKeysForPrefix,
  normalizeFolderKey,
  normalizeFolderPrefix,
  normalizeObjectKey,
  objectExists,
  objectKeyFromPrefix,
  PREVIEW_TEXT_LIMIT,
  sanitizeContentType,
  uniqueNonEmpty,
} from "./shared"

const OBJECT_PAGE_SIZE = 100
const RENAME_COPY_CONCURRENCY = 16

function rethrowNotFound(error: unknown, message: string): never {
  if (isNotFoundError(error)) {
    throw new ServiceError("NotFound", message, error)
  }
  toOperationFailed(error)
}

async function settleWithLimit<T, R>(
  items: T[],
  limit: number,
  run: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const index = next++
      try {
        results[index] = {
          status: "fulfilled",
          value: await run(items[index] as T),
        }
      } catch (reason: unknown) {
        results[index] = { status: "rejected", reason }
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  )
  return results
}

function charsetOf(contentType: string | undefined): string {
  const match = /;\s*charset\s*=\s*"?([^";\s]+)"?/i.exec(contentType ?? "")
  return match?.[1] ?? "utf-8"
}

function decodePreviewText(
  bytes: Uint8Array,
  charset: string,
  truncated: boolean,
): string {
  let decoder: TextDecoder
  try {
    decoder = new TextDecoder(charset)
  } catch {
    decoder = new TextDecoder("utf-8")
  }
  // stream: true holds back a trailing multibyte sequence cut by the range limit.
  return decoder.decode(bytes, { stream: truncated })
}

export async function listObjects(
  bucket: string,
  prefix: string,
  cursor?: string,
): Promise<ObjectListResult> {
  let result: ListObjectsV2CommandOutput
  try {
    result = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Delimiter: "/",
        Prefix: prefix,
        MaxKeys: OBJECT_PAGE_SIZE,
        ContinuationToken: cursor,
      }),
    )
  } catch (error: unknown) {
    rethrowNotFound(error, `Bucket ${bucket} not found`)
  }

  const contents = result.Contents ?? []
  const commonPrefixes = result.CommonPrefixes ?? []

  const folderSet = new Set(
    commonPrefixes
      .map((item) => item.Prefix ?? "")
      .filter((folderPrefix) => folderPrefix && folderPrefix !== prefix),
  )

  for (const object of contents) {
    const key = object.Key ?? ""
    const folderPrefix = folderPrefixFromKey(key, prefix)
    if (folderPrefix && folderPrefix !== prefix) {
      folderSet.add(folderPrefix)
    }
  }

  return {
    objects: contents
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
    folders: [...folderSet].map((folderPrefix) => ({ prefix: folderPrefix })),
    nextCursor: result.NextContinuationToken,
  }
}

export async function getBucketVersioningEnabled(
  bucket: string,
): Promise<boolean> {
  try {
    const result = await s3.send(
      new GetBucketVersioningCommand({ Bucket: bucket }),
    )
    // Suspended buckets still hold earlier versions.
    return result.Status === "Enabled" || result.Status === "Suspended"
  } catch (error: unknown) {
    if (!isNotFoundError(error)) {
      console.warn(`[S3] GetBucketVersioning failed for ${bucket}:`, error)
    }
    return false
  }
}

export async function listObjectVersions(
  bucket: string,
  prefix: string,
): Promise<VersionListResult> {
  const allVersions: ObjectVersion[] = []
  const allDeleteMarkers: DeleteMarkerEntry[] = []
  let keyMarker: string | undefined
  let versionIdMarker: string | undefined
  let isTruncated: boolean

  do {
    const result = await s3.send(
      new ListObjectVersionsCommand({
        Bucket: bucket,
        Prefix: prefix || undefined,
        KeyMarker: keyMarker,
        VersionIdMarker: versionIdMarker,
      }),
    )
    allVersions.push(...(result.Versions ?? []))
    allDeleteMarkers.push(...(result.DeleteMarkers ?? []))
    isTruncated = result.IsTruncated ?? false
    keyMarker = isTruncated ? result.NextKeyMarker : undefined
    versionIdMarker = isTruncated ? result.NextVersionIdMarker : undefined
  } while (isTruncated)

  const versions: ObjectVersionSummary[] = [
    ...allVersions.map((v) => ({
      key: v.Key ?? "",
      versionId: v.VersionId,
      size: v.Size ?? 0,
      lastModified: v.LastModified,
      isLatest: v.IsLatest ?? false,
      isDeleteMarker: false,
      eTag: v.ETag,
    })),
    ...allDeleteMarkers.map((d) => ({
      key: d.Key ?? "",
      versionId: d.VersionId,
      size: 0,
      lastModified: d.LastModified,
      isLatest: d.IsLatest ?? false,
      isDeleteMarker: true,
      eTag: undefined,
    })),
  ]
  versions.sort((a, b) => {
    if (a.key !== b.key) return a.key.localeCompare(b.key)
    return (b.lastModified?.getTime() ?? 0) - (a.lastModified?.getTime() ?? 0)
  })

  return { versions }
}

export async function getObjectForDownload(
  bucket: string,
  key: string,
  versionId?: string,
): Promise<DownloadResult> {
  let result: GetObjectCommandOutput
  try {
    result = await s3.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        VersionId: versionId || undefined,
      }),
    )
  } catch (error: unknown) {
    rethrowNotFound(error, `Object ${key} not found in bucket ${bucket}`)
  }
  if (!result.Body) {
    throw new ServiceError(
      "NotFound",
      `Object ${key} not found in bucket ${bucket}`,
    )
  }

  const contentType = sanitizeContentType(result.ContentType)
  return {
    stream: result.Body.transformToWebStream(),
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

  const size = head.ContentLength ?? 0
  // A Range request on an empty object fails with InvalidRange.
  if (size === 0) {
    return { contentType, mode: "text", text: "", truncated: false }
  }

  let result: GetObjectCommandOutput
  try {
    result = await s3.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        Range: `bytes=0-${PREVIEW_TEXT_LIMIT - 1}`,
      }),
    )
  } catch (error: unknown) {
    rethrowNotFound(error, `Object ${key} not found in bucket ${bucket}`)
  }
  if (!result.Body) {
    throw new ServiceError(
      "NotFound",
      `Object ${key} not found in bucket ${bucket}`,
    )
  }

  const truncated = size > PREVIEW_TEXT_LIMIT
  const bytes = await result.Body.transformToByteArray()
  return {
    contentType,
    mode: "text",
    text: decodePreviewText(bytes, charsetOf(head.ContentType), truncated),
    truncated,
  }
}

export async function deleteObject(
  bucket: string,
  key: string,
  versionId?: string,
): Promise<void> {
  try {
    await s3.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
        VersionId: versionId || undefined,
      }),
    )
  } catch (error: unknown) {
    toOperationFailed(error)
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
    toOperationFailed(error)
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

  const [, toExists] = await Promise.all([
    getHeadObject(bucket, normalizedFromKey),
    objectExists(bucket, normalizedToKey),
  ])

  if (toExists) {
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
    toOperationFailed(error)
  }

  try {
    await s3.send(
      new DeleteObjectCommand({ Bucket: bucket, Key: normalizedFromKey }),
    )
  } catch (deleteError: unknown) {
    try {
      await s3.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: normalizedToKey }),
      )
    } catch {
      // Rollback failed; object exists at both keys and must be cleaned up manually.
    }

    toOperationFailed(deleteError)
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

  const [sourceKeys, targetKeys] = await Promise.all([
    listKeysForPrefix(bucket, normalizedFromPrefix),
    listKeysForPrefix(bucket, normalizedToPrefix),
  ])
  if (sourceKeys.length === 0) {
    throw new ServiceError(
      "NotFound",
      `Folder ${normalizedFromPrefix} not found in bucket ${bucket}`,
    )
  }

  const renamePairs = sourceKeys.map((sourceKey) => ({
    from: sourceKey,
    to: `${normalizedToPrefix}${sourceKey.slice(normalizedFromPrefix.length)}`,
  }))

  const targetKeySet = new Set(targetKeys)
  const conflict = renamePairs.find((pair) => targetKeySet.has(pair.to))
  if (conflict) {
    throw new ServiceError(
      "AlreadyExists",
      `Object ${conflict.to} already exists in bucket ${bucket}`,
    )
  }

  const copyResults = await settleWithLimit(
    renamePairs,
    RENAME_COPY_CONCURRENCY,
    async (pair) => {
      await s3.send(
        new CopyObjectCommand({
          Bucket: bucket,
          Key: pair.to,
          CopySource: copySource(bucket, pair.from),
        }),
      )
      return pair
    },
  )

  const copyErrors = copyResults.flatMap((result, index) =>
    result.status === "rejected"
      ? [
          {
            target: renamePairs[index]?.from ?? `object-${index + 1}`,
            message: errorMessageOf(result.reason),
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
    const rollback = await deleteKeysInBatches(bucket, copiedTargets)
    return {
      copiedCount: 0,
      deletedCount: 0,
      errors: [...copyErrors, ...rollback.errors],
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

/** Media type and parameter names are case-insensitive; parameter values (e.g. boundary) are not. */
function lowercaseMediaType(contentType: string): string {
  const separator = contentType.indexOf(";")
  if (separator === -1) return contentType.toLowerCase()
  return (
    contentType.slice(0, separator).toLowerCase() + contentType.slice(separator)
  )
}

export async function updateObjectProperties(
  bucket: string,
  key: string,
  input: UpdateObjectPropertiesInput,
): Promise<void> {
  const normalizedKey = normalizeObjectKey(key)
  const requestedContentType = lowercaseMediaType(input.contentType.trim())

  if (!requestedContentType) {
    throw new ServiceError("InvalidInput", "Content-Type is required")
  }

  const head = await getHeadObject(bucket, normalizedKey)

  try {
    await s3.send(
      new CopyObjectCommand({
        Bucket: bucket,
        Key: normalizedKey,
        CopySource: copySource(bucket, normalizedKey),
        MetadataDirective: "REPLACE",
        ContentType: requestedContentType,
        CacheControl: head.CacheControl,
        ContentDisposition: head.ContentDisposition,
        ContentEncoding: head.ContentEncoding,
        ContentLanguage: head.ContentLanguage,
        Expires: head.Expires,
        Metadata: head.Metadata,
        StorageClass: head.StorageClass,
        ServerSideEncryption: head.ServerSideEncryption,
        SSEKMSKeyId: head.SSEKMSKeyId,
        BucketKeyEnabled: head.BucketKeyEnabled,
        WebsiteRedirectLocation: head.WebsiteRedirectLocation,
      }),
    )
  } catch (error: unknown) {
    toOperationFailed(error)
  }
}

export async function getObjectTags(
  bucket: string,
  key: string,
): Promise<ObjectTagsResult> {
  try {
    const result = await s3.send(
      new GetObjectTaggingCommand({ Bucket: bucket, Key: key }),
    )
    return {
      tags: fromAwsTags(result.TagSet),
    }
  } catch (error: unknown) {
    toOperationFailed(error)
  }
}

export async function putObjectTags(
  bucket: string,
  key: string,
  input: UpdateObjectTagsInput,
): Promise<void> {
  try {
    await s3.send(
      new PutObjectTaggingCommand({
        Bucket: bucket,
        Key: key,
        Tagging: {
          TagSet: toAwsTags(normalizeTags(input.tags)) ?? [],
        },
      }),
    )
  } catch (error: unknown) {
    toOperationFailed(error)
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
              message: errorMessageOf(result.reason),
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
  for (const [index, result] of listResults.entries()) {
    if (result.status === "fulfilled") {
      for (const key of result.value) {
        keysToDelete.add(key)
      }
    } else {
      errors.push({
        // biome-ignore lint/style/noNonNullAssertion: index is bounded by folderPrefixes.length
        target: folderPrefixes[index]!,
        message: errorMessageOf(result.reason),
      })
    }
  }

  const deleteResult = await deleteKeysInBatches(bucket, [...keysToDelete])
  return {
    deletedCount: deleteResult.deletedCount,
    errors: [...errors, ...deleteResult.errors],
  }
}
