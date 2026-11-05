import {
  ChangeMessageVisibilityCommand,
  CreateQueueCommand,
  DeleteMessageCommand,
  DeleteQueueCommand,
  GetQueueAttributesCommand,
  GetQueueUrlCommand,
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
import { diffTags, normalizeTags, type ResourceTag } from "../resource-tags"
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

const QUEUE_MISSING_ERRORS = new Set([
  "QueueDoesNotExist",
  "AWS.SimpleQueueService.NonExistentQueue",
])

function isQueueMissing(e: unknown): boolean {
  return e instanceof Error && QUEUE_MISSING_ERRORS.has(e.name)
}

function toQueueError(e: unknown, name: string): never {
  if (isQueueMissing(e)) {
    throw new ServiceError("NotFound", `Queue ${name} not found`, e)
  }
  toOperationFailed(e)
}

const UNSUPPORTED_OPERATION_ERRORS = new Set([
  "UnknownOperationException",
  "UnsupportedOperation",
  "InvalidAction",
])

/** True only when the emulator lacks the API, so real failures stay visible. */
function isUnsupportedOperation(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false
  const { name, $metadata } = e as {
    name?: unknown
    $metadata?: { httpStatusCode?: number }
  }
  return (
    (typeof name === "string" && UNSUPPORTED_OPERATION_ERRORS.has(name)) ||
    $metadata?.httpStatusCode === 501
  )
}

const PEEK_TIMEOUT_MS = 10_000

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
  try {
    do {
      // SQS returns NextToken only when MaxResults is set.
      const result = await sqs.send(
        new ListQueuesCommand({ NextToken: nextToken, MaxResults: 1000 }),
      )
      for (const url of result.QueueUrls ?? []) urls.push(url)
      nextToken = result.NextToken
    } while (nextToken)
  } catch (e: unknown) {
    toOperationFailed(e)
  }
  return urls.sort((left, right) =>
    queueNameFromUrl(left).localeCompare(queueNameFromUrl(right)),
  )
}

export async function listQueueNames(): Promise<string[]> {
  const urls = await listQueueUrls()
  return urls.map(queueNameFromUrl)
}

export async function listQueues(): Promise<QueueSummary[]> {
  const urls = await listQueueUrls()
  const summaries = await Promise.all(
    urls.map(async (url): Promise<QueueSummary | null> => {
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
      } catch (e: unknown) {
        if (isQueueMissing(e)) return null
        console.warn(`Failed to load attributes for queue ${name}:`, e)
        return { name, depth: 0, dlqName: null }
      }
    }),
  )
  return summaries.filter((summary) => summary !== null)
}

function recordToTags(
  record: Record<string, string> | undefined,
): ResourceTag[] {
  return Object.entries(record ?? {}).map(([key, value]) => ({ key, value }))
}

function tagsToRecord(tags: ResourceTag[]): Record<string, string> {
  return Object.fromEntries(tags.map((tag) => [tag.key, tag.value]))
}

