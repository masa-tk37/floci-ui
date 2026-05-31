import { Html } from "@elysiajs/html"

import { encodeResourceName } from "../../infrastructure/resource-name-codec"
import { ClientProps, mountComponentAttrs } from "../client"
import { Layout, type SidebarCounts } from "../layout"
import type { ParameterFormInitial } from "./parameter-form-state"

interface ParameterFormProps {
  init: ParameterFormInitial
  sidebarCounts?: SidebarCounts
}

export function ParameterForm({ init, sidebarCounts }: ParameterFormProps) {
  const parameterPath =
    init.mode === "edit" ? `/ssm/${encodeResourceName(init.name)}` : "/ssm"

  return (
    <Layout
      title={
        init.mode === "create" ? "SSM Parameter を作成" : `編集 · ${init.name}`
      }
      active="ssm"
      sidebarCounts={sidebarCounts}
      stylesheets={["/public/styles/views/ssm/parameter-form.css"]}
      crumbs={
        init.mode === "create"
          ? [
              { label: "SSM", href: "/ssm" },
              { label: "Parameter を作成", href: "/ssm/new" },
            ]
          : [
              { label: "SSM", href: "/ssm" },
              { label: init.name, href: parameterPath },
              { label: "編集", href: `${parameterPath}/edit` },
            ]
      }
    >
      <div class="ssm-parameter-form-page">
        <section class="page-header">
          <h1 class="page-title">
            {init.mode === "create"
              ? "SSM Parameter を作成"
              : "Parameter を編集"}
          </h1>
          <p class="page-subtitle">
            {init.mode === "create"
              ? "新しい SSM Parameter を設定します。"
              : "Parameter の設定を更新します。"}
          </p>
        </section>

        <div {...mountComponentAttrs("parameter-form")}>
          <ClientProps props={init} />
          <div class="query-form">
            <h2 class="section-title">基本設定</h2>
            <div class="ssm-parameter-form-page__grid">
              <div class="form-row">
                <label class="form-label" for="ssm-name">
                  Parameter 名
                </label>
                <input
                  id="ssm-name"
                  type="text"
                  class="input"
                  x-model="name"
                  placeholder="/app/dev/config"
                  disabled={init.mode === "edit"}
                />
              </div>

              <div class="form-row">
                <label class="form-label" for="ssm-type">
                  Type
                </label>
                <select id="ssm-type" class="select" x-model="type">
                  <option value="String">String</option>
                  <option value="StringList">StringList</option>
                  <option value="SecureString">SecureString</option>
                </select>
              </div>

              <div class="form-row">
                <label class="form-label" for="ssm-tier">
                  Tier
                </label>
                <select id="ssm-tier" class="select" x-model="tier">
                  <option value="Standard">Standard</option>
                  <option value="Advanced">Advanced</option>
                  <option value="Intelligent-Tiering">
                    Intelligent-Tiering
                  </option>
                </select>
              </div>
            </div>

            <div class="form-row">
              <label class="form-label" for="ssm-description">
                Description
              </label>
              <input
                id="ssm-description"
                type="text"
                class="input"
                x-model="description"
                placeholder="用途メモ"
              />
            </div>

            <div class="form-row">
              <label class="form-label" for="ssm-value">
                Value
              </label>
              <textarea
                id="ssm-value"
                class="textarea ssm-parameter-form-page__value"
                x-model="value"
                placeholder="parameter value"
              />
              <p class="form-help" x-show="type === 'StringList'" x-cloak>
                `StringList` はカンマ区切りの文字列で入力します。
              </p>
            </div>

            <div class="form-row" x-show="isSecureString" x-cloak>
              <label class="form-label" for="ssm-key-id">
                KMS Key ID
              </label>
              <input
                id="ssm-key-id"
                type="text"
                class="input"
                x-model="keyId"
                placeholder="alias/aws/ssm"
              />
            </div>
          </div>

          <div class="query-form">
            <div class="ssm-parameter-form-page__section-header">
              <h2 class="section-title ssm-parameter-form-page__section-title">
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
              class="muted ssm-parameter-form-page__empty"
              x-show="tags.length === 0"
              x-cloak
            >
              タグなし
            </p>

            <template x-for="(tag, index) in tags" {...{ ":key": "index" }}>
              <div class="ssm-parameter-form-page__tag-grid">
                <div class="form-row">
                  <label class="form-label">Key</label>
                  <input type="text" class="input" x-model="tag.key" />
                </div>
                <div class="form-row">
                  <label class="form-label">Value</label>
                  <input type="text" class="input" x-model="tag.value" />
                </div>
                <button
                  type="button"
                  class="btn btn--danger-ghost btn--sm ssm-parameter-form-page__tag-remove"
                  {...{ "@click": "removeTag(index)" }}
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
              class="btn btn--ssm"
              {...{
                "@click": "submit()",
                ":disabled": "submitting || !name || !value",
              }}
            >
              <span x-show="!submitting">
                {init.mode === "create" ? "作成" : "保存"}
              </span>
              <span x-show="submitting">
                {init.mode === "create" ? "作成中…" : "保存中…"}
              </span>
            </button>
            <a href={parameterPath} class="btn btn--ghost">
              キャンセル
            </a>
          </div>
        </div>
      </div>
    </Layout>
  )
}
