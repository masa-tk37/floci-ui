import { Html } from "@elysiajs/html"
import type { Service } from "./layout"

const SERVICE_LINKS: { service: Service; label: string }[] = [
  { service: "dynamodb", label: "DynamoDB" },
  { service: "s3", label: "S3" },
  { service: "sqs", label: "SQS" },
  { service: "ssm", label: "SSM" },
  { service: "secrets", label: "Secrets" },
  { service: "cognito", label: "Cognito" },
]

interface SidebarProps {
  active?: Service
}

export function Sidebar({ active }: SidebarProps) {
  return (
    <aside class="sidebar c--sidebar l--stack">
      <a
        href="/"
        class={`sidebar__brand${active === "dashboard" ? " is-active" : ""}`}
      >
        <span class="sidebar__dot sidebar__dot--dashboard" />
        floci-ui
      </a>
      <nav class="sidebar__nav l--stack" aria-label="AWS サービス">
        {SERVICE_LINKS.map(({ service, label }) => (
          <a
            href={`/${service}`}
            class={`sidebar__section-header${active === service ? " is-active" : ""}`}
          >
            <span class={`sidebar__dot sidebar__dot--${service}`} />
            <span class="sidebar__section-label">{label}</span>
          </a>
        ))}
      </nav>
    </aside>
  )
}
