import { Html } from "@elysiajs/html"

import type { UserPoolSummary } from "../../services/cognito/cognito-service"
import { formatDate } from "../format"
import { IconPlus, IconTrash } from "../icons"
import { Layout, type SidebarCounts } from "../layout"

interface UserPoolListProps {
  userPools: UserPoolSummary[]
  sidebarCounts?: SidebarCounts
}

export function UserPoolList({ userPools, sidebarCounts }: UserPoolListProps) {
  return (
    <Layout
      title="Cognito"
      active="cognito"
      crumbs={[{ label: "Cognito", href: "/cognito" }]}
      sidebarCounts={sidebarCounts}
    >
      <section class="page-header page-header--row">
        <h1 class="page-title">Cognito User Pools</h1>
        <a href="/cognito/new" class="btn btn--cognito btn--sm">
          {IconPlus}User Pool を作成
        </a>
      </section>

      {userPools.length === 0 ? (
        <p class="empty-state">まだ User Pool がありません</p>
      ) : (
        <>
          <p class="list-count">{userPools.length} 件の User Pool</p>
          <div class="data-table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>ID</th>
                  <th>作成日時</th>
                  <th class="data-table__actions">操作</th>
                </tr>
              </thead>
              <tbody>
                {userPools.map((pool) => {
                  const path = `/cognito/${encodeURIComponent(pool.id)}`

                  return (
                    <tr>
                      <td>
                        <a href={path} safe>
                          {pool.name}
                        </a>
                      </td>
                      <td class="mono" safe>
                        {pool.id}
                      </td>
                      <td>{formatDate(pool.createdAt)}</td>
                      <td class="data-table__actions">
                        <button
                          type="button"
                          class="btn btn--danger-ghost btn--sm"
                          data-resource-name={pool.name}
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
