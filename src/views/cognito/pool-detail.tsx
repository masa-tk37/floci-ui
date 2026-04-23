import { Html } from "@elysiajs/html"

import { encodeResourceName } from "../../infrastructure/resource-name-codec"
import type {
  AppClientSummary,
  UserPoolDetail as UserPoolDetailData,
  UserSummary,
} from "../../services/cognito/cognito-service"
import { formatDate } from "../format"
import { IconPlus, IconTrash } from "../icons"
import { Layout, type SidebarCounts } from "../layout"

interface UserPoolDetailProps {
  pool: UserPoolDetailData
  appClients: AppClientSummary[]
  users: UserSummary[]
  sidebarCounts?: SidebarCounts
}

function renderSignInMode(mode: UserPoolDetailData["signInMode"]) {
  switch (mode) {
    case "email":
      return <code class="code-inline">email</code>
    case "phone_number":
      return <code class="code-inline">phone_number</code>
    case "email_or_phone_number":
      return (
        <>
          <code class="code-inline">email</code>
          <span> / </span>
          <code class="code-inline">phone_number</code>
        </>
      )
    default:
      return <code class="code-inline">username</code>
  }
}

function renderVerifiedAttributes(values: string[]) {
  if (values.length === 0) return "—"

  return values.map((value, index) => (
    <>
      {index > 0 ? <span>, </span> : null}
      <code class="code-inline">{value}</code>
    </>
  ))
}

function makeInlineCreateState(
  actionUrl: string,
  fields: Record<string, string>,
): string {
  const fieldEntries = Object.entries(fields)

  return `{
  actionUrl: ${JSON.stringify(actionUrl)},
  ${fieldEntries.map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join(",\n  ")},
  submitting: false,
  error: null,

  async submit(payload) {
    this.error = null;
    this.submitting = true;

    try {
      const response = await fetch(this.actionUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();

      if (!response.ok || data.error) {
        this.error = data.error || ('エラーが発生しました (HTTP ' + response.status + ')');
        this.submitting = false;
        return;
      }

      window.location.reload();
    } catch (error) {
      this.error = error?.message || 'ネットワークエラーが発生しました';
      this.submitting = false;
    }
  },
}`
}

