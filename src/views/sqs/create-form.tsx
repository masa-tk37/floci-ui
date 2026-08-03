import { Html } from "@elysiajs/html"

import { ClientProps, mountComponentAttrs } from "../client"
import { Layout } from "../layout"

export function CreateQueueForm() {
  return (
    <Layout
      title="SQS キューを作成"
      active="sqs"
      stylesheets={["/public/styles/views/sqs/create-form.css"]}
      crumbs={[
        { label: "SQS", href: "/sqs" },
        { label: "Queue を作成", href: "/sqs/new" },
      ]}
    >
      <div class="sqs-create-page">
        <section class="page-header">
          <h1 class="page-title">キューを作成</h1>
          <p class="page-subtitle">新しい SQS Queue を設定します。</p>
        </section>

        <div
          {...mountComponentAttrs("sqs-create-queue")}
          class="sqs-create-page__form"
        >
          <ClientProps props={{}} />
          <div class="query-form">
            <h2 class="section-title">Queue 基本設定</h2>
            <div class="form-row">
              <label class="form-label" for="queueName">
                Queue 名
              </label>
              <input
                id="queueName"
                type="text"
                class="input"
                x-model="name"
                placeholder="my-queue"
                required
              />
              <p class="form-help" x-show="isFifo && name" x-cloak>
                作成されるキュー名：
                <code x-text="resolvedName" />
              </p>
            </div>
            <div class="form-row sqs-create-page__form-row--compact">
              <label class="radio">
                <input type="checkbox" x-model="isFifo" />
                <span>FIFO queue</span>
              </label>
            </div>
            <div
              x-show="isFifo"
              x-cloak
              class="form-row sqs-create-page__fifo-row"
            >
              <label class="radio">
                <input type="checkbox" x-model="contentBasedDedup" />
                <span>Content-based deduplication</span>
              </label>
            </div>
          </div>

          <div class="query-form">
            <h2 class="section-title">メッセージ設定</h2>
            <div class="sqs-create-page__message-grid">
              <div class="form-row">
                <label class="form-label">可視性タイムアウト (s)</label>
                <input
                  type="number"
                  class="input"
                  x-model="visibilityTimeout"
                  min="0"
                  max="43200"
                />
              </div>
              <div class="form-row">
                <label class="form-label">保持期間 (s)</label>
                <input
                  type="number"
                  class="input"
                  x-model="messageRetentionPeriod"
                  min="60"
                  max="1209600"
                />
              </div>
              <div class="form-row">
                <label class="form-label">配信遅延 (s)</label>
                <input
                  type="number"
                  class="input"
                  x-model="delaySeconds"
                  min="0"
                  max="900"
                />
              </div>
              <div class="form-row">
                <label class="form-label">ロングポーリング待機 (s)</label>
                <input
                  type="number"
                  class="input"
                  x-model="receiveMessageWaitTimeSeconds"
                  min="0"
                  max="20"
                />
              </div>
              <div class="form-row sqs-create-page__message-grid-full">
                <label class="form-label">最大メッセージサイズ (bytes)</label>
                <input
                  type="number"
                  class="input"
                  x-model="maximumMessageSize"
                  min="1024"
                  max="262144"
                />
              </div>
            </div>
          </div>

          <div class="query-form">
            <h2 class="section-title">Dead-letter Queue</h2>
            <div class="form-row">
              <label class="radio">
                <input type="checkbox" x-model="dlqEnabled" />
                <span>DLQ リドライブを有効にする</span>
              </label>
            </div>
            <div x-show="dlqEnabled" x-cloak class="sqs-create-page__dlq-grid">
              <div class="form-row">
                <label class="form-label">Dead-letter queue ARN</label>
                <input
                  type="text"
                  class="input"
                  x-model="dlqTargetArn"
                  placeholder="arn:aws:sqs:us-east-1:000000000000:my-dlq"
                />
              </div>
              <div class="form-row">
                <label class="form-label">最大受信回数</label>
                <input
                  type="number"
                  class="input sqs-create-page__count-input"
                  x-model="dlqMaxReceiveCount"
                  min="1"
                  max="1000"
                />
              </div>
            </div>
          </div>

          <div class="query-form">
            <h2 class="section-title">暗号化 (KMS)</h2>
            <div class="form-row">
              <label class="radio">
                <input type="checkbox" x-model="kmsEnabled" />
                <span>KMS 暗号化を有効にする</span>
              </label>
            </div>
            <div
              x-show="kmsEnabled"
              x-cloak
              class="form-row sqs-create-page__form-row--compact"
            >
              <label class="form-label">KMS Master Key ID</label>
              <input
                type="text"
                class="input"
                x-model="kmsMasterKeyId"
                placeholder="alias/aws/sqs"
              />
            </div>
          </div>

          <div class="query-form">
            <div class="sqs-create-page__section-header">
              <h2 class="section-title sqs-create-page__section-title">Tags</h2>
              <button
                type="button"
                class="btn btn--sm"
                {...{ "@click": "addTag()" }}
              >
                + タグを追加
              </button>
            </div>
            <p
              class="muted sqs-create-page__empty"
              x-show="tags.length === 0"
              x-cloak
            >
              タグなし
            </p>
            <template x-for="(tag, i) in tags" {...{ ":key": "i" }}>
              <div class="sqs-create-page__tag-grid">
                <div class="form-row">
                  <label class="form-label">Key</label>
                  <input
                    type="text"
                    class="input"
                    x-model="tag.key"
                    placeholder="Environment"
                  />
                </div>
                <div class="form-row">
                  <label class="form-label">Value</label>
                  <input
                    type="text"
                    class="input"
                    x-model="tag.value"
                    placeholder="dev"
                  />
                </div>
                <button
                  type="button"
                  class="btn btn--danger-ghost btn--sm sqs-create-page__tag-remove"
                  {...{ "@click": "removeTag(i)" }}
                >
                  ✕
                </button>
              </div>
            </template>
          </div>

          <div class="error-inline" x-show="error" x-cloak>
            <strong>エラー:</strong> <span x-text="error" />
          </div>

          <div class="form-actions">
            <button
              type="button"
              class="btn btn--sqs"
              {...{ "@click": "submit()", ":disabled": "submitting || !name" }}
            >
              <span x-show="!submitting">作成</span>
              <span x-show="submitting">作成中…</span>
            </button>
            <a href="/sqs" class="btn btn--ghost">
              キャンセル
            </a>
          </div>
        </div>
      </div>
    </Layout>
  )
}
