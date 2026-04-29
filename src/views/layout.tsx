import { Html } from "@elysiajs/html"

import { Sidebar } from "./sidebar"

type Service =
  | "dashboard"
  | "dynamodb"
  | "s3"
  | "sqs"
  | "ssm"
  | "secrets"
  | "cognito"

export interface Crumb {
  label: string
  href: string
}

export interface SidebarCounts {
  tables: number
  buckets: number
  queues: number
  parameters: number
  secrets: number
  userPools: number
}

/** A script tag specification. Use the object form to add SRI integrity or module type. */
export type ScriptSpec =
  | string
  | { src: string; integrity?: string; module?: boolean }

interface LayoutProps {
  title: string
  active?: Service
  crumbs?: Crumb[]
  sidebarCounts?: SidebarCounts
  mainClass?: string
  contentClass?: string
  stylesheets?: string[]
  scripts?: ScriptSpec[]
  /**
   * Raw inline script bodies. Each string is placed verbatim inside a
   * <script> tag. SECURITY: strings MUST be static templates with no
   * untrusted-data interpolation. Use jsonForScript() for any runtime values.
   */
  inlineScripts?: string[]
  children: JSX.Element | JSX.Element[] | string
}

const toastScript = `
function toast() {
  return {
    items: [],
    nextId: 1,
    push({ kind, message, timeout }) {
      const id = this.nextId++
      this.items.push({ id, kind: kind || 'success', message: message || '' })
      const ms = typeof timeout === 'number' ? timeout : 5000
      if (ms > 0) {
        setTimeout(() => this.dismiss(id), ms)
      }
    },
    dismiss(id) {
      this.items = this.items.filter((it) => it.id !== id)
    },
  }
}
`

const deleteModalScript = `
function deleteModal() {
  return {
    isOpen: false,
    resourceName: '',
    detailText: '',
    deleteUrl: '',
    method: 'DELETE',
    body: '',
    contentType: '',
    onSuccess: 'reload',
    redirectUrl: '',
    rowEl: null,
    loading: false,
    error: '',

    open({ resourceName, detailText, deleteUrl, method, body, contentType, onSuccess, redirectUrl, rowEl }) {
      this.resourceName = resourceName
      this.detailText = detailText || ''
      this.deleteUrl = deleteUrl
      this.method = method || 'DELETE'
      this.body = body || ''
      this.contentType = contentType || ''
      this.onSuccess = onSuccess || 'reload'
      this.redirectUrl = redirectUrl || ''
      this.rowEl = rowEl || null
      this.error = ''
      this.loading = false
      this.isOpen = true
    },

    cancel() {
      if (this.loading) return
      this.isOpen = false
    },

    async confirm() {
      this.loading = true
      this.error = ''
      try {
        const options = { method: this.method }
        if (this.body) {
          options.body = this.body
          if (this.contentType) {
            options.headers = { 'Content-Type': this.contentType }
          }
        }
        const res = await fetch(this.deleteUrl, options)
        let data = null
        try {
          data = await res.json()
        } catch (_) {
          data = null
        }
        if (!res.ok || data?.error) {
          this.error = data?.error || ('エラーが発生しました (HTTP ' + res.status + ')')
          this.loading = false
          return
        }
        this.isOpen = false
        if (this.redirectUrl) {
          location.href = this.redirectUrl
        } else if (this.onSuccess === 'remove-row' && this.rowEl) {
          this.rowEl.remove()
        } else {
          location.reload()
        }
      } catch (e) {
        this.error = 'ネットワークエラーが発生しました'
        this.loading = false
      }
    },
  }
}
`

const listFilterScript = `
function listFilter() {
  return {
    query: '',
    visibleCount: 0,
    get normalizedQuery() {
      return this.query.trim().toLowerCase()
    },
    get hasQuery() {
      return this.normalizedQuery.length > 0
    },
    matches(value) {
      if (!this.hasQuery) return true
      return String(value || '').toLowerCase().includes(this.normalizedQuery)
    },
    update() {
      const q = this.normalizedQuery
      this.$nextTick(() => {
        const rows = Array.from(this.$root.querySelectorAll('[data-filter-text]'))
        this.visibleCount = rows.filter((row) => String(row.dataset.filterText || '').toLowerCase().includes(q)).length
      })
    },
  }
}
`

