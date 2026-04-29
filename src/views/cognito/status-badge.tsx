import { Html } from "@elysiajs/html"

function statusTone(status: string | undefined): string {
  const normalized = (status ?? "").toLowerCase()
  if (normalized === "confirmed") {
    return "success"
  }
  if (
    normalized.includes("force") ||
    normalized.includes("reset") ||
    normalized.includes("unconfirmed")
  ) {
    return "warning"
  }
  if (normalized === "disabled") {
    return "muted"
  }
  return "neutral"
}

export function CognitoStatusBadge({ status }: { status?: string }) {
  const label = status || "—"
  const tone = statusTone(status)
  return (
    <span class={`status-pill status-pill--${tone}`}>
      <span class="status-pill__dot" />
      <span safe>{label}</span>
    </span>
  )
}

export function EnabledBadge({ enabled }: { enabled: boolean }) {
  return (
    <span
      class={`status-pill ${enabled ? "status-pill--success" : "status-pill--muted"}`}
    >
      <span class="status-pill__dot" />
      {enabled ? "有効" : "無効"}
    </span>
  )
}
