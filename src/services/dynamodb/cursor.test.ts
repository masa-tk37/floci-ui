import { describe, expect, it } from "bun:test"
import type { AttributeValue } from "@aws-sdk/client-dynamodb"
import { decodeCursor, encodeCursor } from "./cursor"

describe("encodeCursor", () => {
  it("should return undefined for undefined input", () => {
    expect(encodeCursor(undefined)).toBeUndefined()
  })

  it("should encode a key to base64", () => {
    const key: Record<string, AttributeValue> = { id: { S: "abc" } }
    const result = encodeCursor(key)
    expect(result).toBeTypeOf("string")
    expect(result).not.toBeUndefined()
  })

  it("should produce a valid base64 string that decodes back", () => {
    const key: Record<string, AttributeValue> = {
      id: { S: "test-id" },
      sk: { N: "42" },
    }
    const encoded = encodeCursor(key)
    expect(encoded).toBeTruthy()
    const decoded = Buffer.from(encoded!, "base64").toString("utf-8")
    expect(JSON.parse(decoded)).toEqual(key)
  })
})

describe("decodeCursor", () => {
  it("should return undefined for undefined input", () => {
    expect(decodeCursor(undefined)).toBeUndefined()
  })

  it("should return undefined for invalid base64", () => {
    expect(decodeCursor("not-valid-json-base64")).toBeUndefined()
  })

  it("should decode a valid cursor back to a key", () => {
    const key: Record<string, AttributeValue> = { id: { S: "test-id" } }
    const encoded = Buffer.from(JSON.stringify(key)).toString("base64")
    const result = decodeCursor(encoded)
    expect(result).toEqual(key)
  })

  it("should roundtrip encode then decode", () => {
    const key: Record<string, AttributeValue> = {
      pk: { S: "user#123" },
      sk: { N: "999" },
    }
    const encoded = encodeCursor(key)
    const decoded = decodeCursor(encoded)
    expect(decoded).toEqual(key)
  })
})
