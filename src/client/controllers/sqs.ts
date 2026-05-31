import type { SQSSettingsInitial } from "../../views/sqs/settings-form-state"
import { PLACEHOLDER } from "../../views/format"
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
  } else {
    attributes.RedrivePolicy = ""
  }

  if (input.kmsEnabled && input.kmsMasterKeyId) {
    attributes.KmsMasterKeyId = input.kmsMasterKeyId
  } else {
    attributes.KmsMasterKeyId = ""
  }

  return attributes
}

function validateSqsAttributes(input: SqsAttributesInput): string | null {
  if (input.visibilityTimeout < 0 || input.visibilityTimeout > 43200) {
    return "可視性タイムアウトは 0〜43200 の範囲で入力してください"
  }
  if (
    input.messageRetentionPeriod < 60 ||
    input.messageRetentionPeriod > 1209600
  ) {
    return "保持期間は 60〜1209600 の範囲で入力してください"
  }
  if (input.delaySeconds < 0 || input.delaySeconds > 900) {
    return "配信遅延は 0〜900 の範囲で入力してください"
  }
  if (
    input.receiveMessageWaitTimeSeconds < 0 ||
    input.receiveMessageWaitTimeSeconds > 20
  ) {
    return "ロングポーリング待機は 0〜20 の範囲で入力してください"
  }
  if (input.maximumMessageSize < 1024 || input.maximumMessageSize > 262144) {
    return "最大メッセージサイズは 1024〜262144 の範囲で入力してください"
  }
  if (
    input.dlqEnabled &&
    (input.dlqMaxReceiveCount < 1 || input.dlqMaxReceiveCount > 1000)
  ) {
    return "最大受信回数は 1〜1000 の範囲で入力してください"
  }
  return null
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
  receiveCount: number | null
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
  if (!sentTimestamp) return PLACEHOLDER
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
  try {
    const parsed = JSON.parse(body)
    if (Array.isArray(parsed)) {
      return `[配列 ${parsed.length} 件]`
    }
    if (parsed !== null && typeof parsed === "object") {
      const keys = Object.keys(parsed)
      const preview = keys.slice(0, 5).join(", ")
      const suffix = keys.length > 5 ? `, …+${keys.length - 5}` : ""
      return `{${preview}${suffix}}`
    }
    const str = String(parsed)
    return str.length > 120 ? `${str.slice(0, 120)}…` : str
  } catch {
    if (body.length <= 120) return body
    const cut = body.slice(0, 120)
    const lastSpace = cut.lastIndexOf(" ")
    return lastSpace > 60 ? `${cut.slice(0, lastSpace)}…` : `${cut}…`
  }
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

      this.error = validateSqsAttributes(this)
      if (this.error) return

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
    isFifo: init.isFifo,
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
    deduplicationScope: init.deduplicationScope ?? "queue",
    fifoThroughputLimit: init.fifoThroughputLimit ?? "perQueue",
    tags: [...init.tags],
    error: null as string | null,
    submitting: false,

    ...tagMixin,

    buildPayload() {
      const attributes = buildSqsAttributes(this)
      if (this.isFifo) {
        attributes.DeduplicationScope = this.deduplicationScope
        attributes.FifoThroughputLimit = this.fifoThroughputLimit
      }
      return {
        attributes,
        tags: buildSqsTagsPayload(this.tags),
      }
    },

    async submit() {
      this.error = null

      this.error = validateSqsAttributes(this)
      if (this.error) return

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
    batchMode: false,
    body: "",
    groupId: "",
    deduplicationId: "",
    sending: false,
    lastId: "",
    error: "",
    batchBodies: "",
    batchSending: false,
    batchResult: "",
    batchError: "",
    selectedMsg: null as {
      id: string
      body: string
    } | null,
    bodyLoading: false,
    bodyError: "",
    deleting: false,
    deleteError: "",
    purgeOpen: false,
    purging: false,
    purgeError: "",
    isFifo: props.isFifo,
    requiresDeduplicationId: props.requiresDeduplicationId,
    messages: props.initialMessages,
    attributes: props.initialAttributes,
    approximateAge,
    truncate,

    openSend() {
      this.open = true
    },

    close() {
      if (this.sending || this.batchSending) return
      this.open = false
      this.error = ""
      this.batchError = ""
    },

    async sendBatch() {
      const lines = this.batchBodies
        .split("\n")
        .map((l: string) => l.trim())
        .filter((l: string) => l.length > 0)
      if (lines.length === 0) {
        this.batchError = "メッセージを1件以上入力してください"
        return
      }
      if (lines.length > 10) {
        this.batchError = "バッチ送信は最大10件です"
        return
      }
      this.batchSending = true
      this.batchError = ""
      this.batchResult = ""

      const entries = lines.map((body: string, i: number) => ({
        id: `msg-${i}`,
        body,
      }))

      try {
        const data = await requestJson<{
          result: {
            successful: { id: string; messageId: string }[]
            failed: { id: string; code: string; message?: string }[]
          }
        }>(`${props.queuePath}/send-batch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entries }),
        })
        const { successful, failed } = data.result
        this.batchResult = `成功 ${successful.length} 件 / 失敗 ${failed.length} 件`
        this.batchBodies = ""
        this.batchSending = false
        this.open = false
        await this.refreshState()
      } catch (error) {
        this.batchError = errorMessage(error)
        this.batchSending = false
      }
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

    openPurge() {
      this.purgeError = ""
      this.purgeOpen = true
    },

    closePurge() {
      if (this.purging) return
      this.purgeOpen = false
      this.purgeError = ""
    },

    async confirmPurge() {
      this.purging = true
      this.purgeError = ""
      try {
        await requestJson(`${props.queuePath}/messages`, { method: "DELETE" })
        location.reload()
      } catch (error) {
        this.purgeError = errorMessage(error)
        this.purging = false
      }
    },

    openMessageModal(detail: { id: string; body: string }) {
      this.selectedMsg = detail
      this.bodyLoading = false
      this.bodyError = ""
      this.deleteError = ""
      this.deleting = false
    },

    async deleteMsg() {
      if (!this.selectedMsg) return

      this.deleting = true
      this.deleteError = ""

      try {
        await requestJson(`${props.queuePath}/message`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messageId: this.selectedMsg.id }),
        })
        this.selectedMsg = null
        this.deleting = false
        await this.refreshState()
      } catch (error) {
        this.deleteError = errorMessage(error)
        this.deleting = false
      }
    },

    get formattedBody(): string {
      const body = this.selectedMsg?.body ?? ""
      try {
        return JSON.stringify(JSON.parse(body), null, 2)
      } catch {
        return body
      }
    },

    copyBody() {
      navigator.clipboard.writeText(this.selectedMsg?.body ?? "")
    },

    selectMsg(msg: PeekedMessage) {
      this.openMessageModal({
        id: msg.messageId,
        body: msg.body,
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
