import { describe, expect, it, mock } from "bun:test"
import { ServiceError } from "../errors"
import type { SidebarData } from "../services/sidebar-service"
import {
  isJsonApiRequest,
  jsonData,
  jsonOk,
  loadPageData,
  loadSidebarPage,
  respondWithError,
  respondWithFrameworkError,
  runJsonAction,
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

const stubSidebar: SidebarData = {
  tables: ["t1"],
  buckets: ["b1"],
  queues: ["q1"],
  parameters: ["/p1"],
  secrets: ["s1"],
  userPools: ["u1"],
}

describe("loadPageData", () => {
  it("returns data, sidebar, and sidebarCounts in parallel", async () => {
    const loadSidebarSafe = mock(() => Promise.resolve(stubSidebar))
    const result = await loadPageData({ loadSidebarSafe }, () =>
      Promise.resolve({ value: 42 }),
    )
    expect(result.data).toEqual({ value: 42 })
    expect(result.sidebar).toBe(stubSidebar)
    expect(result.sidebarCounts).toEqual({
      tables: 1,
      buckets: 1,
      queues: 1,
      parameters: 1,
      secrets: 1,
      userPools: 1,
    })
  })

  it("returns undefined sidebar and sidebarCounts when sidebar unavailable", async () => {
    const loadSidebarSafe = mock(() => Promise.resolve(undefined))
    const result = await loadPageData({ loadSidebarSafe }, () =>
      Promise.resolve("ok"),
    )
    expect(result.sidebar).toBeUndefined()
    expect(result.sidebarCounts).toBeUndefined()
  })
})

describe("loadSidebarPage", () => {
  it("returns sidebar and sidebarCounts", async () => {
    const loadSidebarSafe = mock(() => Promise.resolve(stubSidebar))
    const result = await loadSidebarPage({ loadSidebarSafe })
    expect(result.sidebar).toBe(stubSidebar)
    expect(result.sidebarCounts?.tables).toBe(1)
  })
})

describe("runJsonAction", () => {
  it("wraps successful action in ok/data envelope", async () => {
    const set = { status: undefined as number | string | undefined }
    const result = await runJsonAction(set, () => Promise.resolve({ id: "x" }))
    expect(result).toEqual({ ok: true, data: { id: "x" } })
    expect(set.status).toBeUndefined()
  })

  it("returns jsonOk for actions without a payload", async () => {
    const set = { status: undefined as number | string | undefined }
    const result = await runJsonAction(set, async () => {})
    expect(result).toEqual(jsonOk())
    expect(set.status).toBeUndefined()
  })

  it("catches ServiceError and returns error envelope with status", async () => {
    const set = { status: undefined as number | string | undefined }
    const result = await runJsonAction(set, () => {
      throw new ServiceError("NotFound", "item not found")
    })
    expect(set.status).toBe(404)
    expect(result).toEqual({
      ok: false,
      error: { code: "NotFound", message: "item not found" },
    })
  })

  it("catches unexpected error and returns 500 envelope", async () => {
    const set = { status: undefined as number | string | undefined }
    const result = await runJsonAction(set, async () => {
      throw new Error("unexpected")
    })
    expect(set.status).toBe(500)
    expect(result).toEqual({
      ok: false,
      error: { code: "InternalServerError", message: "Internal server error" },
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
