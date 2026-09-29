import { describe, expect, it } from "bun:test"

import { normalizePrefix } from "./prefix"

describe("normalizePrefix", () => {
  it("keeps the bucket root empty rather than producing a lone slash", () => {
    expect(normalizePrefix("")).toBe("")
    expect(normalizePrefix("   ")).toBe("")
    expect(normalizePrefix("/")).toBe("")
  })

  it("appends the trailing slash a prefix needs to act as a folder", () => {
    expect(normalizePrefix("uploads")).toBe("uploads/")
    expect(normalizePrefix("uploads/")).toBe("uploads/")
    expect(normalizePrefix(" nested/dir ")).toBe("nested/dir/")
  })

  it("strips leading slashes so the key does not start with an empty segment", () => {
    expect(normalizePrefix("/uploads/2024")).toBe("uploads/2024/")
  })
})
