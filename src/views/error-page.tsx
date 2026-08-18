import { Html } from "@elysiajs/html"
import { Layout, type Service } from "./layout"

const SERVICE_LABELS: Record<Service, string> = {
  dashboard: "ダッシュボード",
  dynamodb: "DynamoDB",
  s3: "S3",
  sqs: "SQS",
  ssm: "SSM",
  secrets: "Secrets Manager",
  cognito: "Cognito",
}

export interface ErrorPageProps {
  service?: Service
  status: number
  message: string
  awsCode?: string
  endpoint: string
  path: string
}

/**
 * Socket-level failures — the only ones that actually mean the emulator is not
 * answering. An SDK exception name means floci replied and rejected the call.
 */
const UNREACHABLE_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENOTFOUND",
  "EPIPE",
  "ETIMEDOUT",
  "TimeoutError",
])

export function serviceFromPath(pathname: string): Service | undefined {
  const segment = pathname.split("/")[1]
  if (!segment) return "dashboard"
  return Object.hasOwn(SERVICE_LABELS, segment)
    ? (segment as Service)
    : undefined
}

/**
 * Rendered inside Layout so the sidebar survives the failure and the user can
 * navigate away instead of landing on a bare framework 500.
 */
export function ErrorPage({
  service,
  status,
  message,
  awsCode,
  endpoint,
  path,
}: ErrorPageProps) {
  const target = service ? SERVICE_LABELS[service] : "リクエスト"
  const unreachable =
    status >= 500 && (awsCode === undefined || UNREACHABLE_CODES.has(awsCode))

  return (
    <Layout
      title={`エラー — ${target}`}
      active={service}
      stylesheets={["/public/styles/views/error-page.css"]}
    >
      <section class="error-page">
        <p class="error-page__eyebrow">{status === 404 ? "404" : "エラー"}</p>
        <h1 class="error-page__title" safe>
          {`${target} の読み込みに失敗した`}
        </h1>
        {unreachable ? (
          <p class="error-page__hint">
            floci が起動していない可能性がある。
            <code class="error-page__code" safe>
              docker compose up
            </code>
            で起動しているか、下のエンドポイントが正しいかを確認する。
          </p>
        ) : null}

        <dl class="error-page__facts">
          <dt>エンドポイント</dt>
          <dd>
            <code class="error-page__code" safe>
              {endpoint}
            </code>
          </dd>
          {awsCode ? (
            <>
              <dt>エラー種別</dt>
              <dd>
                <code class="error-page__code" safe>
                  {awsCode}
                </code>
              </dd>
            </>
          ) : null}
          <dt>詳細</dt>
          <dd class="error-page__message" safe>
            {message}
          </dd>
        </dl>

        <div class="error-page__actions">
          <a class="btn btn--primary" href={path}>
            再試行
          </a>
          <a class="btn btn--ghost" href="/">
            ダッシュボードへ
          </a>
        </div>
      </section>
    </Layout>
  )
}

export function renderErrorPage(props: ErrorPageProps): string {
  return `<!DOCTYPE html>${ErrorPage(props)}`
}
