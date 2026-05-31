import { Html } from "@elysiajs/html"

import { encodeResourceName } from "../infrastructure/resource-name-codec"
import { Layout, type SidebarCounts } from "./layout"

interface ServiceStatus {
  count: number
  items: string[]
  error?: string
}

interface NamedServiceStatus {
  count: number
  items: { id: string; name: string }[]
  error?: string
}

interface DashboardProps {
  dynamodb: ServiceStatus
  s3: ServiceStatus
  sqs: ServiceStatus
  ssm: ServiceStatus
  secrets: ServiceStatus
  cognito: NamedServiceStatus
  endpoint: string
  sidebarCounts?: SidebarCounts
}

function ServiceHealth({ error }: { error?: string }) {
  return (
    <span
      class={`status-pill ${error ? "status-pill--danger" : "status-pill--success"}`}
      title={error ?? "利用可能"}
    >
      <span class="status-pill__dot" />
      {error ? "エラー" : "OK"}
    </span>
  )
}

export function Dashboard({
  dynamodb,
  s3,
  sqs,
  ssm,
  secrets,
  cognito,
  endpoint,
  sidebarCounts,
}: DashboardProps) {
  const online =
    !dynamodb.error &&
    !s3.error &&
    !sqs.error &&
    !ssm.error &&
    !secrets.error &&
    !cognito.error
  const healthClass = online ? "health-dot--online" : "health-dot--offline"
  const healthLabel = online ? "オンライン" : "オフライン"

  return (
    <Layout
      title="Dashboard"
      active="dashboard"
      sidebarCounts={sidebarCounts}
      stylesheets={["/public/styles/views/dashboard.css"]}
    >
      <div class="dashboard-page">
        <div class="dashboard-header">
          <div>
            <h1 class="dashboard-title">floci-ui</h1>
            <p class="dashboard-subtitle">
              <span
                class={`health-dot ${healthClass}`}
                title={healthLabel}
              ></span>
              <span class="endpoint-badge" safe>
                {endpoint}
              </span>
            </p>
          </div>
        </div>

        <h2 class="section-heading">最近のリソース</h2>
        <div class="recent-grid">
          <div class="recent-card recent-card--dynamodb">
            <div class="recent-card__header">
              <h3 class="recent-card__title">DynamoDB Tables</h3>
              <div class="recent-card__actions">
                <ServiceHealth error={dynamodb.error} />
                <span class="badge badge--dynamodb">{dynamodb.count}</span>
              </div>
            </div>
            {dynamodb.error ? (
              <p class="dashboard-page__note muted" safe>
                {dynamodb.error}
              </p>
            ) : dynamodb.items.length === 0 ? (
              <p class="dashboard-page__note muted">まだテーブルがありません</p>
            ) : (
              <div>
                {dynamodb.items.map((name) => (
                  <div class="recent-item">
                    <a
                      href={`/dynamodb/${encodeURIComponent(name)}`}
                      class="recent-item__name"
                      safe
                    >
                      {name}
                    </a>
                  </div>
                ))}
                {dynamodb.count > 5 ? (
                  <a href="/dynamodb" class="view-all-link">
                    すべての {dynamodb.count} 件を見る →
                  </a>
                ) : null}
              </div>
            )}
          </div>

          <div class="recent-card recent-card--s3">
            <div class="recent-card__header">
              <h3 class="recent-card__title">S3 Buckets</h3>
              <div class="recent-card__actions">
                <ServiceHealth error={s3.error} />
                <span class="badge badge--s3">{s3.count}</span>
              </div>
            </div>
            {s3.error ? (
              <p class="dashboard-page__note muted" safe>
                {s3.error}
              </p>
            ) : s3.items.length === 0 ? (
              <p class="dashboard-page__note muted">まだ Bucket がありません</p>
            ) : (
              <div>
                {s3.items.map((name) => (
                  <div class="recent-item">
                    <a
                      href={`/s3/${encodeURIComponent(name)}`}
                      class="recent-item__name"
                      safe
                    >
                      {name}
                    </a>
                  </div>
                ))}
                {s3.count > 5 ? (
                  <a href="/s3" class="view-all-link">
                    すべての {s3.count} 件を見る →
                  </a>
                ) : null}
              </div>
            )}
          </div>

          <div class="recent-card recent-card--sqs">
            <div class="recent-card__header">
              <h3 class="recent-card__title">SQS Queues</h3>
              <div class="recent-card__actions">
                <ServiceHealth error={sqs.error} />
                <span class="badge badge--sqs">{sqs.count}</span>
              </div>
            </div>
            {sqs.error ? (
              <p class="dashboard-page__note muted" safe>
                {sqs.error}
              </p>
            ) : sqs.items.length === 0 ? (
              <p class="dashboard-page__note muted">まだ Queue がありません</p>
            ) : (
              <div>
                {sqs.items.map((name) => (
                  <div class="recent-item">
                    <a
                      href={`/sqs/${encodeURIComponent(name)}`}
                      class="recent-item__name"
                      safe
                    >
                      {name}
                    </a>
                  </div>
                ))}
                {sqs.count > 5 ? (
                  <a href="/sqs" class="view-all-link">
                    すべての {sqs.count} 件を見る →
                  </a>
                ) : null}
              </div>
            )}
          </div>

          <div class="recent-card recent-card--ssm">
            <div class="recent-card__header">
              <h3 class="recent-card__title">SSM Parameters</h3>
              <div class="recent-card__actions">
                <ServiceHealth error={ssm.error} />
                <span class="badge badge--ssm">{ssm.count}</span>
              </div>
            </div>
            {ssm.error ? (
              <p class="dashboard-page__note muted" safe>
                {ssm.error}
              </p>
            ) : ssm.items.length === 0 ? (
              <p class="dashboard-page__note muted">
                まだ Parameter がありません
              </p>
            ) : (
              <div>
                {ssm.items.map((name) => (
                  <div class="recent-item">
                    <a
                      href={`/ssm/${encodeResourceName(name)}`}
                      class="recent-item__name"
                      safe
                    >
                      {name}
                    </a>
                  </div>
                ))}
                {ssm.count > 5 ? (
                  <a href="/ssm" class="view-all-link">
                    すべての {ssm.count} 件を見る →
                  </a>
                ) : null}
              </div>
            )}
          </div>

          <div class="recent-card recent-card--secrets">
            <div class="recent-card__header">
              <h3 class="recent-card__title">Secrets Manager</h3>
              <div class="recent-card__actions">
                <ServiceHealth error={secrets.error} />
                <span class="badge badge--secrets">{secrets.count}</span>
              </div>
            </div>
            {secrets.error ? (
              <p class="dashboard-page__note muted" safe>
                {secrets.error}
              </p>
            ) : secrets.items.length === 0 ? (
              <p class="dashboard-page__note muted">まだ Secret がありません</p>
            ) : (
              <div>
                {secrets.items.map((name) => (
                  <div class="recent-item">
                    <a
                      href={`/secrets/${encodeResourceName(name)}`}
                      class="recent-item__name"
                      safe
                    >
                      {name}
                    </a>
                  </div>
                ))}
                {secrets.count > 5 ? (
                  <a href="/secrets" class="view-all-link">
                    すべての {secrets.count} 件を見る →
                  </a>
                ) : null}
              </div>
            )}
          </div>

          <div class="recent-card recent-card--cognito">
            <div class="recent-card__header">
              <h3 class="recent-card__title">Cognito User Pools</h3>
              <div class="recent-card__actions">
                <ServiceHealth error={cognito.error} />
                <span class="badge badge--cognito">{cognito.count}</span>
              </div>
            </div>
            {cognito.error ? (
              <p class="dashboard-page__note muted" safe>
                {cognito.error}
              </p>
            ) : cognito.items.length === 0 ? (
              <p class="dashboard-page__note muted">
                まだ User Pool がありません
              </p>
            ) : (
              <div>
                {cognito.items.map((pool) => (
                  <div class="recent-item">
                    <a
                      href={`/cognito/${encodeURIComponent(pool.id)}`}
                      class="recent-item__name"
                      safe
                    >
                      {pool.name}
                    </a>
                    <span class="recent-item__meta mono" safe>
                      {pool.id}
                    </span>
                  </div>
                ))}
                {cognito.count > 5 ? (
                  <a href="/cognito" class="view-all-link">
                    すべての {cognito.count} 件を見る →
                  </a>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  )
}
