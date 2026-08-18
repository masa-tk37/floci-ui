import type { AttributeValue } from "@aws-sdk/client-dynamodb"
import { NumberValueImpl, unmarshall } from "@aws-sdk/util-dynamodb"

/**
 * DynamoDB types that cannot survive a JSON edit round-trip: they normalize to
 * a string or array for display, and marshalling that back would rewrite the
 * attribute as S or L.
 */
const LOSSY_TYPES = ["B", "BS", "SS", "NS"] as const

export function normalizeItem(
  item: Record<string, AttributeValue>,
): Record<string, unknown> {
  return normalizeValue(unmarshall(item, { wrapNumbers: true })) as Record<
    string,
    unknown
  >
}

function normalizeValue(value: unknown): unknown {
  if (value instanceof Uint8Array) return Buffer.from(value).toString("base64")
  if (value instanceof NumberValueImpl) return normalizeNumber(value.value)
  if (value instanceof Set) return Array.from(value, normalizeValue)
  if (Array.isArray(value)) return value.map(normalizeValue)
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, v]) => [key, normalizeValue(v)]),
    )
  }
  return value
}

function roundTripsAsNumber(raw: string): boolean {
  const asNumber = Number(raw)
  return Number.isFinite(asNumber) && String(asNumber) === raw
}

/**
 * Keeps the canonical decimal string whenever a JS number would not reproduce
 * it exactly, so 38-digit DynamoDB numbers are displayed rather than rounded.
 */
function normalizeNumber(raw: string): number | string {
  return roundTripsAsNumber(raw) ? Number(raw) : raw
}

export function findLossyAttributes(
  item: Record<string, AttributeValue>,
): string[] {
  return Object.entries(item)
    .filter(([, value]) => hasLossyType(value))
    .map(([name]) => name)
}

function hasLossyType(value: AttributeValue): boolean {
  if (LOSSY_TYPES.some((type) => type in value)) return true
  // A number normalizeNumber had to keep as a string comes back from the editor
  // as a JSON string, which marshals to S.
  if ("N" in value && value.N !== undefined) return !roundTripsAsNumber(value.N)
  if ("M" in value && value.M) return Object.values(value.M).some(hasLossyType)
  if ("L" in value && value.L) return value.L.some(hasLossyType)
  return false
}
