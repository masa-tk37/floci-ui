import { Html } from "@elysiajs/html"

import { ClientProps, mountComponentAttrs } from "../client"
import { Layout, type SidebarCounts } from "../layout"
import type { UserPoolFormInitial } from "./pool-form-state"

interface UserPoolFormProps {
  init: UserPoolFormInitial
  sidebarCounts?: SidebarCounts
}

export function UserPoolForm({ init, sidebarCounts }: UserPoolFormProps) {
  return (
    <Layout
      title="User Pool を作成"
      active="cognito"
      sidebarCounts={sidebarCounts}
      stylesheets={["/public/styles/views/cognito/pool-form.css"]}
      crumbs={[
        { label: "Cognito", href: "/cognito" },
        { label: "User Pool を作成", href: "/cognito/new" },
      ]}
    >
      <div class="cognito-form-page">
        <section class="page-header">
          <h1 class="page-title">User Pool を作成</h1>
          <p class="page-subtitle">新しい Cognito User Pool を設定します。</p>
        </section>

        <div {...mountComponentAttrs("user-pool-form")}>
          <ClientProps props={init} />
          <div class="query-form">
            <h2 class="section-title">基本設定</h2>
            <div class="cognito-form-page__grid">
              <div class="form-row">
                <label class="form-label" for="cognito-pool-name">
                  Pool 名
                </label>
                <input
                  id="cognito-pool-name"
                  type="text"
                  class="input"
                  x-model="name"
                  placeholder="local-dev-users"
                />
              </div>

              <div class="form-row">
                <label class="form-label" for="cognito-username-mode">
                  サインイン属性
                </label>
                <select
                  id="cognito-username-mode"
                  class="select"
                  x-model="usernameMode"
                >
                  <option value="username">Username</option>
                  <option value="email">Email</option>
                  <option value="phone_number">Phone Number</option>
                </select>
              </div>
            </div>
          </div>

          <div class="query-form">
            <h2 class="section-title">検証と MFA</h2>

            <div class="cognito-form-page__checkbox-grid">
              <label class="cognito-form-page__checkbox">
                <input type="checkbox" x-model="autoVerifyEmail" />
                <span>
                  <strong>Email を自動検証</strong>
                  <span class="form-help">
                    <code class="code-inline">email</code> 属性を sign-up
                    時に自動検証対象へ含めます。
                  </span>
                </span>
              </label>

              <label class="cognito-form-page__checkbox">
                <input type="checkbox" x-model="autoVerifyPhoneNumber" />
                <span>
                  <strong>Phone Number を自動検証</strong>
                  <span class="form-help">
                    <code class="code-inline">phone_number</code>{" "}
                    属性を自動検証対象へ含めます。
                  </span>
                </span>
              </label>
            </div>

            <div class="form-row cognito-form-page__mfa">
              <label class="form-label" for="cognito-mfa">
                MFA 設定
              </label>
              <select
                id="cognito-mfa"
                class="select"
                x-model="mfaConfiguration"
              >
                <option value="OFF">Off</option>
                <option value="OPTIONAL">Optional</option>
                <option value="ON">Required</option>
              </select>
            </div>
          </div>

          <div class="error-inline" x-show="error" x-cloak>
            <strong>Error:</strong> <span x-text="error" />
          </div>

          <div class="form-actions">
            <button
              type="button"
              class="btn btn--cognito"
              {...{ "@click": "submit()", ":disabled": "submitting || !name" }}
            >
              <span x-show="!submitting">作成</span>
              <span x-show="submitting">作成中…</span>
            </button>
            <a href="/cognito" class="btn btn--ghost">
              キャンセル
            </a>
          </div>
        </div>
      </div>
    </Layout>
  )
}
