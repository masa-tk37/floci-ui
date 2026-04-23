import { Html } from "@elysiajs/html"

import { encodeResourceName } from "../../infrastructure/resource-name-codec"
import type { SecretDetail as SecretDetailData } from "../../services/secrets/secret-service"
import { IconEdit, IconTrash } from "../icons"
import { Layout, type SidebarCounts } from "../layout"
import { formatDate } from "../format"

interface SecretDetailProps {
  detail: SecretDetailData
  sidebarCounts?: SidebarCounts
}

export function SecretDetail({ detail, sidebarCounts }: SecretDetailProps) {
  const secretPath = `/secrets/${encodeResourceName(detail.name)}`

  return (
    <Layout
      title={`Secret · ${detail.name}`}
      active="secrets"
      sidebarCounts={sidebarCounts}
      stylesheets={["/public/styles/views/secrets/secret-detail.css"]}
      crumbs={[
        { label: "Secrets", href: "/secrets" },
        { label: detail.name, href: secretPath },
      ]}
    >
      <div class="secret-detail-page">
        <section class="page-header page-header--row">
          <div>
            <h1 class="page-title">
              <span safe>{detail.name}</span>
            </h1>
            {detail.arn ? (
              <p class="page-subtitle mono" safe>
                {detail.arn}
              </p>
            ) : null}
          </div>
          <div class="page-header__actions">
            {!detail.isBinary ? (
              <a href={`${secretPath}/edit`} class="btn btn--ghost btn--sm">
                {IconEdit}編集
              </a>
            ) : null}
            <button
              type="button"
              class="btn btn--danger-ghost btn--sm"
              data-resource-name={detail.name}
              data-delete-url={secretPath}
              data-redirect-url="/secrets"
              x-data
              {...{
                "x-on:click":
                  "$dispatch('open-delete-modal', { resourceName: $el.dataset.resourceName, deleteUrl: $el.dataset.deleteUrl, redirectUrl: $el.dataset.redirectUrl })",
              }}
            >
              {IconTrash}削除
            </button>
          </div>
        </section>

        <section class="attr-grid">
          <div class="attr-card">
            <span class="attr-card__label">Version</span>
            <span class="secret-detail-page__meta-value mono" safe>
              {detail.versionId || "—"}
            </span>
          </div>
          <div class="attr-card">
            <span class="attr-card__label">Version Stages</span>
            <span class="secret-detail-page__meta-value" safe>
              {detail.versionStages.length > 0
                ? detail.versionStages.join(", ")
                : "—"}
            </span>
          </div>
          <div class="attr-card">
            <span class="attr-card__label">更新日時</span>
            <span class="secret-detail-page__meta-value">
              {formatDate(detail.lastChangedDate)}
            </span>
          </div>
          <div class="attr-card">
            <span class="attr-card__label">作成日時</span>
            <span class="secret-detail-page__meta-value">
              {formatDate(detail.createdDate)}
            </span>
          </div>
          <div class="attr-card">
            <span class="attr-card__label">KMS Key</span>
            <span class="secret-detail-page__meta-value mono" safe>
              {detail.kmsKeyId || "—"}
            </span>
          </div>
          <div class="attr-card">
            <span class="attr-card__label">Format</span>
            <span class="secret-detail-page__meta-value">
              {detail.isBinary ? "Binary" : "SecretString"}
            </span>
          </div>
        </section>

        <section class="panel" x-data="{ revealed: false }">
          <div class="panel__header">
            <h2 class="panel__title">Secret Value</h2>
            {!detail.isBinary ? (
              <div class="panel__actions">
                <button
                  type="button"
                  class="btn btn--ghost btn--sm"
                  {...{ "@click": "revealed = !revealed" }}
                >
                  <span x-show="!revealed">表示</span>
                  <span x-show="revealed">隠す</span>
                </button>
              </div>
            ) : null}
          </div>
          <div class="secret-detail-page__value-wrap">
            {detail.isBinary ? (
              <div class="secret-detail-page__binary-note">
                Binary secret は UI では表示・編集できません。
              </div>
            ) : (
              <>
                <div
                  class="secret-detail-page__masked"
                  x-show="!revealed"
                  x-cloak
                >
                  値は初期表示では隠しています。表示ボタンで展開できます。
                </div>
                <pre
                  class="secret-detail-page__value"
                  x-show="revealed"
                  x-cloak
                  safe
                >
                  {detail.secretString}
                </pre>
              </>
            )}
          </div>
        </section>

        {detail.description ? (
          <section class="query-form">
            <h2 class="section-title">Description</h2>
            <p class="muted" safe>
              {detail.description}
            </p>
          </section>
        ) : null}

        <section class="query-form">
          <h2 class="section-title">Tags</h2>
          {detail.tags.length === 0 ? (
            <p class="muted">タグなし</p>
          ) : (
            <div class="data-table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Key</th>
                    <th>Value</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.tags.map((tag) => (
                    <tr>
                      <td safe>{tag.key}</td>
                      <td safe>{tag.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </Layout>
  )
}
