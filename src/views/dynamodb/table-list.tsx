import { Html } from "@elysiajs/html"
import { escapeHtml } from "@kitajs/html"
import { IconPlus, IconSearch, IconSettings, IconTrash } from "../icons"
import { Layout } from "../layout"
import { ResourceTable, type TableColumn } from "../resource-table"

interface TableListProps {
  tables: string[]
}

const columns: TableColumn<string>[] = [
  {
    label: "テーブル名",
    cell: (name) => (
      <a href={`/dynamodb/${encodeURIComponent(name)}`} safe>
        {name}
      </a>
    ),
  },
]

export function TableList({ tables }: TableListProps) {
  return (
    <Layout
      title="DynamoDB Tables"
      active="dynamodb"
      crumbs={[{ label: "DynamoDB", href: "/dynamodb" }]}
    >
      <section class="page-header page-header--row">
        <h1 class="page-title">DynamoDB Tables</h1>
        <a href="/dynamodb/new" class="btn btn--primary btn--sm">
          {IconPlus}Table を作成
        </a>
      </section>

      <ResourceTable
        items={tables}
        columns={columns}
        resourceLabel="Table"
        emptyMessage="まだテーブルがありません"
        filterText={(name) => name}
        actions={(name) => (
          <>
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
              data-resource-name={escapeHtml(name)}
              data-delete-url={`/dynamodb/${encodeURIComponent(name)}`}
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
