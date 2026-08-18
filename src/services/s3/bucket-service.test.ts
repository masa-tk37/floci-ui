import { beforeEach, describe, expect, it, mock } from "bun:test"

const mockSend = mock(() => Promise.resolve({}))
mock.module("../../infrastructure/floci-clients", () => ({
  dynamodb: { send: mockSend },
  s3: { send: mockSend },
  sqs: { send: mockSend },
  FLOCI_ENDPOINT: "http://localhost:4566",
  FLOCI_REGION: "us-east-1",
  FLOCI_ACCOUNT_ID: "000000000000",
}))

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
  getObjectTags,
  listBuckets,
  listObjects,
  putObjectTags,
  renameFolder,
  renameObject,
  updateBucketSettings,
  updateObjectProperties,
  uploadObjects,
} from "./bucket-service"

beforeEach(() => {
  mockSend.mockClear()
})

describe("listBuckets", () => {
  it("should return bucket summaries", async () => {
    mockSend.mockResolvedValueOnce({
      Buckets: [{ Name: "bucket1" }, { Name: "bucket2" }],
    })
    const result = await listBuckets()
    expect(result).toHaveLength(2)
    expect(result[0].name).toBe("bucket1")
  })

  it("should return empty array when no buckets", async () => {
    mockSend.mockResolvedValueOnce({ Buckets: undefined })
    const result = await listBuckets()
    expect(result).toEqual([])
  })
})

describe("createBucket", () => {
  it("should create bucket and return no warnings on success", async () => {
    mockSend.mockResolvedValueOnce({})
    const result = await createBucket("my-bucket", {})
    expect(result.warnings).toHaveLength(0)
    expect(mockSend).toHaveBeenCalledTimes(1)
  })

  it("should throw ServiceError on bucket creation failure", async () => {
    mockSend.mockRejectedValueOnce(new Error("Bucket creation failed"))
    await expect(createBucket("bad-bucket", {})).rejects.toMatchObject({
      code: "OperationFailed",
    })
  })

  it("should accumulate warnings for optional settings failures", async () => {
    mockSend
      .mockResolvedValueOnce({}) // CreateBucket
      .mockRejectedValueOnce(new Error("Versioning not supported")) // PutBucketVersioning
    const result = await createBucket("my-bucket", { versioning: "Enabled" })
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toContain("Versioning")
  })
})

describe("deleteBucket", () => {
  it("should delete a bucket", async () => {
    mockSend.mockResolvedValueOnce({})
    await expect(deleteBucket("my-bucket")).resolves.toBeUndefined()
    expect(mockSend).toHaveBeenCalledTimes(1)
  })

  it("should throw ServiceError NotFound on NoSuchBucket", async () => {
    const awsError = Object.assign(new Error("No such bucket"), {
      name: "NoSuchBucket",
    })
    mockSend.mockRejectedValueOnce(awsError)
    await expect(deleteBucket("missing-bucket")).rejects.toMatchObject({
      code: "NotFound",
    })
  })
})

describe("getBucketSettings", () => {
  it("should return bucket settings with defaults", async () => {
    // Promise.all of 7 parallel calls
    mockSend
      .mockResolvedValueOnce({}) // GetBucketVersioning
      .mockResolvedValueOnce({ ServerSideEncryptionConfiguration: null }) // GetBucketEncryption
      .mockResolvedValueOnce({ TagSet: [] }) // GetBucketTagging
      .mockResolvedValueOnce({ PublicAccessBlockConfiguration: null }) // GetPublicAccessBlock
      .mockResolvedValueOnce({ OwnershipControls: null }) // GetBucketOwnershipControls
      .mockResolvedValueOnce({ CORSRules: [] }) // GetBucketCors
      .mockResolvedValueOnce({ Rules: [] }) // GetBucketLifecycleConfiguration
    const result = await getBucketSettings("my-bucket")
    expect(result.bucket).toBe("my-bucket")
    expect(result.versioning).toBe("Suspended")
    expect(result.tags).toEqual([])
  })
})

