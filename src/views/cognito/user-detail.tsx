import { Html } from "@elysiajs/html"

import { encodeResourceName } from "../../infrastructure/resource-name-codec"
import type { UserDetail as UserDetailData } from "../../services/cognito/cognito-service"
import { formatDate } from "../format"
import { IconTrash } from "../icons"
import { Layout, type SidebarCounts } from "../layout"

interface CognitoUserDetailProps {
  poolId: string
  poolName: string
  detail: UserDetailData
  sidebarCounts?: SidebarCounts
}

function makeActionState(paths: {
  enableUrl: string
  disableUrl: string
  confirmUrl: string
  passwordUrl: string
}): string {
  return `{
  enableUrl: ${JSON.stringify(paths.enableUrl)},
  disableUrl: ${JSON.stringify(paths.disableUrl)},
  confirmUrl: ${JSON.stringify(paths.confirmUrl)},
  passwordUrl: ${JSON.stringify(paths.passwordUrl)},
  password: '',
  loading: false,
  error: null,

  async run(url, body) {
    this.error = null;
    this.loading = true;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await response.json();

      if (!response.ok || data.error) {
        this.error = data.error || ('エラーが発生しました (HTTP ' + response.status + ')');
        this.loading = false;
        return;
      }

      window.location.reload();
    } catch (error) {
      this.error = error?.message || 'ネットワークエラーが発生しました';
      this.loading = false;
    }
  },

  enable() {
    return this.run(this.enableUrl);
  },

  disable() {
    return this.run(this.disableUrl);
  },

  confirmUser() {
    return this.run(this.confirmUrl);
  },

  setPassword() {
    if (!this.password.trim()) {
      this.error = 'Password is required';
      return;
    }

    return this.run(this.passwordUrl, {
      password: this.password,
      permanent: true,
    });
  },
}`
}

export function CognitoUserDetail({
  poolId,
  poolName,
  detail,
  sidebarCounts,
}: CognitoUserDetailProps) {
  const poolPath = `/cognito/${encodeURIComponent(poolId)}`
  const userPath = `${poolPath}/users/${encodeResourceName(detail.username)}`
  const state = makeActionState({
    enableUrl: `${userPath}/enable`,
    disableUrl: `${userPath}/disable`,
    confirmUrl: `${userPath}/confirm`,
    passwordUrl: `${userPath}/password`,
  })

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
          </div>
          <div class="page-header__actions">
            <button
              type="button"
              class="btn btn--danger-ghost btn--sm"
              data-resource-name={detail.username}
              data-delete-url={userPath}
              data-redirect-url={poolPath}
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
            <span class="attr-card__label">Status</span>
            <span class="cognito-user-detail-page__meta-value" safe>
              {detail.status}
            </span>
          </div>
          <div class="attr-card">
            <span class="attr-card__label">Enabled</span>
            <span class="cognito-user-detail-page__meta-value">
              {detail.enabled ? "Yes" : "No"}
            </span>
          </div>
          <div class="attr-card">
            <span class="attr-card__label">Email</span>
            <span class="cognito-user-detail-page__meta-value" safe>
              {detail.email || "—"}
            </span>
          </div>
          <div class="attr-card">
            <span class="attr-card__label">Phone Number</span>
            <span class="cognito-user-detail-page__meta-value" safe>
              {detail.phoneNumber || "—"}
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
              {detail.preferredMfaSetting || "—"}
            </span>
          </div>
          <div class="attr-card">
            <span class="attr-card__label">Active MFA</span>
            <span class="cognito-user-detail-page__meta-value" safe>
              {detail.userMfaSettings.length > 0
                ? detail.userMfaSettings.join(", ")
                : "—"}
            </span>
          </div>
        </section>

        <section class="query-form" x-data={state}>
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
                      <td safe>{attribute.value || "—"}</td>
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
