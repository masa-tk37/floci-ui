import { Html } from "@elysiajs/html"

import { ClientProps, mountComponentAttrs } from "../client"
import { Layout, type SidebarCounts } from "../layout"

interface CreateBucketFormProps {
  sidebarCounts?: SidebarCounts
}

export function CreateBucketForm({
  sidebarCounts,
}: CreateBucketFormProps = {}) {
  return (
    <Layout
      title="Create S3 Bucket"
      active="s3"
      sidebarCounts={sidebarCounts}
      stylesheets={["/public/styles/views/s3/create-form.css"]}
      crumbs={[
        { label: "S3", href: "/s3" },
        { label: "Bucket を作成", href: "/s3/new" },
      ]}
    >
      <div class="s3-create-page">
        <section class="page-header">
          <h1 class="page-title">Bucket を作成</h1>
          <p class="page-subtitle">新しい S3 Bucket を設定します。</p>
        </section>

        <div
          {...mountComponentAttrs("s3-create-bucket")}
          class="s3-create-page__form"
        >
          <ClientProps props={{}} />
          <div class="query-form">
            <h2 class="section-title">Bucket 基本設定</h2>
            <div class="form-row">
              <label class="form-label" for="bucketName">
                Bucket 名
              </label>
              <input
                id="bucketName"
                type="text"
                class="input"
                x-model="name"
                placeholder="my-bucket"
                pattern="[a-z0-9][a-z0-9\\-\\.]*[a-z0-9]"
                required
              />
              <p class="form-help">
                小文字・数字・ハイフン・ドットのみ使用できます。
              </p>
            </div>
          </div>

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
              class="form-row s3-create-page__form-row--compact"
            >
              <label class="form-label" for="s3-kms-key-id">
                KMS キー ID{" "}
                <span class="form-label__hint">
                  （省略可・省略時はデフォルトキーを使用）
                </span>
              </label>
              <input
                id="s3-kms-key-id"
                type="text"
                class="input"
                x-model="kmsKeyId"
                placeholder="arn:aws:kms:..."
              />
            </div>
          </div>

          <div class="query-form">
            <h2 class="section-title">オブジェクト所有者</h2>
            <div class="form-row radio-group s3-create-page__radio-list">
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
            <div class="form-row s3-create-page__checkbox-list">
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
            <div class="s3-create-page__section-header">
              <h2 class="section-title s3-create-page__section-title">タグ</h2>
              <button
                type="button"
                class="btn btn--sm"
                {...{ "@click": "addTag()" }}
              >
                + タグを追加
              </button>
            </div>
            <p
              class="muted s3-create-page__empty"
              x-show="tags.length === 0"
              x-cloak
            >
              タグなし
            </p>
            <template x-for="(tag, i) in tags" {...{ ":key": "i" }}>
              <div class="s3-create-page__tag-grid">
                <div class="form-row">
                  <label class="form-label">キー</label>
                  <input
                    type="text"
                    class="input"
                    x-model="tag.key"
                    placeholder="Environment"
                  />
                </div>
                <div class="form-row">
                  <label class="form-label">値</label>
                  <input
                    type="text"
                    class="input"
                    x-model="tag.value"
                    placeholder="dev"
                  />
                </div>
                <button
                  type="button"
                  class="btn btn--danger-ghost btn--sm s3-create-page__tag-remove"
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

          <div
            class="query-error s3-create-page__warning"
            x-show="warnings.length > 0"
            x-cloak
          >
            <strong>警告（Bucket は作成されました）:</strong>
            <ul class="s3-create-page__warning-list">
              <template x-for="w in warnings" {...{ ":key": "w" }}>
                <li x-text="w" />
              </template>
            </ul>
          </div>

          <div class="form-actions">
            <button
              type="button"
              class="btn btn--s3"
              {...{ "@click": "submit()", ":disabled": "submitting || !name" }}
            >
              <span x-show="!submitting">作成</span>
              <span x-show="submitting">作成中…</span>
            </button>
            <a href="/s3" class="btn btn--ghost">
              キャンセル
            </a>
          </div>
        </div>
      </div>
    </Layout>
  )
}
