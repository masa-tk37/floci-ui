import { describe, expect, it } from "bun:test"
import { ServiceError } from "../errors"
import { respondWithError } from "./route-utils"

describe("respondWithError", () => {
  it("sets 404 and returns error message for NotFound ServiceError", () => {
    const set = { status: undefined as number | string | undefined }
    const result = respondWithError(
      new ServiceError("NotFound", "item not found"),
      set,
    )
    expect(set.status).toBe(404)
    expect(result).toEqual({ error: "item not found" })
  })

  it("sets 409 for AlreadyExists ServiceError", () => {
    const set = { status: undefined as number | string | undefined }
    const result = respondWithError(
      new ServiceError("AlreadyExists", "conflict"),
      set,
    )
    expect(set.status).toBe(409)
    expect(result).toEqual({ error: "conflict" })
  })

  it("sets 400 for InvalidInput ServiceError", () => {
    const set = { status: undefined as number | string | undefined }
    const result = respondWithError(
      new ServiceError("InvalidInput", "bad input"),
      set,
    )
    expect(set.status).toBe(400)
    expect(result).toEqual({ error: "bad input" })
  })

  it("sets 500 and generic message for unknown Error", () => {
    const set = { status: undefined as number | string | undefined }
    const result = respondWithError(new Error("unexpected"), set)
    expect(set.status).toBe(500)
    expect(result).toEqual({ error: "Internal server error" })
  })

  it("sets 500 for non-Error values", () => {
    const set = { status: undefined as number | string | undefined }
    const result = respondWithError("string error", set)
    expect(set.status).toBe(500)
    expect(result).toEqual({ error: "Internal server error" })
  })
})
