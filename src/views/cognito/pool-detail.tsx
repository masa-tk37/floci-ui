import { Html } from "@elysiajs/html"

import { encodeResourceName } from "../../infrastructure/resource-name-codec"
import type {
  AppClientSummary,
  UserPoolDetail as UserPoolDetailData,
  UserSummary,
} from "../../services/cognito/cognito-service"
import { ClientProps, mountComponentAttrs } from "../client"
import { formatDate } from "../format"
import { IconPlus, IconTrash } from "../icons"
import { Layout, type SidebarCounts } from "../layout"
import { CognitoStatusBadge, EnabledBadge } from "./status-badge"

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

export function UserPoolDetail({
  pool,
  appClients,
  users,
  sidebarCounts,
}: UserPoolDetailProps) {
  const poolPath = `/cognito/${encodeURIComponent(pool.id)}`

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
      <div
        class="cognito-pool-detail-page"
        {...mountComponentAttrs("cognito-pool-detail")}
      >
        <ClientProps props={{ poolPath }} />
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
              data-floci-delete-trigger=""
              data-resource-name={pool.name}
              data-delete-url={poolPath}
              data-redirect-url="/cognito"
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

        <section class="panel">
          <div class="panel__header">
            <h2 class="panel__title">App Clients</h2>
            <div class="panel__actions">
              <button
                type="button"
                class="btn btn--cognito btn--sm"
                {...{ "@click": "createClient.open = true" }}
              >
                {IconPlus}追加
              </button>
            </div>
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
                            data-floci-delete-trigger=""
                            data-resource-name={client.name}
                            data-delete-url={`${poolPath}/clients/${encodeURIComponent(client.id)}`}
                            data-on-success="reload"
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
          <div
            x-show="createClient.open"
            class="modal-overlay"
            x-cloak
            {...{ "@click": "createClient.close()" }}
          >
            <div
              class="modal"
              {...{
                "@click.stop": "",
                "@keydown.escape.window": "createClient.close()",
              }}
            >
              <h2 class="modal__title">App Client を追加</h2>
              <div class="form-row">
                <label class="form-label" for="cognito-client-name">
                  Client 名
                </label>
                <input
                  id="cognito-client-name"
                  type="text"
                  class="input"
                  x-model="createClient.name"
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
              <div class="error-inline" x-show="createClient.error" x-cloak>
                <span x-text="createClient.error" />
              </div>
              <div class="modal__actions">
                <button
                  type="button"
                  class="btn btn--cognito"
                  {...{
                    "@click":
                      "createClient.submit({ name: createClient.name })",
                    ":disabled":
                      "createClient.submitting || !createClient.name.trim()",
                  }}
                >
                  <span x-show="!createClient.submitting">追加</span>
                  <span x-show="createClient.submitting">追加中…</span>
                </button>
                <button
                  type="button"
                  class="btn btn--ghost"
                  {...{
                    "@click": "createClient.close()",
                    ":disabled": "createClient.submitting",
                  }}
                >
                  キャンセル
                </button>
              </div>
            </div>
          </div>
        </section>

        <section class="panel">
          <div class="panel__header">
            <h2 class="panel__title">Users</h2>
            <div class="panel__actions">
              <button
                type="button"
                class="btn btn--cognito btn--sm"
                {...{ "@click": "createUser.open = true" }}
              >
                {IconPlus}追加
              </button>
            </div>
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
                          <td>
                            <CognitoStatusBadge status={user.status} />
                          </td>
                          <td>
                            <EnabledBadge enabled={user.enabled} />
                          </td>
                          <td class="data-table__actions">
                            <button
                              type="button"
                              class="btn btn--danger-ghost btn--sm"
                              data-floci-delete-trigger=""
                              data-resource-name={user.username}
                              data-delete-url={userPath}
                              data-on-success="reload"
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
          <div
            x-show="createUser.open"
            class="modal-overlay"
            x-cloak
            {...{ "@click": "createUser.close()" }}
          >
            <div
              class="modal modal--wide"
              {...{
                "@click.stop": "",
                "@keydown.escape.window": "createUser.close()",
              }}
            >
              <h2 class="modal__title">User を追加</h2>
              <div class="cognito-pool-detail-page__form-grid">
                <div class="form-row">
                  <label class="form-label" for="cognito-user-username">
                    Username
                  </label>
                  <input
                    id="cognito-user-username"
                    type="text"
                    class="input"
                    x-model="createUser.username"
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
                    x-model="createUser.temporaryPassword"
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
                    x-model="createUser.email"
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
                    x-model="createUser.phoneNumber"
                    placeholder="+819012345678"
                  />
                </div>
              </div>
              <div class="error-inline" x-show="createUser.error" x-cloak>
                <span x-text="createUser.error" />
              </div>
              <div class="modal__actions">
                <button
                  type="button"
                  class="btn btn--cognito"
                  {...{
                    "@click":
                      "createUser.submit({ username: createUser.username, temporaryPassword: createUser.temporaryPassword, email: createUser.email, phoneNumber: createUser.phoneNumber })",
                    ":disabled":
                      "createUser.submitting || !createUser.username.trim() || !createUser.temporaryPassword.trim()",
                  }}
                >
                  <span x-show="!createUser.submitting">追加</span>
                  <span x-show="createUser.submitting">追加中…</span>
                </button>
                <button
                  type="button"
                  class="btn btn--ghost"
                  {...{
                    "@click": "createUser.close()",
                    ":disabled": "createUser.submitting",
                  }}
                >
                  キャンセル
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </Layout>
  )
}
