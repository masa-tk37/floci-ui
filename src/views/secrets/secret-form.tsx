import { Html } from "@elysiajs/html"

import { encodeResourceName } from "../../infrastructure/resource-name-codec"
import { ClientProps, mountComponentAttrs } from "../client"
import { Layout } from "../layout"
import { TagEditor } from "../tag-editor"
import type { SecretFormInitial } from "./secret-form-state"

interface SecretFormProps {
  init: SecretFormInitial
}

export function SecretForm({ init }: SecretFormProps) {
  const secretPath =
    init.mode === "edit"
      ? `/secrets/${encodeResourceName(init.name)}`
      : "/secrets"
  const copy =
    init.mode === "create"
      ? {
          title: "Secret を作成",
          heading: "Secrets Manager に登録",
          subtitle: "新しい Secret を設定します。",
        }
      : init.isBinary
        ? {
            title: `Binary Secret · ${init.name}`,
            heading: "Binary Secret",
            subtitle: "Binary secret は UI から更新できません。",
          }
        : {
            title: `編集 · ${init.name}`,
            heading: "Secret を編集",
            subtitle: "Secret の設定を更新します。",
          }

  return (
    <Layout
      title={copy.title}
      active="secrets"
      contentMode="form"
      crumbs={
        init.mode === "create"
          ? [
              { label: "Secrets", href: "/secrets" },
              { label: "Secret を作成", href: "/secrets/new" },
            ]
          : [
              { label: "Secrets", href: "/secrets" },
              { label: init.name, href: secretPath },
              {
                label: init.isBinary ? "詳細" : "編集",
                href: `${secretPath}/edit`,
              },
            ]
      }
    >
      <div class="secrets-form-page">
        <section class="page-header">
          <h1 class="page-title">{copy.heading}</h1>
          <p class="page-subtitle">{copy.subtitle}</p>
        </section>

        <div {...mountComponentAttrs("secret-form")}>
          <ClientProps props={init} />
          {init.isBinary ? (
            <div class="query-form">
              <h2 class="section-title">編集不可</h2>
              <p class="muted">
                Binary secret は UI から編集できません。必要であれば AWS CLI
                などで更新してください。
              </p>
            </div>
          ) : (
            <>
              <div class="query-form">
                <h2 class="section-title">基本設定</h2>
                <div class="secrets-form-page__grid">
                  <div class="form-row">
                    <label class="form-label" for="secret-name">
                      Secret 名
                    </label>
                    <input
                      id="secret-name"
                      type="text"
                      class="input"
                      x-model="name"
                      placeholder="app/dev/database"
                      disabled={init.mode === "edit"}
                    />
                  </div>

                  <div class="form-row">
                    <label class="form-label" for="secret-kms-key">
                      KMS Key ID
                    </label>
                    <input
                      id="secret-kms-key"
                      type="text"
                      class="input"
                      x-model="kmsKeyId"
                      placeholder="alias/aws/secretsmanager"
                    />
                  </div>
                </div>

                <div class="form-row">
                  <label class="form-label" for="secret-description">
                    Description
                  </label>
                  <input
                    id="secret-description"
                    type="text"
                    class="input"
                    x-model="description"
                    placeholder="用途メモ"
                  />
                </div>

                <div class="form-row">
                  <label class="form-label" for="secret-value">
                    Secret String
                  </label>
                  <textarea
                    id="secret-value"
                    class="textarea secrets-form-page__value"
                    x-model="secretString"
                    placeholder='{"password":"secret"}'
                  />
                </div>
              </div>

              <TagEditor />
            </>
          )}

          <div class="error-inline" x-show="error" x-cloak>
            <strong>エラー:</strong> <span x-text="error" />
          </div>

          <div class="form-actions">
            {!init.isBinary ? (
              <button
                type="button"
                class="btn btn--primary"
                {...{
                  "@click": "submit()",
                  ":disabled": "submitting || !name || !secretString",
                }}
              >
                <span x-show="!submitting">
                  {init.mode === "create" ? "作成" : "保存"}
                </span>
                <span x-show="submitting">
                  {init.mode === "create" ? "作成中…" : "保存中…"}
                </span>
              </button>
            ) : null}
            <a href={secretPath} class="btn btn--ghost">
              {init.isBinary ? "戻る" : "キャンセル"}
            </a>
          </div>
        </div>
      </div>
    </Layout>
  )
}
