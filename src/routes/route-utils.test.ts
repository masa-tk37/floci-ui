import { describe, expect, it } from "bun:test"
import { ServiceError } from "../errors"
import {
  isJsonApiRequest,
  jsonData,
  jsonOk,
  respondWithError,
  respondWithFrameworkError,
} from "./route-utils"

describe("json helpers", () => {
  it("wraps success payloads in ok/data envelope", () => {
    expect(jsonData({ value: 1 })).toEqual({ ok: true, data: { value: 1 } })
    expect(jsonOk()).toEqual({ ok: true, data: null })
  })

  it("builds structured framework errors", () => {
    const set = { status: undefined as number | string | undefined }
    const result = respondWithFrameworkError("InvalidInput", "bad input", set)
    expect(set.status).toBe(400)
    expect(result).toEqual({
      ok: false,
      error: { code: "InvalidInput", message: "bad input" },
    })
  })
})

describe("respondWithError", () => {
  it("sets 404 and returns error message for NotFound ServiceError", () => {
    const set = { status: undefined as number | string | undefined }
    const result = respondWithError(
      new ServiceError("NotFound", "item not found"),
      set,
    )
    expect(set.status).toBe(404)
    expect(result).toEqual({
      ok: false,
      error: { code: "NotFound", message: "item not found" },
    })
  })

  it("sets 409 for AlreadyExists ServiceError", () => {
    const set = { status: undefined as number | string | undefined }
    const result = respondWithError(
      new ServiceError("AlreadyExists", "conflict"),
      set,
    )
    expect(set.status).toBe(409)
    expect(result).toEqual({
      ok: false,
      error: { code: "AlreadyExists", message: "conflict" },
    })
  })

  it("sets 400 for InvalidInput ServiceError", () => {
    const set = { status: undefined as number | string | undefined }
    const result = respondWithError(
      new ServiceError("InvalidInput", "bad input"),
      set,
    )
    expect(set.status).toBe(400)
    expect(result).toEqual({
      ok: false,
      error: { code: "InvalidInput", message: "bad input" },
    })
  })

  it("sets 500 for OperationFailed ServiceError", () => {
    const set = { status: undefined as number | string | undefined }
    const result = respondWithError(
      new ServiceError("OperationFailed", "failed"),
      set,
    )
    expect(set.status).toBe(500)
    expect(result).toEqual({
      ok: false,
      error: { code: "OperationFailed", message: "failed" },
    })
  })

  it("sets 500 and generic message for unknown Error", () => {
    const set = { status: undefined as number | string | undefined }
    const result = respondWithError(new Error("unexpected"), set)
    expect(set.status).toBe(500)
    expect(result).toEqual({
      ok: false,
      error: {
        code: "InternalServerError",
        message: "Internal server error",
      },
    })
  })

  it("sets 500 for non-Error values", () => {
    const set = { status: undefined as number | string | undefined }
    const result = respondWithError("string error", set)
    expect(set.status).toBe(500)
    expect(result).toEqual({
      ok: false,
      error: {
        code: "InternalServerError",
        message: "Internal server error",
      },
    })
  })
})

describe("isJsonApiRequest", () => {
  it("treats mutation requests as JSON API by default", () => {
    expect(
      isJsonApiRequest(
        new Request("http://localhost/sqs/demo", { method: "POST" }),
      ),
    ).toBe(true)
  })

  it("recognizes JSON GET endpoints", () => {
    expect(
      isJsonApiRequest(
        new Request("http://localhost/s3/bucket/object-details?key=a.txt"),
      ),
    ).toBe(true)
  })

  it("does not mark HTML page GET routes as JSON API", () => {
    expect(isJsonApiRequest(new Request("http://localhost/s3/bucket"))).toBe(
      false,
    )
  })
})
