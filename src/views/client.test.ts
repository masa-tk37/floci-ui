import { describe, expect, it } from "bun:test"

import { serializeClientProps } from "./client"

describe("serializeClientProps", () => {
  it("escapes script-breaking characters", () => {
    const result = serializeClientProps({
      text: "</script><div>&",
      lineSeparator: "\u2028",
      paragraphSeparator: "\u2029",
    })

    expect(result).toContain("\\u003c/script\\u003e\\u003cdiv\\u003e\\u0026")
    expect(result).toContain("\\u2028")
    expect(result).toContain("\\u2029")
  })
})
