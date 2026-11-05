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
  getBucketVersioningEnabled,
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
  mockSend.mockReset()
  mockSend.mockImplementation(() => Promise.resolve({}))
})

type SentCommand = {
  constructor: { name: string }
  input: Record<string, unknown>
}

/** Dispatches by command name because settings ops interleave their reads and writes. */
function respondByCommand(
  responses: Record<string, object | ((command: SentCommand) => unknown)>,
) {
  mockSend.mockImplementation(((command: SentCommand) => {
    const response = responses[command.constructor.name]
    if (response instanceof Error) return Promise.reject(response)
    return Promise.resolve(
      typeof response === "function" ? response(command) : (response ?? {}),
    )
  }) as never)
}

function sentCommands(): SentCommand[] {
  return (mockSend.mock.calls as unknown[][]).map(
    (call) => call[0] as SentCommand,
  )
}

function sentNamed(name: string): SentCommand[] {
  return sentCommands().filter((command) => command.constructor.name === name)
}

function awsError(name: string, httpStatusCode = 400) {
  return Object.assign(new Error(name), {
    name,
    $metadata: { httpStatusCode },
  })
}

describe("listBuckets", () => {
  it("should return bucket summaries", async () => {
    mockSend.mockResolvedValueOnce({
      Buckets: [{ Name: "bucket1" }, { Name: "bucket2" }],
    })
    const result = await listBuckets()
    expect(result).toHaveLength(2)
    expect(result[0].name).toBe("bucket1")
  })

  it("should sort buckets by name", async () => {
    mockSend.mockResolvedValueOnce({
      Buckets: [{ Name: "logs" }, { Name: "assets" }],
    })
    const result = await listBuckets()
    expect(result.map((bucket) => bucket.name)).toEqual(["assets", "logs"])
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
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("Versioning not supported"))
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
    mockSend
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ ServerSideEncryptionConfiguration: null })
      .mockResolvedValueOnce({ TagSet: [] })
      .mockResolvedValueOnce({ PublicAccessBlockConfiguration: null })
      .mockResolvedValueOnce({ OwnershipControls: null })
      .mockResolvedValueOnce({ CORSRules: [] })
      .mockResolvedValueOnce({ Rules: [] })
    const result = await getBucketSettings("my-bucket")
    expect(result.bucket).toBe("my-bucket")
    expect(result.versioning).toBe("Suspended")
    expect(result.tags).toEqual([])
  })

  it("should use defaults only for not-configured errors", async () => {
    respondByCommand({
      GetBucketCorsCommand: awsError("NoSuchCORSConfiguration", 404),
      GetBucketTaggingCommand: awsError("NoSuchTagSet", 404),
    })
    const result = await getBucketSettings("my-bucket")
    expect(result.corsRules).toEqual([])
    expect(result.tags).toEqual([])
  })

  it("should fail instead of reporting defaults when a read fails", async () => {
    respondByCommand({ GetBucketCorsCommand: awsError("TimeoutError", 500) })
    await expect(getBucketSettings("my-bucket")).rejects.toMatchObject({
      code: "OperationFailed",
    })
  })

  it("should expose only the lifecycle rules the form can edit", async () => {
    respondByCommand({
      GetBucketLifecycleConfigurationCommand: {
        Rules: [
          {
            ID: "expire",
            Status: "Enabled",
            Filter: { Prefix: "tmp/" },
            Expiration: { Days: 7 },
          },
          {
            ID: "archive",
            Status: "Enabled",
            Filter: { And: { Prefix: "logs/", Tags: [] } },
            Transitions: [{ Days: 30, StorageClass: "GLACIER" }],
          },
          { ID: "old", Status: "Disabled", Expiration: { Days: 1 } },
        ],
      },
    })
    const result = await getBucketSettings("my-bucket")
    expect(result.lifecycleRules).toEqual([
      { id: "expire", prefix: "tmp/", expirationDays: 7 },
    ])
  })

  it("should show DSSE-KMS as aws:kms so the form can save it", async () => {
    respondByCommand({
      GetBucketEncryptionCommand: {
        ServerSideEncryptionConfiguration: {
          Rules: [
            {
              ApplyServerSideEncryptionByDefault: {
                SSEAlgorithm: "aws:kms:dsse",
                KMSMasterKeyID: "key-1",
              },
            },
          ],
        },
      },
    })
    const result = await getBucketSettings("my-bucket")
    expect(result.encryption).toBe("aws:kms")
    expect(result.kmsKeyId).toBe("key-1")
  })
})

