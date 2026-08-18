import { Html } from "@elysiajs/html"
import { escapeHtml } from "@kitajs/html"

import { encodeResourceName } from "../../infrastructure/resource-name-codec"
import type { SecretSummary } from "../../services/secrets/secret-service"
import { formatDate, PLACEHOLDER } from "../format"
import { IconEdit, IconPlus, IconTrash } from "../icons"
import { Layout } from "../layout"
import { ResourceTable, type TableColumn } from "../resource-table"

interface SecretListProps {
  secrets: SecretSummary[]
}

const columns: TableColumn<SecretSummary>[] = [
  {
    label: "Name",
    cell: (secret) => (
      <a href={`/secrets/${encodeResourceName(secret.name)}`} safe>
        {secret.name}
      </a>
    ),
  },
  { label: "Description", text: (secret) => secret.description || PLACEHOLDER },
  {
    label: "KMS Key",
    className: "mono",
    text: (secret) => secret.kmsKeyId || PLACEHOLDER,
  },
  { label: "更新日時", text: (secret) => formatDate(secret.lastChangedDate) },
]

export function SecretList({ secrets }: SecretListProps) {
  return (
    <Layout
      title="Secrets Manager"
      active="secrets"
      crumbs={[{ label: "Secrets", href: "/secrets" }]}
    >
      <section class="page-header page-header--row">
        <h1 class="page-title">Secrets Manager</h1>
        <a href="/secrets/new" class="btn btn--primary btn--sm">
          {IconPlus}Secret を作成
        </a>
      </section>

      <ResourceTable
        items={secrets}
        columns={columns}
        resourceLabel="Secret"
        filterText={(secret) =>
          `${secret.name} ${secret.description ?? ""} ${secret.kmsKeyId ?? ""}`
        }
        actions={(secret) => {
          const path = `/secrets/${encodeResourceName(secret.name)}`
          return (
            <>
              <a href={`${path}/edit`} class="btn btn--ghost btn--sm">
                {IconEdit}編集
              </a>
              <button
                type="button"
                class="btn btn--danger-ghost btn--sm"
                data-floci-delete-trigger=""
                data-resource-name={escapeHtml(secret.name)}
                data-delete-url={path}
                data-on-success="reload"
              >
                {IconTrash}削除
              </button>
            </>
          )
        }}
      />
    </Layout>
  )
}