describe("updateBucketSettings", () => {
  it("should apply versioning setting and return no warnings", async () => {
    mockSend.mockResolvedValueOnce({}) // PutBucketVersioning
    const result = await updateBucketSettings("my-bucket", {
      versioning: "Enabled",
    })
    expect(result.warnings).toHaveLength(0)
  })

  it("should accumulate warnings for failed sub-operations", async () => {
    mockSend
      .mockResolvedValueOnce({}) // PutBucketVersioning
      .mockRejectedValueOnce(new Error("Encryption error")) // PutBucketEncryption
    const result = await updateBucketSettings("my-bucket", {
      versioning: "Enabled",
      encryption: { type: "AES256" },
    })
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toContain("Encryption")
  })

  it("should delete encryption, cors, and lifecycle when removed", async () => {
    mockSend
      .mockResolvedValueOnce({}) // PutBucketVersioning
      .mockResolvedValueOnce({}) // DeleteBucketEncryption
      .mockResolvedValueOnce({}) // DeleteBucketCors
      .mockResolvedValueOnce({}) // DeleteBucketLifecycle
    const result = await updateBucketSettings("my-bucket", {
      versioning: "Enabled",
      encryption: null,
      corsRules: [],
      lifecycleRules: [],
    })
    const calls = mockSend.mock.calls as unknown[][]
    expect(result.warnings).toHaveLength(0)
    expect(
      (calls[1]?.[0] as { constructor?: { name?: string } })?.constructor?.name,
    ).toBe("DeleteBucketEncryptionCommand")
    expect(
      (calls[2]?.[0] as { constructor?: { name?: string } })?.constructor?.name,
    ).toBe("DeleteBucketCorsCommand")
    expect(
      (calls[3]?.[0] as { constructor?: { name?: string } })?.constructor?.name,
    ).toBe("DeleteBucketLifecycleCommand")
  })

  it("should return warnings when delete operations fail", async () => {
    mockSend
      .mockResolvedValueOnce({}) // PutBucketVersioning
      .mockRejectedValueOnce(new Error("Delete encryption failed"))
      .mockRejectedValueOnce(new Error("Delete cors failed"))
      .mockRejectedValueOnce(new Error("Delete lifecycle failed"))
    const result = await updateBucketSettings("my-bucket", {
      versioning: "Suspended",
      encryption: null,
      corsRules: [],
      lifecycleRules: [],
    })
    expect(result.warnings).toHaveLength(3)
    expect(result.warnings[0]).toContain("Encryption")
    expect(result.warnings[1]).toContain("CORS")
    expect(result.warnings[2]).toContain("Lifecycle")
  })
})

describe("listObjects", () => {
  it("should return objects and folders", async () => {
    mockSend.mockResolvedValueOnce({
      Contents: [{ Key: "file.txt", Size: 100, LastModified: new Date() }],
      CommonPrefixes: [{ Prefix: "folder/" }],
    })
    const result = await listObjects("my-bucket", "")
    expect(result.objects).toHaveLength(1)
    expect(result.folders).toHaveLength(1)
  })

  it("should derive folders from folder marker objects", async () => {
    mockSend.mockResolvedValueOnce({
      Contents: [{ Key: "empty-folder/", Size: 0, LastModified: new Date() }],
      CommonPrefixes: [],
    })
    const result = await listObjects("my-bucket", "")
    expect(result.objects).toEqual([])
    expect(result.folders).toEqual([{ prefix: "empty-folder/" }])
  })
})

describe("getObjectForDownload", () => {
  it("should return download result with stream", async () => {
    const mockStream = {} as ReadableStream
    mockSend.mockResolvedValueOnce({
      Body: { transformToWebStream: () => mockStream },
      ContentType: "text/plain",
    })
    const result = await getObjectForDownload("my-bucket", "file.txt")
    expect(result.contentType).toBe("text/plain")
    expect(result.stream).toBe(mockStream)
    expect(result.filename).toBe("file.txt")
  })

  it("should infer extension from content type when filename has no extension", async () => {
    const mockStream = {} as ReadableStream
    mockSend.mockResolvedValueOnce({
      Body: { transformToWebStream: () => mockStream },
      ContentType: "application/pdf",
    })
    const result = await getObjectForDownload("my-bucket", "report")
    expect(result.filename).toBe("report.pdf")
  })

  it("should infer extension from content type with charset parameter", async () => {
    const mockStream = {} as ReadableStream
    mockSend.mockResolvedValueOnce({
      Body: { transformToWebStream: () => mockStream },
      ContentType: "application/json; charset=utf-8",
    })
    const result = await getObjectForDownload("my-bucket", "payload")
    expect(result.filename).toBe("payload.json")
  })

  it("should keep filename when content type is unknown", async () => {
    const mockStream = {} as ReadableStream
    mockSend.mockResolvedValueOnce({
      Body: { transformToWebStream: () => mockStream },
      ContentType: "application/x-custom-type",
    })
    const result = await getObjectForDownload("my-bucket", "artifact")
    expect(result.filename).toBe("artifact")
  })

  it("should throw ServiceError NotFound when no Body", async () => {
    mockSend.mockResolvedValueOnce({ Body: null })
    await expect(
      getObjectForDownload("my-bucket", "missing.txt"),
    ).rejects.toMatchObject({
      code: "NotFound",
    })
  })
})

