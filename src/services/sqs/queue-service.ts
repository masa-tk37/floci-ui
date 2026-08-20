import {
  CreateQueueCommand,
  DeleteMessageCommand,
  DeleteQueueCommand,
  GetQueueAttributesCommand,
  ListQueuesCommand,
  ListQueueTagsCommand,
  PurgeQueueCommand,
  ReceiveMessageCommand,
  SendMessageBatchCommand,
  SendMessageCommand,
  SetQueueAttributesCommand,
  TagQueueCommand,
  UntagQueueCommand,
} from "@aws-sdk/client-sqs"
import { ServiceError, toOperationFailed } from "../../errors"
import {
  FLOCI_ACCOUNT_ID,
  FLOCI_ENDPOINT,
  sqs,
} from "../../infrastructure/floci-clients"
import type {
  PeekedMessage,
  QueueAttributes,
} from "../../views/sqs/queue-detail"
import type { SQSSettingsInitial } from "../../views/sqs/settings-form-state"
import { queueNameFromUrl } from "./queue-utils"

function queueUrlFor(name: string): string {
  return `${FLOCI_ENDPOINT}/${FLOCI_ACCOUNT_ID}/${name}`
}

function parseRedriveDlqName(redrivePolicy: string | undefined): string | null {
  if (!redrivePolicy) return null
  try {
    const parsed = JSON.parse(redrivePolicy) as { deadLetterTargetArn?: string }
    if (!parsed.deadLetterTargetArn) return null
    return parsed.deadLetterTargetArn.split(":").pop() ?? null
  } catch {
    return null
  }
}

function toInt(value: string | undefined, fallback = 0): number {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isNaN(parsed) ? fallback : parsed
}

export interface QueueSummary {
  name: string
  depth: number
  dlqName: string | null
}

export interface QueueDetailData {
  attributes: QueueAttributes
  messages: PeekedMessage[]
}

async function listQueueUrls(): Promise<string[]> {
  const urls: string[] = []
  let nextToken: string | undefined
  do {
    const result = await sqs.send(
      new ListQueuesCommand({ NextToken: nextToken }),
    )
    for (const url of result.QueueUrls ?? []) urls.push(url)
    nextToken = result.NextToken
  } while (nextToken)
  return urls
}

export async function listQueueNames(): Promise<string[]> {
  const urls = await listQueueUrls()
  return urls.map(queueNameFromUrl)
}

export async function listQueues(): Promise<QueueSummary[]> {
  const urls = await listQueueUrls()
  return Promise.all(
    urls.map(async (url): Promise<QueueSummary> => {
      const name = queueNameFromUrl(url)
      try {
        const { Attributes } = await sqs.send(
          new GetQueueAttributesCommand({
            QueueUrl: url,
            AttributeNames: [
              "ApproximateNumberOfMessages",
              "QueueArn",
              "RedrivePolicy",
            ],
          }),
        )
        return {
          name,
          depth: toInt(Attributes?.ApproximateNumberOfMessages),
          dlqName: parseRedriveDlqName(Attributes?.RedrivePolicy),
        }
      } catch {
        return { name, depth: 0, dlqName: null }
      }
    }),
  )
}

export async function createQueue(
  name: string,
  attributes?: Record<string, string>,
  tags?: Record<string, string>,
): Promise<void> {
  try {
    await sqs.send(
      new CreateQueueCommand({
        QueueName: name,
        Attributes: attributes,
        tags,
      }),
    )
  } catch (e: unknown) {
    toOperationFailed(e)
  }
}

export async function deleteQueue(name: string): Promise<void> {
  try {
    await sqs.send(new DeleteQueueCommand({ QueueUrl: queueUrlFor(name) }))
  } catch (e: unknown) {
    if (e instanceof Error && e.name === "QueueDoesNotExist") {
      throw new ServiceError("NotFound", `Queue ${name} not found`, e)
    }
    toOperationFailed(e)
  }
}

interface RawSqsMessage {
  MessageId: string
  Body: string
  ReceiptHandle: string | null
  Attributes: { SentTimestamp?: string; ApproximateReceiveCount?: string }
}

async function fetchMessagesFromInspect(
  queueUrl: string,
): Promise<PeekedMessage[]> {
  const res = await fetch(
    `${FLOCI_ENDPOINT}/_aws/sqs/messages?QueueUrl=${encodeURIComponent(queueUrl)}`,
  )
  if (!res.ok) {
    throw new ServiceError("OperationFailed", `SQS peek failed: ${res.status}`)
  }
  const { messages } = (await res.json()) as { messages: RawSqsMessage[] }
  return messages.map((msg) => ({
    messageId: msg.MessageId,
    receiptHandle: msg.ReceiptHandle ?? undefined,
    body: msg.Body,
    sentTimestamp: msg.Attributes?.SentTimestamp
      ? Number.parseInt(msg.Attributes.SentTimestamp, 10)
      : null,
    receiveCount: msg.Attributes?.ApproximateReceiveCount
      ? Number.parseInt(msg.Attributes.ApproximateReceiveCount, 10)
      : null,
  }))
}

