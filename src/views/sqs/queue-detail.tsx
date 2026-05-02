import { Html } from "@elysiajs/html"

import { IconPlus, IconSettings } from "../icons"
import { Layout } from "../layout"
import { ResourceRail } from "../resource-rail"
import type { QueueSummary } from "./queue-list"

export interface QueueAttributes {
  depth: number
  inFlight: number
  delayed: number
  visibilityTimeout: number
  messageRetention: number
  dlqName: string | null
  contentBasedDeduplication: boolean
  queueArn?: string
}

export interface PeekedMessage {
  messageId: string
  receiptHandle?: string
  body: string
  sentTimestamp: number | null
}

interface QueueDetailProps {
  name: string
  queues?: QueueSummary[]
  attributes: QueueAttributes
  messages: PeekedMessage[]
  sidebarCounts?: import("../layout").SidebarCounts
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

export function QueueAttributesCards({
  attributes,
}: {
  attributes: QueueAttributes
}) {
  return (
    <>
      <div class="attr-card">
        <span class="attr-card__label">メッセージ数</span>
        <span class="attr-card__value">{attributes.depth}</span>
      </div>
      <div class="attr-card">
        <span class="attr-card__label">処理中</span>
        <span class="attr-card__value">{attributes.inFlight}</span>
      </div>
      <div class="attr-card">
        <span class="attr-card__label">遅延中</span>
        <span class="attr-card__value">{attributes.delayed}</span>
      </div>
      <div class="attr-card">
        <span class="attr-card__label">可視性タイムアウト</span>
        <span class="attr-card__value">{attributes.visibilityTimeout}s</span>
      </div>
      <div class="attr-card">
        <span class="attr-card__label">保持期間</span>
        <span class="attr-card__value">{attributes.messageRetention}s</span>
      </div>
      {attributes.dlqName ? (
        <div class="attr-card attr-card--dlq">
          <span class="attr-card__label">Dead-letter queue</span>
          <a
            href={`/sqs/${encodeURIComponent(attributes.dlqName)}`}
            class="attr-card__link"
            safe
          >
            {attributes.dlqName}
          </a>
        </div>
      ) : null}
    </>
  )
}

export function QueueMessagesTable({
  messages,
}: {
  messages: PeekedMessage[]
}) {
  if (messages.length === 0) {
    return (
      <p class="empty-state empty-state--plain">
        メッセージなし。VisibilityTimeout=0 でプレビューします —
        処理中のメッセージは表示されません。
      </p>
    )
  }
  return (
    <table class="data-table">
      <thead>
        <tr>
          <th>メッセージ ID</th>
          <th>本文プレビュー</th>
          <th>経過時間</th>
        </tr>
      </thead>
      <tbody>
        {messages.map((msg) => (
          <tr
            class="data-table__row data-table__row--clickable"
            data-msg-id={msg.messageId}
            data-msg-receipt={msg.receiptHandle ?? ""}
            onclick="document.dispatchEvent(new CustomEvent('open-message-modal',{detail:{id:this.dataset.msgId,receipt:this.dataset.msgReceipt}}))"
          >
            <td>
              <code class="code-inline" safe>
                {msg.messageId}
              </code>
            </td>
            <td>
              <pre class="msg-body" safe>
                {msg.body.length > 300
                  ? `${msg.body.slice(0, 300)}…`
                  : msg.body}
              </pre>
            </td>
            <td safe>{approximateAge(msg.sentTimestamp)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function QueueDetail({
  name,
  queues = [],
  attributes,
  messages,
  sidebarCounts,
}: QueueDetailProps) {
  const queuePath = `/sqs/${encodeURIComponent(name)}`
  const isFifo = name.endsWith(".fifo")

  const refreshFragments = `
    fetch('${queuePath}/messages-fragment')
      .then(r2 => r2.text())
      .then(html => { const el = document.getElementById('messages-list-inner'); if (el) el.innerHTML = html; })
      .catch(() => {});
    fetch('${queuePath}/attributes-fragment')
      .then(r2 => r2.text())
      .then(html => { const el = document.getElementById('attr-grid'); if (el) el.innerHTML = html; })
      .catch(() => {});`

  const sendState = `{
    open: false, body: '', groupId: '', deduplicationId: '', sending: false, lastId: '', error: '',
    isFifo: ${isFifo},
    requiresDeduplicationId: ${isFifo && !attributes.contentBasedDeduplication},
    close() {
      if (this.sending) return;
      this.open = false;
      this.error = '';
    },
    async send() {
      if (this.isFifo && !this.groupId) {
        this.error = 'FIFO queue では Message Group ID が必須です';
        return;
      }
      if (this.requiresDeduplicationId && !this.deduplicationId) {
        this.error = 'Content-based deduplication が無効な FIFO queue では Message Deduplication ID が必須です';
        return;
      }
      this.sending = true; this.error = ''; this.lastId = '';
      const payload = { body: this.body };
      if (this.isFifo) payload.groupId = this.groupId;
      if (this.requiresDeduplicationId) payload.messageDeduplicationId = this.deduplicationId;
      try {
        const d = await globalThis.floci.requestJson('${queuePath}/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        this.lastId = d.messageId;
        this.body = '';
        this.groupId = '';
        this.deduplicationId = '';
        this.sending = false;
        this.open = false;
        ${refreshFragments}
      } catch (e) {
        this.error = globalThis.floci.errorMessage(e);
        this.sending = false;
      }
    }
  }`

  const msgModalState = `{
    selectedMsg: null,
    bodyLoading: false,
    bodyError: '',
    deleting: false,
    deleteError: '',
  async deleteMsg() {
      this.deleting = true; this.deleteError = '';
      try {
        await globalThis.floci.requestJson('${queuePath}/message', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ receipt: this.selectedMsg.receipt })
        });
        this.selectedMsg = null; this.deleting = false;
        ${refreshFragments}
      } catch(e) {
        this.deleteError = globalThis.floci.errorMessage(e); this.deleting = false;
      }
    }
  }`

  const openMessageModalHandler = `selectedMsg = $event.detail; bodyLoading = true; bodyError = ''; deleteError = ''; deleting = false;
    globalThis.floci.requestJson('${queuePath}/messages/' + $event.detail.id + '/body')
      .then(d => { selectedMsg = {...selectedMsg, body: d.body}; bodyLoading = false; })
      .catch((error) => { bodyError = globalThis.floci.errorMessage(error); bodyLoading = false; })`
  const queueRailItems = queues.map((queue) => ({
    label: queue.name,
    href: `/sqs/${encodeURIComponent(queue.name)}`,
    active: queue.name === name,
    filterText: `${queue.name} ${queue.dlqName ?? ""}`,
    meta: (
      <>
        <span class="badge badge--depth">{queue.depth}</span>
        {queue.dlqName ? <span class="badge badge--dlq">DLQ</span> : null}
      </>
    ),
  }))

  return (
    <Layout
      title={`SQS · ${name}`}
      active="sqs"
      crumbs={[
        { label: "SQS", href: "/sqs" },
        { label: name, href: queuePath },
      ]}
      sidebarCounts={sidebarCounts}
      mainClass="main--resource-workspace"
      contentClass="content--resource-workspace"
      stylesheets={["/public/styles/views/sqs/queue-detail.css"]}
    >
      <div class="sqs-queue-detail-page">
        <div class="resource-workspace sqs-queue-detail-page__workspace">
          {queues.length > 0 ? (
            <ResourceRail
              title="Queues"
              searchPlaceholder="Queue を検索"
              items={queueRailItems}
              emptyLabel="一致する Queue がありません"
            />
          ) : null}

          <div class="resource-main sqs-queue-detail-page__main">
            <section class="page-header page-header--row">
              <div>
                <h1 class="page-title">
                  <span safe>{name}</span>
                </h1>
                {attributes.queueArn ? (
                  <p class="page-subtitle" safe>
                    {attributes.queueArn}
                  </p>
                ) : null}
              </div>
              <div class="page-header__actions">
                <a
                  href={`${queuePath}/settings`}
                  class="btn btn--ghost btn--sm"
                >
                  {IconSettings}設定
                </a>
              </div>
            </section>

            <section class="attr-grid" id="attr-grid">
              <QueueAttributesCards attributes={attributes} />
            </section>

            <div
              x-data={msgModalState}
              {...{
                "@open-message-modal.document": openMessageModalHandler,
              }}
            >
              <section class="panel" x-data={sendState}>
                <div class="panel__header">
                  <h2 class="panel__title">Messages</h2>
                  <div class="panel__actions">
                    <span class="send-form__feedback" x-show="lastId" x-cloak>
                      送信済み · <code x-text="lastId" />
                    </span>
                    <button
                      type="button"
                      class="btn btn--sqs btn--sm"
                      {...{ "@click": "open = true" }}
                    >
                      {IconPlus}送信
                    </button>
                    <span x-data="{ confirming: false }">
                      <button
                        type="button"
                        x-show="!confirming"
                        {...{ "@click": "confirming = true" }}
                        class="btn btn--danger-ghost btn--sm"
                      >
                        キューをパージ
                      </button>
                      <template x-if="confirming">
                        <span class="confirm-inline">
                          <span class="confirm-inline__text">
                            全メッセージを削除しますか？
                          </span>
                          <button
                            type="button"
                            class="btn btn--danger btn--sm"
                            {...{
                              "@click": `globalThis.floci.requestJson('${queuePath}/messages', { method: 'DELETE' }).then(() => location.reload()).catch((error) => window.dispatchEvent(new CustomEvent('floci:toast', { detail: { kind: 'error', message: globalThis.floci.errorMessage(error) } })))`,
                            }}
                          >
                            パージ
                          </button>
                          <button
                            type="button"
                            class="btn btn--ghost btn--sm"
                            {...{ "@click": "confirming = false" }}
                          >
                            キャンセル
                          </button>
                        </span>
                      </template>
                    </span>
                  </div>
                </div>
                <div id="messages-list-inner">
                  <QueueMessagesTable messages={messages} />
                </div>
                <div
                  x-show="open"
                  class="modal-overlay"
                  x-cloak
                  {...{ "@click": "close()" }}
                >
                  <div
                    class="modal modal--wide"
                    {...{
                      "@click.stop": "",
                      "@keydown.escape.window": "close()",
                    }}
                  >
                    <h2 class="modal__title">メッセージを送信</h2>
                    <form
                      class="send-form send-form--modal"
                      {...{ "@submit.prevent": "send()" }}
                    >
                      <textarea
                        rows="6"
                        placeholder="Message body (text or JSON)"
                        required
                        x-model="body"
                        class="send-form__textarea"
                      />
                      <template x-if="isFifo">
                        <div class="form-row sqs-queue-detail-page__group-row">
                          <label class="form-label" for="sqs-group-id">
                            Message Group ID{" "}
                            <span class="form-label__hint">(FIFO 必須)</span>
                          </label>
                          <input
                            id="sqs-group-id"
                            type="text"
                            class="input"
                            x-model="groupId"
                            placeholder="my-group"
                          />
                        </div>
                      </template>
                      <template x-if="requiresDeduplicationId">
                        <div class="form-row sqs-queue-detail-page__group-row">
                          <label class="form-label" for="sqs-deduplication-id">
                            Message Deduplication ID{" "}
                            <span class="form-label__hint">
                              (content-based dedup 無効時に必須)
                            </span>
                          </label>
                          <input
                            id="sqs-deduplication-id"
                            type="text"
                            class="input"
                            x-model="deduplicationId"
                            placeholder="my-dedup-id"
                          />
                        </div>
                      </template>
                      <div class="error-inline" x-show="error" x-cloak>
                        <strong>エラー:</strong> <span x-text="error" />
                      </div>
                      <div class="modal__actions">
                        <button
                          type="submit"
                          class="btn btn--sqs"
                          {...{
                            ":disabled":
                              "sending || !body || (isFifo && !groupId) || (requiresDeduplicationId && !deduplicationId)",
                          }}
                        >
                          <span x-show="!sending">送信</span>
                          <span x-show="sending">送信中…</span>
                        </button>
                        <button
                          type="button"
                          class="btn btn--ghost"
                          {...{ "@click": "close()", ":disabled": "sending" }}
                        >
                          キャンセル
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              </section>

              <template x-if="selectedMsg">
                <div
                  class="modal-overlay"
                  {...{ "@click.self": "selectedMsg = null" }}
                >
                  <div class="modal modal--wide">
                    <h2 class="modal__title">メッセージ詳細</h2>
                    <p class="sqs-queue-detail-page__message-id">
                      ID: <span x-text="selectedMsg.id" />
                    </p>
                    <template x-if="bodyLoading">
                      <p class="loading-text">Loading...</p>
                    </template>
                    <template x-if="bodyError">
                      <p class="error-text" x-text="bodyError" />
                    </template>
                    <pre
                      x-show="!bodyLoading && !bodyError"
                      x-text="selectedMsg?.body ?? ''"
                      class="sqs-queue-detail-page__message-body"
                    />
                    <div class="error-inline" x-show="deleteError" x-cloak>
                      <strong>エラー:</strong> <span x-text="deleteError" />
                    </div>
                    <div class="modal__actions">
                      <button
                        type="button"
                        class="btn btn--danger-ghost"
                        {...{
                          "@click": "deleteMsg()",
                          ":disabled": "deleting || !selectedMsg.receipt",
                        }}
                      >
                        <span x-show="!deleting">削除</span>
                        <span x-show="deleting">削除中…</span>
                      </button>
                      <button
                        type="button"
                        class="btn btn--ghost"
                        {...{ "@click": "selectedMsg = null" }}
                      >
                        閉じる
                      </button>
                    </div>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}