export async function createQueue(
  name: string,
  attributes?: Record<string, string>,
  tags?: Record<string, string>,
): Promise<void> {
  const normalizedTags = normalizeTags(recordToTags(tags))
  try {
    // CreateQueue succeeds silently for an existing queue with matching attributes.
    const exists = await sqs
      .send(new GetQueueUrlCommand({ QueueName: name }))
      .then(
        () => true,
        (e: unknown) => {
          if (isQueueMissing(e)) return false
          throw e
        },
      )
    if (exists) {
      throw new ServiceError("AlreadyExists", `Queue ${name} already exists`)
    }
    await sqs.send(
      new CreateQueueCommand({
        QueueName: name,
        Attributes: attributes,
        tags:
          normalizedTags.length > 0 ? tagsToRecord(normalizedTags) : undefined,
      }),
    )
  } catch (e: unknown) {
    if (
      e instanceof Error &&
      (e.name === "QueueNameExists" || e.name === "QueueAlreadyExists")
    ) {
      throw new ServiceError("AlreadyExists", `Queue ${name} already exists`, e)
    }
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
  let body: { messages?: RawSqsMessage[] }
  try {
    const res = await fetch(
      `${FLOCI_ENDPOINT}/_aws/sqs/messages?QueueUrl=${encodeURIComponent(queueUrl)}`,
      { signal: AbortSignal.timeout(PEEK_TIMEOUT_MS) },
    )
    if (!res.ok) {
      throw new ServiceError(
        "OperationFailed",
        `SQS peek failed: ${res.status}`,
      )
    }
    body = (await res.json()) as { messages?: RawSqsMessage[] }
  } catch (e: unknown) {
    toOperationFailed(e)
  }
  return (body.messages ?? []).map((msg) => ({
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
  const [attributes, messages] = await Promise.all([
    getQueueAttributes(name),
    getQueueMessages(name),
  ])
  return { attributes, messages }
}

export async function getQueueMessages(name: string): Promise<PeekedMessage[]> {
  return fetchMessagesFromInspect(queueUrlFor(name))
}

export async function getQueueAttributes(
  name: string,
): Promise<QueueAttributes> {
  let Attributes: Record<string, string> | undefined
  try {
    ;({ Attributes } = await sqs.send(
      new GetQueueAttributesCommand({
        QueueUrl: queueUrlFor(name),
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
    ))
  } catch (e: unknown) {
    toQueueError(e, name)
  }
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
  let attrResult: { Attributes?: Record<string, string> }
  let tagsResult: { Tags?: Record<string, string> }
  try {
    ;[attrResult, tagsResult] = await Promise.all([
      sqs.send(
        new GetQueueAttributesCommand({
          QueueUrl: queueUrl,
          AttributeNames: ["All"],
        }),
      ),
      // An empty list here would make the next save untag everything.
      sqs
        .send(new ListQueueTagsCommand({ QueueUrl: queueUrl }))
        .catch((e: unknown) => {
          if (isUnsupportedOperation(e)) return { Tags: {} }
          throw e
        }),
    ])
  } catch (e: unknown) {
    toQueueError(e, name)
  }
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
    tags: recordToTags(rawTags),
  }
}

export async function updateQueueSettings(
  name: string,
  attributes: Record<string, string>,
  tags: Record<string, string>,
): Promise<void> {
  const queueUrl = queueUrlFor(name)
  try {
    // Treating a failed read as "no tags" would turn tag removals into silent no-ops.
    const existingTagsResult = await sqs
      .send(new ListQueueTagsCommand({ QueueUrl: queueUrl }))
      .catch((e: unknown) => {
        if (isUnsupportedOperation(e)) return { Tags: {} }
        throw e
      })
    const { removeKeys, upsertTags } = diffTags(
      recordToTags(existingTagsResult.Tags),
      normalizeTags(recordToTags(tags)),
    )

    await Promise.all([
      Object.keys(attributes).length > 0
        ? sqs.send(
            new SetQueueAttributesCommand({
              QueueUrl: queueUrl,
              Attributes: attributes,
            }),
          )
        : Promise.resolve(),
      upsertTags.length > 0
        ? sqs.send(
            new TagQueueCommand({
              QueueUrl: queueUrl,
              Tags: Object.fromEntries(
                upsertTags.map((tag) => [tag.Key, tag.Value]),
              ),
            }),
          )
        : Promise.resolve(),
      removeKeys.length > 0
        ? sqs.send(
            new UntagQueueCommand({ QueueUrl: queueUrl, TagKeys: removeKeys }),
          )
        : Promise.resolve(),
    ])
  } catch (e: unknown) {
    toQueueError(e, name)
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

const DELETE_SCAN_MAX_RECEIVES = 10
const DELETE_SCAN_HIDE_SECONDS = 30

/**
 * Finds the message by receiving batches until it appears or the queue runs dry.
 * Non-targets are hidden while scanning so later receives reach further, then
 * released. Every receive raises ApproximateReceiveCount on the messages it
 * returns, which can move them to a DLQ when maxReceiveCount is low.
 */
export async function deleteMessageById(
  name: string,
  messageId: string,
): Promise<void> {
  const queueUrl = queueUrlFor(name)
  const hiddenReceiptHandles: string[] = []
  try {
    for (let i = 0; i < DELETE_SCAN_MAX_RECEIVES; i++) {
      const { Messages } = await sqs.send(
        new ReceiveMessageCommand({
          QueueUrl: queueUrl,
          VisibilityTimeout: DELETE_SCAN_HIDE_SECONDS,
          MaxNumberOfMessages: 10,
          MessageAttributeNames: ["All"],
          AttributeNames: ["All"],
        }),
      )
      if (!Messages?.length) break
      const target = Messages.find((m) => m.MessageId === messageId)
      for (const message of Messages) {
        if (message !== target && message.ReceiptHandle) {
          hiddenReceiptHandles.push(message.ReceiptHandle)
        }
      }
      if (target?.ReceiptHandle) {
        await sqs.send(
          new DeleteMessageCommand({
            QueueUrl: queueUrl,
            ReceiptHandle: target.ReceiptHandle,
          }),
        )
        return
      }
    }
    throw new ServiceError(
      "NotFound",
      `Message ${messageId} not found or already deleted`,
    )
  } catch (e: unknown) {
    toQueueError(e, name)
  } finally {
    await releaseMessages(queueUrl, hiddenReceiptHandles)
  }
}

async function releaseMessages(
  queueUrl: string,
  receiptHandles: string[],
): Promise<void> {
  const results = await Promise.allSettled(
    receiptHandles.map((receiptHandle) =>
      sqs.send(
        new ChangeMessageVisibilityCommand({
          QueueUrl: queueUrl,
          ReceiptHandle: receiptHandle,
          VisibilityTimeout: 0,
        }),
      ),
    ),
  )
  for (const result of results) {
    if (result.status === "rejected") {
      console.warn(
        `Failed to release message in ${queueUrl}; it stays hidden for ${DELETE_SCAN_HIDE_SECONDS}s:`,
        result.reason,
      )
    }
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
