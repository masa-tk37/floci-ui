import { Html } from "@elysiajs/html"
import { escapeHtml } from "@kitajs/html"

import { encodeResourceName } from "../../infrastructure/resource-name-codec"
import type { ParameterDetail as ParameterDetailData } from "../../services/ssm/parameter-service"
import { ClientProps, mountComponentAttrs } from "../client"
import { formatDate, formatJsonValue, PLACEHOLDER } from "../format"
import { IconEdit, IconTrash } from "../icons"
import { Layout } from "../layout"

interface ParameterDetailProps {
  detail: ParameterDetailData
}

export function ParameterDetail({ detail }: ParameterDetailProps) {
  const parameterPath = `/ssm/${encodeResourceName(detail.name)}`

  return (
    <Layout
      title={`SSM · ${detail.name}`}
      active="ssm"
      stylesheets={["/public/styles/views/ssm/parameter-detail.css"]}
      crumbs={[
        { label: "SSM", href: "/ssm" },
        { label: detail.name, href: parameterPath },
      ]}
    >
      <div class="ssm-parameter-detail-page">
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
            {detail.arn ? (
              <button
                type="button"
                class="btn btn--ghost btn--sm"
                x-data="{ copied: false }"
                {...{
                  "@click":
                    "navigator.clipboard.writeText($el.previousElementSibling.textContent); copied = true; setTimeout(() => copied = false, 1500)",
                }}
              >
                <span x-show="!copied">
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                </span>
                <span x-show="copied" x-cloak>
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </span>
              </button>
            ) : null}
          </div>
          <div class="page-header__actions">
            <a href={`${parameterPath}/edit`} class="btn btn--ghost btn--sm">
              {IconEdit}編集
            </a>
            <button
              type="button"
              class="btn btn--danger-ghost btn--sm"
              data-floci-delete-trigger=""
              data-resource-name={escapeHtml(detail.name)}
              data-delete-url={parameterPath}
              data-redirect-url="/ssm"
            >
              {IconTrash}削除
            </button>
          </div>
        </section>

        <section class="attr-grid">
          <div class="attr-card">
            <span class="attr-card__label">Type</span>
            <span class="ssm-parameter-detail-page__meta-value">
              {detail.type}
            </span>
          </div>
          <div class="attr-card">
            <span class="attr-card__label">Tier</span>
            <span class="ssm-parameter-detail-page__meta-value">
              {detail.tier}
            </span>
          </div>
          <div class="attr-card">
            <span class="attr-card__label">Version</span>
            <span class="ssm-parameter-detail-page__meta-value">
              {detail.version}
            </span>
          </div>
          <div class="attr-card">
            <span class="attr-card__label">Data Type</span>
            <span class="ssm-parameter-detail-page__meta-value">
              {detail.dataType}
            </span>
          </div>
          <div class="attr-card">
            <span class="attr-card__label">更新日時</span>
            <span class="ssm-parameter-detail-page__meta-value">
              {formatDate(detail.lastModifiedDate)}
            </span>
          </div>
          <div class="attr-card">
            <span class="attr-card__label">KMS Key</span>
            <span class="ssm-parameter-detail-page__meta-value mono" safe>
              {detail.keyId || PLACEHOLDER}
            </span>
          </div>
        </section>

        <section class="panel" {...mountComponentAttrs("reveal-toggle")}>
          <ClientProps
            props={{ initialRevealed: detail.type !== "SecureString" }}
          />
          <div class="panel__header">
            <h2 class="panel__title">Value</h2>
            {detail.type === "SecureString" ? (
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
          <div class="ssm-parameter-detail-page__value-wrap">
            <div
              class="ssm-parameter-detail-page__masked"
              x-show="!revealed"
              x-cloak
            >
              SecureString のため初期表示では隠しています。
            </div>
            <pre
              class="ssm-parameter-detail-page__value"
              x-show="revealed"
              x-cloak={detail.type === "SecureString" ? "" : undefined}
              safe
            >
              {formatJsonValue(detail.value)}
            </pre>
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
