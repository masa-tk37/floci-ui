import { describe, expect, it } from "bun:test"

import { createS3CreateBucketController, normalizeUploadPrefix } from "./s3"

function makeEl(): HTMLElement {
  return {} as HTMLElement
}

describe("normalizeUploadPrefix", () => {
  it("keeps the bucket root empty rather than producing a lone slash", () => {
    expect(normalizeUploadPrefix("")).toBe("")
    expect(normalizeUploadPrefix("   ")).toBe("")
    expect(normalizeUploadPrefix("/")).toBe("")
  })

  it("appends the trailing slash a prefix needs to act as a folder", () => {
    expect(normalizeUploadPrefix("uploads")).toBe("uploads/")
    expect(normalizeUploadPrefix("uploads/")).toBe("uploads/")
    expect(normalizeUploadPrefix(" nested/dir ")).toBe("nested/dir/")
  })

  it("strips leading slashes so the key does not start with an empty segment", () => {
    expect(normalizeUploadPrefix("/uploads/2024")).toBe("uploads/2024/")
  })
})

describe("createS3CreateBucketController.buildPayload", () => {
  it("sets encryption to null when 'none' is selected", () => {
    const ctrl = createS3CreateBucketController(makeEl(), {})
    ctrl.encryption = "none"
    const payload = ctrl.buildPayload()
    expect(payload.encryption).toBeNull()
  })

  it("omits kmsKeyId from payload when 'aws:kms' is selected with empty kmsKeyId", () => {
    const ctrl = createS3CreateBucketController(makeEl(), {})
    ctrl.encryption = "aws:kms"
    ctrl.kmsKeyId = ""
    const payload = ctrl.buildPayload()
    expect(payload.encryption).toEqual({ type: "aws:kms", kmsKeyId: undefined })
  })

  it("includes kmsKeyId when 'aws:kms' is selected with non-empty kmsKeyId", () => {
    const ctrl = createS3CreateBucketController(makeEl(), {})
    ctrl.encryption = "aws:kms"
    ctrl.kmsKeyId = "arn:aws:kms:us-east-1:000000000000:key/my-key"
    const payload = ctrl.buildPayload()
    expect(payload.encryption).toEqual({
      type: "aws:kms",
      kmsKeyId: "arn:aws:kms:us-east-1:000000000000:key/my-key",
    })
  })
})
