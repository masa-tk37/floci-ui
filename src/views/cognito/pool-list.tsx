import { Html } from "@elysiajs/html"
import { escapeHtml } from "@kitajs/html"

import type { UserPoolSummary } from "../../services/cognito/cognito-service"
import { formatDate } from "../format"
import { IconPlus, IconTrash } from "../icons"
import { Layout } from "../layout"
import { ResourceTable, type TableColumn } from "../resource-table"

interface UserPoolListProps {
  userPools: UserPoolSummary[]
}

const columns: TableColumn<UserPoolSummary>[] = [
  {
    label: "Name",
    cell: (pool) => (
      <a href={`/cognito/${encodeURIComponent(pool.id)}`} safe>
        {pool.name}
      </a>
    ),
  },
  { label: "ID", className: "mono", text: (pool) => pool.id },
  { label: "作成日時", text: (pool) => formatDate(pool.createdAt) },
]

export function UserPoolList({ userPools }: UserPoolListProps) {
  return (
    <Layout
      title="Cognito"
      active="cognito"
      crumbs={[{ label: "Cognito", href: "/cognito" }]}
    >
      <section class="page-header page-header--row">
        <h1 class="page-title">Cognito User Pools</h1>
        <a href="/cognito/new" class="btn btn--primary btn--sm">
          {IconPlus}User Pool を作成
        </a>
      </section>

      <ResourceTable
        items={userPools}
        columns={columns}
        resourceLabel="User Pool"
        filterText={(pool) => `${pool.name} ${pool.id}`}
        actions={(pool) => (
          <button
            type="button"
            class="btn btn--danger-ghost btn--sm"
            data-floci-delete-trigger=""
            data-resource-name={escapeHtml(pool.name)}
            data-delete-url={`/cognito/${encodeURIComponent(pool.id)}`}
            data-on-success="reload"
          >
            {IconTrash}削除
          </button>
        )}
      />
    </Layout>
  )
}
