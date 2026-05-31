import { Html } from "@elysiajs/html"

import { ClientProps, mountComponentAttrs } from "../client"
import { Layout, type SidebarCounts } from "../layout"
import type { SQSSettingsInitial } from "./settings-form-state"

interface SQSSettingsFormProps {
  init: SQSSettingsInitial
  sidebarCounts?: SidebarCounts
}

export function SQSSettingsForm({ init, sidebarCounts }: SQSSettingsFormProps) {
  const queuePath = `/sqs/${encodeURIComponent(init.name)}`

  return (
    <Layout
      title={`設定 · ${init.name}`}
      active="sqs"
      sidebarCounts={sidebarCounts}
      stylesheets={["/public/styles/views/sqs/settings-form.css"]}
      crumbs={[
        { label: "SQS", href: "/sqs" },
        { label: init.name, href: queuePath },
        { label: "設定", href: `${queuePath}/settings` },
      ]}
    >
      <div class="sqs-settings-page">
        <section class="page-header">
          <h1 class="page-title">
            設定 · <span safe>{init.name}</span>
          </h1>
          <p class="page-subtitle">
            Queue の属性を更新します。FIFO タイプは作成後に変更できません。
          </p>
        </section>

        <div
          {...mountComponentAttrs("sqs-settings")}
          class="sqs-settings-page__form"
        >
          <ClientProps props={init} />
          {init.isFifo ? (
            <div class="query-form sqs-settings-page__info">
              <p class="sqs-settings-page__info-text">
                これは FIFO queue です。FIFO
                タイプとコンテンツベース重複排除は作成後に変更できません。
              </p>
              <div class="sqs-settings-page__message-grid">
                <div class="form-row">
                  <label class="form-label" for="sqs-deduplication-scope">
                    Deduplication Scope
                  </label>
                  <select
                    id="sqs-deduplication-scope"
                    class="select"
                    x-model="deduplicationScope"
                  >
                    <option value="queue">queue</option>
                    <option value="messageGroup">messageGroup</option>
                  </select>
                </div>
                <div class="form-row">
                  <label class="form-label" for="sqs-fifo-throughput-limit">
                    FIFO Throughput Limit
                  </label>
                  <select
                    id="sqs-fifo-throughput-limit"
                    class="select"
                    x-model="fifoThroughputLimit"
                  >
                    <option value="perQueue">perQueue</option>
                    <option value="perMessageGroupId">perMessageGroupId</option>
                  </select>
                </div>
              </div>
            </div>
          ) : null}

          <div class="query-form">
            <h2 class="section-title">メッセージ設定</h2>
            <div class="sqs-settings-page__message-grid">
              <div class="form-row">
                <label class="form-label" for="sqs-visibility-timeout">
                  可視性タイムアウト (s)
                </label>
                <input
                  id="sqs-visibility-timeout"
                  type="number"
                  class="input"
                  x-model="visibilityTimeout"
                  min="0"
                  max="43200"
                />
              </div>
              <div class="form-row">
                <label class="form-label" for="sqs-retention">
                  保持期間 (s)
                </label>
                <input
                  id="sqs-retention"
                  type="number"
                  class="input"
                  x-model="messageRetentionPeriod"
                  min="60"
                  max="1209600"
                />
              </div>
              <div class="form-row">
                <label class="form-label" for="sqs-delay">
                  配信遅延 (s)
                </label>
                <input
                  id="sqs-delay"
                  type="number"
                  class="input"
                  x-model="delaySeconds"
                  min="0"
                  max="900"
                />
              </div>
              <div class="form-row">
                <label class="form-label" for="sqs-wait-time">
                  ロングポーリング待機 (s)
                </label>
                <input
                  id="sqs-wait-time"
                  type="number"
                  class="input"
                  x-model="receiveMessageWaitTimeSeconds"
                  min="0"
                  max="20"
                />
              </div>
              <div class="form-row sqs-settings-page__message-grid-full">
                <label class="form-label" for="sqs-max-size">
                  最大メッセージサイズ (bytes)
                </label>
                <input
                  id="sqs-max-size"
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
            <div
              x-show="dlqEnabled"
              x-cloak
              class="sqs-settings-page__dlq-grid"
            >
              <div class="form-row">
                <label class="form-label" for="sqs-dlq-arn">
                  Dead-letter queue ARN
                </label>
                <input
                  id="sqs-dlq-arn"
                  type="text"
                  class="input"
                  x-model="dlqTargetArn"
                  placeholder="arn:aws:sqs:us-east-1:000000000000:my-dlq"
                />
              </div>
              <div class="form-row">
                <label class="form-label" for="sqs-dlq-count">
                  最大受信回数
                </label>
                <input
                  id="sqs-dlq-count"
                  type="number"
                  class="input sqs-settings-page__count-input"
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
              class="form-row sqs-settings-page__form-row--compact"
            >
              <label class="form-label" for="sqs-kms-key">
                KMS Master Key ID
              </label>
              <input
                id="sqs-kms-key"
                type="text"
                class="input"
                x-model="kmsMasterKeyId"
                placeholder="alias/aws/sqs"
              />
            </div>
          </div>

          <div class="query-form">
            <div class="sqs-settings-page__section-header">
              <h2 class="section-title sqs-settings-page__section-title">
                Tags
              </h2>
              <button
                type="button"
                class="btn btn--sm"
                {...{ "@click": "addTag()" }}
              >
                + タグを追加
              </button>
            </div>
            <p
              class="muted sqs-settings-page__empty"
              x-show="tags.length === 0"
              x-cloak
            >
              タグなし
            </p>
            <template x-for="(tag, i) in tags" {...{ ":key": "i" }}>
              <div class="sqs-settings-page__tag-grid">
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
                  class="btn btn--danger-ghost btn--sm sqs-settings-page__tag-remove"
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
              {...{ "@click": "submit()", ":disabled": "submitting" }}
            >
              <span x-show="!submitting">保存</span>
              <span x-show="submitting">保存中…</span>
            </button>
            <a href={queuePath} class="btn btn--ghost">
              キャンセル
            </a>
          </div>
        </div>
      </div>
    </Layout>
  )
}