export function UserPoolDetail({
  pool,
  appClients,
  users,
  sidebarCounts,
}: UserPoolDetailProps) {
  const poolPath = `/cognito/${encodeURIComponent(pool.id)}`
  const createClientState = makeInlineCreateState(`${poolPath}/clients`, {
    name: "",
  })
  const createUserState = makeInlineCreateState(`${poolPath}/users`, {
    username: "",
    temporaryPassword: "",
    email: "",
    phoneNumber: "",
  })

  return (
    <Layout
      title={`Cognito · ${pool.name}`}
      active="cognito"
      sidebarCounts={sidebarCounts}
      stylesheets={["/public/styles/views/cognito/pool-detail.css"]}
      crumbs={[
        { label: "Cognito", href: "/cognito" },
        { label: pool.name, href: poolPath },
      ]}
    >
      <div class="cognito-pool-detail-page">
        <section class="page-header page-header--row">
          <div>
            <h1 class="page-title">
              <span safe>{pool.name}</span>
            </h1>
            <p class="page-subtitle mono" safe>
              {pool.id}
            </p>
          </div>
          <div class="page-header__actions">
            <button
              type="button"
              class="btn btn--danger-ghost btn--sm"
              data-resource-name={pool.name}
              data-delete-url={poolPath}
              data-redirect-url="/cognito"
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
            <span class="attr-card__label">Sign-in</span>
            <span class="cognito-pool-detail-page__meta-value">
              {renderSignInMode(pool.signInMode)}
            </span>
          </div>
          <div class="attr-card">
            <span class="attr-card__label">Auto Verify</span>
            <span class="cognito-pool-detail-page__meta-value">
              {renderVerifiedAttributes(pool.autoVerifiedAttributes)}
            </span>
          </div>
          <div class="attr-card">
            <span class="attr-card__label">MFA</span>
            <span class="cognito-pool-detail-page__meta-value">
              {pool.mfaConfiguration}
            </span>
          </div>
          <div class="attr-card">
            <span class="attr-card__label">作成日時</span>
            <span class="cognito-pool-detail-page__meta-value">
              {formatDate(pool.createdAt)}
            </span>
          </div>
          <div class="attr-card">
            <span class="attr-card__label">更新日時</span>
            <span class="cognito-pool-detail-page__meta-value">
              {formatDate(pool.updatedAt)}
            </span>
          </div>
        </section>

        <section class="cognito-pool-detail-page__split">
          <div class="query-form" x-data={createClientState}>
            <h2 class="section-title">App Client を追加</h2>
            <div class="form-row">
              <label class="form-label" for="cognito-client-name">
                Client 名
              </label>
              <input
                id="cognito-client-name"
                type="text"
                class="input"
                x-model="name"
                placeholder="local-web"
              />
              <p class="form-help">
                Client secret は作成せず、
                <code class="code-inline">ALLOW_USER_PASSWORD_AUTH</code> /{" "}
                <code class="code-inline">ALLOW_REFRESH_TOKEN_AUTH</code> /{" "}
                <code class="code-inline">ALLOW_USER_SRP_AUTH</code>{" "}
                を有効にします。
              </p>
            </div>
            <div class="error-inline" x-show="error" x-cloak>
              <span x-text="error" />
            </div>
            <div class="form-actions">
              <button
                type="button"
                class="btn btn--cognito btn--sm"
                {...{
                  "@click": "submit({ name })",
                  ":disabled": "submitting || !name.trim()",
                }}
              >
                <span x-show="!submitting">{IconPlus}追加</span>
                <span x-show="submitting">追加中…</span>
              </button>
            </div>
          </div>

          <div class="query-form" x-data={createUserState}>
            <h2 class="section-title">User を追加</h2>
            <div class="cognito-pool-detail-page__form-grid">
              <div class="form-row">
                <label class="form-label" for="cognito-user-username">
                  Username
                </label>
                <input
                  id="cognito-user-username"
                  type="text"
                  class="input"
                  x-model="username"
                  placeholder="alice"
                />
              </div>
              <div class="form-row">
                <label class="form-label" for="cognito-user-temp-password">
                  Temporary Password
                </label>
                <input
                  id="cognito-user-temp-password"
                  type="password"
                  class="input"
                  x-model="temporaryPassword"
                  placeholder="TempPassw0rd!"
                />
              </div>
            </div>
            <div class="cognito-pool-detail-page__form-grid">
              <div class="form-row">
                <label class="form-label" for="cognito-user-email">
                  Email
                </label>
                <input
                  id="cognito-user-email"
                  type="email"
                  class="input"
                  x-model="email"
                  placeholder="alice@example.com"
                />
              </div>
              <div class="form-row">
                <label class="form-label" for="cognito-user-phone">
                  Phone Number
                </label>
                <input
                  id="cognito-user-phone"
                  type="text"
                  class="input"
                  x-model="phoneNumber"
                  placeholder="+819012345678"
                />
              </div>
            </div>
            <div class="error-inline" x-show="error" x-cloak>
              <span x-text="error" />
            </div>
            <div class="form-actions">
              <button
                type="button"
                class="btn btn--cognito btn--sm"
                {...{
                  "@click":
                    "submit({ username, temporaryPassword, email, phoneNumber })",
                  ":disabled":
                    "submitting || !username.trim() || !temporaryPassword.trim()",
                }}
              >
                <span x-show="!submitting">{IconPlus}追加</span>
                <span x-show="submitting">追加中…</span>
              </button>
            </div>
          </div>
        </section>

        <section class="panel">
          <div class="panel__header">
            <h2 class="panel__title">App Clients</h2>
          </div>
          <div class="cognito-panel__body">
            {appClients.length === 0 ? (
              <p class="empty-state empty-state--plain">
                まだ App Client がありません
              </p>
            ) : (
              <div class="data-table-wrap">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>ID</th>
                      <th class="data-table__actions">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {appClients.map((client) => (
                      <tr>
                        <td safe>{client.name}</td>
                        <td class="mono" safe>
                          {client.id}
                        </td>
                        <td class="data-table__actions">
                          <button
                            type="button"
                            class="btn btn--danger-ghost btn--sm"
                            data-resource-name={client.name}
                            data-delete-url={`${poolPath}/clients/${encodeURIComponent(client.id)}`}
                            x-data
                            {...{
                              "x-on:click":
                                "$dispatch('open-delete-modal', { resourceName: $el.dataset.resourceName, deleteUrl: $el.dataset.deleteUrl, onSuccess: 'reload' })",
                            }}
                          >
                            {IconTrash}削除
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        <section class="panel">
          <div class="panel__header">
            <h2 class="panel__title">Users</h2>
          </div>
          <div class="cognito-panel__body">
            {users.length === 0 ? (
              <p class="empty-state empty-state--plain">
                まだ User がありません
              </p>
            ) : (
              <div class="data-table-wrap">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>Username</th>
                      <th>Email</th>
                      <th>Status</th>
                      <th>Enabled</th>
                      <th class="data-table__actions">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => {
                      const userPath = `${poolPath}/users/${encodeResourceName(user.username)}`

                      return (
                        <tr>
                          <td>
                            <a href={userPath} safe>
                              {user.username}
                            </a>
                          </td>
                          <td safe>{user.email || "—"}</td>
                          <td safe>{user.status}</td>
                          <td>{user.enabled ? "有効" : "無効"}</td>
                          <td class="data-table__actions">
                            <button
                              type="button"
                              class="btn btn--danger-ghost btn--sm"
                              data-resource-name={user.username}
                              data-delete-url={userPath}
                              x-data
                              {...{
                                "x-on:click":
                                  "$dispatch('open-delete-modal', { resourceName: $el.dataset.resourceName, deleteUrl: $el.dataset.deleteUrl, onSuccess: 'reload' })",
                              }}
                            >
                              {IconTrash}削除
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>
    </Layout>
  )
}
