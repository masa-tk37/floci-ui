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
        <script>
          {
            "(function(){try{var s=localStorage.getItem('theme');var d=(s==='light'||s==='dark')?s:(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.setAttribute('data-theme',d);}catch(e){}})();"
          }
        </script>
        <title safe>{title} — floci-ui</title>
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
            <button
              type="button"
              class="theme-toggle"
              aria-label="テーマを切り替え"
              title="テーマを切り替え"
              {...mountComponentAttrs("theme-toggle")}
              {...{ "x-on:click": "toggle()" }}
            >
              <svg
                class="theme-toggle__icon"
                aria-hidden="true"
                focusable="false"
                x-show="!isDark"
                x-cloak
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
              </svg>
              <svg
                class="theme-toggle__icon"
                aria-hidden="true"
                focusable="false"
                x-show="isDark"
                x-cloak
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            </button>
          </header>
          <main class={contentClass ? `content ${contentClass}` : "content"}>
            {children}
          </main>
        </div>
        <div
          {...mountComponentAttrs("delete-modal")}
          {...{ "x-on:open-delete-modal.window": "open($event.detail)" }}
          {...{ "@keydown.escape.window": "cancel()" }}
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
