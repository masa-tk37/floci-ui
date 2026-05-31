import html, { Html } from "@elysiajs/html"
import { Elysia, t } from "elysia"
import { httpStatusFor, ServiceError } from "../errors"
import {
  createBucket,
  createFolderObject,
  deleteBucket,
  deleteObject,
  deleteSelectedObjects,
  getBucketSettings,
  getBucketVersioningEnabled,
  getObjectDetails,
  getObjectForDownload,
  getObjectPreview,
  getObjectTags,
  listBuckets,
  listObjectVersions,
  listObjects,
  putObjectTags,
  renameFolder,
  renameObject,
  updateBucketSettings,
  updateObjectProperties,
  uploadObjects,
} from "../services/s3/bucket-service"
import { buildAttachmentContentDisposition } from "../services/s3/content-disposition"
import { loadSidebarSafe } from "../services/sidebar-service"
import { BucketList } from "../views/s3/bucket-list"
import { CreateBucketForm } from "../views/s3/create-form"
import { ObjectList } from "../views/s3/object-list"
import { Preview } from "../views/s3/preview"
import { S3SettingsForm } from "../views/s3/settings-form"
import {
  jsonData,
  jsonError,
  loadPageData,
  loadSidebarPage,
  respondWithError,
  respondWithFrameworkError,
  runJsonAction,
} from "./route-utils"

const s3TagSchema = t.Object({
  key: t.String(),
  value: t.String(),
})

const bucketEncryptionSchema = t.Union([
  t.Null(),
  t.Object({
    type: t.Union([t.Literal("AES256"), t.Literal("aws:kms")]),
    kmsKeyId: t.Optional(t.String()),
  }),
])

const bucketOwnershipSchema = t.Union([
  t.Literal("BucketOwnerEnforced"),
  t.Literal("BucketOwnerPreferred"),
  t.Literal("ObjectWriter"),
])

const publicAccessBlockSchema = t.Object({
  blockPublicAcls: t.Boolean(),
  ignorePublicAcls: t.Boolean(),
  blockPublicPolicy: t.Boolean(),
  restrictPublicBuckets: t.Boolean(),
})

const createBucketSchema = t.Object({
  name: t.String({ minLength: 1 }),
  versioning: t.Optional(
    t.Union([t.Null(), t.Literal("Enabled"), t.Literal("Suspended")]),
  ),
  encryption: t.Optional(bucketEncryptionSchema),
  ownership: t.Optional(t.Union([t.Null(), bucketOwnershipSchema])),
  publicAccessBlock: t.Optional(publicAccessBlockSchema),
  tags: t.Optional(t.Array(s3TagSchema)),
})

const bucketSettingsSchema = t.Object({
  versioning: t.Optional(t.String()),
  encryption: t.Optional(bucketEncryptionSchema),
  ownership: t.Optional(bucketOwnershipSchema),
  publicAccessBlock: t.Optional(publicAccessBlockSchema),
  tags: t.Optional(t.Array(s3TagSchema)),
  corsRules: t.Optional(
    t.Array(
      t.Object({
        allowedMethods: t.Array(
          t.Union([
            t.Literal("GET"),
            t.Literal("PUT"),
            t.Literal("POST"),
            t.Literal("DELETE"),
            t.Literal("HEAD"),
          ]),
        ),
        allowedOrigins: t.Array(t.String()),
        allowedHeaders: t.Array(t.String()),
        maxAge: t.Number({ minimum: 0 }),
      }),
    ),
  ),
  lifecycleRules: t.Optional(
    t.Array(
      t.Object({
        id: t.String({ minLength: 1 }),
        prefix: t.String(),
        expirationDays: t.Number({ minimum: 1 }),
      }),
    ),
  ),
})

const createFolderSchema = t.Object({
  prefix: t.Optional(t.String()),
  folderName: t.String({ minLength: 1 }),
})

const renameObjectSchema = t.Object({
  fromKey: t.String({ minLength: 1 }),
  toKey: t.String({ minLength: 1 }),
})

const renameFolderSchema = t.Object({
  fromPrefix: t.String({ minLength: 1 }),
  toPrefix: t.String({ minLength: 1 }),
})

const updateObjectPropertiesSchema = t.Object({
  key: t.String({ minLength: 1 }),
  contentType: t.String({ minLength: 1 }),
})

const deleteObjectsSchema = t.Object({
  files: t.Optional(t.Array(t.String({ minLength: 1 }))),
  folders: t.Optional(t.Array(t.String({ minLength: 1 }))),
})

const putObjectTagsSchema = t.Object({
  key: t.String({ minLength: 1 }),
  tags: t.Array(
    t.Object({
      key: t.String({ minLength: 1 }),
      value: t.String(),
    }),
  ),
})

