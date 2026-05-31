import { Html } from "@elysiajs/html"
import { escapeHtml } from "@kitajs/html"

import { encodeResourceName } from "../../infrastructure/resource-name-codec"
import type { ParameterSummary } from "../../services/ssm/parameter-service"
import { mountComponentAttrs } from "../client"
import { formatDate } from "../format"
import { IconEdit, IconPlus, IconSearch, IconTrash } from "../icons"
import { Layout, type SidebarCounts } from "../layout"

interface ParameterListProps {
  parameters: ParameterSummary[]
  sidebarCounts?: SidebarCounts
}

export function ParameterList({
  parameters,
  sidebarCounts,
}: ParameterListProps) {
  return (
    <Layout
      title="SSM Parameters"
      active="ssm"
      crumbs={[{ label: "SSM", href: "/ssm" }]}
      sidebarCounts={sidebarCounts}
    >
      <section class="page-header page-header--row">
        <h1 class="page-title">SSM Parameters</h1>
        <a href="/ssm/new" class="btn btn--ssm btn--sm">
          {IconPlus}Parameter を作成
        </a>
      </section>

      {parameters.length === 0 ? (
        <p class="empty-state">まだ Parameter がありません</p>
      ) : (
        <div {...mountComponentAttrs("list-filter")}>
          <div class="list-toolbar">
            <label class="list-filter">
              <span class="list-filter__icon">{IconSearch}</span>
              <input
                type="search"
                class="input list-filter__input"
                placeholder="Parameter を検索"
                {...{ "x-model.debounce.120ms": "query" }}
              />
            </label>
          </div>
          <p class="list-count">{parameters.length} 件の Parameter</p>
          <div class="data-table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Tier</th>
                  <th>更新日時</th>
                  <th class="data-table__actions">操作</th>
                </tr>
              </thead>
              <tbody>
                {parameters.map((parameter) => {
                  const id = encodeResourceName(parameter.name)
                  const path = `/ssm/${id}`
                  return (
                    <tr
                      data-filter-text={`${escapeHtml(parameter.name)} ${parameter.type} ${parameter.tier}`}
                      x-show="matches($el.dataset.filterText)"
                    >
                      <td>
                        <a href={path} safe>
                          {parameter.name}
                        </a>
                      </td>
                      <td>{parameter.type}</td>
                      <td>{parameter.tier}</td>
                      <td>{formatDate(parameter.lastModifiedDate)}</td>
                      <td class="data-table__actions">
                        <a href={`${path}/edit`} class="btn btn--ghost btn--sm">
                          {IconEdit}編集
                        </a>
                        <button
                          type="button"
                          class="btn btn--danger-ghost btn--sm"
                          data-floci-delete-trigger=""
                          data-resource-name={escapeHtml(parameter.name)}
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
                    一致する Parameter がありません
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
