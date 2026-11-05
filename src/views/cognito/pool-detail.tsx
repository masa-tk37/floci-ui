import { Html } from "@elysiajs/html"
import { escapeHtml } from "@kitajs/html"

import { encodeResourceName } from "../../infrastructure/resource-name-codec"
import type {
  AppClientSummary,
  GroupSummary,
  UserPoolDetail as UserPoolDetailData,
  UserSummary,
} from "../../services/cognito/cognito-service"
import { ClientProps, mountComponentAttrs } from "../client"
import { CopyButton } from "../copy-button"
import { formatDate, PLACEHOLDER } from "../format"
import { IconPlus, IconSearch, IconTrash } from "../icons"
import { Layout } from "../layout"
import { CognitoStatusBadge, EnabledBadge } from "./status-badge"

// The URL parser collapses "." and ".." path segments (even percent-encoded),
// so a request for such a group would hit the parent route, e.g. pool deletion.
function isDotSegment(value: string): boolean {
  return value === "." || value === ".."
}

interface UserPoolDetailProps {
  pool: UserPoolDetailData
  appClients: AppClientSummary[]
  groups: GroupSummary[]
  users: UserSummary[]
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
  if (values.length === 0) return PLACEHOLDER

  return values.map((value, index) => (
    <>
      {index > 0 ? <span>, </span> : null}
      <code class="code-inline">{value}</code>
    </>
  ))
}

interface CreateModalProps {
  controller: string
  title: string
  fields: string[]
  requiredFields: string[]
  wide?: boolean
  children: JSX.Element | JSX.Element[]
}

function CreateModal({
  controller,
  title,
  fields,
  requiredFields,
  wide,
  children,
}: CreateModalProps) {
  const payload = fields
    .map((field) => `${field}: ${controller}.${field}`)
    .join(", ")
  const disabled = [
    `${controller}.submitting`,
    ...requiredFields.map((field) => `!${controller}.${field}.trim()`),
  ].join(" || ")

  return (
    <div
      x-show={`${controller}.open`}
      class="modal-overlay"
      x-cloak
      {...{ "@click": `${controller}.close()` }}
    >
      <div
        class={wide ? "modal modal--wide" : "modal"}
        {...{
          "@click.stop": "",
          "@keydown.escape.window": `${controller}.close()`,
        }}
      >
        <h2 class="modal__title" safe>
          {title}
        </h2>
        {children}
        <div class="error-inline" x-show={`${controller}.error`} x-cloak>
          <span x-text={`${controller}.error`} />
        </div>
        <div class="modal__actions">
          <button
            type="button"
            class="btn btn--primary"
            {...{
              "@click": `${controller}.submit({ ${payload} })`,
              ":disabled": disabled,
            }}
          >
            <span x-show={`!${controller}.submitting`}>追加</span>
            <span x-show={`${controller}.submitting`}>追加中…</span>
          </button>
          <button
            type="button"
            class="btn btn--ghost"
            {...{
              "@click": `${controller}.close()`,
              ":disabled": `${controller}.submitting`,
            }}
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  )
}

