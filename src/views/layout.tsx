import { Html } from "@elysiajs/html"
import { mountComponentAttrs } from "./client"
import { Modal } from "./modal"
import { Sidebar } from "./sidebar"

export type Service =
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

interface LayoutProps {
  title: string
  active?: Service
  crumbs?: Crumb[]
  contentMode?: "standard" | "form" | "workspace" | "narrow"
  children: JSX.Element | JSX.Element[] | string
}

export function Layout({
  title,
  active,
  crumbs,
  contentMode = "standard",
  children,
}: LayoutProps) {
  const workspace = contentMode === "workspace"

  return (
    <html lang="ja">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="color-scheme" content="light dark" />
        {/* Inline and right after the meta so a stored override applies before first paint. */}
        <script>
          {
            "try{var s=localStorage.getItem('theme');if(s==='light'||s==='dark')document.querySelector('meta[name=color-scheme]').content=s}catch(e){}"
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
          href="https://fonts.googleapis.com/css2?family=M+PLUS+1:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <link rel="stylesheet" href="/public/assets/lism.css" />
        <link rel="stylesheet" href="/public/assets/app.css" />
        <script type="module" src="/public/assets/app.js" />
      </head>
      <body class="app c--appShell l--flex is--container" data-service={active}>
        <Sidebar active={active} />
        <div
          class={`main c--main l--stack${workspace ? " main--resource-workspace" : ""}`}
        >
          <header class="toolbar c--toolbar l--cluster">
            {crumbs && crumbs.length > 0 ? (
              <nav class="toolbar__breadcrumb l--cluster" aria-label="パンくず">
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
              title="テーマを切り替え"
              {...mountComponentAttrs("theme-toggle")}
              {...{ "x-on:click": "toggle()" }}
            >
              {/* Both states are rendered; CSS shows the one matching the resolved scheme, so it stays correct without JS. */}
              <span class="theme-toggle__option theme-toggle__option--light">
                <svg
                  class="theme-toggle__icon"
                  aria-hidden="true"
                  focusable="false"
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
                <span class="u--srOnly">ダークテーマに切り替え</span>
              </span>
              <span class="theme-toggle__option theme-toggle__option--dark">
                <svg
                  class="theme-toggle__icon"
                  aria-hidden="true"
                  focusable="false"
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
                <span class="u--srOnly">ライトテーマに切り替え</span>
              </span>
            </button>
          </header>
          <main class={`content c--content content--${contentMode}`}>
            {children}
          </main>
        </div>
        <div
          {...mountComponentAttrs("delete-modal")}
          {...{ "x-on:open-delete-modal.window": "open($event.detail)" }}
        >
          <Modal open="isOpen" close="cancel" labelledBy="delete-modal-title">
            <h2 id="delete-modal-title" class="modal__title">
              削除の確認
            </h2>
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
            <div class="modal__actions l--cluster">
              <button
                type="button"
                class="btn btn--danger"
                {...{ "x-on:click": "confirm()" }}
                {...{ "x-bind:disabled": "loading" }}
              >
                <span x-show="!loading">削除</span>
                <span x-show="loading">削除中…</span>
              </button>
              <button
                type="button"
                class="btn btn--ghost"
                autofocus
                {...{ "x-on:click": "cancel()" }}
                {...{ "x-bind:disabled": "loading" }}
              >
                キャンセル
              </button>
            </div>
          </Modal>
        </div>
        <div
          class="toast-stack l--stack"
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
