import { Html } from "@elysiajs/html"
import { escapeHtml } from "@kitajs/html"
import { mountComponentAttrs } from "./client"
import { IconSearch } from "./icons"

interface ColumnBase {
  label: string
  /** Extra class on both the header and body cells, e.g. "mono". */
  className?: string
}

/**
 * A column either yields plain text, which this component escapes, or markup the
 * view already made safe. Escaping is not a per-view decision to forget.
 */
export type TableColumn<T> =
  | (ColumnBase & { text: (item: T) => string; cell?: never })
  | (ColumnBase & { cell: (item: T) => JSX.Element; text?: never })

interface ResourceTableProps<T> {
  items: T[]
  columns: TableColumn<T>[]
  filterText: (item: T) => string
  actions?: (item: T) => JSX.Element
  /** Noun used in the count, the search placeholder and the empty messages. */
  resourceLabel: string
  /** Overrides "まだ {resourceLabel} がありません" when the wording differs. */
  emptyMessage?: string
}

/**
 * Filterable list table shared by every service index page. Emits the
 * data-filter-text / x-show pair that the list-filter controller drives, so the
 * client side needs no per-service wiring.
 */
export function ResourceTable<T>({
  items,
  columns,
  filterText,
  actions,
  resourceLabel,
  emptyMessage,
}: ResourceTableProps<T>) {
  if (items.length === 0) {
    return (
      <p class="empty-state" safe>
        {emptyMessage ?? `まだ ${resourceLabel} がありません`}
      </p>
    )
  }

  const columnCount = columns.length + (actions ? 1 : 0)

  return (
    <div {...mountComponentAttrs("list-filter")}>
      <div class="list-toolbar">
        <label class="list-filter">
          <span class="list-filter__icon">{IconSearch}</span>
          <input
            type="search"
            class="input list-filter__input"
            placeholder={`${resourceLabel} を検索`}
            {...{ "x-model.debounce.120ms": "query" }}
          />
        </label>
      </div>
      <p class="list-count" safe>
        {`${items.length} 件の ${resourceLabel}`}
      </p>
      <div class="data-table-wrap data-table-wrap--sticky">
        <table class="data-table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th class={column.className} safe>
                  {column.label}
                </th>
              ))}
              {actions ? <th class="data-table__actions">操作</th> : null}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr
                data-filter-text={escapeHtml(filterText(item))}
                x-show="matches($el.dataset.filterText)"
              >
                {columns.map((column) => {
                  if (!column.text) {
                    return <td class={column.className}>{column.cell(item)}</td>
                  }
                  // Cells clip at 320px, so carry the full value in the tooltip.
                  const value = column.text(item)
                  return (
                    <td class={column.className} title={escapeHtml(value)}>
                      {escapeHtml(value)}
                    </td>
                  )
                })}
                {actions ? (
                  <td class="data-table__actions">{actions(item)}</td>
                ) : null}
              </tr>
            ))}
            <tr x-show="hasQuery && visibleCount === 0" x-cloak>
              <td colspan={columnCount} class="data-table__empty" safe>
                {`一致する ${resourceLabel} がありません`}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
