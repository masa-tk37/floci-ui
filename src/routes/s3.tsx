import { Html } from "@elysiajs/html"
import { Elysia, t } from "elysia"
import html from "@elysiajs/html"
import {
  listBuckets,
  createBucket,
  deleteBucket,
  getBucketSettings,
  updateBucketSettings,
  listObjects,
  getObjectForDownload,
  getObjectPreview,
  getObjectDetails,
  renameObject,
  renameFolder,
  updateObjectProperties,
  createFolderObject,
  uploadObjects,
  deleteObject,
  deleteSelectedObjects,
  type CreateBucketOptions,
  type BucketSettingsInput,
} from "../services/s3/bucket-service"
import { ServiceError, httpStatusFor } from "../errors"
import { buildAttachmentContentDisposition } from "../services/s3/content-disposition"
import { loadSidebarSafe, toSidebarCounts } from "../services/sidebar-service"
import { BucketList } from "../views/s3/bucket-list"
import { ObjectList } from "../views/s3/object-list"
import { Preview } from "../views/s3/preview"
import { CreateBucketForm } from "../views/s3/create-form"
import { S3SettingsForm } from "../views/s3/settings-form"

export const s3Routes = new Elysia({ prefix: "/s3" })
  .use(html())
  .get("/", async () => {
    const [buckets, sidebarData] = await Promise.all([
      listBuckets(),
      loadSidebarSafe(),
    ])
    return (
      <BucketList
        buckets={buckets.map((b) => ({ Name: b.name }))}
        sidebarCounts={toSidebarCounts(sidebarData)}
      />
    )
  })
  .get("/new", () => {
    return <CreateBucketForm />
  })
  .post(
    "/bucket",
    async ({ body, set }) => {
      const b = body as {
        name: string
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
      }
      try {
        const result = await createBucket(b.name, {
          versioning: b.versioning,
          encryption: b.encryption,
          ownership: b.ownership,
          publicAccessBlock: b.publicAccessBlock,
          tags: b.tags,
        } as CreateBucketOptions)
        return { success: true, warnings: result.warnings }
      } catch (e) {
        if (e instanceof ServiceError) {
          set.status = httpStatusFor(e.code)
          return { error: e.message }
        }
        set.status = 500
        return { error: "Internal server error" }
      }
    },
    { body: t.Any() },
  )
  .get("/:bucket/settings", async ({ params }) => {
    const init = await getBucketSettings(params.bucket)
    return <S3SettingsForm init={init} />
  })
  .post(
    "/:bucket/settings",
    async ({ params, body }) => {
      const b = body as BucketSettingsInput
      const result = await updateBucketSettings(params.bucket, b)
      return { success: true, warnings: result.warnings }
    },
    { body: t.Any() },
  )
  .delete("/:bucket", async ({ params, set }) => {
    try {
      await deleteBucket(params.bucket)
      return { success: true }
    } catch (e) {
      if (e instanceof ServiceError) {
        set.status = httpStatusFor(e.code)
        return { error: e.message }
      }
      set.status = 500
      return { error: "Internal server error" }
    }
  })
  .get("/:bucket/download", async ({ params, query }) => {
    const key = query.key
    if (!key) return new Response("Missing key", { status: 400 })
    try {
      const result = await getObjectForDownload(params.bucket, key)
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
      set.status = 400
      return { error: "Missing key" }
    }
    try {
      return await getObjectDetails(params.bucket, key)
    } catch (e) {
      if (e instanceof ServiceError) {
        set.status = httpStatusFor(e.code)
        return { error: e.message }
      }
      set.status = 500
      return { error: "Internal server error" }
    }
  })
  .post(
    "/:bucket/folder",
    async ({ params, body, set }) => {
      const payload = body as { prefix?: string; folderName?: string }
      try {
        const result = await createFolderObject(
          params.bucket,
          payload.prefix ?? "",
          payload.folderName ?? "",
        )
        return { success: true, key: result.key }
      } catch (e) {
        if (e instanceof ServiceError) {
          set.status = httpStatusFor(e.code)
          return { error: e.message }
        }
        set.status = 500
        return { error: "Internal server error" }
      }
    },
    { body: t.Any() },
  )
  .post("/:bucket/upload", async ({ params, request, set }) => {
    try {
      const formData = await request.formData()
      const prefix = String(formData.get("prefix") ?? "")
      const files = formData
        .getAll("files")
        .filter((value): value is File => value instanceof File)

      const result = await uploadObjects(params.bucket, prefix, files)
      if (result.errors.length > 0) {
        set.status = 400
        return {
          error: `${result.errors.length} file(s) failed to upload`,
          uploadedCount: result.uploadedCount,
          errors: result.errors,
        }
      }
      return { success: true, uploadedCount: result.uploadedCount }
    } catch (e) {
      if (e instanceof ServiceError) {
        set.status = httpStatusFor(e.code)
        return { error: e.message }
      }
      set.status = 500
      return { error: "Internal server error" }
    }
  })
  .post(
    "/:bucket/rename-object",
    async ({ params, body, set }) => {
      const payload = body as { fromKey?: string; toKey?: string }
      try {
        const result = await renameObject(
          params.bucket,
          payload.fromKey ?? "",
          payload.toKey ?? "",
        )
        return { success: true, key: result.key }
      } catch (e) {
        if (e instanceof ServiceError) {
          set.status = httpStatusFor(e.code)
          return { error: e.message }
        }
        set.status = 500
        return { error: "Internal server error" }
      }
    },
    { body: t.Any() },
  )
  .post(
    "/:bucket/rename-folder",
    async ({ params, body, set }) => {
      const payload = body as { fromPrefix?: string; toPrefix?: string }
      try {
        const result = await renameFolder(
          params.bucket,
          payload.fromPrefix ?? "",
          payload.toPrefix ?? "",
        )
        if (result.errors.length > 0) {
          set.status = 400
          return {
            error: `${result.errors.length} item(s) failed during folder rename`,
            copiedCount: result.copiedCount,
            deletedCount: result.deletedCount,
            prefix: result.prefix,
            errors: result.errors,
          }
        }
        return {
          success: true,
          copiedCount: result.copiedCount,
          deletedCount: result.deletedCount,
          prefix: result.prefix,
        }
      } catch (e) {
        if (e instanceof ServiceError) {
          set.status = httpStatusFor(e.code)
          return { error: e.message }
        }
        set.status = 500
        return { error: "Internal server error" }
      }
    },
    { body: t.Any() },
  )
  .post(
    "/:bucket/object-properties",
    async ({ params, body, set }) => {
      const payload = body as { key?: string; contentType?: string }
      try {
        const result = await updateObjectProperties(
          params.bucket,
          payload.key ?? "",
          {
            contentType: payload.contentType ?? "",
          },
        )
        return { success: true, object: result }
      } catch (e) {
        if (e instanceof ServiceError) {
          set.status = httpStatusFor(e.code)
          return { error: e.message }
        }
        set.status = 500
        return { error: "Internal server error" }
      }
    },
    { body: t.Any() },
  )
  .delete("/:bucket/object", async ({ params, query }) => {
    const key = query.key
    if (!key) return new Response("Missing key", { status: 400 })
    try {
      await deleteObject(params.bucket, key)
      return { success: true }
    } catch (e) {
      if (e instanceof ServiceError) {
        return new Response(e.message, { status: httpStatusFor(e.code) })
      }
      return new Response("Internal server error", { status: 500 })
    }
  })
  .post(
    "/:bucket/delete-objects",
    async ({ params, body, set }) => {
      const payload = body as { files?: string[]; folders?: string[] }
      try {
        const result = await deleteSelectedObjects(params.bucket, payload)
        if (result.errors.length > 0) {
          set.status = 400
          return {
            error: `${result.errors.length} item(s) failed to delete`,
            deletedCount: result.deletedCount,
            errors: result.errors,
          }
        }
        return { success: true, deletedCount: result.deletedCount }
      } catch (e) {
        if (e instanceof ServiceError) {
          set.status = httpStatusFor(e.code)
          return { error: e.message }
        }
        set.status = 500
        return { error: "Internal server error" }
      }
    },
    { body: t.Any() },
  )
  .get("/:bucket/preview", async ({ params, query }) => {
    const key = query.key
    if (!key) return new Response("Missing key", { status: 400 })
    try {
      const result = await getObjectPreview(params.bucket, key)
      if (result.mode === "text") {
        return (
          <Preview
            bucket={params.bucket}
            objectKey={key}
            contentType={result.contentType}
            mode="text"
            text={result.text}
            truncated={result.truncated}
          />
        )
      }
      if (result.mode === "image") {
        return (
          <Preview
            bucket={params.bucket}
            objectKey={key}
            contentType={result.contentType}
            mode="image"
          />
        )
      }
      if (result.mode === "pdf") {
        return (
          <Preview
            bucket={params.bucket}
            objectKey={key}
            contentType={result.contentType}
            mode="pdf"
          />
        )
      }
      return (
        <Preview
          bucket={params.bucket}
          objectKey={key}
          contentType={result.contentType}
          mode="binary"
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
      listObjects(params.bucket, prefix),
      loadSidebarSafe(),
    ])
    return (
      <ObjectList
        bucket={params.bucket}
        prefix={prefix}
        objects={result.objects.map((o) => ({
          Key: o.key,
          Size: o.size,
          LastModified: o.lastModified,
        }))}
        folders={result.folders.map((f) => ({ Prefix: f.prefix }))}
        sidebarCounts={toSidebarCounts(sidebarData)}
      />
    )
  })
