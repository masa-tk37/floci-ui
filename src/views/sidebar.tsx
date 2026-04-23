import { Html } from "@elysiajs/html"

import type { SidebarCounts } from "./layout"

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
  counts?: SidebarCounts
}

export function Sidebar({ active, counts }: SidebarProps) {
  return (
    <aside class="sidebar">
      <a
        href="/"
        class={`sidebar__brand${active === "dashboard" ? " is-active" : ""}`}
      >
        floci-ui
      </a>
      <nav class="sidebar__nav">
        <a
          href="/dynamodb"
          class={`sidebar__section-header${active === "dynamodb" ? " is-active" : ""}`}
        >
          <span class="sidebar__dot sidebar__dot--dynamodb" />
          <span class="sidebar__section-label">DynamoDB</span>
          {counts !== undefined ? (
            <span class="sidebar__badge sidebar__badge--dynamodb">
              {counts.tables}
            </span>
          ) : null}
        </a>
        <a
          href="/s3"
          class={`sidebar__section-header${active === "s3" ? " is-active" : ""}`}
        >
          <span class="sidebar__dot sidebar__dot--s3" />
          <span class="sidebar__section-label">S3</span>
          {counts !== undefined ? (
            <span class="sidebar__badge sidebar__badge--s3">
              {counts.buckets}
            </span>
          ) : null}
        </a>
        <a
          href="/sqs"
          class={`sidebar__section-header${active === "sqs" ? " is-active" : ""}`}
        >
          <span class="sidebar__dot sidebar__dot--sqs" />
          <span class="sidebar__section-label">SQS</span>
          {counts !== undefined ? (
            <span class="sidebar__badge sidebar__badge--sqs">
              {counts.queues}
            </span>
          ) : null}
        </a>
        <a
          href="/ssm"
          class={`sidebar__section-header${active === "ssm" ? " is-active" : ""}`}
        >
          <span class="sidebar__dot sidebar__dot--ssm" />
          <span class="sidebar__section-label">SSM</span>
          {counts !== undefined ? (
            <span class="sidebar__badge sidebar__badge--ssm">
              {counts.parameters}
            </span>
          ) : null}
        </a>
        <a
          href="/secrets"
          class={`sidebar__section-header${active === "secrets" ? " is-active" : ""}`}
        >
          <span class="sidebar__dot sidebar__dot--secrets" />
          <span class="sidebar__section-label">Secrets</span>
          {counts !== undefined ? (
            <span class="sidebar__badge sidebar__badge--secrets">
              {counts.secrets}
            </span>
          ) : null}
        </a>
        <a
          href="/cognito"
          class={`sidebar__section-header${active === "cognito" ? " is-active" : ""}`}
        >
          <span class="sidebar__dot sidebar__dot--cognito" />
          <span class="sidebar__section-label">Cognito</span>
          {counts !== undefined ? (
            <span class="sidebar__badge sidebar__badge--cognito">
              {counts.userPools}
            </span>
          ) : null}
        </a>
      </nav>
    </aside>
  )
}
