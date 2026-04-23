import { describe, it, expect } from "bun:test"
import { ServiceError, httpStatusFor } from "./errors"

describe("ServiceError", () => {
  it("should extend Error", () => {
    const err = new ServiceError("NotFound", "Resource not found")
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(ServiceError)
  })

  it("should set code and message", () => {
    const err = new ServiceError("InvalidInput", "Bad input")
    expect(err.code).toBe("InvalidInput")
    expect(err.message).toBe("Bad input")
  })

  it("should set name to ServiceError", () => {
    const err = new ServiceError("OperationFailed", "failed")
    expect(err.name).toBe("ServiceError")
  })

  it("should accept optional cause", () => {
    const cause = new Error("original")
    const err = new ServiceError("NotFound", "not found", cause)
    expect(err.cause).toBe(cause)
  })

  it("should work without cause", () => {
    const err = new ServiceError("AlreadyExists", "already exists")
    expect(err.cause).toBeUndefined()
  })
})

describe("httpStatusFor", () => {
  it("should return 404 for NotFound", () => {
    expect(httpStatusFor("NotFound")).toBe(404)
  })

  it("should return 409 for AlreadyExists", () => {
    expect(httpStatusFor("AlreadyExists")).toBe(409)
  })

  it("should return 400 for InvalidInput", () => {
    expect(httpStatusFor("InvalidInput")).toBe(400)
  })

  it("should return 400 for OperationFailed", () => {
    expect(httpStatusFor("OperationFailed")).toBe(400)
  })
})
