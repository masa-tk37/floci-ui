import type { AttributeValue } from "@aws-sdk/client-dynamodb"

export function encodeCursor(
  key: Record<string, AttributeValue> | undefined,
): string | undefined {
  if (!key) return undefined
  return Buffer.from(JSON.stringify(key)).toString("base64")
}

export function decodeCursor(
  cursor: string | undefined,
): Record<string, AttributeValue> | undefined {
  if (!cursor) return undefined
  try {
    return JSON.parse(Buffer.from(cursor, "base64").toString("utf-8"))
  } catch {
    return undefined
  }
}