describe("getObjectPreview", () => {
  it("should return text preview for text content types", async () => {
    mockSend.mockResolvedValueOnce({ ContentType: "text/plain" })
    mockSend.mockResolvedValueOnce({
      Body: { transformToString: async () => "hello world" },
    })
    const result = await getObjectPreview("my-bucket", "file.txt")
    expect(result.mode).toBe("text")
    expect(result.text).toBe("hello world")
    expect(result.truncated).toBe(false)
  })

  it("should return image mode for image content types", async () => {
    mockSend.mockResolvedValueOnce({ ContentType: "image/png" })
    const result = await getObjectPreview("my-bucket", "photo.png")
    expect(result.mode).toBe("image")
    expect(mockSend).toHaveBeenCalledTimes(1)
  })

  it("should return binary mode for other content types", async () => {
    mockSend.mockResolvedValueOnce({ ContentType: "application/octet-stream" })
    const result = await getObjectPreview("my-bucket", "data.bin")
    expect(result.mode).toBe("binary")
    expect(mockSend).toHaveBeenCalledTimes(1)
  })

  it("should return pdf mode for pdf content types", async () => {
    mockSend.mockResolvedValueOnce({ ContentType: "application/pdf" })
    const result = await getObjectPreview("my-bucket", "guide.pdf")
    expect(result.mode).toBe("pdf")
    expect(mockSend).toHaveBeenCalledTimes(1)
  })

  it("should return json preview for application/json", async () => {
    mockSend.mockResolvedValueOnce({ ContentType: "application/json" })
    mockSend.mockResolvedValueOnce({
      Body: { transformToString: async () => '{"key": "value"}' },
    })
    const result = await getObjectPreview("my-bucket", "data.json")
    expect(result.mode).toBe("text")
  })
})

describe("getObjectDetails", () => {
  it("should return object details from head metadata", async () => {
    const lastModified = new Date("2026-04-11T10:20:30.000Z")
    mockSend.mockResolvedValueOnce({
      ContentType: "application/pdf",
      ContentLength: 2048,
      LastModified: lastModified,
      ETag: '"etag"',
      Metadata: { owner: "team-a" },
    })

    const result = await getObjectDetails("my-bucket", "guide.pdf")
    expect(result).toEqual({
      key: "guide.pdf",
      contentType: "application/pdf",
      size: 2048,
      lastModified,
      eTag: '"etag"',
      metadata: { owner: "team-a" },
    })
  })

  it("should propagate NotFound when object does not exist", async () => {
    mockSend.mockRejectedValueOnce(
      Object.assign(new Error("not found"), {
        name: "NotFound",
        $metadata: { httpStatusCode: 404 },
      }),
    )
    await expect(
      getObjectDetails("my-bucket", "missing.pdf"),
    ).rejects.toMatchObject({ code: "NotFound" })
  })
})

