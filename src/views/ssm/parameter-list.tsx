import { Html } from "@elysiajs/html"

import { encodeResourceName } from "../../infrastructure/resource-name-codec"
import type { ParameterSummary } from "../../services/ssm/parameter-service"
import { formatDate } from "../format"
import { IconEdit, IconPlus, IconTrash } from "../icons"
import { Layout, type SidebarCounts } from "../layout"

interface ParameterListProps {
  parameters: ParameterSummary[]
  sidebarCounts?: SidebarCounts
}

export function ParameterList({
  parameters,
  sidebarCounts,
}: ParameterListProps) {
  return (
    <Layout
      title="SSM Parameters"
      active="ssm"
      crumbs={[{ label: "SSM", href: "/ssm" }]}
      sidebarCounts={sidebarCounts}
    >
      <section class="page-header page-header--row">
        <h1 class="page-title">SSM Parameters</h1>
        <a href="/ssm/new" class="btn btn--ssm btn--sm">
          {IconPlus}Parameter を作成
        </a>
      </section>

      {parameters.length === 0 ? (
        <p class="empty-state">まだ Parameter がありません</p>
      ) : (
        <>
          <p class="list-count">{parameters.length} 件の Parameter</p>
          <div class="data-table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Tier</th>
                  <th>更新日時</th>
                  <th class="data-table__actions">操作</th>
                </tr>
              </thead>
              <tbody>
                {parameters.map((parameter) => {
                  const id = encodeResourceName(parameter.name)
                  const path = `/ssm/${id}`
                  return (
                    <tr>
                      <td>
                        <a href={path} safe>
                          {parameter.name}
                        </a>
                      </td>
                      <td>{parameter.type}</td>
                      <td>{parameter.tier}</td>
                      <td>{formatDate(parameter.lastModifiedDate)}</td>
                      <td class="data-table__actions">
                        <a href={`${path}/edit`} class="btn btn--ghost btn--sm">
                          {IconEdit}編集
                        </a>
                        <button
                          type="button"
                          class="btn btn--danger-ghost btn--sm"
                          data-resource-name={parameter.name}
                          data-delete-url={path}
                          x-data
                          {...{
                            "x-on:click":
                              "$dispatch('open-delete-modal', { resourceName: $el.dataset.resourceName, deleteUrl: $el.dataset.deleteUrl, onSuccess: 'reload' })",
                          }}
                        >
                          {IconTrash}削除
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
    </Layout>
  )
}
