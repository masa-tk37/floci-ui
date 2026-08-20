import type Alpine from "alpinejs"

export type AlpineMagic = Alpine.Magics<Record<string, unknown>>

export interface ToastDetail {
  kind?: "success" | "error"
  message: string
  timeout?: number
}

export interface DeleteModalDetail {
  resourceName: string
  detailText?: string
  deleteUrl: string
  method?: string
  body?: string
  contentType?: string
  onSuccess?: "reload" | "remove-row"
  redirectUrl?: string
  rowEl?: HTMLElement | null
}

export function errorMessage(error: unknown): string {
  if (!error) return "ネットワークエラーが発生しました"
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message
  ) {
    // fetch() の転送層エラーはランタイムごとに文言が違い、判別できるコードを持たない
    if (
      "name" in error &&
      error.name === "TypeError" &&
      /fetch failed|Failed to fetch|Load failed|NetworkError/i.test(
        error.message,
      )
    ) {
      return "floci-ui サーバーに接続できません"
    }
    return error.message
  }
  return "ネットワークエラーが発生しました"
}

export async function requestJson<T>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(url, options)
  let payload: unknown = null

  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (
    response.ok &&
    payload &&
    typeof payload === "object" &&
    "ok" in payload &&
    payload.ok === true &&
    "data" in payload
  ) {
    return payload.data as T
  }

  const errorObj =
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    payload.error &&
    typeof payload.error === "object"
      ? (payload.error as Record<string, unknown>)
      : null

  const message =
    errorObj && typeof errorObj.message === "string" && errorObj.message
      ? errorObj.message
      : `エラーが発生しました (HTTP ${response.status})`

  const error = new Error(message) as Error & {
    code?: string
    status?: number
  }

  error.code =
    errorObj && typeof errorObj.code === "string"
      ? errorObj.code
      : "InternalServerError"
  error.status = response.status
  throw error
}

export function dispatchToast(detail: ToastDetail): void {
  window.dispatchEvent(new CustomEvent("floci:toast", { detail }))
}

export function openDeleteModal(detail: DeleteModalDetail): void {
  window.dispatchEvent(new CustomEvent("open-delete-modal", { detail }))
}

export function openDeleteModalFromDataset(el: HTMLElement): void {
  const d = el.dataset
  openDeleteModal({
    resourceName: d.resourceName ?? "",
    detailText: d.detailText ?? "",
    deleteUrl: d.deleteUrl ?? "",
    method: d.deleteMethod ?? "DELETE",
    body: d.deleteBody ?? "",
    contentType: d.contentType ?? "",
    onSuccess: d.onSuccess === "remove-row" ? "remove-row" : "reload",
    redirectUrl: d.redirectUrl ?? "",
    rowEl: el.closest("tr"),
  })
}

export function splitCommaList(str: string): string[] {
  return str
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean)
}

export const tagMixin = {
  addTag(this: { tags: { key: string; value: string }[] }) {
    this.tags.push({ key: "", value: "" })
  },
  removeTag(this: { tags: { key: string; value: string }[] }, index: number) {
    this.tags.splice(index, 1)
  },
}
