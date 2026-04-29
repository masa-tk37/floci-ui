import {
  CreateQueueCommand,
  DeleteMessageCommand,
  DeleteQueueCommand,
  GetQueueAttributesCommand,
  ListQueuesCommand,
  ListQueueTagsCommand,
  PurgeQueueCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
  SetQueueAttributesCommand,
  TagQueueCommand,
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

export async function listQueues(): Promise<QueueSummary[]> {
  const { QueueUrls } = await sqs.send(new ListQueuesCommand({}))
  const urls = QueueUrls ?? []
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

export async function getQueueDetail(name: string): Promise<QueueDetailData> {
  const queueUrl = queueUrlFor(name)
  const [{ Attributes }, { Messages }] = await Promise.all([
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
    sqs.send(
      new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        VisibilityTimeout: 0,
        MaxNumberOfMessages: 10,
        WaitTimeSeconds: 0,
        AttributeNames: ["All"],
        MessageAttributeNames: ["All"],
      }),
    ),
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

  const messages: PeekedMessage[] = (Messages ?? []).map((msg) => ({
    messageId: msg.MessageId ?? "",
    receiptHandle: msg.ReceiptHandle,
    body: msg.Body ?? "",
    sentTimestamp: msg.Attributes?.SentTimestamp
      ? Number.parseInt(msg.Attributes.SentTimestamp, 10)
      : null,
  }))

  return { attributes, messages }
}

export async function getQueueMessages(name: string): Promise<PeekedMessage[]> {
  const queueUrl = queueUrlFor(name)
  const { Messages } = await sqs.send(
    new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      VisibilityTimeout: 0,
      MaxNumberOfMessages: 10,
      WaitTimeSeconds: 0,
      AttributeNames: ["All"],
      MessageAttributeNames: ["All"],
    }),
  )
  return (Messages ?? []).map((msg) => ({
    messageId: msg.MessageId ?? "",
    receiptHandle: msg.ReceiptHandle,
    body: msg.Body ?? "",
    sentTimestamp: msg.Attributes?.SentTimestamp
      ? Number.parseInt(msg.Attributes.SentTimestamp, 10)
      : null,
  }))
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
      /* ignore */
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

export async function purgeQueue(name: string): Promise<void> {
  try {
    await sqs.send(new PurgeQueueCommand({ QueueUrl: queueUrlFor(name) }))
  } catch (e: unknown) {
    toOperationFailed(e)
  }
}

export async function getQueueMessageBody(
  queueName: string,
  messageId: string,
): Promise<string> {
  const messages = await getQueueMessages(queueName)
  const found = messages.find((m) => m.messageId === messageId)
  if (!found)
    throw new ServiceError("NotFound", `Message ${messageId} not found`)
  return found.body
}
