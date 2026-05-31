import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetBucketVersioningCommand,
  GetObjectCommand,
  GetObjectTaggingCommand,
  ListObjectVersionsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  PutObjectTaggingCommand,
  type CommonPrefix,
  type DeleteMarkerEntry,
  type ObjectVersion,
  type _Object,
} from "@aws-sdk/client-s3"
import { ServiceError } from "../../errors"
import { s3 } from "../../infrastructure/floci-clients"
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
  PREVIEW_TEXT_LIMIT,
  copySource,
  deleteKeysInBatches,
  directChildRemainder,
  folderPrefixFromKey,
  getHeadObject,
  inferredFilename,
  isImageContentType,
  isPdfContentType,
  isTextContentType,
  listKeysForPrefix,
  normalizeFolderKey,
  normalizeFolderPrefix,
  normalizeObjectKey,
  normalizePrefix,
  objectExists,
  objectKeyFromPrefix,
  sanitizeContentType,
  uniqueNonEmpty,
} from "./shared"

const OBJECT_PAGE_SIZE = 100

export async function listObjects(
  bucket: string,
  prefix: string,
  cursor?: string,
): Promise<ObjectListResult> {
  const result = await s3.send(
    new ListObjectsV2Command({
      Bucket: bucket,
      Delimiter: "/",
      Prefix: prefix,
      MaxKeys: OBJECT_PAGE_SIZE,
      ContinuationToken: cursor,
    }),
  )

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
    return result.Status === "Enabled"
  } catch {
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
  const result = await s3.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      VersionId: versionId || undefined,
    }),
  )
  if (!result.Body) {
    throw new ServiceError(
      "NotFound",
      `Object ${key} not found in bucket ${bucket}`,
    )
  }

  return {
    stream: result.Body.transformToWebStream(),
    contentType: sanitizeContentType(result.ContentType),
    filename: inferredFilename(key, sanitizeContentType(result.ContentType)),
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
      Range: `bytes=0-${PREVIEW_TEXT_LIMIT - 1}`,
    }),
  )
  if (!result.Body) {
    throw new ServiceError(
      "NotFound",
      `Object ${key} not found in bucket ${bucket}`,
    )
  }

  const text = await result.Body.transformToString()
  return {
    contentType,
    mode: "text",
    text,
    truncated: result.ContentRange !== undefined,
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
    throw new ServiceError(
      "OperationFailed",
      error instanceof Error ? error.message : String(error),
      error,
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
    try {
      await s3.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: normalizedToKey }),
      )
    } catch {
      // Rollback failed; object exists at both keys and must be cleaned up manually.
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
  const conflict = existenceResults.find((result) => result.exists)
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
  const requestedContentType = input.contentType.trim().toLowerCase()

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
    contentType: requestedContentType,
    size: updatedHead.ContentLength ?? 0,
    lastModified: updatedHead.LastModified,
    eTag: updatedHead.ETag,
    metadata: updatedHead.Metadata ?? {},
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
      tags: (result.TagSet ?? []).map((tag) => ({
        key: tag.Key ?? "",
        value: tag.Value ?? "",
      })),
    }
  } catch (error: unknown) {
    throw new ServiceError(
      "OperationFailed",
      error instanceof Error ? error.message : String(error),
      error,
    )
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
          TagSet: input.tags.map((t) => ({ Key: t.key, Value: t.value })),
        },
      }),
    )
  } catch (error: unknown) {
    throw new ServiceError(
      "OperationFailed",
      error instanceof Error ? error.message : String(error),
      error,
    )
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
  for (const [index, result] of listResults.entries()) {
    if (result.status === "fulfilled") {
      for (const key of result.value) {
        keysToDelete.add(key)
      }
    } else {
      errors.push({
        // biome-ignore lint/style/noNonNullAssertion: index is bounded by folderPrefixes.length
        target: folderPrefixes[index]!,
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