export async function getQueueDetail(name: string): Promise<QueueDetailData> {
  const queueUrl = queueUrlFor(name)
  const [{ Attributes }, messages] = await Promise.all([
    sqs.send(
      new GetQueueAttributesCommand({
        QueueUrl: queueUrl,
        AttributeNames: [
          "ApproximateNumberOfMessages",
          "ApproximateNumberOfMessagesNotVisible",
          "ApproximateNumberOfMessagesDelayed",
          "VisibilityTimeout",
          "MessageRetentionPeriod",
          "RedrivePolicy",
          "ContentBasedDeduplication",
          "QueueArn",
        ],
      }),
    ),
    fetchMessagesFromInspect(queueUrl),
  ])

  const attributes: QueueAttributes = {
    depth: toInt(Attributes?.ApproximateNumberOfMessages),
    inFlight: toInt(Attributes?.ApproximateNumberOfMessagesNotVisible),
    delayed: toInt(Attributes?.ApproximateNumberOfMessagesDelayed),
    visibilityTimeout: toInt(Attributes?.VisibilityTimeout),
    messageRetention: toInt(Attributes?.MessageRetentionPeriod),
    dlqName: parseRedriveDlqName(Attributes?.RedrivePolicy),
    contentBasedDeduplication: Attributes?.ContentBasedDeduplication === "true",
    queueArn: Attributes?.QueueArn,
  }

  return { attributes, messages }
}

export async function getQueueMessages(name: string): Promise<PeekedMessage[]> {
  const queueUrl = queueUrlFor(name)
  return fetchMessagesFromInspect(queueUrl)
}

export async function getQueueAttributes(
  name: string,
): Promise<import("../../views/sqs/queue-detail").QueueAttributes> {
  const queueUrl = queueUrlFor(name)
  const { Attributes } = await sqs.send(
    new GetQueueAttributesCommand({
      QueueUrl: queueUrl,
      AttributeNames: [
        "ApproximateNumberOfMessages",
        "ApproximateNumberOfMessagesNotVisible",
        "ApproximateNumberOfMessagesDelayed",
        "VisibilityTimeout",
        "MessageRetentionPeriod",
        "RedrivePolicy",
        "ContentBasedDeduplication",
        "QueueArn",
      ],
    }),
  )
  return {
    depth: toInt(Attributes?.ApproximateNumberOfMessages),
    inFlight: toInt(Attributes?.ApproximateNumberOfMessagesNotVisible),
    delayed: toInt(Attributes?.ApproximateNumberOfMessagesDelayed),
    visibilityTimeout: toInt(Attributes?.VisibilityTimeout),
    messageRetention: toInt(Attributes?.MessageRetentionPeriod),
    dlqName: parseRedriveDlqName(Attributes?.RedrivePolicy),
    contentBasedDeduplication: Attributes?.ContentBasedDeduplication === "true",
    queueArn: Attributes?.QueueArn,
  }
}

export async function getQueueSettings(
  name: string,
): Promise<SQSSettingsInitial> {
  const queueUrl = queueUrlFor(name)
  const [attrResult, tagsResult] = await Promise.all([
    sqs.send(
      new GetQueueAttributesCommand({
        QueueUrl: queueUrl,
        AttributeNames: ["All"],
      }),
    ),
    sqs
      .send(new ListQueueTagsCommand({ QueueUrl: queueUrl }))
      .catch(() => ({ Tags: {} })),
  ])
  const attrs = attrResult.Attributes ?? {}
  const rawTags = tagsResult.Tags ?? {}

  let dlqEnabled = false
  let dlqTargetArn = ""
  let dlqMaxReceiveCount = 3
  if (attrs.RedrivePolicy) {
    try {
      const rp = JSON.parse(attrs.RedrivePolicy) as {
        deadLetterTargetArn?: string
        maxReceiveCount?: number
      }
      dlqEnabled = true
      dlqTargetArn = rp.deadLetterTargetArn ?? ""
      dlqMaxReceiveCount = Number(rp.maxReceiveCount) || 3
    } catch {
      /* Unparsable RedrivePolicy reads as no DLQ rather than failing the detail page. */
    }
  }

  return {
    name,
    isFifo: attrs.FifoQueue === "true",
    visibilityTimeout: toInt(attrs.VisibilityTimeout, 30),
    messageRetentionPeriod: toInt(attrs.MessageRetentionPeriod, 345600),
    delaySeconds: toInt(attrs.DelaySeconds, 0),
    receiveMessageWaitTimeSeconds: toInt(
      attrs.ReceiveMessageWaitTimeSeconds,
      0,
    ),
    maximumMessageSize: toInt(attrs.MaximumMessageSize, 262144),
    dlqEnabled,
    dlqTargetArn,
    dlqMaxReceiveCount,
    kmsEnabled: !!attrs.KmsMasterKeyId,
    kmsMasterKeyId: attrs.KmsMasterKeyId ?? "",
    deduplicationScope: attrs.DeduplicationScope as
      | "queue"
      | "messageGroup"
      | undefined,
    fifoThroughputLimit: attrs.FifoThroughputLimit as
      | "perQueue"
      | "perMessageGroupId"
      | undefined,
    tags: Object.entries(rawTags).map(([key, value]) => ({
      key,
      value: String(value),
    })),
  }
}

