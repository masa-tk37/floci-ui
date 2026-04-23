const dateFormatter = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "medium",
  timeStyle: "short",
})

export function formatDate(date: Date | undefined): string {
  if (!date) return "—"
  return dateFormatter.format(date)
}
