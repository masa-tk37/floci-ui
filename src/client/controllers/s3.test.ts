import { describe, expect, it } from "bun:test"

import { createS3CreateBucketController } from "./s3"

function makeEl(): HTMLElement {
  return {} as HTMLElement
}

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
