import { Html } from "@elysiajs/html"

import { IconSettings } from "../icons"
import { Layout } from "../layout"

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
            data-msg-body={msg.body}
            onclick="document.dispatchEvent(new CustomEvent('open-message-modal',{detail:{id:this.dataset.msgId,receipt:this.dataset.msgReceipt,body:this.dataset.msgBody}}))"
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
    body: '', groupId: '', deduplicationId: '', sending: false, lastId: '', error: '',
    isFifo: ${isFifo},
    requiresDeduplicationId: ${isFifo && !attributes.contentBasedDeduplication},
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
        const r = await fetch('${queuePath}/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const d = await r.json();
        if (d.error) { this.error = d.error; this.sending = false; return; }
        this.lastId = d.messageId;
        this.body = '';
        this.groupId = '';
        this.deduplicationId = '';
        this.sending = false;
        ${refreshFragments}
      } catch (e) {
        this.error = e.message || 'ネットワークエラー';
        this.sending = false;
      }
    }
  }`

  const msgModalState = `{
    selectedMsg: null,
    deleting: false,
    deleteError: '',
    async deleteMsg() {
      this.deleting = true; this.deleteError = '';
      try {
        const r = await fetch('${queuePath}/message', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ receipt: this.selectedMsg.receipt })
        });
        const d = await r.json();
        if (d.error) { this.deleteError = d.error; this.deleting = false; return; }
        this.selectedMsg = null; this.deleting = false;
        ${refreshFragments}
      } catch(e) {
        this.deleteError = e.message || 'ネットワークエラー'; this.deleting = false;
      }
    }
  }`

  return (
    <Layout
      title={`SQS · ${name}`}
      active="sqs"
      crumbs={[
        { label: "SQS", href: "/sqs" },
        { label: name, href: queuePath },
      ]}
      sidebarCounts={sidebarCounts}
      stylesheets={["/public/styles/views/sqs/queue-detail.css"]}
    >
      <div class="sqs-queue-detail-page">
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
            <a href={`${queuePath}/settings`} class="btn btn--ghost btn--sm">
              {IconSettings}設定
            </a>
          </div>
        </section>

        <section class="attr-grid" id="attr-grid">
          <QueueAttributesCards attributes={attributes} />
        </section>

        <section class="panel">
          <div class="panel__header">
            <h2 class="panel__title">メッセージを送信</h2>
          </div>
          <form
            class="send-form"
            x-data={sendState}
            {...{ "@submit.prevent": "send()" }}
          >
            <textarea
              rows="5"
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
            <div class="send-form__actions">
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
              <span class="send-form__feedback" x-show="lastId" x-cloak>
                送信済み · <code x-text="lastId" />
              </span>
            </div>
            <div class="error-inline" x-show="error" x-cloak>
              <strong>エラー:</strong> <span x-text="error" />
            </div>
          </form>
        </section>

        <div
          x-data={msgModalState}
          {...{
            "@open-message-modal.document":
              'selectedMsg = $event.detail; deleteError = ""; deleting = false;',
          }}
        >
          <section class="panel">
            <div class="panel__header">
              <h2 class="panel__title">メッセージをプレビュー</h2>
              <div class="panel__actions" x-data="{ confirming: false }">
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
                        "@click": `fetch('${queuePath}/messages', { method: 'DELETE' }).then(r => r.json()).then(() => location.reload())`,
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
              </div>
            </div>
            <div id="messages-list-inner">
              <QueueMessagesTable messages={messages} />
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
                <pre
                  x-text="selectedMsg.body"
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
    </Layout>
  )
}
