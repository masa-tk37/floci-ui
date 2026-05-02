import { Html } from "@elysiajs/html"

import { ClientProps, mountComponentAttrs } from "../client"
import { Layout, type SidebarCounts } from "../layout"

type PreviewMode = "text" | "image" | "pdf" | "binary"

interface PreviewProps {
  bucket: string
  objectKey: string
  contentType: string
  mode: PreviewMode
  text?: string
  truncated?: boolean
  sidebarCounts?: SidebarCounts
}

function parentPrefix(key: string): string {
  const idx = key.lastIndexOf("/")
  return idx === -1 ? "" : key.slice(0, idx + 1)
}

export function Preview({
  bucket,
  objectKey,
  contentType,
  mode,
  text,
  truncated,
  sidebarCounts,
}: PreviewProps) {
  const bucketPath = `/s3/${encodeURIComponent(bucket)}`
  const parent = parentPrefix(objectKey)
  const backHref = parent
    ? `${bucketPath}?prefix=${encodeURIComponent(parent)}`
    : bucketPath
  const downloadHref = `${bucketPath}/download?key=${encodeURIComponent(objectKey)}`

  return (
    <Layout
      title={`Preview · ${objectKey}`}
      active="s3"
      sidebarCounts={sidebarCounts}
      crumbs={[
        { label: "S3", href: "/s3" },
        { label: bucket, href: bucketPath },
        ...(parent
          ? [
              {
                label: parent.replace(/\/$/, "").split("/").pop() ?? parent,
                href: backHref,
              },
            ]
          : []),
        { label: objectKey.split("/").pop() ?? objectKey, href: "#" },
      ]}
      stylesheets={["/public/styles/views/s3/preview.css"]}
    >
      <div class="s3-preview-page" {...mountComponentAttrs("s3-preview")}>
        <ClientProps props={{ downloadHref, mode }} />
        <section class="page-header page-header--row">
          <div>
            <h1 class="page-title">
              <span safe>{objectKey}</span>
            </h1>
            <p class="page-subtitle">
              <span class="pill pill--s3" safe>
                {contentType || "application/octet-stream"}
              </span>
            </p>
          </div>
          <div class="page-header__actions">
            <a href={backHref} class="btn btn--ghost btn--sm">
              戻る
            </a>
            <a href={downloadHref} class="btn btn--ghost btn--sm">
              ダウンロード
            </a>
          </div>
        </section>

        {mode === "text" && (
          <>
            {truncated && (
              <p class="s3-preview-page__notice s3-preview-page__notice--warning">
                File truncated to 50KB. Use Download for the full contents.
              </p>
            )}
            <pre
              class="s3-preview-page__panel s3-preview-page__panel--text"
              safe
            >
              {text ?? ""}
            </pre>
          </>
        )}

        {mode === "image" && (
          <div class="s3-preview-page__panel s3-preview-page__panel--image">
            <img
              src={downloadHref}
              alt={objectKey}
              class="s3-preview-page__img"
            />
          </div>
        )}

        {mode === "pdf" && (
          <div class="s3-preview-page__panel s3-preview-page__panel--pdf">
            <p id="pdf-preview-status" class="s3-preview-page__pdf-status">
              PDF を読み込んでいます…
            </p>
            <div id="pdf-preview-pages" class="s3-preview-page__pdf-pages" />
          </div>
        )}

        {mode === "binary" && (
          <div class="s3-preview-page__panel s3-preview-page__panel--binary">
            <p>Binary file — no inline preview available.</p>
          </div>
        )}
      </div>
    </Layout>
  )
}
