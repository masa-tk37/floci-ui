import type { SQSSettingsInitial } from "../../views/sqs/settings-form-state"
import {
  dispatchToast,
  errorMessage,
  requestJson,
  tagMixin,
} from "../lib/floci"

interface SqsAttributesInput {
  visibilityTimeout: number
  messageRetentionPeriod: number
  delaySeconds: number
  receiveMessageWaitTimeSeconds: number
  maximumMessageSize: number
  dlqEnabled: boolean
  dlqTargetArn: string
  dlqMaxReceiveCount: number
  kmsEnabled: boolean
  kmsMasterKeyId: string
}

function buildSqsAttributes(input: SqsAttributesInput): Record<string, string> {
  const attributes: Record<string, string> = {
    VisibilityTimeout: String(input.visibilityTimeout),
    MessageRetentionPeriod: String(input.messageRetentionPeriod),
    DelaySeconds: String(input.delaySeconds),
    ReceiveMessageWaitTimeSeconds: String(input.receiveMessageWaitTimeSeconds),
    MaximumMessageSize: String(input.maximumMessageSize),
  }

  if (input.dlqEnabled && input.dlqTargetArn) {
    attributes.RedrivePolicy = JSON.stringify({
      deadLetterTargetArn: input.dlqTargetArn,
      maxReceiveCount: Number(input.dlqMaxReceiveCount),
    })
  }

  if (input.kmsEnabled && input.kmsMasterKeyId) {
    attributes.KmsMasterKeyId = input.kmsMasterKeyId
  }

  return attributes
}

function buildSqsTagsPayload(tags: { key: string; value: string }[]) {
  return Object.fromEntries(
    tags.filter((tag) => tag.key.trim()).map((tag) => [tag.key, tag.value]),
  )
}

type CreateQueueProps = Record<string, never>

interface PeekedMessage {
  messageId: string
  receiptHandle?: string
  body: string
  sentTimestamp: number | null
}

interface QueueAttributes {
  depth: number
  inFlight: number
  delayed: number
  visibilityTimeout: number
  messageRetention: number
  dlqName: string | null
  contentBasedDeduplication: boolean
  queueArn?: string
}

interface QueueDetailControllerProps {
  queuePath: string
  isFifo: boolean
  requiresDeduplicationId: boolean
  initialMessages: PeekedMessage[]
  initialAttributes: QueueAttributes
}

