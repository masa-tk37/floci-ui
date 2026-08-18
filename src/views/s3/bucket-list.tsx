import { Html } from "@elysiajs/html"
import { escapeHtml } from "@kitajs/html"
import { IconPlus, IconSettings, IconTrash } from "../icons"
import { Layout } from "../layout"
import { ResourceTable, type TableColumn } from "../resource-table"

interface Bucket {
  Name?: string
}

interface BucketListProps {
  buckets: Bucket[]
}

const bucketName = (bucket: Bucket) => bucket.Name ?? ""

const columns: TableColumn<Bucket>[] = [
  {
    label: "Bucket 名",
    cell: (bucket) => (
      <a href={`/s3/${encodeURIComponent(bucketName(bucket))}`} safe>
        {bucketName(bucket)}
      </a>
    ),
  },
]

export function BucketList({ buckets }: BucketListProps) {
  return (
    <Layout
      title="S3 Buckets"
      active="s3"
      crumbs={[{ label: "S3", href: "/s3" }]}
    >
      <section class="page-header page-header--row">
        <h1 class="page-title">S3 Buckets</h1>
        <a href="/s3/new" class="btn btn--primary btn--sm">
          {IconPlus}Bucket を作成
        </a>
      </section>

      <ResourceTable
        items={buckets}
        columns={columns}
        resourceLabel="Bucket"
        filterText={bucketName}
        actions={(bucket) => (
          <>
            <a
              href={`/s3/${encodeURIComponent(bucketName(bucket))}/settings`}
              class="btn btn--ghost btn--sm"
            >
              {IconSettings}設定
            </a>
            <button
              type="button"
              class="btn btn--danger-ghost btn--sm"
              data-floci-delete-trigger=""
              data-resource-name={escapeHtml(bucketName(bucket))}
              data-delete-url={`/s3/${encodeURIComponent(bucketName(bucket))}`}
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
