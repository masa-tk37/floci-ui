import { Html } from "@elysiajs/html"

import { Layout } from "./layout"

interface ServiceStatus {
  count: number
  error?: string
}

type ServiceKey = "dynamodb" | "s3" | "sqs" | "ssm" | "secrets" | "cognito"

interface DashboardProps {
  dynamodb: ServiceStatus
  s3: ServiceStatus
  sqs: ServiceStatus
  ssm: ServiceStatus
  secrets: ServiceStatus
  cognito: ServiceStatus
  endpoint: string
}

function ServiceCard({
  title,
  service,
  status,
}: {
  title: string
  service: ServiceKey
  status: ServiceStatus
}) {
  return (
    <div class="service-card" data-service={service}>
      <h2 class="service-card__title" safe>
        {title}
      </h2>
      <div class="service-card__status">
        <span
          class={`status-pill ${status.error ? "status-pill--danger" : "status-pill--success"}`}
          title={status.error ?? "利用可能"}
        >
          <span class="status-pill__dot" />
          {status.error ? "エラー" : "OK"}
        </span>
        <span class={`badge badge--${service}`}>{status.count}</span>
      </div>
    </div>
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

        <div class="service-grid">
          <ServiceCard
            title="DynamoDB Tables"
            service="dynamodb"
            status={dynamodb}
          />
          <ServiceCard title="S3 Buckets" service="s3" status={s3} />
          <ServiceCard title="SQS Queues" service="sqs" status={sqs} />
          <ServiceCard title="SSM Parameters" service="ssm" status={ssm} />
          <ServiceCard
            title="Secrets Manager"
            service="secrets"
            status={secrets}
          />
          <ServiceCard
            title="Cognito User Pools"
            service="cognito"
            status={cognito}
          />
        </div>
      </div>
    </Layout>
  )
}
