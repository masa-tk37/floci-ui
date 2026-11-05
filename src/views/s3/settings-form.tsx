import { Html } from "@elysiajs/html"

import { ClientProps, mountComponentAttrs } from "../client"
import { Layout } from "../layout"
import { TagEditor } from "../tag-editor"
import { bucketHref } from "./bucket-list"
import type { S3SettingsInitial } from "./settings-form-state"

interface S3SettingsFormProps {
  init: S3SettingsInitial
}

// The only literals the settings route schema accepts.
const CORS_METHODS = ["GET", "PUT", "POST", "DELETE", "HEAD"] as const

interface CorsValueListProps {
  field: "allowedOrigins" | "allowedHeaders"
  itemVar: string
  label: string
  hint?: string
  placeholder: string
  addLabel: string
}

function CorsValueList({
  field,
  itemVar,
  label,
  hint,
  placeholder,
  addLabel,
}: CorsValueListProps) {
  const indexVar = `${itemVar}i`
  return (
    <div class="form-row">
      <label class="form-label">
        {hint ? (
          <>
            {label} <span class="form-label__hint">{hint}</span>
          </>
        ) : (
          label
        )}
      </label>
      <div class="cors-tag-list">
        <template
          x-for={`(${itemVar}, ${indexVar}) in r.${field}`}
          {...{ ":key": indexVar }}
        >
          <div class="cors-tag-item">
            <input
              type="text"
              class="input input--sm"
              {...{ "x-model": `r.${field}[${indexVar}]` }}
              placeholder={placeholder}
            />
            <button
              type="button"
              class="btn btn--danger-ghost btn--xs"
              {...{
                "@click": `removeCorsValue(i, '${field}', ${indexVar})`,
              }}
            >
              ✕
            </button>
          </div>
        </template>
        <button
          type="button"
          class="btn btn--sm"
          {...{ "@click": `addCorsValue(i, '${field}')` }}
        >
          {addLabel}
        </button>
      </div>
    </div>
  )
}

