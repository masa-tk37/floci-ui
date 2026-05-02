import { Html } from "@elysiajs/html"

import { ClientProps, mountComponentAttrs } from "../client"
import { Layout, type SidebarCounts } from "../layout"

interface CreateTableFormProps {
  sidebarCounts?: SidebarCounts
}

export function CreateTableForm({ sidebarCounts }: CreateTableFormProps = {}) {
  return (
    <Layout
      title="Create DynamoDB Table"
      active="dynamodb"
      sidebarCounts={sidebarCounts}
      stylesheets={["/public/styles/views/dynamodb/create-form.css"]}
      crumbs={[
        { label: "DynamoDB", href: "/dynamodb" },
        { label: "Table を作成", href: "/dynamodb/new" },
      ]}
    >
      <div class="ddb-create-page">
        <section class="page-header">
          <h1 class="page-title">Table を作成</h1>
          <p class="page-subtitle">新しい DynamoDB Table を設定します。</p>
        </section>

        <div
          {...mountComponentAttrs("ddb-create-table")}
          class="ddb-create-page__form"
        >
          <ClientProps props={{}} />
          <div class="query-form">
            <h2 class="section-title">Table の基本設定</h2>
            <div class="form-row">
              <label class="form-label" for="tableName">
                Table 名
              </label>
              <input
                id="tableName"
                type="text"
                class="input"
                x-model="tableName"
                placeholder="my-table"
                required
              />
            </div>
          </div>

          <div class="query-form">
            <h2 class="section-title">プライマリキー</h2>
            <div class="ddb-create-page__key-grid ddb-create-page__key-grid--spaced">
              <div class="form-row ddb-create-page__form-row--compact">
                <label class="form-label" for="ddb-pk-name">
                  パーティションキー (PK)
                </label>
                <input
                  id="ddb-pk-name"
                  type="text"
                  class="input"
                  x-model="pk.name"
                  placeholder="pk"
                />
              </div>
              <div class="form-row ddb-create-page__form-row--compact">
                <label class="form-label" for="ddb-pk-type">
                  種別
                </label>
                <select
                  id="ddb-pk-type"
                  class="select ddb-create-page__select"
                  x-model="pk.type"
                >
                  <option value="S">String (S)</option>
                  <option value="N">Number (N)</option>
                  <option value="B">Binary (B)</option>
                </select>
              </div>
            </div>

            <div class="form-row ddb-create-page__form-row--spaced">
              <label class="radio">
                <input type="checkbox" x-model="hasSk" />
                <span>ソートキーを追加 (SK)</span>
              </label>
            </div>

            <div x-show="hasSk" x-cloak class="ddb-create-page__key-grid">
              <div class="form-row ddb-create-page__form-row--compact">
                <label class="form-label" for="ddb-sk-name">
                  ソートキー (SK)
                </label>
                <input
                  id="ddb-sk-name"
                  type="text"
                  class="input"
                  x-model="sk.name"
                  placeholder="sk"
                />
              </div>
              <div class="form-row ddb-create-page__form-row--compact">
                <label class="form-label" for="ddb-sk-type">
                  種別
                </label>
                <select
                  id="ddb-sk-type"
                  class="select ddb-create-page__select"
                  x-model="sk.type"
                >
                  <option value="S">String (S)</option>
                  <option value="N">Number (N)</option>
                  <option value="B">Binary (B)</option>
                </select>
              </div>
            </div>
          </div>

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
              class="ddb-create-page__capacity-grid"
            >
              <div class="form-row ddb-create-page__form-row--compact">
                <label class="form-label" for="ddb-create-rcu">
                  読み込みキャパシティユニット (RCU)
                </label>
                <input
                  id="ddb-create-rcu"
                  type="number"
                  class="input"
                  x-model="rcu"
                  min="1"
                />
              </div>
              <div class="form-row ddb-create-page__form-row--compact">
                <label class="form-label" for="ddb-create-wcu">
                  書き込みキャパシティユニット (WCU)
                </label>
                <input
                  id="ddb-create-wcu"
                  type="number"
                  class="input"
                  x-model="wcu"
                  min="1"
                />
              </div>
            </div>
          </div>

          <div class="query-form">
            <div class="ddb-create-page__section-header">
              <h2 class="section-title ddb-create-page__section-title">
                Global Secondary Indexes
              </h2>
              <button
                type="button"
                class="btn btn--sm"
                {...{ "@click": "addGsi()" }}
              >
                + GSI を追加
              </button>
            </div>
            <p
              class="muted ddb-create-page__empty"
              x-show="gsi.length === 0"
              x-cloak
            >
              GSI が設定されていません。
            </p>
            <template x-for="(g, i) in gsi" {...{ ":key": "i" }}>
              <div class="ddb-create-page__card">
                <div class="ddb-create-page__card-header">
                  <span class="form-label ddb-create-page__card-label">
                    GSI <span x-text="i + 1" />
                  </span>
                  <button
                    type="button"
                    class="btn btn--danger-ghost btn--sm"
                    {...{ "@click": "removeGsi(i)" }}
                  >
                    削除
                  </button>
                </div>
                <div class="form-row">
                  <label class="form-label">インデックス名</label>
                  <input
                    type="text"
                    class="input"
                    x-model="g.indexName"
                    placeholder="gsi-pk-index"
                  />
                </div>
                <div class="ddb-create-page__key-grid ddb-create-page__key-grid--spaced">
                  <div class="form-row ddb-create-page__form-row--compact">
                    <label class="form-label">PK</label>
                    <input
                      type="text"
                      class="input"
                      x-model="g.pk.name"
                      placeholder="gsi_pk"
                    />
                  </div>
                  <div class="form-row ddb-create-page__form-row--compact">
                    <label class="form-label">種別</label>
                    <select
                      class="select ddb-create-page__select"
                      x-model="g.pk.type"
                    >
                      <option value="S">S</option>
                      <option value="N">N</option>
                      <option value="B">B</option>
                    </select>
                  </div>
                </div>
                <div class="form-row ddb-create-page__form-row--spaced">
                  <label class="radio">
                    <input type="checkbox" x-model="g.hasSk" />
                    <span>ソートキー</span>
                  </label>
                </div>
                <div
                  x-show="g.hasSk"
                  x-cloak
                  class="ddb-create-page__key-grid ddb-create-page__key-grid--spaced"
                >
                  <div class="form-row ddb-create-page__form-row--compact">
                    <label class="form-label">SK</label>
                    <input
                      type="text"
                      class="input"
                      x-model="g.sk.name"
                      placeholder="gsi_sk"
                    />
                  </div>
                  <div class="form-row ddb-create-page__form-row--compact">
                    <label class="form-label">種別</label>
                    <select
                      class="select ddb-create-page__select"
                      x-model="g.sk.type"
                    >
                      <option value="S">S</option>
                      <option value="N">N</option>
                      <option value="B">B</option>
                    </select>
                  </div>
                </div>
                <div class="form-row">
                  <label class="form-label">プロジェクション</label>
                  <select class="select" x-model="g.projectionType">
                    <option value="ALL">ALL</option>
                    <option value="KEYS_ONLY">KEYS_ONLY</option>
                    <option value="INCLUDE">INCLUDE</option>
                  </select>
                </div>
                <div
                  class="form-row"
                  x-show="g.projectionType === 'INCLUDE'"
                  x-cloak
                >
                  <label class="form-label">
                    非キー属性{" "}
                    <span class="form-label__hint">(カンマ区切り)</span>
                  </label>
                  <input
                    type="text"
                    class="input"
                    x-model="g.nonKeyAttrs"
                    placeholder="attr1, attr2"
                  />
                </div>
                <div
                  x-show="billingMode === 'PROVISIONED'"
                  x-cloak
                  class="ddb-create-page__capacity-grid"
                >
                  <div class="form-row ddb-create-page__form-row--compact">
                    <label class="form-label">RCU</label>
                    <input
                      type="number"
                      class="input"
                      x-model="g.rcu"
                      min="1"
                    />
                  </div>
                  <div class="form-row ddb-create-page__form-row--compact">
                    <label class="form-label">WCU</label>
                    <input
                      type="number"
                      class="input"
                      x-model="g.wcu"
                      min="1"
                    />
                  </div>
                </div>
              </div>
            </template>
          </div>

          <div class="query-form">
            <div class="ddb-create-page__section-header">
              <h2 class="section-title ddb-create-page__section-title">
                Local Secondary Indexes
              </h2>
              <button
                type="button"
                class="btn btn--sm"
                {...{ "@click": "addLsi()", ":disabled": "!hasSk" }}
                title="LSI を追加するにはソートキーが必要です"
              >
                + LSI を追加
              </button>
            </div>
            <p class="muted ddb-create-page__empty" x-show="!hasSk" x-cloak>
              LSI を追加するにはソートキーが必要です。
            </p>
            <p
              class="muted ddb-create-page__empty"
              x-show="hasSk && lsi.length === 0"
              x-cloak
            >
              LSI が設定されていません。
            </p>
            <template x-for="(l, i) in lsi" {...{ ":key": "i" }}>
              <div class="ddb-create-page__card">
                <div class="ddb-create-page__card-header">
                  <span class="form-label ddb-create-page__card-label">
                    LSI <span x-text="i + 1" />
                  </span>
                  <button
                    type="button"
                    class="btn btn--danger-ghost btn--sm"
                    {...{ "@click": "removeLsi(i)" }}
                  >
                    削除
                  </button>
                </div>
                <div class="form-row">
                  <label class="form-label">インデックス名</label>
                  <input
                    type="text"
                    class="input"
                    x-model="l.indexName"
                    placeholder="lsi-sk-index"
                  />
                </div>
                <div class="ddb-create-page__key-grid ddb-create-page__key-grid--spaced">
                  <div class="form-row ddb-create-page__form-row--compact">
                    <label class="form-label">ソートキー</label>
                    <input
                      type="text"
                      class="input"
                      x-model="l.sk.name"
                      placeholder="lsi_sk"
                    />
                  </div>
                  <div class="form-row ddb-create-page__form-row--compact">
                    <label class="form-label">種別</label>
                    <select
                      class="select ddb-create-page__select"
                      x-model="l.sk.type"
                    >
                      <option value="S">S</option>
                      <option value="N">N</option>
                      <option value="B">B</option>
                    </select>
                  </div>
                </div>
                <div class="form-row">
                  <label class="form-label">プロジェクション</label>
                  <select class="select" x-model="l.projectionType">
                    <option value="ALL">ALL</option>
                    <option value="KEYS_ONLY">KEYS_ONLY</option>
                    <option value="INCLUDE">INCLUDE</option>
                  </select>
                </div>
                <div
                  class="form-row"
                  x-show="l.projectionType === 'INCLUDE'"
                  x-cloak
                >
                  <label class="form-label">
                    非キー属性{" "}
                    <span class="form-label__hint">(カンマ区切り)</span>
                  </label>
                  <input
                    type="text"
                    class="input"
                    x-model="l.nonKeyAttrs"
                    placeholder="attr1, attr2"
                  />
                </div>
              </div>
            </template>
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
              class="form-row ddb-create-page__form-row--compact"
            >
              <label class="form-label">ストリームビュータイプ</label>
              <select class="select" x-model="streamViewType">
                <option value="NEW_AND_OLD_IMAGES">NEW_AND_OLD_IMAGES</option>
                <option value="NEW_IMAGE">NEW_IMAGE</option>
                <option value="OLD_IMAGE">OLD_IMAGE</option>
                <option value="KEYS_ONLY">KEYS_ONLY</option>
              </select>
            </div>
          </div>

          <div class="error-inline" x-show="error" x-cloak>
            <strong>エラー:</strong> <span x-text="error" />
          </div>

          <div class="form-actions">
            <button
              type="button"
              class="btn btn--dynamodb"
              {...{
                "@click": "submit()",
                ":disabled": "submitting || !tableName || !pk.name",
              }}
            >
              <span x-show="!submitting">作成</span>
              <span x-show="submitting">作成中…</span>
            </button>
            <a href="/dynamodb" class="btn btn--ghost">
              キャンセル
            </a>
          </div>
        </div>
      </div>
    </Layout>
  )
}
