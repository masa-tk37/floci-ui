import type { ServiceErrorCode } from "../errors"
import { httpStatusFor, ServiceError } from "../errors"
import { type SidebarData, toSidebarCounts } from "../services/sidebar-service"

export interface JsonError {
  code: ServiceErrorCode | "InternalServerError"
  message: string
}

export interface JsonErrorResponse {
  ok: false
  error: JsonError
}

export interface JsonSuccessResponse<T> {
  ok: true
  data: T
}

export function jsonData<T>(data: T): JsonSuccessResponse<T> {
  return { ok: true, data }
}

export function jsonOk(): JsonSuccessResponse<null> {
  return jsonData(null)
}

export function jsonError(
  code: JsonError["code"],
  message: string,
): JsonErrorResponse {
  return {
    ok: false,
    error: { code, message },
  }
}

export function respondWithFrameworkError(
  code: ServiceErrorCode,
  message: string,
  set: { status?: number | string },
  status = httpStatusFor(code),
): JsonErrorResponse {
  set.status = status
  return jsonError(code, message)
}

export function respondWithError(
  error: unknown,
  set: { status?: number | string },
): JsonErrorResponse {
  if (error instanceof ServiceError) {
    set.status = httpStatusFor(error.code)
    return jsonError(error.code, error.message)
  }

  set.status = 500
  return jsonError("InternalServerError", "Internal server error")
}

export interface PageData<T> {
  data: T
  sidebar: SidebarData | undefined
  sidebarCounts: ReturnType<typeof toSidebarCounts>
}

export async function loadPageData<T>(
  deps: { loadSidebarSafe: () => Promise<SidebarData | undefined> },
  loader: () => Promise<T>,
): Promise<PageData<T>> {
  const [data, sidebar] = await Promise.all([loader(), deps.loadSidebarSafe()])
  return { data, sidebar, sidebarCounts: toSidebarCounts(sidebar) }
}

export async function loadSidebarPage(deps: {
  loadSidebarSafe: () => Promise<SidebarData | undefined>
}): Promise<{
  sidebar: SidebarData | undefined
  sidebarCounts: ReturnType<typeof toSidebarCounts>
}> {
  const sidebar = await deps.loadSidebarSafe()
  return { sidebar, sidebarCounts: toSidebarCounts(sidebar) }
}

export async function runJsonAction(
  set: { status?: number | string },
  action: () => Promise<undefined | null>,
): Promise<JsonSuccessResponse<null> | JsonErrorResponse>
export async function runJsonAction<T>(
  set: { status?: number | string },
  action: () => Promise<T>,
): Promise<JsonSuccessResponse<T> | JsonErrorResponse>
export async function runJsonAction<T>(
  set: { status?: number | string },
  action: () => Promise<T | undefined | null>,
): Promise<JsonSuccessResponse<T | null> | JsonErrorResponse> {
  try {
    const result = await action()
    return result == null ? jsonOk() : jsonData(result)
  } catch (error) {
    return respondWithError(error, set)
  }
}

const GET_JSON_API_PATTERNS = [
  /^\/s3\/[^/]+\/object-details$/,
  /^\/sqs\/[^/]+\/messages\.json$/,
  /^\/sqs\/[^/]+\/attributes\.json$/,
]

export function isJsonApiRequest(request: Request): boolean {
  const method = request.method.toUpperCase()
  if (method !== "GET") {
    return true
  }

  const pathname = new URL(request.url).pathname
  return GET_JSON_API_PATTERNS.some((pattern) => pattern.test(pathname))
}
