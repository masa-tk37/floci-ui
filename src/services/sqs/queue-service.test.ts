import { beforeEach, describe, expect, it, mock, spyOn } from "bun:test"

const mockSend = mock(() => Promise.resolve({}))
mock.module("../../infrastructure/floci-clients", () => ({
  dynamodb: { send: mockSend },
  s3: { send: mockSend },
  sqs: { send: mockSend },
  FLOCI_ENDPOINT: "http://localhost:4566",
  FLOCI_REGION: "us-east-1",
  FLOCI_ACCOUNT_ID: "000000000000",
}))

const emptyMessagesResponse = { messages: [] }
const mockFetch = spyOn(globalThis, "fetch").mockResolvedValue(
  new Response(JSON.stringify(emptyMessagesResponse), {
    headers: { "Content-Type": "application/json" },
  }),
)

import {
  createQueue,
  deleteMessage,
  deleteMessageById,
  deleteQueue,
  getQueueAttributes,
  getQueueDetail,
  getQueueMessages,
  getQueueSettings,
  listQueueNames,
  listQueues,
  purgeQueue,
  sendMessage,
  sendMessageBatch,
  updateQueueSettings,
} from "./queue-service"
import { queueNameFromUrl } from "./queue-utils"

beforeEach(() => {
  mockSend.mockClear()
  mockFetch.mockResolvedValue(
    new Response(JSON.stringify(emptyMessagesResponse), {
      headers: { "Content-Type": "application/json" },
    }),
  )
})

describe("listQueues", () => {
  it("extracts queue names from SQS URLs", () => {
    expect(
      queueNameFromUrl("http://localhost:4566/000000000000/my-queue"),
    ).toBe("my-queue")
    expect(queueNameFromUrl("my-queue")).toBe("my-queue")
  })

  it("should return queue summaries", async () => {
    mockSend
      .mockResolvedValueOnce({
        QueueUrls: ["http://localhost:4566/000000000000/queue1"],
      })
      .mockResolvedValueOnce({
        Attributes: {
          ApproximateNumberOfMessages: "5",
          QueueArn: "arn:aws:sqs:us-east-1:000000000000:queue1",
          RedrivePolicy: undefined,
        },
      })
    const result = await listQueues()
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe("queue1")
    expect(result[0].depth).toBe(5)
    expect(result[0].dlqName).toBeNull()
  })

  it("should return empty array when no queues", async () => {
    mockSend.mockResolvedValueOnce({ QueueUrls: undefined })
    const result = await listQueues()
    expect(result).toEqual([])
  })

  it("should return queue with dlq name when RedrivePolicy exists", async () => {
    mockSend
      .mockResolvedValueOnce({
        QueueUrls: ["http://localhost:4566/000000000000/main-queue"],
      })
      .mockResolvedValueOnce({
        Attributes: {
          ApproximateNumberOfMessages: "0",
          RedrivePolicy: JSON.stringify({
            deadLetterTargetArn:
              "arn:aws:sqs:us-east-1:000000000000:dead-letter-queue",
          }),
        },
      })
    const result = await listQueues()
    expect(result[0].dlqName).toBe("dead-letter-queue")
  })
})

describe("listQueueNames", () => {
  it("returns queue names without loading per-queue attributes", async () => {
    mockSend.mockResolvedValueOnce({
      QueueUrls: [
        "http://localhost:4566/000000000000/queue1",
        "http://localhost:4566/000000000000/queue2",
      ],
    })

    await expect(listQueueNames()).resolves.toEqual(["queue1", "queue2"])
    expect(mockSend).toHaveBeenCalledTimes(1)
  })
})

describe("createQueue", () => {
  it("should create a queue", async () => {
    mockSend.mockResolvedValueOnce({
      QueueUrl: "http://localhost:4566/000000000000/new-queue",
    })
    await expect(createQueue("new-queue")).resolves.toBeUndefined()
    expect(mockSend).toHaveBeenCalledTimes(1)
  })

  it("should throw ServiceError on failure", async () => {
    mockSend.mockRejectedValueOnce(new Error("Queue creation failed"))
    await expect(createQueue("bad-queue")).rejects.toMatchObject({
      code: "OperationFailed",
    })
  })
})

describe("deleteQueue", () => {
  it("should delete a queue", async () => {
    mockSend.mockResolvedValueOnce({})
    await expect(deleteQueue("my-queue")).resolves.toBeUndefined()
    expect(mockSend).toHaveBeenCalledTimes(1)
  })

  it("should throw ServiceError NotFound on QueueDoesNotExist", async () => {
    const awsError = Object.assign(new Error("Queue does not exist"), {
      name: "QueueDoesNotExist",
    })
    mockSend.mockRejectedValueOnce(awsError)
    await expect(deleteQueue("missing-queue")).rejects.toMatchObject({
      code: "NotFound",
    })
  })
})