describe("renameObject", () => {
  it("should copy then delete the source object", async () => {
    mockSend
      .mockResolvedValueOnce({}) // Head source
      .mockRejectedValueOnce(
        Object.assign(new Error("missing"), {
          name: "NotFound",
          $metadata: { httpStatusCode: 404 },
        }),
      ) // Head target
      .mockResolvedValueOnce({}) // Copy
      .mockResolvedValueOnce({}) // Delete

    const result = await renameObject("my-bucket", "old.txt", "new.txt")
    expect(result.key).toBe("new.txt")

    const calls = mockSend.mock.calls as unknown[][]
    expect(
      (calls[2]?.[0] as { constructor?: { name?: string } })?.constructor?.name,
    ).toBe("CopyObjectCommand")
    expect(
      (calls[3]?.[0] as { constructor?: { name?: string } })?.constructor?.name,
    ).toBe("DeleteObjectCommand")
  })

  it("should reject when the target key already exists", async () => {
    mockSend.mockResolvedValueOnce({}).mockResolvedValueOnce({})

    await expect(
      renameObject("my-bucket", "old.txt", "new.txt"),
    ).rejects.toMatchObject({
      code: "AlreadyExists",
    })
  })

  it("should reject when fromKey and toKey are the same", async () => {
    await expect(
      renameObject("my-bucket", "file.txt", "file.txt"),
    ).rejects.toMatchObject({
      code: "InvalidInput",
    })
    expect(mockSend).not.toHaveBeenCalled()
  })

  it("should rollback the copy when delete fails", async () => {
    mockSend
      .mockResolvedValueOnce({}) // Head source
      .mockRejectedValueOnce(
        Object.assign(new Error("missing"), {
          name: "NotFound",
          $metadata: { httpStatusCode: 404 },
        }),
      ) // Head target (objectExists → false)
      .mockResolvedValueOnce({}) // Copy (success)
      .mockRejectedValueOnce(new Error("delete failed")) // Delete source (fail)
      .mockResolvedValueOnce({}) // Rollback: delete copy

    await expect(
      renameObject("my-bucket", "old.txt", "new.txt"),
    ).rejects.toMatchObject({
      code: "OperationFailed",
      message: "delete failed",
    })

    expect(mockSend).toHaveBeenCalledTimes(5)
    const calls = mockSend.mock.calls as unknown[][]
    expect(
      (calls[4]?.[0] as { constructor?: { name?: string } })?.constructor?.name,
    ).toBe("DeleteObjectCommand")
  })
})

describe("renameFolder", () => {
  it("should copy all keys in the folder and delete originals", async () => {
    mockSend
      .mockResolvedValueOnce({
        Contents: [{ Key: "reports/a.txt" }, { Key: "reports/nested/b.txt" }],
        NextContinuationToken: undefined,
      })
      .mockRejectedValueOnce(
        Object.assign(new Error("missing"), {
          name: "NotFound",
          $metadata: { httpStatusCode: 404 },
        }),
      )
      .mockRejectedValueOnce(
        Object.assign(new Error("missing"), {
          name: "NotFound",
          $metadata: { httpStatusCode: 404 },
        }),
      )
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        Deleted: [{ Key: "reports/a.txt" }, { Key: "reports/nested/b.txt" }],
      })

    const result = await renameFolder("my-bucket", "reports/", "archive/2026/")

    expect(result.copiedCount).toBe(2)
    expect(result.deletedCount).toBe(2)
    expect(result.errors).toEqual([])
    expect(result.prefix).toBe("archive/2026/")
  })

  it("should reject when the target folder is a descendant of the source", async () => {
    await expect(
      renameFolder("my-bucket", "reports/", "reports/archive/"),
    ).rejects.toMatchObject({
      code: "InvalidInput",
    })
  })

  it("should reject when fromPrefix and toPrefix normalise to the same value", async () => {
    await expect(
      renameFolder("my-bucket", "reports/", "reports/"),
    ).rejects.toMatchObject({ code: "InvalidInput" })
    expect(mockSend).not.toHaveBeenCalled()
  })

  it("should reject when the source folder contains no objects", async () => {
    mockSend.mockResolvedValueOnce({
      Contents: [],
      NextContinuationToken: undefined,
    })
    await expect(
      renameFolder("my-bucket", "empty-folder/", "archive/"),
    ).rejects.toMatchObject({ code: "NotFound" })
  })

  it("should rollback successfully copied targets on partial copy failure", async () => {
    const notFound = Object.assign(new Error("missing"), {
      name: "NotFound",
      $metadata: { httpStatusCode: 404 },
    })
    mockSend
      .mockResolvedValueOnce({
        Contents: [{ Key: "reports/a.txt" }, { Key: "reports/b.txt" }],
        NextContinuationToken: undefined,
      }) // listKeysForPrefix
      .mockRejectedValueOnce(notFound) // objectExists archive/a.txt → false
      .mockRejectedValueOnce(notFound) // objectExists archive/b.txt → false
      .mockResolvedValueOnce({}) // copy a.txt (success)
      .mockRejectedValueOnce(new Error("Network timeout")) // copy b.txt (fail)
      .mockResolvedValueOnce({
        Deleted: [{ Key: "archive/a.txt" }],
      }) // rollback DeleteObjectsCommand

    const result = await renameFolder("my-bucket", "reports/", "archive/")
    expect(result.copiedCount).toBe(0)
    expect(result.deletedCount).toBe(0)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]?.message).toBe("Network timeout")
    expect(mockSend).toHaveBeenCalledTimes(6)
    const calls = mockSend.mock.calls as unknown[][]
    expect(
      (calls[5]?.[0] as { constructor?: { name?: string } })?.constructor?.name,
    ).toBe("DeleteObjectsCommand")
  })
})

