import { Html } from "@elysiajs/html"
import { escapeHtml } from "@kitajs/html"
import { mountComponentAttrs } from "../client"
import { IconEdit, IconSearch, IconSettings, IconTrash } from "../icons"
import { Layout } from "../layout"
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
  stack?: string
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

// The URL parser collapses "." and ".." path segments (even percent-encoded),
// so an item URL with such a key would hit the parent route, e.g. table deletion.
function isDotSegment(value: string): boolean {
  return value === "." || value === ".."
}

function isComplexValue(value: unknown): boolean {
  return value !== null && typeof value === "object"
}

function buildPrevUrl(
  tablePath: string,
  cursor: string | undefined,
  stack: string | undefined,
): string | undefined {
  if (!cursor) return undefined
  if (!stack) return tablePath
  const parts = stack.split(",")
  const prevCursor = parts[parts.length - 1]
  const newStack = parts.slice(0, -1).join(",")
  const params = new URLSearchParams({ cursor: prevCursor ?? "" })
  if (newStack) params.set("stack", newStack)
  return `${tablePath}?${params.toString()}`
}

// Each cursor is a base64 key, so an unbounded history outgrows URL limits on
// deep scans; past this depth "前のページ" falls back to the first page.
const MAX_STACK_DEPTH = 3

function buildNextUrl(
  tablePath: string,
  cursor: string | undefined,
  nextCursor: string,
  stack: string | undefined,
): string {
  const cursorForStack = cursor ?? ""
  const newStack = (stack ? `${stack},${cursorForStack}` : cursorForStack)
    .split(",")
    .slice(-MAX_STACK_DEPTH)
    .join(",")
  const params = new URLSearchParams({ cursor: nextCursor })
  if (newStack) params.set("stack", newStack)
  return `${tablePath}?${params.toString()}`
}

function detectColumns(
  items: Record<string, unknown>[],
  hashKey: string,
  sortKey?: string,
): string[] {
  if (items.length === 0) return []
  const keys = [...new Set(items.flatMap((item) => Object.keys(item)))]
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
  stack,
}: ItemListProps) {
  const columns = detectColumns(items, hashKey, sortKey)
  const tablePath = `/dynamodb/${encodeURIComponent(tableName)}`
  const tableRailItems = tables.map((name) => ({
    label: name,
    href: `/dynamodb/${encodeURIComponent(name)}`,
    active: name === tableName,
  }))
  const prevUrl = buildPrevUrl(tablePath, cursor, stack)

  return (
    <Layout
      title={`DynamoDB · ${tableName}`}
      active="dynamodb"
      crumbs={[
        { label: "DynamoDB", href: "/dynamodb" },
        { label: tableName, href: tablePath },
      ]}
      contentMode="workspace"
    >
      <div
        class="resource-workspace ddb-item-list-page__workspace l--withSide"
        {...mountComponentAttrs("ddb-item-list")}
      >
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
                      const hasDotSegmentKey =
                        isDotSegment(pkValue) ||
                        (sortKey !== undefined && isDotSegment(skValue))
                      const resourceName = sortKey
                        ? `${pkValue} / ${skValue}`
                        : pkValue
                      return (
                        <tr class="data-table__row">
                          {columns.map((col) => {
                            const val = item[col]
                            if (isComplexValue(val)) {
                              const jsonStr = JSON.stringify(val)
                              return (
                                <td
                                  class="ddb-item-list__cell--complex"
                                  {...{
                                    "data-json": escapeHtml(jsonStr),
                                    "data-field-name": escapeHtml(col),
                                    "@click": "openCell($el)",
                                  }}
                                  safe
                                >
                                  {jsonStr}
                                </td>
                              )
                            }
                            return <td safe>{formatValue(val)}</td>
                          })}
                          <td class="data-table__actions">
                            {hasDotSegmentKey ? null : (
                              <>
                                <a
                                  href={`${itemPath}/edit`}
                                  class="btn btn--ghost btn--sm"
                                >
                                  {IconEdit}編集
                                </a>
                                <button
                                  type="button"
                                  class="btn btn--danger-ghost btn--sm"
                                  data-floci-delete-trigger=""
                                  data-resource-name={escapeHtml(resourceName)}
                                  data-delete-url={itemPath}
                                  data-on-success="remove-row"
                                >
                                  {IconTrash}削除
                                </button>
                              </>
                            )}
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
            {cursor && stack ? (
              <a href={tablePath} class="btn btn--ghost">
                ← 最初のページ
              </a>
            ) : null}
            {prevUrl ? (
              <a href={prevUrl} class="btn btn--ghost">
                ← 前のページ
              </a>
            ) : null}
            {nextCursor ? (
              <a
                href={buildNextUrl(tablePath, cursor, nextCursor, stack)}
                class="btn btn--ghost"
              >
                次のページ →
              </a>
            ) : null}
          </nav>
        </div>
        <template x-if="selectedCell">
          <div
            class="modal-overlay"
            {...{
              "@click.self": "closeCell()",
              "@keydown.escape.window": "closeCell()",
            }}
          >
            <div class="modal modal--wide">
              <div class="modal__header-row">
                <h2 class="modal__title">
                  フィールド: <span x-text="selectedCell.fieldName" />
                </h2>
                <button
                  type="button"
                  class="btn btn--ghost btn--sm"
                  {...{ "@click": "copyCell()" }}
                >
                  コピー
                </button>
              </div>
              <pre
                class="ddb-item-list__json-preview"
                x-text="selectedCell.formatted"
              />
              <div class="modal__actions">
                <button
                  type="button"
                  class="btn btn--ghost"
                  {...{ "@click": "closeCell()" }}
                >
                  閉じる
                </button>
              </div>
            </div>
          </div>
        </template>
      </div>
    </Layout>
  )
}
