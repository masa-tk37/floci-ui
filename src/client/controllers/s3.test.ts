import { afterEach, describe, expect, it } from "bun:test"

import {
  createS3CreateBucketController,
  createS3ObjectListController,
  createS3SettingsController,
} from "./s3"

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

describe("createS3SettingsController.submit", () => {
  it("rejects a lifecycle rule without an ID instead of dropping it", async () => {
    const ctrl = createS3SettingsController(makeEl(), {
      bucket: "b",
      versioning: "Disabled",
      encryption: "none",
      kmsKeyId: "",
      ownership: "BucketOwnerEnforced",
      blockPublicAcls: true,
      ignorePublicAcls: true,
      blockPublicPolicy: true,
      restrictPublicBuckets: true,
      tags: [],
      corsRules: [],
      lifecycleRules: [],
    })
    ctrl.addLifecycle()
    await ctrl.submit()
    expect(ctrl.error).toContain("ルール ID")
    expect(ctrl.submitting).toBe(false)
  })
})

describe("createS3ObjectListController.saveProperties", () => {
  const originalFetch = globalThis.fetch
  const originalWindow = globalThis.window
  let urls: string[] = []

  function setup() {
    urls = []
    globalThis.fetch = (async (url: string) => {
      urls.push(url)
      return new Response(JSON.stringify({ ok: true, data: {} }))
    }) as unknown as typeof fetch
    globalThis.window = {
      location: { reload() {} },
    } as unknown as typeof globalThis.window
    const ctrl = createS3ObjectListController(makeEl(), {
      bucket: "b",
      prefix: "",
      fileKeys: [],
      folderPrefixes: [],
    })
    ctrl.propertyKey = "k"
    ctrl.propertyLoadedContentType = "text/plain"
    ctrl.propertyContentType = "text/plain"
    return ctrl
  }

  afterEach(() => {
    globalThis.fetch = originalFetch
    globalThis.window = originalWindow
  })

  it("does not overwrite tags that failed to load", async () => {
    const ctrl = setup()
    ctrl.propertyTagsLoaded = false
    ctrl.propertyContentType = "application/json"
    await ctrl.saveProperties()
    expect(urls).toEqual(["/s3/b/object-properties"])
  })

  it("skips the self-copy when Content-Type is unchanged", async () => {
    const ctrl = setup()
    ctrl.propertyTagsLoaded = true
    ctrl.propertyContentType = " TEXT/plain "
    await ctrl.saveProperties()
    expect(urls).toEqual(["/s3/b/object-tags"])
  })
})
