import { Html } from "@elysiajs/html"
import { mountComponentAttrs } from "../client"
import { IconSearch, IconSettings } from "../icons"
import { Layout, type SidebarCounts } from "../layout"
import { ResourceRail } from "../resource-rail"

interface ItemListProps {
  tableName: string
  tables?: string[]
  items: Record<string, unknown>[]
  hashKey: string
  sortKey?: string
  cursor?: string
  nextCursor?: string
  tableArn?: string
  sidebarCounts?: SidebarCounts
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return ""
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean")
    return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function detectColumns(
  items: Record<string, unknown>[],
  hashKey: string,
  sortKey?: string,
): string[] {
  if (items.length === 0) return []
  const first = items[0]
  const keys = Object.keys(first)
  const ordered: string[] = []
  if (keys.includes(hashKey)) ordered.push(hashKey)
  if (sortKey && keys.includes(sortKey)) ordered.push(sortKey)
  for (const k of keys) {
    if (k !== hashKey && k !== sortKey) ordered.push(k)
  }
  return ordered
}

export function ItemList({
  tableName,
  tables = [],
  items,
  hashKey,
  sortKey,
  cursor,
  nextCursor,
  tableArn,
  sidebarCounts,
}: ItemListProps) {
  const columns = detectColumns(items, hashKey, sortKey)
  const tablePath = `/dynamodb/${encodeURIComponent(tableName)}`
  const tableRailItems = tables.map((name) => ({
    label: name,
    href: `/dynamodb/${encodeURIComponent(name)}`,
    active: name === tableName,
  }))

  return (
    <Layout
      title={`DynamoDB · ${tableName}`}
      active="dynamodb"
      crumbs={[
        { label: "DynamoDB", href: "/dynamodb" },
        { label: tableName, href: tablePath },
      ]}
      sidebarCounts={sidebarCounts}
      mainClass="main--resource-workspace"
      contentClass="content--resource-workspace"
    >
      <div class="resource-workspace ddb-item-list-page__workspace">
        {tables.length > 0 ? (
          <ResourceRail
            title="Tables"
            searchPlaceholder="Table を検索"
            items={tableRailItems}
            emptyLabel="一致する Table がありません"
          />
        ) : null}
        <div class="resource-main ddb-item-list-page__main">
          <section class="page-header page-header--row">
            <div>
              <h1 class="page-title">
                <span safe>{tableName}</span>
              </h1>
              {tableArn ? (
                <p class="page-subtitle" safe>
                  {tableArn}
                </p>
              ) : null}
            </div>
            <div class="page-header__actions">
              <a href={`${tablePath}/query`} class="btn btn--ghost btn--sm">
                {IconSearch}Query
              </a>
              <a href={`${tablePath}/edit`} class="btn btn--ghost btn--sm">
                {IconSettings}設定
              </a>
            </div>
          </section>

          {items.length === 0 ? (
            <p class="empty-state">この Table にアイテムがありません。</p>
          ) : (
            <>
              <p class="list-count">このページに {items.length} 件</p>
              <div class="data-table-wrap">
                <table class="data-table">
                  <thead>
                    <tr>
                      {columns.map((col) => (
                        <th safe>{col}</th>
                      ))}
                      <th class="data-table__actions">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => {
                      const pkRaw = item[hashKey]
                      const skRaw = sortKey ? item[sortKey] : undefined
                      const pkValue = pkRaw === undefined ? "" : String(pkRaw)
                      const skValue = skRaw === undefined ? "" : String(skRaw)
                      const itemPath = sortKey
                        ? `${tablePath}/${encodeURIComponent(pkValue)}/${encodeURIComponent(skValue)}`
                        : `${tablePath}/${encodeURIComponent(pkValue)}`
                      const resourceName = sortKey
                        ? `${pkValue} / ${skValue}`
                        : pkValue
                      return (
                        <tr class="data-table__row">
                          {columns.map((col) => (
                            <td safe>{formatValue(item[col])}</td>
                          ))}
                          <td class="data-table__actions">
                            <a
                              href={`${itemPath}/edit`}
                              class="btn btn--ghost btn--sm"
                            >
                              編集
                            </a>
                            <button
                              type="button"
                              class="btn btn--danger-ghost btn--sm"
                              data-floci-delete-trigger=""
                              data-resource-name={resourceName}
                              data-delete-url={itemPath}
                              data-on-success="remove-row"
                            >
                              削除
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

          <nav class="pagination">
            {cursor ? (
              <a href={tablePath} class="btn btn--ghost">
                ← 最初のページ
              </a>
            ) : null}
            {nextCursor ? (
              <a
                href={`${tablePath}?cursor=${encodeURIComponent(nextCursor)}`}
                class="btn btn--ghost"
              >
                次のページ →
              </a>
            ) : null}
          </nav>
        </div>
      </div>
    </Layout>
  )
}
