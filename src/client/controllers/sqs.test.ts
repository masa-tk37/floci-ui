import { describe, expect, it } from "bun:test"

import {
  createSqsCreateQueueController,
  createSqsQueueDetailController,
} from "./sqs"

function makeEl(): HTMLElement {
  return {} as HTMLElement
}

function makeDetailProps(overrides = {}) {
  return {
    queuePath: "/sqs/demo",
    isFifo: false,
    requiresDeduplicationId: false,
    initialMessages: [],
    initialAttributes: {
      depth: 0,
      inFlight: 0,
      delayed: 0,
      visibilityTimeout: 30,
      messageRetention: 345600,
      dlqName: null,
      contentBasedDeduplication: false,
    },
    ...overrides,
  }
}

describe("createSqsCreateQueueController.resolvedName", () => {
  it("appends .fifo suffix when isFifo and name has no suffix", () => {
    const ctrl = createSqsCreateQueueController(makeEl(), {})
    ctrl.name = "my-queue"
    ctrl.isFifo = true
    expect(ctrl.resolvedName).toBe("my-queue.fifo")
  })

  it("does not double-append .fifo suffix when name already ends with .fifo", () => {
    const ctrl = createSqsCreateQueueController(makeEl(), {})
    ctrl.name = "my-queue.fifo"
    ctrl.isFifo = true
    expect(ctrl.resolvedName).toBe("my-queue.fifo")
  })

  it("returns name unchanged when isFifo is false", () => {
    const ctrl = createSqsCreateQueueController(makeEl(), {})
    ctrl.name = "my-queue"
    ctrl.isFifo = false
    expect(ctrl.resolvedName).toBe("my-queue")
  })
})

describe("createSqsQueueDetailController.send", () => {
  it("sets error and aborts when groupId is missing for FIFO queue", async () => {
    const ctrl = createSqsQueueDetailController(
      makeEl(),
      makeDetailProps({ isFifo: true }),
    )
    ctrl.body = "hello"
    ctrl.groupId = ""
    await ctrl.send()
    expect(ctrl.error).toContain("Group ID")
    expect(ctrl.sending).toBe(false)
  })

  it("sets error when deduplicationId is missing for non-CBD FIFO queue", async () => {
    const ctrl = createSqsQueueDetailController(
      makeEl(),
      makeDetailProps({ isFifo: true, requiresDeduplicationId: true }),
    )
    ctrl.body = "hello"
    ctrl.groupId = "g1"
    ctrl.deduplicationId = ""
    await ctrl.send()
    expect(ctrl.error).toContain("Deduplication ID")
    expect(ctrl.sending).toBe(false)
  })
})