export function S3SettingsForm({ init }: S3SettingsFormProps) {
  const bucketPath = bucketHref(init.bucket)

  return (
    <Layout
      title={`Settings · ${init.bucket}`}
      active="s3"
      contentMode="form"
      crumbs={[
        { label: "S3", href: "/s3" },
        { label: init.bucket, href: bucketPath },
        { label: "設定", href: `${bucketPath}/settings` },
      ]}
    >
      <div class="s3-settings-page">
        <section class="page-header">
          <h1 class="page-title">
            設定 · <span safe>{init.bucket}</span>
          </h1>
          <p class="page-subtitle">
            Bucket の設定を更新します。変更はすぐに反映されます。
          </p>
        </section>

        <div
          {...mountComponentAttrs("s3-settings")}
          class="s3-settings-page__form"
        >
          <ClientProps props={init} />
          <div class="query-form">
            <h2 class="section-title">バージョニング</h2>
            <div class="form-row radio-group">
              <label class="radio">
                <input type="radio" value="Suspended" x-model="versioning" />
                <span>無効</span>
              </label>
              <label class="radio">
                <input type="radio" value="Enabled" x-model="versioning" />
                <span>有効</span>
              </label>
            </div>
          </div>

          <div class="query-form">
            <h2 class="section-title">暗号化</h2>
            <div class="form-row radio-group">
              <label class="radio">
                <input type="radio" value="none" x-model="encryption" />
                <span>なし</span>
              </label>
              <label class="radio">
                <input type="radio" value="AES256" x-model="encryption" />
                <span>SSE-S3 (AES256)</span>
              </label>
              <label class="radio">
                <input type="radio" value="aws:kms" x-model="encryption" />
                <span>SSE-KMS</span>
              </label>
            </div>
            <div
              x-show="encryption === 'aws:kms'"
              x-cloak
              class="form-row s3-settings-page__form-row--compact"
            >
              <label class="form-label">
                KMS キー ID <span class="form-label__hint">（省略可）</span>
              </label>
              <input
                type="text"
                class="input"
                x-model="kmsKeyId"
                placeholder="arn:aws:kms:..."
              />
            </div>
          </div>

          <div class="query-form">
            <h2 class="section-title">オブジェクト所有者</h2>
            <div class="form-row radio-group s3-settings-page__radio-list">
              <label class="radio">
                <input
                  type="radio"
                  value="BucketOwnerEnforced"
                  x-model="ownership"
                />
                <span>バケット所有者強制（ACL 無効）</span>
              </label>
              <label class="radio">
                <input
                  type="radio"
                  value="BucketOwnerPreferred"
                  x-model="ownership"
                />
                <span>バケット所有者優先</span>
              </label>
              <label class="radio">
                <input type="radio" value="ObjectWriter" x-model="ownership" />
                <span>オブジェクトライター</span>
              </label>
            </div>
          </div>

          <div class="query-form">
            <h2 class="section-title">パブリックアクセスのブロック</h2>
            <div class="form-row s3-settings-page__checkbox-list">
              <label class="radio">
                <input type="checkbox" x-model="blockPublicAcls" />
                <span>パブリック ACL をブロック</span>
              </label>
              <label class="radio">
                <input type="checkbox" x-model="ignorePublicAcls" />
                <span>パブリック ACL を無視</span>
              </label>
              <label class="radio">
                <input type="checkbox" x-model="blockPublicPolicy" />
                <span>パブリックバケットポリシーをブロック</span>
              </label>
              <label class="radio">
                <input type="checkbox" x-model="restrictPublicBuckets" />
                <span>パブリックバケットを制限</span>
              </label>
            </div>
          </div>

          <div class="query-form">
            <div class="s3-settings-page__section-header">
              <h2 class="section-title s3-settings-page__section-title">
                CORS ルール
              </h2>
              <button
                type="button"
                class="btn btn--sm"
                {...{ "@click": "addCors()" }}
              >
                + ルールを追加
              </button>
            </div>
            <p
              class="muted s3-settings-page__empty"
              x-show="corsRules.length === 0"
              x-cloak
            >
              CORS ルールなし
            </p>
            <template x-for="(r, i) in corsRules" {...{ ":key": "i" }}>
              <div class="s3-settings-page__card">
                <div class="s3-settings-page__card-actions">
                  <button
                    type="button"
                    class="btn btn--danger-ghost btn--sm"
                    {...{ "@click": "removeCors(i)" }}
                  >
                    削除
                  </button>
                </div>
                <div class="form-row">
                  <label class="form-label">許可メソッド</label>
                  <div class="cors-tag-list">
                    {CORS_METHODS.map((method) => (
                      <label class="radio">
                        <input
                          type="checkbox"
                          value={method}
                          x-model="r.allowedMethods"
                        />
                        <span>{method}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <CorsValueList
                  field="allowedOrigins"
                  itemVar="o"
                  label="許可オリジン"
                  placeholder="*"
                  addLabel="+ オリジン"
                />
                <CorsValueList
                  field="allowedHeaders"
                  itemVar="h"
                  label="許可ヘッダー"
                  hint="（省略可）"
                  placeholder="Content-Type"
                  addLabel="+ ヘッダー"
                />
                <div class="form-row s3-settings-page__form-row--compact">
                  <label class="form-label">最大エージ（秒）</label>
                  <input
                    type="number"
                    class="input"
                    x-model="r.maxAge"
                    min="0"
                  />
                </div>
              </div>
            </template>
          </div>

          <div class="query-form">
            <div class="s3-settings-page__section-header">
              <h2 class="section-title s3-settings-page__section-title">
                ライフサイクルルール
              </h2>
              <button
                type="button"
                class="btn btn--sm"
                {...{ "@click": "addLifecycle()" }}
              >
                + ルールを追加
              </button>
            </div>
            <p
              class="muted s3-settings-page__empty"
              x-show="lifecycleRules.length === 0"
              x-cloak
            >
              ライフサイクルルールなし
            </p>
            <template x-for="(r, i) in lifecycleRules" {...{ ":key": "i" }}>
              <div class="s3-settings-page__card">
                <div class="s3-settings-page__card-actions">
                  <button
                    type="button"
                    class="btn btn--danger-ghost btn--sm"
                    {...{ "@click": "removeLifecycle(i)" }}
                  >
                    削除
                  </button>
                </div>
                <div class="form-row">
                  <label class="form-label">ルール ID</label>
                  <input
                    type="text"
                    class="input"
                    x-model="r.id"
                    placeholder="expire-old-logs"
                  />
                </div>
                <div class="form-row">
                  <label class="form-label">
                    プレフィックス{" "}
                    <span class="form-label__hint">
                      （空白 = すべてのオブジェクト）
                    </span>
                  </label>
                  <input
                    type="text"
                    class="input"
                    x-model="r.prefix"
                    placeholder="logs/"
                  />
                </div>
                <div class="form-row s3-settings-page__form-row--compact">
                  <label class="form-label">有効期限（日数）</label>
                  <input
                    type="number"
                    class="input"
                    x-model="r.expirationDays"
                    min="1"
                  />
                </div>
              </div>
            </template>
          </div>

          <TagEditor />

          <div class="error-inline" x-show="error" x-cloak>
            <strong>エラー:</strong> <span x-text="error" />
          </div>

          <div
            class="query-error s3-settings-page__warning"
            x-show="warnings.length > 0"
            x-cloak
          >
            <strong>警告あり（保存しました）:</strong>
            <ul class="s3-settings-page__warning-list">
              <template x-for="w in warnings" {...{ ":key": "w" }}>
                <li x-text="w" />
              </template>
            </ul>
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
            <a href={bucketPath} class="btn btn--ghost">
              キャンセル
            </a>
          </div>
        </div>
      </div>
    </Layout>
  )
}
