import { Html } from "@elysiajs/html"

import { encodeResourceName } from "../../infrastructure/resource-name-codec"
import type { SecretSummary } from "../../services/secrets/secret-service"
import { IconEdit, IconPlus, IconTrash } from "../icons"
import { Layout, type SidebarCounts } from "../layout"
import { formatDate } from "../format"

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
        <>
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
                    <tr>
                      <td>
                        <a href={path} safe>
                          {secret.name}
                        </a>
                      </td>
                      <td safe>{secret.description || "—"}</td>
                      <td class="mono" safe>
                        {secret.kmsKeyId || "—"}
                      </td>
                      <td>{formatDate(secret.lastChangedDate)}</td>
                      <td class="data-table__actions">
                        <a href={`${path}/edit`} class="btn btn--ghost btn--sm">
                          {IconEdit}編集
                        </a>
                        <button
                          type="button"
                          class="btn btn--danger-ghost btn--sm"
                          data-resource-name={secret.name}
                          data-delete-url={path}
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
        </>
      )}
    </Layout>
  )
}
