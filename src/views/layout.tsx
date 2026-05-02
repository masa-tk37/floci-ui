import { Html } from "@elysiajs/html"

import { Sidebar } from "./sidebar"
import { mountComponentAttrs } from "./client"

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

interface LayoutProps {
  title: string
  active?: Service
  crumbs?: Crumb[]
  sidebarCounts?: SidebarCounts
  mainClass?: string
  contentClass?: string
  stylesheets?: string[]
  children: JSX.Element | JSX.Element[] | string
}

export function Layout({
  title,
  active,
  crumbs,
  sidebarCounts,
  mainClass,
  contentClass,
  stylesheets,
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
        <link rel="stylesheet" href="/public/styles/app.css" />
        {stylesheets?.map((href) => (
          <link rel="stylesheet" href={href} />
        ))}
        <script type="module" src="/public/assets/app.js" />
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
          {...mountComponentAttrs("delete-modal")}
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
          {...mountComponentAttrs("toast")}
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
      </body>
    </html>
  )
}
