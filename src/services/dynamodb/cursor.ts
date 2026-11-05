import type { AttributeValue } from "@aws-sdk/client-dynamodb"
import { ServiceError } from "../../errors"

export function encodeCursor(
  key: Record<string, AttributeValue> | undefined,
): string | undefined {
  if (!key) return undefined
  return Buffer.from(JSON.stringify(key)).toString("base64")
}

function isAttributeValue(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === 1
  )
}

function isKeyMap(value: unknown): value is Record<string, AttributeValue> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false
  }
  const entries = Object.values(value)
  return entries.length > 0 && entries.every(isAttributeValue)
}

/** Throws rather than restarting at page 1, which would desync the page stack. */
export function decodeCursor(
  cursor: string | undefined,
): Record<string, AttributeValue> | undefined {
  if (!cursor) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.from(cursor, "base64").toString("utf-8"))
  } catch {
    throw new ServiceError("InvalidInput", "Invalid cursor")
  }
  if (!isKeyMap(parsed))
    throw new ServiceError("InvalidInput", "Invalid cursor")
  return parsed
}
