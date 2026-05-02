import { Html } from "@elysiajs/html"
import { mountComponentAttrs } from "../client"
import { IconPlus, IconSearch, IconSettings, IconTrash } from "../icons"
import { Layout, type SidebarCounts } from "../layout"

interface TableListProps {
  tables: string[]
  sidebarCounts?: SidebarCounts
}

export function TableList({ tables, sidebarCounts }: TableListProps) {
  return (
    <Layout
      title="DynamoDB Tables"
      active="dynamodb"
      crumbs={[{ label: "DynamoDB", href: "/dynamodb" }]}
      sidebarCounts={sidebarCounts}
    >
      <section class="page-header page-header--row">
        <h1 class="page-title">DynamoDB Tables</h1>
        <a href="/dynamodb/new" class="btn btn--dynamodb btn--sm">
          {IconPlus}Table を作成
        </a>
      </section>

      {tables.length === 0 ? (
        <p class="empty-state">まだテーブルがありません</p>
      ) : (
        <div {...mountComponentAttrs("list-filter")}>
          <div class="list-toolbar">
            <label class="list-filter">
              <span class="list-filter__icon">{IconSearch}</span>
              <input
                type="search"
                class="input list-filter__input"
                placeholder="Table を検索"
                {...{ "x-model.debounce.120ms": "query" }}
              />
            </label>
          </div>
          <p class="list-count">{tables.length} 件の Table</p>
          <div class="data-table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>テーブル名</th>
                  <th class="data-table__actions">操作</th>
                </tr>
              </thead>
              <tbody>
                {tables.map((name) => (
                  <tr
                    data-filter-text={name}
                    x-show="matches($el.dataset.filterText)"
                  >
                    <td>
                      <a href={`/dynamodb/${encodeURIComponent(name)}`} safe>
                        {name}
                      </a>
                    </td>
                    <td class="data-table__actions">
                      <a
                        href={`/dynamodb/${encodeURIComponent(name)}/query`}
                        class="btn btn--ghost btn--sm"
                      >
                        {IconSearch}Query
                      </a>
                      <a
                        href={`/dynamodb/${encodeURIComponent(name)}/edit`}
                        class="btn btn--ghost btn--sm"
                      >
                        {IconSettings}設定
                      </a>
                      <button
                        type="button"
                        class="btn btn--danger-ghost btn--sm"
                        data-floci-delete-trigger=""
                        data-resource-name={name}
                        data-delete-url={`/dynamodb/${encodeURIComponent(name)}`}
                        data-on-success="reload"
                      >
                        {IconTrash}削除
                      </button>
                    </td>
                  </tr>
                ))}
                <tr x-show="hasQuery && visibleCount === 0" x-cloak>
                  <td colspan={2} class="data-table__empty">
                    一致する Table がありません
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
