import { Html } from "@elysiajs/html"

import { Layout, type Service } from "./layout"

interface ServiceStatus {
  count: number
  error?: string
}

type ServiceKey = Exclude<Service, "dashboard">

interface DashboardProps {
  dynamodb: ServiceStatus
  s3: ServiceStatus
  sqs: ServiceStatus
  ssm: ServiceStatus
  secrets: ServiceStatus
  cognito: ServiceStatus
  endpoint: string
}

const SERVICE_CARDS: { service: ServiceKey; title: string }[] = [
  { service: "dynamodb", title: "DynamoDB Tables" },
  { service: "s3", title: "S3 Buckets" },
  { service: "sqs", title: "SQS Queues" },
  { service: "ssm", title: "SSM Parameters" },
  { service: "secrets", title: "Secrets Manager" },
  { service: "cognito", title: "Cognito User Pools" },
]

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

export function Dashboard({ endpoint, ...statuses }: DashboardProps) {
  // One service answering proves the endpoint is reachable; a single failing
  // card is a per-service error, shown on its own pill.
  const online = SERVICE_CARDS.some(({ service }) => !statuses[service].error)
  const healthClass = online ? "health-dot--online" : "health-dot--offline"
  const healthLabel = online ? "オンライン" : "オフライン"

  return (
    <Layout title="Dashboard" active="dashboard">
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

        <div class="service-grid l--grid">
          {SERVICE_CARDS.map(({ service, title }) => (
            <ServiceCard
              title={title}
              service={service}
              status={statuses[service]}
            />
          ))}
        </div>
      </div>
    </Layout>
  )
}
