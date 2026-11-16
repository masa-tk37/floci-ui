import { describe, expect, it } from "bun:test"

import { nextStoredScheme } from "./shared"

describe("nextStoredScheme", () => {
  it("stores the opposite scheme when it differs from the system preference", () => {
    expect(nextStoredScheme("light", false)).toBe("dark")
    expect(nextStoredScheme("dark", true)).toBe("light")
  })

  it("clears the override when the target matches the system preference", () => {
    expect(nextStoredScheme("dark", false)).toBeNull()
    expect(nextStoredScheme("light", true)).toBeNull()
  })
})