export interface S3RouteDeps {
  createBucket: typeof createBucket
  createFolderObject: typeof createFolderObject
  deleteBucket: typeof deleteBucket
  deleteObject: typeof deleteObject
  deleteSelectedObjects: typeof deleteSelectedObjects
  getBucketSettings: typeof getBucketSettings
  getBucketVersioningEnabled: typeof getBucketVersioningEnabled
  getObjectDetails: typeof getObjectDetails
  getObjectForDownload: typeof getObjectForDownload
  getObjectPreview: typeof getObjectPreview
  getObjectTags: typeof getObjectTags
  listBuckets: typeof listBuckets
  listObjectVersions: typeof listObjectVersions
  listObjects: typeof listObjects
  loadSidebarSafe: typeof loadSidebarSafe
  putObjectTags: typeof putObjectTags
  renameFolder: typeof renameFolder
  renameObject: typeof renameObject
  updateBucketSettings: typeof updateBucketSettings
  updateObjectProperties: typeof updateObjectProperties
  uploadObjects: typeof uploadObjects
}

const defaultS3RouteDeps: S3RouteDeps = {
  createBucket,
  createFolderObject,
  deleteBucket,
  deleteObject,
  deleteSelectedObjects,
  getBucketSettings,
  getBucketVersioningEnabled,
  getObjectDetails,
  getObjectForDownload,
  getObjectPreview,
  getObjectTags,
  listBuckets,
  listObjectVersions,
  listObjects,
  loadSidebarSafe,
  putObjectTags,
  renameFolder,
  renameObject,
  updateBucketSettings,
  updateObjectProperties,
  uploadObjects,
}