describe("getQueueDetail", () => {
  it("should return queue detail with attributes and messages", async () => {
    mockSend.mockResolvedValueOnce({
      Attributes: {
        ApproximateNumberOfMessages: "3",
        ApproximateNumberOfMessagesNotVisible: "1",
        ApproximateNumberOfMessagesDelayed: "0",
        VisibilityTimeout: "30",
        MessageRetentionPeriod: "345600",
        ContentBasedDeduplication: "false",
        RedrivePolicy: undefined,
      },
    })
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          messages: [
            {
              MessageId: "msg-1",
              Body: "hello",
              ReceiptHandle: null,
              Attributes: {
                SentTimestamp: "1700000000000",
                ApproximateReceiveCount: "2",
              },
            },
          ],
        }),
        { headers: { "Content-Type": "application/json" } },
      ),
    )
    const result = await getQueueDetail("my-queue")
    expect(result.attributes.depth).toBe(3)
    expect(result.attributes.inFlight).toBe(1)
    expect(result.attributes.contentBasedDeduplication).toBe(false)
    expect(result.messages).toHaveLength(1)
    expect(result.messages[0].messageId).toBe("msg-1")
    expect(result.messages[0].receiveCount).toBe(2)
  })
})

describe("getQueueSettings", () => {
  it("should return queue settings", async () => {
    mockSend
      .mockResolvedValueOnce({
        Attributes: {
          FifoQueue: "false",
          VisibilityTimeout: "30",
          MessageRetentionPeriod: "345600",
          DelaySeconds: "0",
          ReceiveMessageWaitTimeSeconds: "0",
          MaximumMessageSize: "262144",
        },
      })
      .mockResolvedValueOnce({ Tags: { env: "dev" } })
    const result = await getQueueSettings("my-queue")
    expect(result.name).toBe("my-queue")
    expect(result.visibilityTimeout).toBe(30)
    expect(result.isFifo).toBe(false)
    expect(result.tags).toEqual([{ key: "env", value: "dev" }])
  })
})

describe("updateQueueSettings", () => {
  it("should update attributes and tags", async () => {
    // ListQueueTagsCommand (existing tags fetch) + SetQueueAttributesCommand + TagQueueCommand
    mockSend
      .mockResolvedValueOnce({ Tags: {} })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
    await expect(
      updateQueueSettings(
        "my-queue",
        { VisibilityTimeout: "60" },
        { env: "prod" },
      ),
    ).resolves.toBeUndefined()
    expect(mockSend).toHaveBeenCalledTimes(3)
  })

  it("should skip tag update when tags is empty", async () => {
    // ListQueueTagsCommand (existing tags fetch) + SetQueueAttributesCommand
    mockSend.mockResolvedValueOnce({ Tags: {} }).mockResolvedValueOnce({})
    await expect(
      updateQueueSettings("my-queue", { VisibilityTimeout: "60" }, {}),
    ).resolves.toBeUndefined()
    expect(mockSend).toHaveBeenCalledTimes(2)
  })
})

describe("sendMessage", () => {
  it("should return message id", async () => {
    mockSend.mockResolvedValueOnce({ MessageId: "msg-abc-123" })
    const result = await sendMessage("my-queue", "hello world")
    expect(result).toBe("msg-abc-123")
  })

  it("should forward FIFO deduplication fields when provided", async () => {
    mockSend.mockResolvedValueOnce({ MessageId: "msg-abc-123" })
    await sendMessage("my-queue.fifo", "hello world", "group-1", "dedup-1")
    const calls = mockSend.mock.calls as unknown[][]
    expect(mockSend).toHaveBeenCalledTimes(1)
    expect((calls[0]?.[0] as { input?: unknown })?.input).toMatchObject({
      MessageGroupId: "group-1",
      MessageDeduplicationId: "dedup-1",
    })
  })
})

describe("purgeQueue", () => {
  it("should purge the queue", async () => {
    mockSend.mockResolvedValueOnce({})
    await expect(purgeQueue("my-queue")).resolves.toBeUndefined()
    expect(mockSend).toHaveBeenCalledTimes(1)
  })
})

describe("getQueueMessages", () => {
  it("returns mapped messages with receiveCount", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          messages: [
            {
              MessageId: "msg-1",
              ReceiptHandle: "rh-1",
              Body: "hello",
              Attributes: {
                SentTimestamp: "1700000000000",
                ApproximateReceiveCount: "3",
              },
            },
          ],
        }),
        { headers: { "Content-Type": "application/json" } },
      ),
    )
    const result = await getQueueMessages("my-queue")
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      messageId: "msg-1",
      receiptHandle: "rh-1",
      body: "hello",
      sentTimestamp: 1700000000000,
      receiveCount: 3,
    })
  })

  it("returns receiveCount null when ApproximateReceiveCount is absent", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          messages: [
            {
              MessageId: "msg-2",
              ReceiptHandle: "rh-2",
              Body: "world",
              Attributes: { SentTimestamp: "1700000000000" },
            },
          ],
        }),
        { headers: { "Content-Type": "application/json" } },
      ),
    )
    const result = await getQueueMessages("my-queue")
    expect(result[0].receiveCount).toBeNull()
  })

  it("returns empty array when no messages", async () => {
    // mockFetch already returns empty messages by default in beforeEach
    const result = await getQueueMessages("my-queue")
    expect(result).toEqual([])
  })
})