export function UserPoolDetail({
  pool,
  appClients,
  groups,
  users,
}: UserPoolDetailProps) {
  const poolPath = `/cognito/${encodeURIComponent(pool.id)}`

  return (
    <Layout
      title={`Cognito · ${pool.name}`}
      active="cognito"
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
            <CopyButton />
          </div>
          <div class="page-header__actions">
            <button
              type="button"
              class="btn btn--danger-ghost btn--sm"
              data-floci-delete-trigger=""
              data-resource-name={escapeHtml(pool.name)}
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
                class="btn btn--primary btn--sm"
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
                            data-resource-name={escapeHtml(client.name)}
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
          <CreateModal
            controller="createClient"
            title="App Client を追加"
            fields={["name"]}
            requiredFields={["name"]}
          >
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
          </CreateModal>
        </section>

        <section class="panel">
          <div class="panel__header">
            <h2 class="panel__title">Groups</h2>
            <div class="panel__actions">
              <button
                type="button"
                class="btn btn--primary btn--sm"
                {...{ "@click": "createGroup.open = true" }}
              >
                {IconPlus}追加
              </button>
            </div>
          </div>
          <div class="cognito-panel__body">
            {groups.length === 0 ? (
              <p class="empty-state empty-state--plain">
                まだ Group がありません
              </p>
            ) : (
              <div class="data-table-wrap">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Description</th>
                      <th>作成日時</th>
                      <th class="data-table__actions">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map((group) => (
                      <tr>
                        <td>
                          {isDotSegment(group.name) ? (
                            <span safe>{group.name}</span>
                          ) : (
                            <button
                              type="button"
                              class="btn btn--link"
                              data-group-name={escapeHtml(group.name)}
                              data-group-name-encoded={escapeHtml(
                                encodeURIComponent(group.name),
                              )}
                              {...{
                                "@click":
                                  "groupMembers.show($el.dataset.groupName, $el.dataset.groupNameEncoded)",
                              }}
                            >
                              <span safe>{group.name}</span>
                            </button>
                          )}
                        </td>
                        <td safe>{group.description || PLACEHOLDER}</td>
                        <td>{formatDate(group.createdAt)}</td>
                        <td class="data-table__actions">
                          {isDotSegment(group.name) ? null : (
                            <button
                              type="button"
                              class="btn btn--danger-ghost btn--sm"
                              data-floci-delete-trigger=""
                              data-resource-name={escapeHtml(group.name)}
                              data-delete-url={`${poolPath}/groups/${encodeURIComponent(group.name)}`}
                              data-on-success="reload"
                            >
                              {IconTrash}削除
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <CreateModal
            controller="createGroup"
            title="Group を追加"
            fields={["name", "description"]}
            requiredFields={["name"]}
          >
            <div class="form-row">
              <label class="form-label" for="cognito-group-name">
                グループ名
              </label>
              <input
                id="cognito-group-name"
                type="text"
                class="input"
                x-model="createGroup.name"
                placeholder="admins"
              />
            </div>
            <div class="form-row">
              <label class="form-label" for="cognito-group-description">
                説明（任意）
              </label>
              <input
                id="cognito-group-description"
                type="text"
                class="input"
                x-model="createGroup.description"
                placeholder="管理者グループ"
              />
            </div>
          </CreateModal>
        </section>

        <div
          x-show="groupMembers.isOpen"
          class="modal-overlay"
          x-cloak
          {...{ "@click": "groupMembers.close()" }}
        >
          <div
            class="modal modal--wide"
            {...{
              "@click.stop": "",
              "@keydown.escape.window":
                "groupMembers.isOpen && groupMembers.close()",
            }}
          >
            <h2 class="modal__title">
              Group メンバー: <span x-text="groupMembers.groupName" />
            </h2>
            <div class="form-row">
              <label class="form-label" for="cognito-group-member-username">
                Username を追加
              </label>
              <div class="input-with-btn">
                <input
                  id="cognito-group-member-username"
                  type="text"
                  class="input"
                  x-model="groupMembers.newUsername"
                  placeholder="alice"
                  {...{ "@keydown.enter": "groupMembers.addMember()" }}
                />
                <button
                  type="button"
                  class="btn btn--primary btn--sm"
                  {...{
                    "@click": "groupMembers.addMember()",
                    ":disabled":
                      "groupMembers.adding || !groupMembers.newUsername.trim()",
                  }}
                >
                  <span x-show="!groupMembers.adding">追加</span>
                  <span x-show="groupMembers.adding">追加中…</span>
                </button>
              </div>
            </div>
            <div class="error-inline" x-show="groupMembers.error" x-cloak>
              <span x-text="groupMembers.error" />
            </div>
            <div class="cognito-panel__body">
              <template x-if="groupMembers.loading">
                <p class="empty-state empty-state--plain">読み込み中…</p>
              </template>
              <template x-if="!groupMembers.loading && groupMembers.users.length === 0">
                <p class="empty-state empty-state--plain">メンバーがいません</p>
              </template>
              <template x-if="!groupMembers.loading && groupMembers.users.length > 0">
                <div class="data-table-wrap">
                  <table class="data-table">
                    <thead>
                      <tr>
                        <th>Username</th>
                        <th>Email</th>
                        <th>Status</th>
                        <th class="data-table__actions">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      <template
                        x-for="user in groupMembers.users"
                        {...{ ":key": "user.username" }}
                      >
                        <tr>
                          <td x-text="user.username" />
                          <td x-text="user.email || '—'" />
                          <td x-text="user.status" />
                          <td class="data-table__actions">
                            <button
                              type="button"
                              class="btn btn--danger-ghost btn--sm"
                              {...{
                                "@click":
                                  "groupMembers.removeMember(user.username)",
                                ":disabled": "groupMembers.removing",
                              }}
                            >
                              {IconTrash}削除
                            </button>
                          </td>
                        </tr>
                      </template>
                    </tbody>
                  </table>
                </div>
              </template>
            </div>
            <div class="modal__actions">
              <button
                type="button"
                class="btn btn--ghost"
                {...{ "@click": "groupMembers.close()" }}
              >
                閉じる
              </button>
            </div>
          </div>
        </div>

        <section class="panel">
          <div class="panel__header">
            <h2 class="panel__title">Users</h2>
            <div class="panel__actions">
              <button
                type="button"
                class="btn btn--primary btn--sm"
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
              <div {...mountComponentAttrs("list-filter")}>
                <div class="list-toolbar">
                  <label class="list-filter">
                    <span class="list-filter__icon">{IconSearch}</span>
                    <input
                      type="search"
                      class="input list-filter__input"
                      placeholder="User を検索"
                      {...{ "x-model.debounce.120ms": "query" }}
                    />
                  </label>
                </div>
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
                          <tr
                            data-filter-text={`${escapeHtml(user.username)} ${escapeHtml(user.email ?? "")}`}
                            x-show="matches($el.dataset.filterText)"
                          >
                            <td>
                              <a href={userPath} safe>
                                {user.username}
                              </a>
                            </td>
                            <td safe>{user.email || PLACEHOLDER}</td>
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
                                data-resource-name={escapeHtml(user.username)}
                                data-delete-url={userPath}
                                data-on-success="reload"
                              >
                                {IconTrash}削除
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                      <tr x-show="hasQuery && visibleCount === 0" x-cloak>
                        <td colspan={5} class="data-table__empty">
                          一致する User がありません
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
          <CreateModal
            controller="createUser"
            title="User を追加"
            fields={["username", "temporaryPassword", "email", "phoneNumber"]}
            requiredFields={["username", "temporaryPassword"]}
            wide
          >
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
          </CreateModal>
        </section>
      </div>
    </Layout>
  )
}