describe("updateObjectProperties", () => {
  it("should replace content type while preserving metadata", async () => {
    const lastModified = new Date("2026-04-11T10:20:30.000Z")
    mockSend
      .mockResolvedValueOnce({
        ContentType: "text/plain",
        CacheControl: "max-age=60",
        ContentDisposition: 'inline; filename="file.txt"',
        ContentEncoding: "gzip",
        ContentLanguage: "ja",
        Expires: new Date("2026-04-12T00:00:00.000Z"),
        Metadata: { owner: "team-a" },
      }) // HEAD before copy
      .mockResolvedValueOnce({}) // COPY
      .mockResolvedValueOnce({
        ContentType: "application/json",
        ContentLength: 42,
        LastModified: lastModified,
        ETag: '"etag"',
        Metadata: { owner: "team-a" },
      }) // HEAD after copy (re-fetch)

    const result = await updateObjectProperties("my-bucket", "file.txt", {
      contentType: "application/json",
    })

    expect(result.contentType).toBe("application/json")
    expect(result.size).toBe(42)
    expect(result.lastModified).toEqual(lastModified)
    expect(result.eTag).toBe('"etag"')
    const calls = mockSend.mock.calls as unknown[][]
    expect(
      (
        calls[1]?.[0] as {
          input?: {
            MetadataDirective?: string
            ContentType?: string
            Metadata?: Record<string, string>
          }
        }
      )?.input,
    ).toMatchObject({
      MetadataDirective: "REPLACE",
      ContentType: "application/json",
      Metadata: { owner: "team-a" },
    })
  })

  it("should reject an empty content type", async () => {
    await expect(
      updateObjectProperties("my-bucket", "file.txt", {
        contentType: "   ",
      }),
    ).rejects.toMatchObject({
      code: "InvalidInput",
      message: "Content-Type is required",
    })
  })
})

describe("deleteObject", () => {
  it("should delete an object", async () => {
    mockSend.mockResolvedValueOnce({})
    await expect(deleteObject("my-bucket", "file.txt")).resolves.toBeUndefined()
    expect(mockSend).toHaveBeenCalledTimes(1)
  })
})

describe("createFolderObject", () => {
  it("should create a folder marker object", async () => {
    mockSend.mockResolvedValueOnce({})
    const result = await createFolderObject("my-bucket", "reports/", "daily")
    expect(result.key).toBe("reports/daily/")
  })

  it("should reject when folderName is empty", async () => {
    await expect(
      createFolderObject("my-bucket", "reports/", ""),
    ).rejects.toMatchObject({ code: "InvalidInput" })
    expect(mockSend).not.toHaveBeenCalled()
  })
})

describe("uploadObjects", () => {
  it("should upload multiple files to the current prefix", async () => {
    mockSend.mockResolvedValue({})
    const first = new File(["alpha"], "alpha.txt", { type: "text/plain" })
    const second = new File(["beta"], "beta.json", {
      type: "application/json",
    })

    const result = await uploadObjects("my-bucket", "reports/", [first, second])
    expect(result.uploadedCount).toBe(2)
    expect(result.errors).toEqual([])

    const calls = mockSend.mock.calls as unknown[][]
    expect((calls[0]?.[0] as { input?: { Key?: string } })?.input?.Key).toBe(
      "reports/alpha.txt",
    )
    expect((calls[1]?.[0] as { input?: { Key?: string } })?.input?.Key).toBe(
      "reports/beta.json",
    )
  })

  it("should reject when no files are provided", async () => {
    await expect(
      uploadObjects("my-bucket", "reports/", []),
    ).rejects.toMatchObject({ code: "InvalidInput" })
    expect(mockSend).not.toHaveBeenCalled()
  })

  it("should return errors for files that fail to upload", async () => {
    mockSend
      .mockResolvedValueOnce({}) // alpha.txt success
      .mockRejectedValueOnce(new Error("S3 write error")) // beta.json fail

    const first = new File(["alpha"], "alpha.txt", { type: "text/plain" })
    const second = new File(["beta"], "beta.json", { type: "application/json" })
    const result = await uploadObjects("my-bucket", "", [first, second])

    expect(result.uploadedCount).toBe(1)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]?.name).toBe("beta.json")
    expect(result.errors[0]?.message).toBe("S3 write error")
  })
})

