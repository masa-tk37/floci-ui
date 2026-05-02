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
  getObjectDetails,
  getObjectForDownload,
  getObjectPreview,
  listBuckets,
  listObjects,
  renameFolder,
  renameObject,
  updateBucketSettings,
  updateObjectProperties,
  uploadObjects,
} from "../services/s3/bucket-service"
import { buildAttachmentContentDisposition } from "../services/s3/content-disposition"
import { loadSidebarSafe, toSidebarCounts } from "../services/sidebar-service"
import { BucketList } from "../views/s3/bucket-list"
import { CreateBucketForm } from "../views/s3/create-form"
import { ObjectList } from "../views/s3/object-list"
import { Preview } from "../views/s3/preview"
import { S3SettingsForm } from "../views/s3/settings-form"
import {
  jsonData,
  jsonError,
  jsonOk,
  respondWithError,
  respondWithFrameworkError,
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

export interface S3RouteDeps {
  createBucket: typeof createBucket
  createFolderObject: typeof createFolderObject
  deleteBucket: typeof deleteBucket
  deleteObject: typeof deleteObject
  deleteSelectedObjects: typeof deleteSelectedObjects
  getBucketSettings: typeof getBucketSettings
  getObjectDetails: typeof getObjectDetails
  getObjectForDownload: typeof getObjectForDownload
  getObjectPreview: typeof getObjectPreview
  listBuckets: typeof listBuckets
  listObjects: typeof listObjects
  loadSidebarSafe: typeof loadSidebarSafe
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
  getObjectDetails,
  getObjectForDownload,
  getObjectPreview,
  listBuckets,
  listObjects,
  loadSidebarSafe,
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
      const [buckets, sidebarData] = await Promise.all([
        deps.listBuckets(),
        deps.loadSidebarSafe(),
      ])
      return (
        <BucketList
          buckets={buckets.map((bucket) => ({ Name: bucket.name }))}
          sidebarCounts={toSidebarCounts(sidebarData)}
        />
      )
    })
    .get("/new", async () => {
      const sidebarData = await deps.loadSidebarSafe()
      return <CreateBucketForm sidebarCounts={toSidebarCounts(sidebarData)} />
    })
    .post(
      "/bucket",
      async ({ body, set }) => {
        try {
          const result = await deps.createBucket(body.name, {
            versioning: body.versioning ?? undefined,
            encryption: body.encryption ?? null,
            ownership: body.ownership ?? undefined,
            publicAccessBlock: body.publicAccessBlock,
            tags: body.tags,
          })
          return jsonData({ warnings: result.warnings })
        } catch (e) {
          return respondWithError(e, set)
        }
      },
      { body: createBucketSchema },
    )
    .get("/:bucket/settings", async ({ params }) => {
      const [init, sidebarData] = await Promise.all([
        deps.getBucketSettings(params.bucket),
        deps.loadSidebarSafe(),
      ])
      return (
        <S3SettingsForm
          init={init}
          sidebarCounts={toSidebarCounts(sidebarData)}
        />
      )
    })
    .post(
      "/:bucket/settings",
      async ({ params, body, set }) => {
        try {
          const result = await deps.updateBucketSettings(params.bucket, body)
          return jsonData({ warnings: result.warnings })
        } catch (e) {
          return respondWithError(e, set)
        }
      },
      { body: bucketSettingsSchema },
    )
    .delete("/:bucket", async ({ params, set }) => {
      try {
        await deps.deleteBucket(params.bucket)
        return jsonOk()
      } catch (e) {
        return respondWithError(e, set)
      }
    })
    .get("/:bucket/download", async ({ params, query }) => {
      const key = query.key
      if (!key) return new Response("Missing key", { status: 400 })
      try {
        const result = await deps.getObjectForDownload(params.bucket, key)
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
      try {
        return jsonData(await deps.getObjectDetails(params.bucket, key))
      } catch (e) {
        return respondWithError(e, set)
      }
    })
    .post(
      "/:bucket/folder",
      async ({ params, body, set }) => {
        try {
          const result = await deps.createFolderObject(
            params.bucket,
            body.prefix ?? "",
            body.folderName,
          )
          return jsonData({ key: result.key })
        } catch (e) {
          return respondWithError(e, set)
        }
      },
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
      async ({ params, body, set }) => {
        try {
          const result = await deps.renameObject(
            params.bucket,
            body.fromKey,
            body.toKey,
          )
          return jsonData({ key: result.key })
        } catch (e) {
          return respondWithError(e, set)
        }
      },
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
      async ({ params, body, set }) => {
        try {
          const result = await deps.updateObjectProperties(
            params.bucket,
            body.key,
            {
              contentType: body.contentType,
            },
          )
          return jsonData({ object: result })
        } catch (e) {
          return respondWithError(e, set)
        }
      },
      { body: updateObjectPropertiesSchema },
    )
    .delete("/:bucket/object", async ({ params, query, set }) => {
      const key = query.key
      if (!key) {
        return respondWithFrameworkError(
          "InvalidInput",
          "Missing key",
          set,
          400,
        )
      }
      try {
        await deps.deleteObject(params.bucket, key)
        return jsonOk()
      } catch (e) {
        return respondWithError(e, set)
      }
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
        const [result, sidebarData] = await Promise.all([
          deps.getObjectPreview(params.bucket, key),
          deps.loadSidebarSafe(),
        ])
        return (
          <Preview
            bucket={params.bucket}
            objectKey={key}
            contentType={result.contentType}
            mode={result.mode}
            text={result.text}
            truncated={result.truncated}
            sidebarCounts={toSidebarCounts(sidebarData)}
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
      const [result, sidebarData] = await Promise.all([
        deps.listObjects(params.bucket, prefix),
        deps.loadSidebarSafe(),
      ])
      const buckets = (sidebarData?.buckets ?? []).map((name) => ({
        Name: name,
      }))
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
          sidebarCounts={toSidebarCounts(sidebarData)}
        />
      )
    })
}

export const s3Routes = createS3Routes()