describe("updateBucketSettings", () => {
  it("should apply versioning setting and return no warnings", async () => {
    const result = await updateBucketSettings("my-bucket", {
      versioning: "Enabled",
    })
    expect(result.warnings).toHaveLength(0)
    expect(sentNamed("PutBucketVersioningCommand")[0]?.input).toMatchObject({
      VersioningConfiguration: { Status: "Enabled" },
    })
  })

  it("should not suspend a bucket that was never versioned", async () => {
    respondByCommand({ GetBucketVersioningCommand: {} })
    await updateBucketSettings("my-bucket", { versioning: "Suspended" })
    expect(sentNamed("PutBucketVersioningCommand")).toHaveLength(0)
  })

  it("should skip versioning when the status is unchanged", async () => {
    respondByCommand({ GetBucketVersioningCommand: { Status: "Enabled" } })
    await updateBucketSettings("my-bucket", { versioning: "Enabled" })
    expect(sentNamed("PutBucketVersioningCommand")).toHaveLength(0)
  })

  it("should reject an unknown versioning status", async () => {
    await expect(
      updateBucketSettings("my-bucket", { versioning: "foo" }),
    ).rejects.toMatchObject({ code: "InvalidInput" })
    expect(mockSend).not.toHaveBeenCalled()
  })

  it("should accumulate warnings for failed sub-operations", async () => {
    respondByCommand({
      PutBucketEncryptionCommand: new Error("Encryption error"),
    })
    const result = await updateBucketSettings("my-bucket", {
      versioning: "Enabled",
      encryption: { type: "AES256" },
    })
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toContain("Encryption")
  })

  it("should keep BucketKeyEnabled and skip unchanged encryption", async () => {
    const kmsRule = {
      ServerSideEncryptionConfiguration: {
        Rules: [
          {
            ApplyServerSideEncryptionByDefault: {
              SSEAlgorithm: "aws:kms",
              KMSMasterKeyID: "key-1",
            },
            BucketKeyEnabled: true,
          },
        ],
      },
    }
    respondByCommand({ GetBucketEncryptionCommand: kmsRule })
    await updateBucketSettings("my-bucket", {
      encryption: { type: "aws:kms", kmsKeyId: "key-1" },
    })
    expect(sentNamed("PutBucketEncryptionCommand")).toHaveLength(0)

    await updateBucketSettings("my-bucket", {
      encryption: { type: "aws:kms", kmsKeyId: "key-2" },
    })
    expect(sentNamed("PutBucketEncryptionCommand")[0]?.input).toMatchObject({
      ServerSideEncryptionConfiguration: {
        Rules: [{ BucketKeyEnabled: true }],
      },
    })
  })

  it("should not rewrite DSSE-KMS echoed back as aws:kms", async () => {
    respondByCommand({
      GetBucketEncryptionCommand: {
        ServerSideEncryptionConfiguration: {
          Rules: [
            {
              ApplyServerSideEncryptionByDefault: {
                SSEAlgorithm: "aws:kms:dsse",
                KMSMasterKeyID: "key-1",
              },
            },
          ],
        },
      },
    })
    await updateBucketSettings("my-bucket", {
      encryption: { type: "aws:kms", kmsKeyId: "key-1" },
    })
    expect(sentNamed("PutBucketEncryptionCommand")).toHaveLength(0)
  })

  it("should delete encryption, cors, and lifecycle when removed", async () => {
    respondByCommand({
      GetBucketCorsCommand: {
        CORSRules: [{ AllowedMethods: ["GET"], AllowedOrigins: ["*"] }],
      },
      GetBucketLifecycleConfigurationCommand: {
        Rules: [
          {
            ID: "expire",
            Status: "Enabled",
            Filter: { Prefix: "" },
            Expiration: { Days: 7 },
          },
        ],
      },
    })
    const result = await updateBucketSettings("my-bucket", {
      versioning: "Enabled",
      encryption: null,
      corsRules: [],
      lifecycleRules: [],
    })
    expect(result.warnings).toHaveLength(0)
    expect(sentNamed("DeleteBucketEncryptionCommand")).toHaveLength(1)
    expect(sentNamed("DeleteBucketCorsCommand")).toHaveLength(1)
    expect(sentNamed("DeleteBucketLifecycleCommand")).toHaveLength(1)
  })

  it("should not write CORS or lifecycle when nothing changed", async () => {
    respondByCommand({
      GetBucketCorsCommand: {
        CORSRules: [
          {
            AllowedMethods: ["GET"],
            AllowedOrigins: ["*"],
            ExposeHeaders: ["ETag"],
          },
        ],
      },
      GetBucketLifecycleConfigurationCommand: awsError(
        "NoSuchLifecycleConfiguration",
        404,
      ),
    })
    const result = await updateBucketSettings("my-bucket", {
      corsRules: [
        {
          allowedMethods: ["GET"],
          allowedOrigins: ["*"],
          allowedHeaders: [],
          maxAge: 0,
        },
      ],
      lifecycleRules: [],
    })
    expect(result.warnings).toHaveLength(0)
    expect(sentNamed("PutBucketCorsCommand")).toHaveLength(0)
    expect(sentNamed("DeleteBucketCorsCommand")).toHaveLength(0)
    expect(sentNamed("DeleteBucketLifecycleCommand")).toHaveLength(0)
  })

  it("should carry ExposeHeaders, ID and an explicit zero max age over on CORS edits", async () => {
    respondByCommand({
      GetBucketCorsCommand: {
        CORSRules: [
          {
            ID: "upload",
            AllowedMethods: ["PUT"],
            AllowedOrigins: ["*"],
            ExposeHeaders: ["ETag"],
            MaxAgeSeconds: 0,
          },
        ],
      },
    })
    await updateBucketSettings("my-bucket", {
      corsRules: [
        {
          allowedMethods: ["PUT"],
          allowedOrigins: ["*"],
          allowedHeaders: [],
          maxAge: 0,
        },
        {
          allowedMethods: ["GET"],
          allowedOrigins: ["*"],
          allowedHeaders: [],
          maxAge: 0,
        },
      ],
    })
    const rules = (
      (sentNamed("PutBucketCorsCommand")[0]?.input ?? {}) as {
        CORSConfiguration: { CORSRules: Record<string, unknown>[] }
      }
    ).CORSConfiguration.CORSRules
    expect(rules[0]).toMatchObject({
      ID: "upload",
      ExposeHeaders: ["ETag"],
      MaxAgeSeconds: 0,
    })
    expect(rules[1]?.MaxAgeSeconds).toBeUndefined()
  })

  it("should keep lifecycle rules the form cannot edit", async () => {
    const archive = {
      ID: "archive",
      Status: "Enabled",
      Filter: { And: { Prefix: "logs/", Tags: [{ Key: "k", Value: "v" }] } },
      Transitions: [{ Days: 30, StorageClass: "GLACIER" }],
    }
    const disabled = { ID: "old", Status: "Disabled", Expiration: { Days: 1 } }
    respondByCommand({
      GetBucketLifecycleConfigurationCommand: {
        Rules: [
          archive,
          disabled,
          {
            ID: "expire",
            Status: "Enabled",
            Filter: { Prefix: "tmp/" },
            Expiration: { Days: 7 },
          },
        ],
      },
    })
    await updateBucketSettings("my-bucket", {
      lifecycleRules: [{ id: "expire", prefix: "tmp/", expirationDays: 14 }],
    })
    const rules = (
      (sentNamed("PutBucketLifecycleConfigurationCommand")[0]?.input ?? {}) as {
        LifecycleConfiguration: { Rules: unknown[] }
      }
    ).LifecycleConfiguration.Rules
    expect(rules).toEqual([
      archive,
      disabled,
      {
        ID: "expire",
        Status: "Enabled",
        Filter: { Prefix: "tmp/" },
        Expiration: { Days: 14 },
      },
    ])

    mockSend.mockClear()
    await updateBucketSettings("my-bucket", { lifecycleRules: [] })
    expect(sentNamed("DeleteBucketLifecycleCommand")).toHaveLength(0)
    expect(
      (
        (sentNamed("PutBucketLifecycleConfigurationCommand")[0]?.input ??
          {}) as {
          LifecycleConfiguration: { Rules: unknown[] }
        }
      ).LifecycleConfiguration.Rules,
    ).toEqual([archive, disabled])
  })

  it("should warn instead of clobbering a preserved lifecycle rule ID", async () => {
    respondByCommand({
      GetBucketLifecycleConfigurationCommand: {
        Rules: [{ ID: "old", Status: "Disabled", Expiration: { Days: 1 } }],
      },
    })
    const result = await updateBucketSettings("my-bucket", {
      lifecycleRules: [{ id: "old", prefix: "", expirationDays: 3 }],
    })
    expect(result.warnings[0]).toContain("Lifecycle")
    expect(sentNamed("PutBucketLifecycleConfigurationCommand")).toHaveLength(0)
  })

  it("should not delete a section whose current state cannot be read", async () => {
    respondByCommand({ GetBucketCorsCommand: awsError("TimeoutError", 500) })
    const result = await updateBucketSettings("my-bucket", { corsRules: [] })
    expect(result.warnings[0]).toContain("CORS")
    expect(sentNamed("DeleteBucketCorsCommand")).toHaveLength(0)
  })

  it("should delete bucket tagging when every tag is removed", async () => {
    const result = await updateBucketSettings("my-bucket", {
      versioning: "Enabled",
      tags: [],
    })
    expect(result.warnings).toHaveLength(0)
    expect(sentNamed("DeleteBucketTaggingCommand")).toHaveLength(1)
  })

  it("should put bucket tagging when tags remain", async () => {
    await updateBucketSettings("my-bucket", {
      versioning: "Enabled",
      tags: [{ key: "env", value: "local" }],
    })
    const command = sentNamed("PutBucketTaggingCommand")[0] as {
      input?: { Tagging?: { TagSet?: unknown } }
    }
    expect(command?.input?.Tagging?.TagSet).toEqual([
      { Key: "env", Value: "local" },
    ])
  })

  it("should return warnings when delete operations fail", async () => {
    respondByCommand({
      GetBucketCorsCommand: { CORSRules: [{ AllowedMethods: ["GET"] }] },
      GetBucketLifecycleConfigurationCommand: {
        Rules: [
          { ID: "a", Status: "Enabled", Filter: {}, Expiration: { Days: 1 } },
        ],
      },
      DeleteBucketEncryptionCommand: new Error("Delete encryption failed"),
      DeleteBucketCorsCommand: new Error("Delete cors failed"),
      DeleteBucketLifecycleCommand: new Error("Delete lifecycle failed"),
    })
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

  it("should map NoSuchBucket to NotFound", async () => {
    mockSend.mockRejectedValueOnce(awsError("NoSuchBucket"))
    await expect(listObjects("missing", "")).rejects.toMatchObject({
      code: "NotFound",
    })
  })
})

describe("getBucketVersioningEnabled", () => {
  it("should treat suspended buckets as holding versions", async () => {
    mockSend.mockResolvedValueOnce({ Status: "Suspended" })
    expect(await getBucketVersioningEnabled("my-bucket")).toBe(true)
  })

  it("should return false for a missing bucket", async () => {
    mockSend.mockRejectedValueOnce(awsError("NoSuchBucket", 404))
    expect(await getBucketVersioningEnabled("my-bucket")).toBe(false)
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

  it("should map NoSuchVersion to NotFound", async () => {
    mockSend.mockRejectedValueOnce(awsError("NoSuchVersion"))
    await expect(
      getObjectForDownload("my-bucket", "file.txt", "stale"),
    ).rejects.toMatchObject({ code: "NotFound" })
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

const bytesOf = (text: string) => new TextEncoder().encode(text)

describe("getObjectPreview", () => {
  it("should return text preview for text content types", async () => {
    mockSend.mockResolvedValueOnce({
      ContentType: "text/plain",
      ContentLength: 11,
    })
    mockSend.mockResolvedValueOnce({
      Body: { transformToByteArray: async () => bytesOf("hello world") },
      ContentRange: "bytes 0-10/11",
    })
    const result = await getObjectPreview("my-bucket", "file.txt")
    expect(result.mode).toBe("text")
    expect(result.text).toBe("hello world")
    expect(result.truncated).toBe(false)
  })

  it("should return an empty preview for an empty object without a ranged GET", async () => {
    mockSend.mockResolvedValueOnce({
      ContentType: "text/plain",
      ContentLength: 0,
    })
    const result = await getObjectPreview("my-bucket", "empty.txt")
    expect(result).toMatchObject({ mode: "text", text: "", truncated: false })
    expect(mockSend).toHaveBeenCalledTimes(1)
  })

  it("should decode with the declared charset", async () => {
    mockSend.mockResolvedValueOnce({
      ContentType: "text/plain; charset=shift_jis",
      ContentLength: 2,
    })
    mockSend.mockResolvedValueOnce({
      Body: { transformToByteArray: async () => new Uint8Array([0x82, 0xa0]) },
    })
    const result = await getObjectPreview("my-bucket", "sjis.txt")
    expect(result.text).toBe("あ")
  })

  it("should mark large objects truncated without a dangling partial character", async () => {
    mockSend.mockResolvedValueOnce({
      ContentType: "text/plain",
      ContentLength: 200_000,
    })
    mockSend.mockResolvedValueOnce({
      Body: {
        transformToByteArray: async () => new Uint8Array([0x61, 0xe3, 0x81]),
      },
    })
    const result = await getObjectPreview("my-bucket", "big.txt")
    expect(result.truncated).toBe(true)
    expect(result.text).toBe("a")
  })

  it("should map a missing object to NotFound", async () => {
    mockSend.mockResolvedValueOnce({
      ContentType: "text/plain",
      ContentLength: 5,
    })
    mockSend.mockRejectedValueOnce(awsError("NoSuchKey", 404))
    await expect(
      getObjectPreview("my-bucket", "gone.txt"),
    ).rejects.toMatchObject({ code: "NotFound" })
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
    mockSend.mockResolvedValueOnce({
      ContentType: "application/json",
      ContentLength: 16,
    })
    mockSend.mockResolvedValueOnce({
      Body: { transformToByteArray: async () => bytesOf('{"key": "value"}') },
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
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(
        Object.assign(new Error("missing"), {
          name: "NotFound",
          $metadata: { httpStatusCode: 404 },
        }),
      )
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})

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
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(
        Object.assign(new Error("missing"), {
          name: "NotFound",
          $metadata: { httpStatusCode: 404 },
        }),
      )
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("delete failed"))
      .mockResolvedValueOnce({})

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
      .mockResolvedValueOnce({ Contents: [] })
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

  it("should reject when a target key already exists", async () => {
    mockSend
      .mockResolvedValueOnce({ Contents: [{ Key: "reports/a.txt" }] })
      .mockResolvedValueOnce({ Contents: [{ Key: "archive/a.txt" }] })
    await expect(
      renameFolder("my-bucket", "reports/", "archive/"),
    ).rejects.toMatchObject({ code: "AlreadyExists" })
    expect(mockSend).toHaveBeenCalledTimes(2)
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
    mockSend
      .mockResolvedValueOnce({
        Contents: [{ Key: "reports/a.txt" }, { Key: "reports/b.txt" }],
        NextContinuationToken: undefined,
      })
      .mockResolvedValueOnce({ Contents: [] })
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("Network timeout"))
      .mockResolvedValueOnce({
        Deleted: [{ Key: "archive/a.txt" }],
      })

    const result = await renameFolder("my-bucket", "reports/", "archive/")
    expect(result.copiedCount).toBe(0)
    expect(result.deletedCount).toBe(0)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]?.message).toBe("Network timeout")
    expect(mockSend).toHaveBeenCalledTimes(5)
    const calls = mockSend.mock.calls as unknown[][]
    expect(
      (calls[4]?.[0] as { constructor?: { name?: string } })?.constructor?.name,
    ).toBe("DeleteObjectsCommand")
  })
})

describe("renameFolder concurrency and rollback", () => {
  it("should bound concurrent copies", async () => {
    const keys = Array.from({ length: 40 }, (_, i) => ({ Key: `src/${i}` }))
    let inFlight = 0
    let peak = 0
    respondByCommand({
      ListObjectsV2Command: (command) =>
        command.input.Prefix === "src/" ? { Contents: keys } : { Contents: [] },
      CopyObjectCommand: async () => {
        inFlight += 1
        peak = Math.max(peak, inFlight)
        await Promise.resolve()
        inFlight -= 1
        return {}
      },
    })
    const result = await renameFolder("my-bucket", "src/", "dst/")
    expect(result.copiedCount).toBe(40)
    expect(peak).toBeLessThanOrEqual(16)
  })

  it("should report rollback failures", async () => {
    respondByCommand({
      ListObjectsV2Command: (command) =>
        command.input.Prefix === "src/"
          ? { Contents: [{ Key: "src/a" }, { Key: "src/b" }] }
          : { Contents: [] },
      CopyObjectCommand: (command) =>
        command.input.Key === "dst/b"
          ? Promise.reject(new Error("copy failed"))
          : {},
      DeleteObjectsCommand: {
        Errors: [{ Key: "dst/a", Message: "rollback failed" }],
      },
    })
    const result = await renameFolder("my-bucket", "src/", "dst/")
    expect(result.errors).toEqual([
      { target: "src/b", message: "copy failed" },
      { target: "dst/a", message: "rollback failed" },
    ])
  })
})

describe("updateObjectProperties", () => {
  it("should replace content type while preserving metadata", async () => {
    mockSend
      .mockResolvedValueOnce({
        ContentType: "text/plain",
        CacheControl: "max-age=60",
        ContentDisposition: 'inline; filename="file.txt"',
        ContentEncoding: "gzip",
        ContentLanguage: "ja",
        Expires: new Date("2026-04-12T00:00:00.000Z"),
        Metadata: { owner: "team-a" },
        StorageClass: "STANDARD_IA",
        ServerSideEncryption: "aws:kms",
        SSEKMSKeyId: "key-1",
        BucketKeyEnabled: true,
        WebsiteRedirectLocation: "/elsewhere",
      })
      .mockResolvedValueOnce({})

    await updateObjectProperties("my-bucket", "file.txt", {
      contentType: "Multipart/Mixed; boundary=AbC",
    })

    expect(mockSend).toHaveBeenCalledTimes(2)
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
      ContentType: "multipart/mixed; boundary=AbC",
      Metadata: { owner: "team-a" },
      StorageClass: "STANDARD_IA",
      ServerSideEncryption: "aws:kms",
      SSEKMSKeyId: "key-1",
      BucketKeyEnabled: true,
      WebsiteRedirectLocation: "/elsewhere",
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

  it("should nest a folder whose name starts with the parent's name", async () => {
    const result = await createFolderObject("my-bucket", "a/", "a/b")
    expect(result.key).toBe("a/a/b/")
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
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("S3 write error"))

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

  it("should delete keys exactly as listed, including leading slashes and spaces", async () => {
    respondByCommand({
      ListObjectsV2Command: { Contents: [{ Key: "/x/a" }] },
      DeleteObjectsCommand: {},
    })
    await deleteSelectedObjects("my-bucket", {
      files: ["report.txt "],
      folders: ["/x/"],
    })
    expect(sentNamed("ListObjectsV2Command")[0]?.input.Prefix).toBe("/x/")
    expect(sentNamed("DeleteObjectsCommand")[0]?.input).toMatchObject({
      Delete: { Objects: [{ Key: "report.txt " }, { Key: "/x/a" }] },
    })
  })

  it("should reject when neither files nor folders are provided", async () => {
    await expect(deleteSelectedObjects("my-bucket", {})).rejects.toMatchObject({
      code: "InvalidInput",
    })
    expect(mockSend).not.toHaveBeenCalled()
  })

  it("should accumulate folder listing errors without aborting remaining deletions", async () => {
    mockSend
      .mockRejectedValueOnce(new Error("list failed"))
      .mockResolvedValueOnce({
        Deleted: [{ Key: "direct.txt" }],
      })

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
