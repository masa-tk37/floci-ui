import { Html } from "@elysiajs/html"

import { ClientProps, mountComponentAttrs } from "../client"
import { Layout } from "../layout"
import type { UpdateFormInitial } from "./update-form-state"

interface UpdateTableFormProps {
  init: UpdateFormInitial
}

export function UpdateTableForm({ init }: UpdateTableFormProps) {
  const tablePath = `/dynamodb/${encodeURIComponent(init.tableName)}`

  return (
    <Layout
      title={`Table を編集 · ${init.tableName}`}
      active="dynamodb"
      stylesheets={["/public/styles/views/dynamodb/update-form.css"]}
      crumbs={[
        { label: "DynamoDB", href: "/dynamodb" },
        { label: init.tableName, href: tablePath },
        { label: "編集", href: `${tablePath}/edit` },
      ]}
    >
      <div class="ddb-update-page">
        <section class="page-header">
          <h1 class="page-title">
            Table を編集 · <span safe>{init.tableName}</span>
          </h1>
          <p class="page-subtitle">
            課金モード、スループット、Streams、TTL、削除保護を更新します。
          </p>
        </section>

        <div
          {...mountComponentAttrs("ddb-update-table")}
          class="ddb-update-page__form"
        >
          <ClientProps props={init} />
          <div class="query-form">
            <h2 class="section-title">課金モード</h2>
            <div class="form-row radio-group">
              <label class="radio">
                <input
                  type="radio"
                  value="PAY_PER_REQUEST"
                  x-model="billingMode"
                />
                <span>オンデマンド (PAY_PER_REQUEST)</span>
              </label>
              <label class="radio">
                <input type="radio" value="PROVISIONED" x-model="billingMode" />
                <span>プロビジョニング済み</span>
              </label>
            </div>
            <div
              x-show="billingMode === 'PROVISIONED'"
              x-cloak
              class="ddb-update-page__capacity-grid"
            >
              <div class="form-row ddb-update-page__form-row--compact">
                <label class="form-label" for="ddb-rcu">
                  読み込みキャパシティユニット (RCU)
                </label>
                <input
                  id="ddb-rcu"
                  type="number"
                  class="input"
                  x-model="rcu"
                  min="1"
                />
              </div>
              <div class="form-row ddb-update-page__form-row--compact">
                <label class="form-label" for="ddb-wcu">
                  書き込みキャパシティユニット (WCU)
                </label>
                <input
                  id="ddb-wcu"
                  type="number"
                  class="input"
                  x-model="wcu"
                  min="1"
                />
              </div>
            </div>
          </div>

          <div class="query-form">
            <h2 class="section-title">Streams</h2>
            <div class="form-row">
              <label class="radio">
                <input type="checkbox" x-model="streamEnabled" />
                <span>DynamoDB Streams を有効化</span>
              </label>
            </div>
            <div
              x-show="streamEnabled"
              x-cloak
              class="form-row ddb-update-page__form-row--compact"
            >
              <label class="form-label" for="ddb-stream-view">
                ストリームビュータイプ
              </label>
              <select
                id="ddb-stream-view"
                class="select"
                x-model="streamViewType"
              >
                <option value="NEW_AND_OLD_IMAGES">NEW_AND_OLD_IMAGES</option>
                <option value="NEW_IMAGE">NEW_IMAGE</option>
                <option value="OLD_IMAGE">OLD_IMAGE</option>
                <option value="KEYS_ONLY">KEYS_ONLY</option>
              </select>
            </div>
          </div>

          <div class="query-form">
            <h2 class="section-title">Time to Live (TTL)</h2>
            <div class="form-row">
              <label class="radio">
                <input type="checkbox" x-model="ttlEnabled" />
                <span>TTL を有効化</span>
              </label>
            </div>
            <div
              x-show="ttlEnabled"
              x-cloak
              class="form-row ddb-update-page__form-row--compact"
            >
              <label class="form-label" for="ddb-ttl-attr">
                TTL 属性名
              </label>
              <input
                id="ddb-ttl-attr"
                type="text"
                class="input"
                x-model="ttlAttr"
                placeholder="ttl"
              />
            </div>
          </div>

          <div class="query-form">
            <h2 class="section-title">保護</h2>
            <div class="form-row ddb-update-page__form-row--compact">
              <label class="radio">
                <input type="checkbox" x-model="deletionProtection" />
                <span>削除保護を有効化</span>
              </label>
            </div>
          </div>

          <div class="error-inline" x-show="error" x-cloak>
            <strong>エラー:</strong> <span x-text="error" />
          </div>

          <div class="form-actions">
            <button
              type="button"
              class="btn btn--primary"
              {...{ "@click": "submit()", ":disabled": "submitting" }}
            >
              <span x-show="!submitting">保存</span>
              <span x-show="submitting">保存中…</span>
            </button>
            <a href={tablePath} class="btn btn--ghost">
              キャンセル
            </a>
          </div>
        </div>
      </div>
    </Layout>
  )
}
