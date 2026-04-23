import { describe, expect, it } from "bun:test"
import { ServiceError } from "../errors"
import { decodeResourceName, encodeResourceName } from "./resource-name-codec"

describe("encodeResourceName", () => {
  it("encodes a name to a base64url string", () => {
    const encoded = encodeResourceName("my-pool")
    expect(typeof encoded).toBe("string")
    expect(encoded).not.toContain("/")
    expect(encoded).not.toContain("+")
    expect(encoded).not.toContain("=")
  })
})

describe("decodeResourceName", () => {
  it("decodes a valid base64url back to the original name", () => {
    expect(decodeResourceName(encodeResourceName("my-pool"))).toBe("my-pool")
  })

  it("round-trips names with special characters", () => {
    const names = ["/app/config", "hello world", "ユーザー", "a/b/c/d"]
    for (const name of names) {
      expect(decodeResourceName(encodeResourceName(name))).toBe(name)
    }
  })

  it("throws InvalidInput for an empty encoded value", () => {
    expect(() => decodeResourceName("")).toThrow(ServiceError)
    expect(() => decodeResourceName("")).toThrow(
      expect.objectContaining({ code: "InvalidInput" }),
    )
  })
})
