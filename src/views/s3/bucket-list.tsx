import { Html } from "@elysiajs/html"

import { Layout, type SidebarCounts } from "../layout"
import { IconSettings, IconTrash, IconPlus } from "../icons"

interface Bucket {
  Name?: string
}

interface BucketListProps {
  buckets: Bucket[]
  sidebarCounts?: SidebarCounts
}

export function BucketList({ buckets, sidebarCounts }: BucketListProps) {
  return (
    <Layout
      title="S3 Buckets"
      active="s3"
      crumbs={[{ label: "S3", href: "/s3" }]}
      sidebarCounts={sidebarCounts}
    >
      <section class="page-header page-header--row">
        <h1 class="page-title">S3 Buckets</h1>
        <a href="/s3/new" class="btn btn--s3 btn--sm">
          {IconPlus}Bucket を作成
        </a>
      </section>

      {buckets.length === 0 ? (
        <p class="empty-state">まだ Bucket がありません</p>
      ) : (
        <>
          <p class="list-count">{buckets.length} 件の Bucket</p>
          <div class="data-table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Bucket 名</th>
                  <th class="data-table__actions">操作</th>
                </tr>
              </thead>
              <tbody>
                {buckets.map((bucket) => {
                  const name = bucket.Name ?? ""
                  return (
                    <tr>
                      <td>
                        <a href={`/s3/${encodeURIComponent(name)}`} safe>
                          {name}
                        </a>
                      </td>
                      <td class="data-table__actions">
                        <a
                          href={`/s3/${encodeURIComponent(name)}/settings`}
                          class="btn btn--ghost btn--sm"
                        >
                          {IconSettings}設定
                        </a>
                        <button
                          type="button"
                          class="btn btn--danger-ghost btn--sm"
                          data-resource-name={name}
                          data-delete-url={`/s3/${encodeURIComponent(name)}`}
                          data-on-success="reload"
                          x-data
                          {...{
                            "x-on:click": `$dispatch('open-delete-modal', {
                              resourceName: $el.dataset.resourceName,
                              deleteUrl: $el.dataset.deleteUrl,
                              onSuccess: $el.dataset.onSuccess
                            })`,
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
