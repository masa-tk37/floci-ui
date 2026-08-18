import { describe, expect, it } from "bun:test"
import { formatBytes, PLACEHOLDER } from "./format"

describe("formatBytes", () => {
  it("falls back to the placeholder when the size is unknown", () => {
    expect(formatBytes(undefined)).toBe(PLACEHOLDER)
    expect(formatBytes(null)).toBe(PLACEHOLDER)
  })

  it("keeps byte counts exact below 1 KiB", () => {
    expect(formatBytes(0)).toBe("0 B")
    expect(formatBytes(1023)).toBe("1023 B")
  })

  it("steps up a unit at each 1024 boundary", () => {
    expect(formatBytes(1024)).toBe("1.0 KB")
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB")
    expect(formatBytes(1024 * 1024 * 1024)).toBe("1.00 GB")
  })
})
