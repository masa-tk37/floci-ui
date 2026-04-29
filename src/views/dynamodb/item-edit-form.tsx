import { Html } from "@elysiajs/html"

import { Layout, type SidebarCounts } from "../layout"
import {
  type ItemEditFormInitial,
  makeItemEditAlpineState,
} from "./item-edit-form-state"

interface ItemEditFormProps {
  init: ItemEditFormInitial
  sidebarCounts?: SidebarCounts
}

export function ItemEditForm({ init, sidebarCounts }: ItemEditFormProps) {
  const tablePath = `/dynamodb/${encodeURIComponent(init.tableName)}`
  const itemPath = init.sk
    ? `${tablePath}/${encodeURIComponent(init.pk)}/${encodeURIComponent(init.sk)}`
    : `${tablePath}/${encodeURIComponent(init.pk)}`
  const alpineState = makeItemEditAlpineState(init, itemPath)

  return (
    <Layout
      title={`Item を編集 · ${init.tableName}`}
      active="dynamodb"
      stylesheets={["/public/styles/views/dynamodb/item-edit-form.css"]}
      crumbs={[
        { label: "DynamoDB", href: "/dynamodb" },
        { label: init.tableName, href: tablePath },
        { label: "編集", href: `${itemPath}/edit` },
      ]}
      sidebarCounts={sidebarCounts}
    >
      <div class="ddb-item-edit-page">
        <section class="page-header">
          <h1 class="page-title">
            Item を編集 · <span safe>{init.tableName}</span>
          </h1>
          {init.tableArn ? (
            <p class="page-subtitle" safe>
              {init.tableArn}
            </p>
          ) : (
            <p class="page-subtitle">
              JSON を直接編集して保存します。主キー属性は変更できません。
            </p>
          )}
        </section>

        <div x-data={alpineState} class="ddb-item-edit-page__form">
          <div class="query-form">
            <h2 class="section-title">キー</h2>
            <div class="ddb-item-edit-page__key-grid">
              <div class="ddb-item-edit-page__key-card">
                <span class="ddb-item-edit-page__key-label" safe>
                  {init.hashKey}
                </span>
                <code safe>{init.pk}</code>
              </div>
              {init.sortKey && init.sk ? (
                <div class="ddb-item-edit-page__key-card">
                  <span class="ddb-item-edit-page__key-label" safe>
                    {init.sortKey}
                  </span>
                  <code safe>{init.sk}</code>
                </div>
              ) : null}
            </div>
            <p class="muted ddb-item-edit-page__note">
              既存 item をそのまま上書き保存します。主キー属性の値は route
              のキーと一致している必要があります。
            </p>
          </div>

          <div class="query-form">
            <div class="ddb-item-edit-page__section-header">
              <h2 class="section-title">Item JSON</h2>
              <button
                type="button"
                class="btn btn--sm"
                {...{ "@click": "formatJson()" }}
              >
                整形
              </button>
            </div>
            <div class="form-row ddb-item-edit-page__editor-row">
              <textarea
                rows="20"
                class="textarea ddb-item-edit-page__editor"
                x-model="itemJson"
                spellcheck="false"
              />
            </div>
          </div>

          <div class="error-inline" x-show="error" x-cloak>
            <strong>エラー:</strong> <span x-text="error" />
          </div>

          <div class="form-actions">
            <button
              type="button"
              class="btn btn--dynamodb"
              {...{ "@click": "submit()", ":disabled": "submitting" }}
            >
              <span x-show="!submitting">保存</span>
              <span x-show="submitting">保存中…</span>
            </button>
            <a href={itemPath} class="btn btn--ghost">
              キャンセル
            </a>
          </div>
        </div>
      </div>
    </Layout>
  )
}
