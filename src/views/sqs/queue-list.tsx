import { Html } from "@elysiajs/html"
import { IconPlus, IconSettings, IconTrash } from "../icons"
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
        <>
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
                  <tr>
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
                        "—"
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
                        data-resource-name={queue.name}
                        data-delete-url={`/sqs/${encodeURIComponent(queue.name)}`}
                        data-on-success="reload"
                        x-data
                        {...{
                          "x-on:click":
                            "$dispatch('open-delete-modal', { resourceName: $el.dataset.resourceName, deleteUrl: $el.dataset.deleteUrl, onSuccess: $el.dataset.onSuccess })",
                        }}
                      >
                        {IconTrash}削除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Layout>
  )
}
