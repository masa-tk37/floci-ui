import { Html } from "@elysiajs/html"

type Service =
  | "dashboard"
  | "dynamodb"
  | "s3"
  | "sqs"
  | "ssm"
  | "secrets"
  | "cognito"

interface SidebarProps {
  active?: Service
}

export function Sidebar({ active }: SidebarProps) {
  return (
    <aside class="sidebar">
      <a
        href="/"
        class={`sidebar__brand${active === "dashboard" ? " is-active" : ""}`}
      >
        <span class="sidebar__dot sidebar__dot--dashboard" />
        floci-ui
      </a>
      <nav class="sidebar__nav">
        <a
          href="/dynamodb"
          class={`sidebar__section-header${active === "dynamodb" ? " is-active" : ""}`}
        >
          <span class="sidebar__dot sidebar__dot--dynamodb" />
          <span class="sidebar__section-label">DynamoDB</span>
        </a>
        <a
          href="/s3"
          class={`sidebar__section-header${active === "s3" ? " is-active" : ""}`}
        >
          <span class="sidebar__dot sidebar__dot--s3" />
          <span class="sidebar__section-label">S3</span>
        </a>
        <a
          href="/sqs"
          class={`sidebar__section-header${active === "sqs" ? " is-active" : ""}`}
        >
          <span class="sidebar__dot sidebar__dot--sqs" />
          <span class="sidebar__section-label">SQS</span>
        </a>
        <a
          href="/ssm"
          class={`sidebar__section-header${active === "ssm" ? " is-active" : ""}`}
        >
          <span class="sidebar__dot sidebar__dot--ssm" />
          <span class="sidebar__section-label">SSM</span>
        </a>
        <a
          href="/secrets"
          class={`sidebar__section-header${active === "secrets" ? " is-active" : ""}`}
        >
          <span class="sidebar__dot sidebar__dot--secrets" />
          <span class="sidebar__section-label">Secrets</span>
        </a>
        <a
          href="/cognito"
          class={`sidebar__section-header${active === "cognito" ? " is-active" : ""}`}
        >
          <span class="sidebar__dot sidebar__dot--cognito" />
          <span class="sidebar__section-label">Cognito</span>
        </a>
      </nav>
    </aside>
  )
}