export function Layout({
  title,
  active,
  crumbs,
  sidebarCounts,
  mainClass,
  contentClass,
  stylesheets,
  scripts,
  inlineScripts,
  children,
}: LayoutProps) {
  return (
    <html lang="ja">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title} — floci-ui</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossorigin=""
        />
        <link
          href="https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
        <link rel="stylesheet" href="/public/style.css" />
        {stylesheets?.map((href) => (
          <link rel="stylesheet" href={href} />
        ))}
        <script
          defer
          src="https://cdn.jsdelivr.net/npm/alpinejs@3/dist/cdn.min.js"
        />
        {scripts?.map((spec) => {
          if (typeof spec === "string") {
            return <script defer src={spec} />
          }
          const sri = spec.integrity
            ? { integrity: spec.integrity, crossorigin: "anonymous" }
            : {}
          return spec.module ? (
            <script type="module" src={spec.src} {...sri} />
          ) : (
            <script defer src={spec.src} {...sri} />
          )
        })}
      </head>
      <body class="app" data-service={active}>
        <Sidebar active={active} counts={sidebarCounts} />
        <div class={mainClass ? `main ${mainClass}` : "main"}>
          <header class="toolbar">
            {crumbs && crumbs.length > 0 ? (
              <nav class="toolbar__breadcrumb">
                {crumbs.map((crumb, i) => (
                  <>
                    {i > 0 ? <span class="breadcrumb__sep">/</span> : null}
                    <a href={crumb.href} class="breadcrumb__link" safe>
                      {crumb.label}
                    </a>
                  </>
                ))}
              </nav>
            ) : (
              <div class="toolbar__spacer" />
            )}
          </header>
          <main class={contentClass ? `content ${contentClass}` : "content"}>
            {children}
          </main>
        </div>
        <div
          x-data="deleteModal()"
          {...{ "x-on:open-delete-modal.window": "open($event.detail)" }}
          x-cloak
        >
          <div
            x-show="isOpen"
            class="modal-overlay"
            {...{ "x-on:click": "cancel()" }}
          >
            <div class="modal" {...{ "x-on:click.stop": "" }}>
              <h2 class="modal__title">削除の確認</h2>
              <p class="modal__body">
                <strong x-text="resourceName" />{" "}
                を削除しますか？この操作は取り消せません。
              </p>
              <p
                class="modal__body modal__body--muted"
                x-show="detailText"
                x-cloak
              >
                <span x-text="detailText" />
              </p>
              <div class="modal__error error-inline" x-show="error" x-cloak="">
                <span x-text="error" />
              </div>
              <div class="modal__actions">
                <button
                  class="btn btn--danger"
                  {...{ "x-on:click": "confirm()" }}
                  {...{ "x-bind:disabled": "loading" }}
                >
                  <span x-show="!loading">削除</span>
                  <span x-show="loading">削除中…</span>
                </button>
                <button
                  class="btn btn--ghost"
                  {...{ "x-on:click": "cancel()" }}
                  {...{ "x-bind:disabled": "loading" }}
                >
                  キャンセル
                </button>
              </div>
            </div>
          </div>
        </div>
        <div
          class="toast-stack"
          x-data="toast()"
          {...{ "x-on:floci:toast.window": "push($event.detail)" }}
          x-cloak
        >
          <template x-for="item in items" {...{ ":key": "item.id" }}>
            <div class="toast" {...{ ":class": "'toast--' + item.kind" }}>
              <span class="toast__message" x-text="item.message" />
              <button
                type="button"
                class="toast__close"
                aria-label="閉じる"
                {...{ "@click": "dismiss(item.id)" }}
              >
                ✕
              </button>
            </div>
          </template>
        </div>
        <script>{toastScript}</script>
        <script>{deleteModalScript}</script>
        <script>{listFilterScript}</script>
        {inlineScripts?.map((script) => (
          <script>{script}</script>
        ))}
      </body>
    </html>
  )
}
