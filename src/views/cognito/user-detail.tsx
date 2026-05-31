import { Html } from "@elysiajs/html"
import { escapeHtml } from "@kitajs/html"

import { encodeResourceName } from "../../infrastructure/resource-name-codec"
import type { UserDetail as UserDetailData } from "../../services/cognito/cognito-service"
import { ClientProps, mountComponentAttrs } from "../client"
import { formatDate, PLACEHOLDER } from "../format"
import { IconTrash } from "../icons"
import { Layout, type SidebarCounts } from "../layout"
import { CognitoStatusBadge, EnabledBadge } from "./status-badge"

interface CognitoUserDetailProps {
  poolId: string
  poolName: string
  detail: UserDetailData
  sidebarCounts?: SidebarCounts
}

export function CognitoUserDetail({
  poolId,
  poolName,
  detail,
  sidebarCounts,
}: CognitoUserDetailProps) {
  const poolPath = `/cognito/${encodeURIComponent(poolId)}`
  const userPath = `${poolPath}/users/${encodeResourceName(detail.username)}`
  const state = {
    enableUrl: `${userPath}/enable`,
    disableUrl: `${userPath}/disable`,
    confirmUrl: `${userPath}/confirm`,
    passwordUrl: `${userPath}/password`,
  }

  return (
    <Layout
      title={`Cognito User · ${detail.username}`}
      active="cognito"
      sidebarCounts={sidebarCounts}
      stylesheets={["/public/styles/views/cognito/pool-detail.css"]}
      crumbs={[
        { label: "Cognito", href: "/cognito" },
        { label: poolName, href: poolPath },
        { label: detail.username, href: userPath },
      ]}
    >
      <div class="cognito-user-detail-page">
        <section class="page-header page-header--row">
          <div>
            <h1 class="page-title">
              <span safe>{detail.username}</span>
            </h1>
            {detail.sub ? (
              <p class="page-subtitle mono" safe>
                {detail.sub}
              </p>
            ) : null}
            {detail.sub ? (
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
            <button
              type="button"
              class="btn btn--danger-ghost btn--sm"
              data-floci-delete-trigger=""
              data-resource-name={escapeHtml(detail.username)}
              data-delete-url={userPath}
              data-redirect-url={poolPath}
            >
              {IconTrash}削除
            </button>
          </div>
        </section>

        <section class="attr-grid">
          <div class="attr-card">
            <span class="attr-card__label">Status</span>
            <span class="cognito-user-detail-page__meta-value">
              <CognitoStatusBadge status={detail.status} />
            </span>
          </div>
          <div class="attr-card">
            <span class="attr-card__label">Enabled</span>
            <span class="cognito-user-detail-page__meta-value">
              <EnabledBadge enabled={detail.enabled} />
            </span>
          </div>
          <div class="attr-card">
            <span class="attr-card__label">Email</span>
            <span class="cognito-user-detail-page__meta-value" safe>
              {detail.email || PLACEHOLDER}
            </span>
          </div>
          <div class="attr-card">
            <span class="attr-card__label">Phone Number</span>
            <span class="cognito-user-detail-page__meta-value" safe>
              {detail.phoneNumber || PLACEHOLDER}
            </span>
          </div>
          <div class="attr-card">
            <span class="attr-card__label">作成日時</span>
            <span class="cognito-user-detail-page__meta-value">
              {formatDate(detail.createdAt)}
            </span>
          </div>
          <div class="attr-card">
            <span class="attr-card__label">更新日時</span>
            <span class="cognito-user-detail-page__meta-value">
              {formatDate(detail.updatedAt)}
            </span>
          </div>
          <div class="attr-card">
            <span class="attr-card__label">Preferred MFA</span>
            <span class="cognito-user-detail-page__meta-value" safe>
              {detail.preferredMfaSetting || PLACEHOLDER}
            </span>
          </div>
          <div class="attr-card">
            <span class="attr-card__label">Active MFA</span>
            <span class="cognito-user-detail-page__meta-value" safe>
              {detail.userMfaSettings.length > 0
                ? detail.userMfaSettings.join(", ")
                : PLACEHOLDER}
            </span>
          </div>
        </section>

        <section
          class="query-form"
          {...mountComponentAttrs("cognito-user-detail")}
        >
          <ClientProps props={state} />
          <h2 class="section-title">Admin Actions</h2>

          <div class="cognito-user-detail-page__actions">
            {detail.enabled ? (
              <button
                type="button"
                class="btn btn--ghost btn--sm"
                {...{ "@click": "disable()", ":disabled": "loading" }}
              >
                Disable
              </button>
            ) : (
              <button
                type="button"
                class="btn btn--cognito btn--sm"
                {...{ "@click": "enable()", ":disabled": "loading" }}
              >
                Enable
              </button>
            )}

            {detail.status !== "CONFIRMED" ? (
              <button
                type="button"
                class="btn btn--ghost btn--sm"
                {...{ "@click": "confirmUser()", ":disabled": "loading" }}
              >
                Confirm Sign-up
              </button>
            ) : null}
          </div>

          <form
            class="cognito-user-detail-page__password-form"
            {...{ "@submit.prevent": "setPassword()" }}
          >
            <div class="form-row">
              <label class="form-label" for="cognito-permanent-password">
                Permanent Password
              </label>
              <input
                id="cognito-permanent-password"
                type="password"
                class="input"
                x-model="password"
                placeholder="NewStrongPassw0rd!"
              />
              <p class="form-help">
                permanent password
                として設定します。次回ログイン時の変更は不要です。
              </p>
            </div>
            <div class="form-actions">
              <button
                type="submit"
                class="btn btn--cognito btn--sm"
                {...{ ":disabled": "loading || !password.trim()" }}
              >
                <span x-show="!loading">Set Password</span>
                <span x-show="loading">保存中…</span>
              </button>
            </div>
          </form>

          <div class="error-inline" x-show="error" x-cloak>
            <span x-text="error" />
          </div>
        </section>

        <section class="query-form">
          <h2 class="section-title">Attributes</h2>
          {detail.attributes.length === 0 ? (
            <p class="empty-state empty-state--plain">属性がありません</p>
          ) : (
            <div class="data-table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Value</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.attributes.map((attribute) => (
                    <tr>
                      <td>
                        <code class="code-inline" safe>
                          {attribute.name}
                        </code>
                      </td>
                      <td safe>{attribute.value || PLACEHOLDER}</td>
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