function approximateAge(sentTimestamp: number | null): string {
  if (!sentTimestamp) return "—"
  const ageMs = Date.now() - sentTimestamp
  if (ageMs < 0) return "0s"
  const sec = Math.floor(ageMs / 1000)
  if (sec < 60) return `${sec}s`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h`
  const day = Math.floor(hr / 24)
  return `${day}d`
}

function truncate(body: string): string {
  return body.length > 300 ? `${body.slice(0, 300)}…` : body
}

export function createSqsCreateQueueController(
  _el: HTMLElement,
  _props: CreateQueueProps,
) {
  return {
    name: "",
    isFifo: false,
    contentBasedDedup: false,
    visibilityTimeout: 30,
    messageRetentionPeriod: 345600,
    delaySeconds: 0,
    receiveMessageWaitTimeSeconds: 0,
    maximumMessageSize: 262144,
    dlqEnabled: false,
    dlqTargetArn: "",
    dlqMaxReceiveCount: 3,
    kmsEnabled: false,
    kmsMasterKeyId: "",
    tags: [] as { key: string; value: string }[],
    error: null as string | null,
    submitting: false,

    ...tagMixin,

    get resolvedName(): string {
      if (this.isFifo && !this.name.endsWith(".fifo")) {
        return `${this.name}.fifo`
      }
      return this.name
    },

    buildPayload() {
      const attributes = buildSqsAttributes(this)

      if (this.isFifo) {
        attributes.FifoQueue = "true"
        if (this.contentBasedDedup) {
          attributes.ContentBasedDeduplication = "true"
        }
      }

      return {
        name: this.resolvedName,
        attributes,
        tags: buildSqsTagsPayload(this.tags),
      }
    },

    async submit() {
      this.error = null
      this.submitting = true
      try {
        await requestJson("/sqs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(this.buildPayload()),
        })
        window.location.href = "/sqs"
      } catch (error) {
        this.error = errorMessage(error)
        this.submitting = false
      }
    },
  }
}

export function createSqsSettingsController(
  _el: HTMLElement,
  init: SQSSettingsInitial,
) {
  const { name } = init
  return {
    visibilityTimeout: init.visibilityTimeout,
    messageRetentionPeriod: init.messageRetentionPeriod,
    delaySeconds: init.delaySeconds,
    receiveMessageWaitTimeSeconds: init.receiveMessageWaitTimeSeconds,
    maximumMessageSize: init.maximumMessageSize,
    dlqEnabled: init.dlqEnabled,
    dlqTargetArn: init.dlqTargetArn,
    dlqMaxReceiveCount: init.dlqMaxReceiveCount,
    kmsEnabled: init.kmsEnabled,
    kmsMasterKeyId: init.kmsMasterKeyId,
    tags: [...init.tags],
    error: null as string | null,
    submitting: false,

    ...tagMixin,

    buildPayload() {
      return {
        attributes: buildSqsAttributes(this),
        tags: buildSqsTagsPayload(this.tags),
      }
    },

    async submit() {
      this.error = null
      this.submitting = true

      try {
        await requestJson(`/sqs/${encodeURIComponent(name)}/settings`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(this.buildPayload()),
        })
        dispatchToast({ kind: "success", message: "設定を保存しました" })
        this.submitting = false
      } catch (error) {
        this.error = errorMessage(error)
        this.submitting = false
      }
    },
  }
}

export function createSqsQueueDetailController(
  _el: HTMLElement,
  props: QueueDetailControllerProps,
) {
  return {
    open: false,
    body: "",
    groupId: "",
    deduplicationId: "",
    sending: false,
    lastId: "",
    error: "",
    selectedMsg: null as {
      id: string
      receipt: string
      body?: string
    } | null,
    bodyLoading: false,
    bodyError: "",
    deleting: false,
    deleteError: "",
    purgeConfirming: false,
    isFifo: props.isFifo,
    requiresDeduplicationId: props.requiresDeduplicationId,
    messages: props.initialMessages,
    attributes: props.initialAttributes,
    approximateAge,
    truncate,

    close() {
      if (this.sending) return
      this.open = false
      this.error = ""
    },

    async send() {
      if (this.isFifo && !this.groupId) {
        this.error = "FIFO queue では Message Group ID が必須です"
        return
      }
      if (this.requiresDeduplicationId && !this.deduplicationId) {
        this.error =
          "Content-based deduplication が無効な FIFO queue では Message Deduplication ID が必須です"
        return
      }

      this.sending = true
      this.error = ""
      this.lastId = ""

      const payload: Record<string, string> = { body: this.body }
      if (this.isFifo) payload.groupId = this.groupId
      if (this.requiresDeduplicationId) {
        payload.messageDeduplicationId = this.deduplicationId
      }

      try {
        const data = await requestJson<{ messageId: string }>(
          `${props.queuePath}/send`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
        )
        this.lastId = data.messageId
        this.body = ""
        this.groupId = ""
        this.deduplicationId = ""
        this.sending = false
        this.open = false
        await this.refreshState()
      } catch (error) {
        this.error = errorMessage(error)
        this.sending = false
      }
    },

    async confirmPurge() {
      try {
        await requestJson(`${props.queuePath}/messages`, { method: "DELETE" })
        location.reload()
      } catch (error) {
        dispatchToast({ kind: "error", message: errorMessage(error) })
      }
    },

    async openMessageModal(detail: { id: string; receipt: string }) {
      this.selectedMsg = detail
      this.bodyLoading = true
      this.bodyError = ""
      this.deleteError = ""
      this.deleting = false

      try {
        const data = await requestJson<{ body: string }>(
          `${props.queuePath}/messages/${detail.id}/body`,
        )
        this.selectedMsg = { ...detail, body: data.body }
        this.bodyLoading = false
      } catch (error) {
        this.bodyError = errorMessage(error)
        this.bodyLoading = false
      }
    },

    async deleteMsg() {
      if (!this.selectedMsg) return

      this.deleting = true
      this.deleteError = ""

      try {
        await requestJson(`${props.queuePath}/message`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ receipt: this.selectedMsg.receipt }),
        })
        this.selectedMsg = null
        this.deleting = false
        await this.refreshState()
      } catch (error) {
        this.deleteError = errorMessage(error)
        this.deleting = false
      }
    },

    selectMsg(msg: PeekedMessage) {
      this.openMessageModal({
        id: msg.messageId,
        receipt: msg.receiptHandle ?? "",
      })
    },

    async refreshState() {
      const [msgData, attrData] = await Promise.all([
        requestJson<{ messages: PeekedMessage[] }>(
          `${props.queuePath}/messages.json`,
        ),
        requestJson<{ attributes: QueueAttributes }>(
          `${props.queuePath}/attributes.json`,
        ),
      ])
      this.messages = msgData.messages
      this.attributes = attrData.attributes
    },
  }
}
