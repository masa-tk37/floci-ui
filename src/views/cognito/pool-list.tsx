import { Html } from "@elysiajs/html"

import type { UserPoolSummary } from "../../services/cognito/cognito-service"
import { formatDate } from "../format"
import { IconPlus, IconSearch, IconTrash } from "../icons"
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
        <div x-data="listFilter()" x-init="update()" x-effect="update()">
          <div class="list-toolbar">
            <label class="list-filter">
              <span class="list-filter__icon">{IconSearch}</span>
              <input
                type="search"
                class="input list-filter__input"
                placeholder="User Pool を検索"
                {...{ "x-model.debounce.120ms": "query" }}
              />
            </label>
          </div>
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
                    <tr
                      data-filter-text={`${pool.name} ${pool.id}`}
                      x-show="matches($el.dataset.filterText)"
                    >
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
                <tr x-show="hasQuery && visibleCount === 0" x-cloak>
                  <td colspan={4} class="data-table__empty">
                    一致する User Pool がありません
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
