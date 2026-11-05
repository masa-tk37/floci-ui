import { describe, expect, it } from "bun:test"

import { normalizePrefix } from "./prefix"

describe("normalizePrefix", () => {
  it("keeps the bucket root empty", () => {
    expect(normalizePrefix("")).toBe("")
  })

  it("appends the trailing slash a prefix needs to act as a folder", () => {
    expect(normalizePrefix("uploads")).toBe("uploads/")
    expect(normalizePrefix("uploads/")).toBe("uploads/")
  })

  it("keeps leading slashes and whitespace because S3 keys may contain them", () => {
    expect(normalizePrefix("/")).toBe("/")
    expect(normalizePrefix("/x/")).toBe("/x/")
    expect(normalizePrefix(" nested/dir ")).toBe(" nested/dir /")
  })
})