describe("getQueueAttributes", () => {
  it("returns parsed queue attributes", async () => {
    mockSend.mockResolvedValueOnce({
      Attributes: {
        ApproximateNumberOfMessages: "7",
        ApproximateNumberOfMessagesNotVisible: "2",
        ApproximateNumberOfMessagesDelayed: "1",
        VisibilityTimeout: "30",
        MessageRetentionPeriod: "86400",
        ContentBasedDeduplication: "true",
        QueueArn: "arn:aws:sqs:us-east-1:000000000000:my-queue",
      },
    })
    const result = await getQueueAttributes("my-queue")
    expect(result).toMatchObject({
      depth: 7,
      inFlight: 2,
      delayed: 1,
      visibilityTimeout: 30,
      messageRetention: 86400,
      contentBasedDeduplication: true,
      queueArn: "arn:aws:sqs:us-east-1:000000000000:my-queue",
      dlqName: null,
    })
  })
})

describe("deleteMessage", () => {
  it("deletes a message by receipt handle", async () => {
    mockSend.mockResolvedValueOnce({})
    await expect(deleteMessage("my-queue", "rh-abc")).resolves.toBeUndefined()
    const calls = mockSend.mock.calls as unknown[][]
    expect((calls[0]?.[0] as { input?: unknown })?.input).toMatchObject({
      ReceiptHandle: "rh-abc",
    })
  })

  it("throws OperationFailed on error", async () => {
    mockSend.mockRejectedValueOnce(new Error("delete failed"))
    await expect(deleteMessage("my-queue", "rh-bad")).rejects.toMatchObject({
      code: "OperationFailed",
    })
  })
})

describe("deleteMessageById", () => {
  it("receives messages, finds target by id, then deletes by receipt handle", async () => {
    mockSend
      .mockResolvedValueOnce({
        Messages: [
          { MessageId: "msg-1", ReceiptHandle: "rh-1", Body: "hello" },
          { MessageId: "msg-2", ReceiptHandle: "rh-2", Body: "world" },
        ],
      })
      .mockResolvedValueOnce({})
    await expect(
      deleteMessageById("my-queue", "msg-1"),
    ).resolves.toBeUndefined()
    const calls = mockSend.mock.calls as unknown[][]
    expect((calls[1]?.[0] as { input?: unknown })?.input).toMatchObject({
      ReceiptHandle: "rh-1",
    })
  })

  it("throws NotFound when messageId is not in received messages", async () => {
    mockSend.mockResolvedValueOnce({ Messages: [] })
    await expect(
      deleteMessageById("my-queue", "missing-id"),
    ).rejects.toMatchObject({
      code: "NotFound",
    })
  })

  it("throws OperationFailed on receive error", async () => {
    mockSend.mockRejectedValueOnce(new Error("receive failed"))
    await expect(deleteMessageById("my-queue", "msg-1")).rejects.toMatchObject({
      code: "OperationFailed",
    })
  })
})

describe("sendMessageBatch", () => {
  it("returns successful results when all entries succeed", async () => {
    mockSend.mockResolvedValueOnce({
      Successful: [
        { Id: "msg-0", MessageId: "mid-a" },
        { Id: "msg-1", MessageId: "mid-b" },
      ],
      Failed: [],
    })
    const result = await sendMessageBatch("my-queue", [
      { id: "msg-0", body: "hello" },
      { id: "msg-1", body: "world" },
    ])
    expect(result.successful).toHaveLength(2)
    expect(result.successful[0]).toEqual({ id: "msg-0", messageId: "mid-a" })
    expect(result.successful[1]).toEqual({ id: "msg-1", messageId: "mid-b" })
    expect(result.failed).toHaveLength(0)
  })

  it("returns partial failure when some entries fail", async () => {
    mockSend.mockResolvedValueOnce({
      Successful: [{ Id: "msg-0", MessageId: "mid-a" }],
      Failed: [
        { Id: "msg-1", Code: "InvalidMessageContents", Message: "bad content" },
      ],
    })
    const result = await sendMessageBatch("my-queue", [
      { id: "msg-0", body: "hello" },
      { id: "msg-1", body: "" },
    ])
    expect(result.successful).toHaveLength(1)
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0]).toEqual({
      id: "msg-1",
      code: "InvalidMessageContents",
      message: "bad content",
    })
  })

  it("throws OperationFailed when SDK throws", async () => {
    mockSend.mockRejectedValueOnce(new Error("network error"))
    await expect(
      sendMessageBatch("my-queue", [{ id: "msg-0", body: "hello" }]),
    ).rejects.toMatchObject({ code: "OperationFailed" })
  })
})
