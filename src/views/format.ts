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

export function formatJsonValue(value: string): string {
  if (!value) return value
  try {
    return JSON.stringify(JSON.parse(value), null, 2)
  } catch {
    return value
  }
}
