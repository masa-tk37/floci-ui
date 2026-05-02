import { Html } from "@elysiajs/html"

import { ClientProps, mountComponentAttrs } from "../client"
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

export function QueueDetail({
  name,
  queues = [],
  attributes,
  messages,
  sidebarCounts,
}: QueueDetailProps) {
  const queuePath = `/sqs/${encodeURIComponent(name)}`
  const isFifo = name.endsWith(".fifo")
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
      <div
        class="sqs-queue-detail-page"
        {...mountComponentAttrs("sqs-queue-detail")}
      >
        <ClientProps
          props={{
            queuePath,
            isFifo,
            requiresDeduplicationId:
              isFifo && !attributes.contentBasedDeduplication,
            initialMessages: messages,
            initialAttributes: attributes,
          }}
        />
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
              <div class="attr-card">
                <span class="attr-card__label">メッセージ数</span>
                <span class="attr-card__value" x-text="attributes.depth" />
              </div>
              <div class="attr-card">
                <span class="attr-card__label">処理中</span>
                <span class="attr-card__value" x-text="attributes.inFlight" />
              </div>
              <div class="attr-card">
                <span class="attr-card__label">遅延中</span>
                <span class="attr-card__value" x-text="attributes.delayed" />
              </div>
              <div class="attr-card">
                <span class="attr-card__label">可視性タイムアウト</span>
                <span
                  class="attr-card__value"
                  x-text="attributes.visibilityTimeout + 's'"
                />
              </div>
              <div class="attr-card">
                <span class="attr-card__label">保持期間</span>
                <span
                  class="attr-card__value"
                  x-text="attributes.messageRetention + 's'"
                />
              </div>
              <template x-if="attributes.dlqName">
                <div class="attr-card attr-card--dlq">
                  <span class="attr-card__label">Dead-letter queue</span>
                  <a
                    {...{
                      ":href":
                        "'/sqs/' + encodeURIComponent(attributes.dlqName)",
                    }}
                    class="attr-card__link"
                    x-text="attributes.dlqName"
                  />
                </div>
              </template>
            </section>

            <div>
              <section class="panel">
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
                    <button
                      type="button"
                      {...{ "@click": "openPurge()" }}
                      class="btn btn--danger-ghost btn--sm"
                    >
                      キューをパージ
                    </button>
                  </div>
                </div>
                <div id="messages-list-inner">
                  <p
                    class="empty-state empty-state--plain"
                    x-show="messages.length === 0"
                    x-cloak
                  >
                    メッセージなし。VisibilityTimeout=0 でプレビューします —
                    処理中のメッセージは表示されません。
                  </p>
                  <table
                    class="data-table"
                    x-show="messages.length > 0"
                    x-cloak
                  >
                    <thead>
                      <tr>
                        <th>メッセージ ID</th>
                        <th>本文プレビュー</th>
                        <th>経過時間</th>
                      </tr>
                    </thead>
                    <tbody>
                      <template
                        x-for="msg in messages"
                        {...{ ":key": "msg.messageId" }}
                      >
                        <tr
                          class="data-table__row data-table__row--clickable"
                          {...{ "@click": "selectMsg(msg)" }}
                        >
                          <td>
                            <code class="code-inline" x-text="msg.messageId" />
                          </td>
                          <td>
                            <pre class="msg-body" x-text="truncate(msg.body)" />
                          </td>
                          <td x-text="approximateAge(msg.sentTimestamp)" />
                        </tr>
                      </template>
                    </tbody>
                  </table>
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

              <div
                x-show="purgeOpen"
                class="modal-overlay"
                x-cloak
                {...{ "@click.self": "closePurge()" }}
              >
                <div
                  class="modal"
                  {...{
                    "@click.stop": "",
                    "@keydown.escape.window": "closePurge()",
                  }}
                >
                  <h2 class="modal__title">キューをパージ</h2>
                  <p class="sqs-queue-detail-page__purge-desc">
                    キュー内の全メッセージを削除します。この操作は取り消せません。
                  </p>
                  <div class="error-inline" x-show="purgeError" x-cloak>
                    <strong>エラー:</strong> <span x-text="purgeError" />
                  </div>
                  <div class="modal__actions">
                    <button
                      type="button"
                      class="btn btn--danger"
                      {...{
                        "@click": "confirmPurge()",
                        ":disabled": "purging",
                      }}
                    >
                      <span x-show="!purging">パージ</span>
                      <span x-show="purging">パージ中…</span>
                    </button>
                    <button
                      type="button"
                      class="btn btn--ghost"
                      {...{ "@click": "closePurge()", ":disabled": "purging" }}
                    >
                      キャンセル
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}
