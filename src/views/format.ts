export const PLACEHOLDER = "—"

const dateFormatter = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "medium",
  timeStyle: "short",
})

export function formatDate(date: Date | undefined): string {
  if (!date) return PLACEHOLDER
  return dateFormatter.format(date)
}

const relativeTimeFormatter = new Intl.RelativeTimeFormat("ja-JP", {
  numeric: "auto",
})

const MINUTE = 60_000
const HOUR = 3_600_000
const DAY = 86_400_000
const WEEK = 604_800_000
const MONTH = 2_592_000_000
const YEAR = 31_536_000_000

export function formatRelativeDate(date: Date | undefined): string {
  if (!date) return PLACEHOLDER
  const diff = date.getTime() - Date.now()
  const abs = Math.abs(diff)
  if (abs < MINUTE)
    return relativeTimeFormatter.format(Math.round(diff / 1000), "second")
  if (abs < HOUR)
    return relativeTimeFormatter.format(Math.round(diff / MINUTE), "minute")
  if (abs < DAY)
    return relativeTimeFormatter.format(Math.round(diff / HOUR), "hour")
  if (abs < WEEK)
    return relativeTimeFormatter.format(Math.round(diff / DAY), "day")
  if (abs < MONTH)
    return relativeTimeFormatter.format(Math.round(diff / WEEK), "week")
  if (abs < YEAR)
    return relativeTimeFormatter.format(Math.round(diff / MONTH), "month")
  return relativeTimeFormatter.format(Math.round(diff / YEAR), "year")
}

const KB = 1024
const MB = KB * 1024
const GB = MB * 1024

export function formatBytes(bytes: number | undefined | null): string {
  if (bytes === undefined || bytes === null) return PLACEHOLDER
  if (bytes < KB) return `${bytes} B`
  if (bytes < MB) return `${(bytes / KB).toFixed(1)} KB`
  if (bytes < GB) return `${(bytes / MB).toFixed(1)} MB`
  return `${(bytes / GB).toFixed(2)} GB`
}

// Matches a JSON string literal or a whitespace run outside one.
const JSON_TOKEN_OR_SPACE = /"(?:[^"\\]|\\.)*"|\s+/g

/**
 * Pretty-prints only when re-serializing reproduces the input exactly, so a
 * large integer or rewritten escape is shown as sent rather than as parsed.
 */
export function formatJsonValue(value: string): string {
  if (!value) return value
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    return value
  }
  const compact = value.replace(JSON_TOKEN_OR_SPACE, (match) =>
    match.startsWith('"') ? match : "",
  )
  if (JSON.stringify(parsed) !== compact) return value
  return JSON.stringify(parsed, null, 2)
}
