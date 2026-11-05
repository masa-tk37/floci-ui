/**
 * Pure so the browser bundle can share the server's prefix rules.
 * Leading slashes and surrounding whitespace are valid key characters, so they are kept.
 */
export function normalizePrefix(prefix: string): string {
  if (!prefix) return ""
  return prefix.endsWith("/") ? prefix : `${prefix}/`
}
