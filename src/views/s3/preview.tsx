import { Html } from "@elysiajs/html"

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

const PDF_JS_URL =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"
const PDF_JS_INTEGRITY =
  "sha384-/1qUCSGwTur9vjf/z9lmu/eCUYbpOTgSjmpbMQZ1/CtX2v/WcAIKqRv+U1DUCG6e"
const PDF_WORKER_URL =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"

function makePdfPreviewScript(downloadHref: string): string {
  return `
window.addEventListener('load', async () => {
  const statusEl = document.getElementById('pdf-preview-status')
  const pagesEl = document.getElementById('pdf-preview-pages')

  if (!statusEl || !pagesEl) return

  try {
    if (!window.pdfjsLib) {
      throw new Error('pdf.js failed to load')
    }

    window.pdfjsLib.GlobalWorkerOptions.workerSrc = ${JSON.stringify(PDF_WORKER_URL)}

    const pdf = await window.pdfjsLib.getDocument(${JSON.stringify(downloadHref)}).promise
    statusEl.textContent = pdf.numPages + ' ページを読み込みました'

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const viewport = page.getViewport({ scale: 1.25 })
      const canvas = document.createElement('canvas')
      const context = canvas.getContext('2d')

      if (!context) {
        throw new Error('Canvas rendering is unavailable')
      }

      canvas.width = viewport.width
      canvas.height = viewport.height
      canvas.className = 's3-preview-page__pdf-page'

      const section = document.createElement('section')
      section.className = 's3-preview-page__pdf-sheet'

      const label = document.createElement('p')
      label.className = 's3-preview-page__pdf-label'
      label.textContent = 'Page ' + pageNumber

      section.appendChild(label)
      section.appendChild(canvas)
      pagesEl.appendChild(section)

      await page.render({ canvasContext: context, viewport }).promise
    }
  } catch (error) {
    statusEl.textContent =
      (error && error.message) || 'PDF をプレビューできませんでした'
    statusEl.classList.add('s3-preview-page__pdf-status--error')
  }
})
`
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
  const inlineScripts =
    mode === "pdf" ? [makePdfPreviewScript(downloadHref)] : undefined

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
      scripts={
        mode === "pdf"
          ? [{ src: PDF_JS_URL, integrity: PDF_JS_INTEGRITY }]
          : undefined
      }
      inlineScripts={inlineScripts}
    >
      <div class="s3-preview-page">
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
