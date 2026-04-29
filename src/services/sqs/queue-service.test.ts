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
  createQueue,
  deleteMessage,
  deleteQueue,
  getQueueAttributes,
  getQueueDetail,
  getQueueMessageBody,
  getQueueMessages,
  getQueueSettings,
  listQueues,
  purgeQueue,
  sendMessage,
  updateQueueSettings,
} from "./queue-service"
import { queueNameFromUrl } from "./queue-utils"

beforeEach(() => {
  mockSend.mockClear()
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
    mockSend
      .mockResolvedValueOnce({
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
      .mockResolvedValueOnce({
        Messages: [
          {
            MessageId: "msg-1",
            Body: "hello",
            Attributes: { SentTimestamp: "1700000000000" },
          },
        ],
      })
    const result = await getQueueDetail("my-queue")
    expect(result.attributes.depth).toBe(3)
    expect(result.attributes.inFlight).toBe(1)
    expect(result.attributes.contentBasedDeduplication).toBe(false)
    expect(result.messages).toHaveLength(1)
    expect(result.messages[0].messageId).toBe("msg-1")
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
    mockSend.mockResolvedValueOnce({}).mockResolvedValueOnce({})
    await expect(
      updateQueueSettings(
        "my-queue",
        { VisibilityTimeout: "60" },
        { env: "prod" },
      ),
    ).resolves.toBeUndefined()
    expect(mockSend).toHaveBeenCalledTimes(2)
  })

  it("should skip tag update when tags is empty", async () => {
    mockSend.mockResolvedValueOnce({})
    await expect(
      updateQueueSettings("my-queue", { VisibilityTimeout: "60" }, {}),
    ).resolves.toBeUndefined()
    expect(mockSend).toHaveBeenCalledTimes(1)
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
  it("returns mapped messages", async () => {
    mockSend.mockResolvedValueOnce({
      Messages: [
        {
          MessageId: "msg-1",
          ReceiptHandle: "rh-1",
          Body: "hello",
          Attributes: { SentTimestamp: "1700000000000" },
        },
      ],
    })
    const result = await getQueueMessages("my-queue")
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      messageId: "msg-1",
      receiptHandle: "rh-1",
      body: "hello",
      sentTimestamp: 1700000000000,
    })
  })

  it("returns empty array when no messages", async () => {
    mockSend.mockResolvedValueOnce({ Messages: undefined })
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

describe("getQueueMessageBody", () => {
  it("returns the body of a matching message", async () => {
    mockSend.mockResolvedValueOnce({
      Messages: [
        {
          MessageId: "msg-1",
          ReceiptHandle: "rh-1",
          Body: '{"key":"value"}',
          Attributes: {},
        },
      ],
    })
    const body = await getQueueMessageBody("my-queue", "msg-1")
    expect(body).toBe('{"key":"value"}')
  })

  it("throws NotFound when message id is not in peek results", async () => {
    mockSend.mockResolvedValueOnce({ Messages: [] })
    await expect(
      getQueueMessageBody("my-queue", "missing-id"),
    ).rejects.toMatchObject({ code: "NotFound" })
  })
})
