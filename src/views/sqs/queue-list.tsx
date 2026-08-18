import { Html } from "@elysiajs/html"
import { escapeHtml } from "@kitajs/html"
import { PLACEHOLDER } from "../format"
import { IconPlus, IconSettings, IconTrash } from "../icons"
import { Layout } from "../layout"
import { ResourceTable, type TableColumn } from "../resource-table"

export interface QueueSummary {
  name: string
  depth: number
  dlqName: string | null
}

interface QueueListProps {
  queues: QueueSummary[]
}

const columns: TableColumn<QueueSummary>[] = [
  {
    label: "Queue 名",
    cell: (queue) => (
      <a href={`/sqs/${encodeURIComponent(queue.name)}`} safe>
        {queue.name}
      </a>
    ),
  },
  { label: "メッセージ数", text: (queue) => String(queue.depth) },
  {
    label: "DLQ",
    cell: (queue) =>
      queue.dlqName ? (
        <a href={`/sqs/${encodeURIComponent(queue.dlqName)}`} safe>
          {queue.dlqName}
        </a>
      ) : (
        PLACEHOLDER
      ),
  },
]

export function QueueList({ queues }: QueueListProps) {
  return (
    <Layout
      title="SQS Queues"
      active="sqs"
      crumbs={[{ label: "SQS", href: "/sqs" }]}
    >
      <section class="page-header page-header--row">
        <h1 class="page-title">SQS Queues</h1>
        <a href="/sqs/new" class="btn btn--primary btn--sm">
          {IconPlus}Queue を作成
        </a>
      </section>

      <ResourceTable
        items={queues}
        columns={columns}
        resourceLabel="Queue"
        filterText={(queue) => `${queue.name} ${queue.dlqName ?? ""}`}
        actions={(queue) => (
          <>
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
          </>
        )}
      />
    </Layout>
  )
}
