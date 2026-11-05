import { afterEach, describe, expect, it } from "bun:test"

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

describe("createSqsCreateQueueController.submit validation", () => {
  it("rejects a blank numeric field instead of sending an empty attribute", async () => {
    const ctrl = createSqsCreateQueueController(makeEl(), {})
    ctrl.name = "q"
    ctrl.visibilityTimeout = "" as unknown as number
    await ctrl.submit()
    expect(ctrl.error).toContain("可視性タイムアウト")
  })

  it("rejects a fractional numeric field", async () => {
    const ctrl = createSqsCreateQueueController(makeEl(), {})
    ctrl.name = "q"
    ctrl.delaySeconds = "1.5" as unknown as number
    await ctrl.submit()
    expect(ctrl.error).toContain("配信遅延")
  })

  it("accepts a 1 MiB maximum message size", async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ ok: false }), {
        status: 500,
      })) as unknown as typeof fetch
    try {
      const ctrl = createSqsCreateQueueController(makeEl(), {})
      ctrl.name = "q"
      ctrl.maximumMessageSize = 1048576
      await ctrl.submit()
      expect(ctrl.error).not.toContain("最大メッセージサイズ")
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

describe("createSqsQueueDetailController.sendBatch", () => {
  const originalFetch = globalThis.fetch
  let requests: { url: string; body: unknown }[] = []

  function stubFetch(sendBatchData: unknown) {
    requests = []
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      requests.push({
        url,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      })
      let data: unknown = sendBatchData
      if (url.endsWith("messages.json")) data = { messages: [] }
      if (url.endsWith("attributes.json")) {
        data = { attributes: makeDetailProps().initialAttributes }
      }
      return new Response(JSON.stringify({ ok: true, data }))
    }) as unknown as typeof fetch
  }

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it("requires a group ID on FIFO queues", async () => {
    const ctrl = createSqsQueueDetailController(
      makeEl(),
      makeDetailProps({ isFifo: true }),
    )
    ctrl.batchBodies = "a\nb"
    await ctrl.sendBatch()
    expect(ctrl.batchError).toContain("Group ID")
  })

  it("sends group ID and a unique deduplication ID per entry", async () => {
    stubFetch({ result: { successful: [], failed: [] } })
    const ctrl = createSqsQueueDetailController(
      makeEl(),
      makeDetailProps({ isFifo: true, requiresDeduplicationId: true }),
    )
    ctrl.batchBodies = "a\nb"
    ctrl.groupId = "g1"
    ctrl.deduplicationId = "d"
    await ctrl.sendBatch()
    expect(requests[0]?.body).toEqual({
      entries: [
        {
          id: "msg-0",
          body: "a",
          groupId: "g1",
          messageDeduplicationId: "d-0",
        },
        {
          id: "msg-1",
          body: "b",
          groupId: "g1",
          messageDeduplicationId: "d-1",
        },
      ],
    })
  })

  it("keeps the modal open with only the failed lines and their reasons", async () => {
    stubFetch({
      result: {
        successful: [{ id: "msg-0", messageId: "m0" }],
        failed: [{ id: "msg-1", code: "TooLarge", message: "too big" }],
      },
    })
    const ctrl = createSqsQueueDetailController(makeEl(), makeDetailProps())
    ctrl.open = true
    ctrl.batchBodies = "a\nb"
    await ctrl.sendBatch()
    expect(ctrl.open).toBe(true)
    expect(ctrl.batchBodies).toBe("b")
    expect(ctrl.batchError).toContain("msg-1: too big")
  })
})

describe("createSqsQueueDetailController.openSend", () => {
  it("clears errors left from a previous attempt", () => {
    const ctrl = createSqsQueueDetailController(makeEl(), makeDetailProps())
    ctrl.error = "old"
    ctrl.batchError = "old"
    ctrl.openSend()
    expect(ctrl.error).toBe("")
    expect(ctrl.batchError).toBe("")
  })
})
