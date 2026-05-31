import { Html } from "@elysiajs/html"
import { escapeHtml } from "@kitajs/html"

import { encodeResourceName } from "../../infrastructure/resource-name-codec"
import type { SecretSummary } from "../../services/secrets/secret-service"
import { mountComponentAttrs } from "../client"
import { formatDate, PLACEHOLDER } from "../format"
import { IconEdit, IconPlus, IconSearch, IconTrash } from "../icons"
import { Layout, type SidebarCounts } from "../layout"

interface SecretListProps {
  secrets: SecretSummary[]
  sidebarCounts?: SidebarCounts
}

export function SecretList({ secrets, sidebarCounts }: SecretListProps) {
  return (
    <Layout
      title="Secrets Manager"
      active="secrets"
      crumbs={[{ label: "Secrets", href: "/secrets" }]}
      sidebarCounts={sidebarCounts}
    >
      <section class="page-header page-header--row">
        <h1 class="page-title">Secrets Manager</h1>
        <a href="/secrets/new" class="btn btn--secrets btn--sm">
          {IconPlus}Secret を作成
        </a>
      </section>

      {secrets.length === 0 ? (
        <p class="empty-state">まだ Secret がありません</p>
      ) : (
        <div {...mountComponentAttrs("list-filter")}>
          <div class="list-toolbar">
            <label class="list-filter">
              <span class="list-filter__icon">{IconSearch}</span>
              <input
                type="search"
                class="input list-filter__input"
                placeholder="Secret を検索"
                {...{ "x-model.debounce.120ms": "query" }}
              />
            </label>
          </div>
          <p class="list-count">{secrets.length} 件の Secret</p>
          <div class="data-table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Description</th>
                  <th>KMS Key</th>
                  <th>更新日時</th>
                  <th class="data-table__actions">操作</th>
                </tr>
              </thead>
              <tbody>
                {secrets.map((secret) => {
                  const id = encodeResourceName(secret.name)
                  const path = `/secrets/${id}`

                  return (
                    <tr
                      data-filter-text={`${escapeHtml(secret.name)} ${escapeHtml(secret.description ?? "")} ${escapeHtml(secret.kmsKeyId ?? "")}`}
                      x-show="matches($el.dataset.filterText)"
                    >
                      <td>
                        <a href={path} safe>
                          {secret.name}
                        </a>
                      </td>
                      <td safe>{secret.description || PLACEHOLDER}</td>
                      <td class="mono" safe>
                        {secret.kmsKeyId || PLACEHOLDER}
                      </td>
                      <td>{formatDate(secret.lastChangedDate)}</td>
                      <td class="data-table__actions">
                        <a href={`${path}/edit`} class="btn btn--ghost btn--sm">
                          {IconEdit}編集
                        </a>
                        <button
                          type="button"
                          class="btn btn--danger-ghost btn--sm"
                          data-floci-delete-trigger=""
                          data-resource-name={escapeHtml(secret.name)}
                          data-delete-url={path}
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
                    一致する Secret がありません
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Layout>
  )
}