describe("getObjectTags", () => {
  it("should return tags mapped from TagSet", async () => {
    mockSend.mockResolvedValueOnce({
      TagSet: [{ Key: "env", Value: "local" }],
    })
    const result = await getObjectTags("my-bucket", "file.txt")
    expect(result).toEqual({ tags: [{ key: "env", value: "local" }] })
  })

  it("should return empty tags when TagSet is undefined", async () => {
    mockSend.mockResolvedValueOnce({ TagSet: undefined })
    const result = await getObjectTags("my-bucket", "file.txt")
    expect(result).toEqual({ tags: [] })
  })

  it("should throw ServiceError OperationFailed on SDK error", async () => {
    mockSend.mockRejectedValueOnce(new Error("Access denied"))
    await expect(getObjectTags("my-bucket", "file.txt")).rejects.toMatchObject({
      code: "OperationFailed",
    })
  })
})

describe("putObjectTags", () => {
  it("should succeed when SDK returns successfully", async () => {
    mockSend.mockResolvedValueOnce({})
    await expect(
      putObjectTags("my-bucket", "file.txt", {
        tags: [{ key: "env", value: "local" }],
      }),
    ).resolves.toBeUndefined()
    expect(mockSend).toHaveBeenCalledTimes(1)
  })

  it("should pass correct TagSet to PutObjectTaggingCommand", async () => {
    mockSend.mockResolvedValueOnce({})
    await putObjectTags("my-bucket", "file.txt", {
      tags: [
        { key: "env", value: "local" },
        { key: "team", value: "dev" },
      ],
    })
    const calls = mockSend.mock.calls as unknown[][]
    expect(
      (calls[0]?.[0] as { input?: { Tagging?: { TagSet?: unknown } } })?.input
        ?.Tagging?.TagSet,
    ).toEqual([
      { Key: "env", Value: "local" },
      { Key: "team", Value: "dev" },
    ])
  })

  it("should throw ServiceError OperationFailed on SDK error", async () => {
    mockSend.mockRejectedValueOnce(new Error("Write failed"))
    await expect(
      putObjectTags("my-bucket", "file.txt", { tags: [] }),
    ).rejects.toMatchObject({
      code: "OperationFailed",
    })
  })
})

describe("deleteSelectedObjects", () => {
  it("should delete mixed file and folder selections", async () => {
    mockSend
      .mockResolvedValueOnce({
        Contents: [{ Key: "reports/alpha.txt" }, { Key: "reports/beta.txt" }],
      })
      .mockResolvedValueOnce({
        Deleted: [
          { Key: "single.txt" },
          { Key: "reports/alpha.txt" },
          { Key: "reports/beta.txt" },
        ],
      })

    const result = await deleteSelectedObjects("my-bucket", {
      files: ["single.txt"],
      folders: ["reports/"],
    })

    expect(result.deletedCount).toBe(3)
    expect(result.errors).toEqual([])
  })

  it("should reject when neither files nor folders are provided", async () => {
    await expect(deleteSelectedObjects("my-bucket", {})).rejects.toMatchObject({
      code: "InvalidInput",
    })
    expect(mockSend).not.toHaveBeenCalled()
  })

  it("should accumulate folder listing errors without aborting remaining deletions", async () => {
    mockSend
      .mockRejectedValueOnce(new Error("list failed")) // listKeysForPrefix for bad-folder/
      .mockResolvedValueOnce({
        Deleted: [{ Key: "direct.txt" }],
      }) // delete file

    const result = await deleteSelectedObjects("my-bucket", {
      files: ["direct.txt"],
      folders: ["bad-folder/"],
    })

    expect(result.deletedCount).toBe(1)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]?.target).toBe("bad-folder/")
  })

  it("should paginate when deleting folder contents", async () => {
    mockSend
      .mockResolvedValueOnce({
        Contents: [{ Key: "reports/a.txt" }],
        NextContinuationToken: "next-token",
      })
      .mockResolvedValueOnce({
        Contents: [{ Key: "reports/b.txt" }],
        NextContinuationToken: undefined,
      })
      .mockResolvedValueOnce({
        Deleted: [{ Key: "reports/a.txt" }, { Key: "reports/b.txt" }],
      })

    const result = await deleteSelectedObjects("my-bucket", {
      folders: ["reports/"],
    })

    expect(result.deletedCount).toBe(2)
    expect(result.errors).toEqual([])
    expect(mockSend).toHaveBeenCalledTimes(3)
  })
})
