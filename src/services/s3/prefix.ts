/** Pure so the browser bundle can share the server's prefix rules. */
export function normalizePrefix(prefix: string): string {
  const trimmed = prefix.trim().replace(/^\/+/, "")
  if (!trimmed) return ""
  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`
}
