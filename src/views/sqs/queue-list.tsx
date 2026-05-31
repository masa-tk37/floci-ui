import { Html } from "@elysiajs/html"
import { escapeHtml } from "@kitajs/html"
import { PLACEHOLDER } from "../format"
import { mountComponentAttrs } from "../client"
import { IconPlus, IconSearch, IconSettings, IconTrash } from "../icons"
import { Layout, type SidebarCounts } from "../layout"

export interface QueueSummary {
  name: string
  depth: number
  dlqName: string | null
}

interface QueueListProps {
  queues: QueueSummary[]
  sidebarCounts?: SidebarCounts
}

export function QueueList({ queues, sidebarCounts }: QueueListProps) {
  return (
    <Layout
      title="SQS Queues"
      active="sqs"
      crumbs={[{ label: "SQS", href: "/sqs" }]}
      sidebarCounts={sidebarCounts}
    >
      <section class="page-header page-header--row">
        <h1 class="page-title">SQS Queues</h1>
        <a href="/sqs/new" class="btn btn--sqs btn--sm">
          {IconPlus}Queue を作成
        </a>
      </section>

      {queues.length === 0 ? (
        <p class="empty-state">まだ Queue がありません</p>
      ) : (
        <div {...mountComponentAttrs("list-filter")}>
          <div class="list-toolbar">
            <label class="list-filter">
              <span class="list-filter__icon">{IconSearch}</span>
              <input
                type="search"
                class="input list-filter__input"
                placeholder="Queue を検索"
                {...{ "x-model.debounce.120ms": "query" }}
              />
            </label>
          </div>
          <p class="list-count">{queues.length} 件の Queue</p>
          <div class="data-table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Queue 名</th>
                  <th>メッセージ数</th>
                  <th>DLQ</th>
                  <th class="data-table__actions">操作</th>
                </tr>
              </thead>
              <tbody>
                {queues.map((queue) => (
                  <tr
                    data-filter-text={`${escapeHtml(queue.name)} ${escapeHtml(queue.dlqName ?? "")}`}
                    x-show="matches($el.dataset.filterText)"
                  >
                    <td>
                      <a href={`/sqs/${encodeURIComponent(queue.name)}`} safe>
                        {queue.name}
                      </a>
                    </td>
                    <td>{queue.depth}</td>
                    <td>
                      {queue.dlqName ? (
                        <a
                          href={`/sqs/${encodeURIComponent(queue.dlqName)}`}
                          safe
                        >
                          {queue.dlqName}
                        </a>
                      ) : (
                        PLACEHOLDER
                      )}
                    </td>
                    <td class="data-table__actions">
                      <a
                        href={`/sqs/${encodeURIComponent(queue.name)}/settings`}
                        class="btn btn--ghost btn--sm"
                      >
                        {IconSettings}設定
                      </a>
                      <button
                        type="button"
                        class="btn btn--danger-ghost btn--sm"
                        data-floci-delete-trigger=""
                        data-resource-name={escapeHtml(queue.name)}
                        data-delete-url={`/sqs/${encodeURIComponent(queue.name)}`}
                        data-on-success="reload"
                      >
                        {IconTrash}削除
                      </button>
                    </td>
                  </tr>
                ))}
                <tr x-show="hasQuery && visibleCount === 0" x-cloak>
                  <td colspan={4} class="data-table__empty">
                    一致する Queue がありません
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