export async function updateQueueSettings(
  name: string,
  attributes: Record<string, string>,
  tags: Record<string, string>,
): Promise<void> {
  const queueUrl = queueUrlFor(name)
  try {
    const existingTagsResult = await sqs
      .send(new ListQueueTagsCommand({ QueueUrl: queueUrl }))
      .catch(() => ({ Tags: {} }))
    const existingKeys = Object.keys(existingTagsResult.Tags ?? {})
    const newKeys = new Set(Object.keys(tags))
    const removedKeys = existingKeys.filter((k) => !newKeys.has(k))

    await Promise.all([
      Object.keys(attributes).length > 0
        ? sqs.send(
            new SetQueueAttributesCommand({
              QueueUrl: queueUrl,
              Attributes: attributes,
            }),
          )
        : Promise.resolve(),
      Object.keys(tags).length > 0
        ? sqs.send(new TagQueueCommand({ QueueUrl: queueUrl, Tags: tags }))
        : Promise.resolve(),
      removedKeys.length > 0
        ? sqs.send(
            new UntagQueueCommand({ QueueUrl: queueUrl, TagKeys: removedKeys }),
          )
        : Promise.resolve(),
    ])
  } catch (e: unknown) {
    toOperationFailed(e)
  }
}

export async function sendMessage(
  name: string,
  body: string,
  messageGroupId?: string,
  messageDeduplicationId?: string,
): Promise<string> {
  try {
    const result = await sqs.send(
      new SendMessageCommand({
        QueueUrl: queueUrlFor(name),
        MessageBody: body,
        MessageGroupId: messageGroupId,
        MessageDeduplicationId: messageDeduplicationId,
      }),
    )
    return result.MessageId ?? ""
  } catch (e: unknown) {
    toOperationFailed(e)
  }
}

export async function deleteMessage(
  name: string,
  receiptHandle: string,
): Promise<void> {
  try {
    await sqs.send(
      new DeleteMessageCommand({
        QueueUrl: queueUrlFor(name),
        ReceiptHandle: receiptHandle,
      }),
    )
  } catch (e: unknown) {
    toOperationFailed(e)
  }
}

export async function deleteMessageById(
  name: string,
  messageId: string,
): Promise<void> {
  const queueUrl = queueUrlFor(name)
  try {
    const { Messages } = await sqs.send(
      new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        VisibilityTimeout: 0,
        MaxNumberOfMessages: 10,
        MessageAttributeNames: ["All"],
        AttributeNames: ["All"],
      }),
    )
    const target = (Messages ?? []).find((m) => m.MessageId === messageId)
    if (!target?.ReceiptHandle) {
      throw new ServiceError(
        "NotFound",
        `Message ${messageId} not found or already deleted`,
      )
    }
    await sqs.send(
      new DeleteMessageCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: target.ReceiptHandle,
      }),
    )
  } catch (e: unknown) {
    if (e instanceof ServiceError) throw e
    toOperationFailed(e)
  }
}

export async function purgeQueue(name: string): Promise<void> {
  try {
    await sqs.send(new PurgeQueueCommand({ QueueUrl: queueUrlFor(name) }))
  } catch (e: unknown) {
    toOperationFailed(e)
  }
}

export interface BatchMessageEntry {
  id: string
  body: string
  messageGroupId?: string
  messageDeduplicationId?: string
}

export interface BatchSendResult {
  successful: { id: string; messageId: string }[]
  failed: { id: string; code: string; message?: string }[]
}

export async function sendMessageBatch(
  name: string,
  entries: BatchMessageEntry[],
): Promise<BatchSendResult> {
  try {
    const result = await sqs.send(
      new SendMessageBatchCommand({
        QueueUrl: queueUrlFor(name),
        Entries: entries.map((e) => ({
          Id: e.id,
          MessageBody: e.body,
          MessageGroupId: e.messageGroupId,
          MessageDeduplicationId: e.messageDeduplicationId,
        })),
      }),
    )
    return {
      successful: (result.Successful ?? []).map((s) => ({
        id: s.Id ?? "",
        messageId: s.MessageId ?? "",
      })),
      failed: (result.Failed ?? []).map((f) => ({
        id: f.Id ?? "",
        code: f.Code ?? "",
        message: f.Message,
      })),
    }
  } catch (e: unknown) {
    toOperationFailed(e)
  }
}