export function createS3Routes(deps: S3RouteDeps = defaultS3RouteDeps) {
  return new Elysia({ prefix: "/s3" })
    .use(html())
    .get("/", async () => {
      const { data: buckets, sidebarCounts } = await loadPageData(deps, () =>
        deps.listBuckets(),
      )
      return (
        <BucketList
          buckets={buckets.map((bucket) => ({ Name: bucket.name }))}
          sidebarCounts={sidebarCounts}
        />
      )
    })
    .get("/new", async () => {
      const { sidebarCounts } = await loadSidebarPage(deps)
      return <CreateBucketForm sidebarCounts={sidebarCounts} />
    })
    .post(
      "/bucket",
      async ({ body, set }) =>
        runJsonAction(set, async () => {
          const result = await deps.createBucket(body.name, {
            versioning: body.versioning ?? undefined,
            encryption: body.encryption ?? null,
            ownership: body.ownership ?? undefined,
            publicAccessBlock: body.publicAccessBlock,
            tags: body.tags,
          })
          return { warnings: result.warnings }
        }),
      { body: createBucketSchema },
    )
    .get("/:bucket/settings", async ({ params }) => {
      const { data: init, sidebarCounts } = await loadPageData(deps, () =>
        deps.getBucketSettings(params.bucket),
      )
      return <S3SettingsForm init={init} sidebarCounts={sidebarCounts} />
    })
    .post(
      "/:bucket/settings",
      async ({ params, body, set }) =>
        runJsonAction(set, async () => {
          const result = await deps.updateBucketSettings(params.bucket, body)
          return { warnings: result.warnings }
        }),
      { body: bucketSettingsSchema },
    )
    .delete("/:bucket", async ({ params, set }) =>
      runJsonAction(set, async () => {
        await deps.deleteBucket(params.bucket)
      }),
    )
    .get("/:bucket/download", async ({ params, query }) => {
      const key = query.key
      const versionId = query.versionId
      if (!key) return new Response("Missing key", { status: 400 })
      try {
        const result = await deps.getObjectForDownload(
          params.bucket,
          key,
          versionId,
        )
        return new Response(result.stream, {
          headers: {
            "Content-Type": result.contentType,
            "Content-Disposition": buildAttachmentContentDisposition(
              result.filename,
            ),
          },
        })
      } catch (e) {
        if (e instanceof ServiceError) {
          return new Response(e.message, { status: httpStatusFor(e.code) })
        }
        return new Response("Internal server error", { status: 500 })
      }
    })
    .get("/:bucket/object-details", async ({ params, query, set }) => {
      const key = query.key
      if (!key) {
        return respondWithFrameworkError(
          "InvalidInput",
          "Missing key",
          set,
          400,
        )
      }
      return runJsonAction(set, () => deps.getObjectDetails(params.bucket, key))
    })
    .get("/:bucket/object-tags", async ({ params, query, set }) => {
      const key = query.key
      if (!key) {
        return respondWithFrameworkError(
          "InvalidInput",
          "Missing key",
          set,
          400,
        )
      }
      return runJsonAction(set, () => deps.getObjectTags(params.bucket, key))
    })
    .post(
      "/:bucket/object-tags",
      async ({ params, body, set }) =>
        runJsonAction(set, async () => {
          await deps.putObjectTags(params.bucket, body.key, {
            tags: body.tags,
          })
        }),
      { body: putObjectTagsSchema },
    )
    .post(
      "/:bucket/folder",
      async ({ params, body, set }) =>
        runJsonAction(set, async () => {
          const result = await deps.createFolderObject(
            params.bucket,
            body.prefix ?? "",
            body.folderName,
          )
          return { key: result.key }
        }),
      { body: createFolderSchema },
    )
    .post("/:bucket/upload", async ({ params, request, set }) => {
      try {
        const formData = await request.formData()
        const prefix = String(formData.get("prefix") ?? "")
        const files = formData
          .getAll("files")
          .filter((value): value is File => value instanceof File)

        const result = await deps.uploadObjects(params.bucket, prefix, files)
        if (result.errors.length > 0) {
          set.status = 400
          return jsonError(
            "InvalidInput",
            `${result.errors.length} file(s) failed to upload`,
          )
        }
        return jsonData({ uploadedCount: result.uploadedCount })
      } catch (e) {
        return respondWithError(e, set)
      }
    })
    .post(
      "/:bucket/rename-object",
      async ({ params, body, set }) =>
        runJsonAction(set, async () => {
          const result = await deps.renameObject(
            params.bucket,
            body.fromKey,
            body.toKey,
          )
          return { key: result.key }
        }),
      { body: renameObjectSchema },
    )
    .post(
      "/:bucket/rename-folder",
      async ({ params, body, set }) => {
        try {
          const result = await deps.renameFolder(
            params.bucket,
            body.fromPrefix,
            body.toPrefix,
          )
          if (result.errors.length > 0) {
            set.status = 400
            return jsonError(
              "InvalidInput",
              `${result.errors.length} item(s) failed during folder rename`,
            )
          }
          return jsonData({
            copiedCount: result.copiedCount,
            deletedCount: result.deletedCount,
            prefix: result.prefix,
          })
        } catch (e) {
          return respondWithError(e, set)
        }
      },
      { body: renameFolderSchema },
    )
    .post(
      "/:bucket/object-properties",
      async ({ params, body, set }) =>
        runJsonAction(set, async () => ({
          object: await deps.updateObjectProperties(params.bucket, body.key, {
            contentType: body.contentType,
          }),
        })),
      { body: updateObjectPropertiesSchema },
    )
    .delete("/:bucket/object", async ({ params, query, set }) => {
      const key = query.key
      const versionId = query.versionId
      if (!key) {
        return respondWithFrameworkError(
          "InvalidInput",
          "Missing key",
          set,
          400,
        )
      }
      return runJsonAction(set, async () => {
        await deps.deleteObject(params.bucket, key, versionId)
      })
    })
    .post(
      "/:bucket/delete-objects",
      async ({ params, body, set }) => {
        try {
          const result = await deps.deleteSelectedObjects(params.bucket, body)
          if (result.errors.length > 0) {
            set.status = 400
            return jsonError(
              "InvalidInput",
              `${result.errors.length} item(s) failed to delete`,
            )
          }
          return jsonData({ deletedCount: result.deletedCount })
        } catch (e) {
          return respondWithError(e, set)
        }
      },
      { body: deleteObjectsSchema },
    )
    .get("/:bucket/preview", async ({ params, query }) => {
      const key = query.key
      if (!key) return new Response("Missing key", { status: 400 })
      try {
        const { data: result, sidebarCounts } = await loadPageData(deps, () =>
          deps.getObjectPreview(params.bucket, key),
        )
        return (
          <Preview
            bucket={params.bucket}
            objectKey={key}
            contentType={result.contentType}
            mode={result.mode}
            text={result.text}
            truncated={result.truncated}
            sidebarCounts={sidebarCounts}
          />
        )
      } catch (e) {
        if (e instanceof ServiceError) {
          return new Response(e.message, { status: httpStatusFor(e.code) })
        }
        return new Response("Internal server error", { status: 500 })
      }
    })
    .get("/:bucket", async ({ params, query }) => {
      const prefix = query.prefix ?? ""
      const cursor = query.cursor
      const showVersions = query.versions === "1"
      const [{ data: result, sidebar, sidebarCounts }, versioningEnabled] =
        await Promise.all([
          loadPageData(deps, () =>
            deps.listObjects(params.bucket, prefix, cursor),
          ),
          deps.getBucketVersioningEnabled(params.bucket),
        ])
      let versionResult:
        | Awaited<ReturnType<typeof deps.listObjectVersions>>
        | undefined
      if (showVersions && versioningEnabled) {
        versionResult = await deps.listObjectVersions(params.bucket, prefix)
      }
      const buckets = (sidebar?.buckets ?? []).map((name) => ({ Name: name }))
      return (
        <ObjectList
          bucket={params.bucket}
          buckets={buckets}
          prefix={prefix}
          objects={result.objects.map((object) => ({
            Key: object.key,
            Size: object.size,
            LastModified: object.lastModified,
          }))}
          folders={result.folders.map((folder) => ({ Prefix: folder.prefix }))}
          sidebarCounts={sidebarCounts}
          nextCursor={result.nextCursor}
          versioningEnabled={versioningEnabled}
          showVersions={showVersions}
          versions={versionResult?.versions}
        />
      )
    })
}

export const s3Routes = createS3Routes()
