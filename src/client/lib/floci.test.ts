import { afterEach, beforeEach, describe, expect, it } from "bun:test"

import { requestJson } from "./floci"

function mockFetch(response: Response) {
  globalThis.fetch = (async () => response) as unknown as typeof fetch
}

function makeResponse(body: unknown, status = 200) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  }) as Response & { ok: boolean }
}

describe("requestJson", () => {
  let originalFetch: typeof fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it("returns data when response is ok and payload.ok is true", async () => {
    mockFetch(makeResponse({ ok: true, data: { id: "abc" } }))
    const result = await requestJson<{ id: string }>("/test")
    expect(result).toEqual({ id: "abc" })
  })

  it("throws with fallback message when response is not ok and body is not JSON", async () => {
    globalThis.fetch = (async () =>
      new Response("Internal Server Error", {
        status: 500,
      })) as unknown as typeof fetch
    await expect(requestJson("/test")).rejects.toMatchObject({
      message: "エラーが発生しました (HTTP 500)",
      code: "InternalServerError",
      status: 500,
    })
  })

  it("throws with server error message when response contains { error: { message } }", async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          error: { message: "Queue not found", code: "NotFound" },
        }),
        { status: 404 },
      )) as unknown as typeof fetch
    await expect(requestJson("/test")).rejects.toMatchObject({
      message: "Queue not found",
      code: "NotFound",
      status: 404,
    })
  })

  it("throws when response.ok but payload.ok is false", async () => {
    mockFetch(
      makeResponse({
        ok: false,
        error: { message: "Validation error", code: "BadRequest" },
      }),
    )
    await expect(requestJson("/test")).rejects.toMatchObject({
      message: "Validation error",
      code: "BadRequest",
      status: 200,
    })
  })

  it("preserves error.code default when server provides no code", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: { message: "Oops" } }), {
        status: 500,
      })) as unknown as typeof fetch
    await expect(requestJson("/test")).rejects.toMatchObject({
      message: "Oops",
      code: "InternalServerError",
      status: 500,
    })
  })
})
