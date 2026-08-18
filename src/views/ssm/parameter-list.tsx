import { Html } from "@elysiajs/html"
import { escapeHtml } from "@kitajs/html"

import { encodeResourceName } from "../../infrastructure/resource-name-codec"
import type { ParameterSummary } from "../../services/ssm/parameter-service"
import { formatDate } from "../format"
import { IconEdit, IconPlus, IconTrash } from "../icons"
import { Layout } from "../layout"
import { ResourceTable, type TableColumn } from "../resource-table"

interface ParameterListProps {
  parameters: ParameterSummary[]
}

const columns: TableColumn<ParameterSummary>[] = [
  {
    label: "Name",
    cell: (parameter) => (
      <a href={`/ssm/${encodeResourceName(parameter.name)}`} safe>
        {parameter.name}
      </a>
    ),
  },
  { label: "Type", text: (parameter) => parameter.type },
  { label: "Tier", text: (parameter) => parameter.tier },
  {
    label: "更新日時",
    text: (parameter) => formatDate(parameter.lastModifiedDate),
  },
]

export function ParameterList({ parameters }: ParameterListProps) {
  return (
    <Layout
      title="SSM Parameters"
      active="ssm"
      crumbs={[{ label: "SSM", href: "/ssm" }]}
    >
      <section class="page-header page-header--row">
        <h1 class="page-title">SSM Parameters</h1>
        <a href="/ssm/new" class="btn btn--primary btn--sm">
          {IconPlus}Parameter を作成
        </a>
      </section>

      <ResourceTable
        items={parameters}
        columns={columns}
        resourceLabel="Parameter"
        filterText={(parameter) =>
          `${parameter.name} ${parameter.type} ${parameter.tier}`
        }
        actions={(parameter) => {
          const path = `/ssm/${encodeResourceName(parameter.name)}`
          return (
            <>
              <a href={`${path}/edit`} class="btn btn--ghost btn--sm">
                {IconEdit}編集
              </a>
              <button
                type="button"
                class="btn btn--danger-ghost btn--sm"
                data-floci-delete-trigger=""
                data-resource-name={escapeHtml(parameter.name)}
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
