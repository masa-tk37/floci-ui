import {
  type AlpineMagic,
  type DeleteModalDetail,
  errorMessage,
  openDeleteModalFromDataset,
  requestJson,
} from "../lib/floci"

export interface RevealToggleProps {
  initialRevealed?: boolean
}

export function createDeleteModalController() {
  return {
    isOpen: false,
    resourceName: "",
    detailText: "",
    deleteUrl: "",
    method: "DELETE",
    body: "",
    contentType: "",
    onSuccess: "reload",
    redirectUrl: "",
    rowEl: null as HTMLElement | null,
    loading: false,
    error: "",

    open({
      resourceName,
      detailText,
      deleteUrl,
      method,
      body,
      contentType,
      onSuccess,
      redirectUrl,
      rowEl,
    }: DeleteModalDetail) {
      this.resourceName = resourceName
      this.detailText = detailText || ""
      this.deleteUrl = deleteUrl
      this.method = method || "DELETE"
      this.body = body || ""
      this.contentType = contentType || ""
      this.onSuccess = onSuccess || "reload"
      this.redirectUrl = redirectUrl || ""
      this.rowEl = rowEl || null
      this.error = ""
      this.loading = false
      this.isOpen = true
    },

    cancel() {
      if (this.loading) return
      this.isOpen = false
    },

    async confirm() {
      this.loading = true
      this.error = ""

      try {
        const options: RequestInit = { method: this.method }
        if (this.body) {
          options.body = this.body
          if (this.contentType) {
            options.headers = { "Content-Type": this.contentType }
          }
        }

        await requestJson(this.deleteUrl, options)
        this.isOpen = false

        if (this.redirectUrl) {
          location.href = this.redirectUrl
        } else if (this.onSuccess === "remove-row" && this.rowEl) {
          this.rowEl.remove()
        } else {
          location.reload()
        }
      } catch (error) {
        this.error = errorMessage(error)
        this.loading = false
      }
    },
  }
}

export function createToastController() {
  return {
    items: [] as { id: number; kind: string; message: string }[],
    nextId: 1,
    _timers: {} as Record<number, ReturnType<typeof setTimeout>>,

    push({
      kind,
      message,
      timeout,
    }: {
      kind?: string
      message?: string
      timeout?: number
    }) {
      const id = this.nextId++
      this.items.push({ id, kind: kind || "success", message: message || "" })
      const duration = typeof timeout === "number" ? timeout : 5000
      if (duration > 0) {
        this._timers[id] = setTimeout(() => this.dismiss(id), duration)
      }
    },

    dismiss(id: number) {
      clearTimeout(this._timers[id])
      delete this._timers[id]
      this.items = this.items.filter((item) => item.id !== id)
    },
  }
}

export function createListFilterController() {
  return {
    query: "",
    visibleCount: 0,

    get normalizedQuery() {
      return this.query.trim().toLowerCase()
    },

    get hasQuery() {
      return this.normalizedQuery.length > 0
    },

    matches(value: string | undefined) {
      if (!this.hasQuery) return true
      return String(value || "")
        .toLowerCase()
        .includes(this.normalizedQuery)
    },

    update() {
      const magic = this as unknown as AlpineMagic
      magic.$nextTick(() => {
        const rows = Array.from(
          magic.$root.querySelectorAll<HTMLElement>("[data-filter-text]"),
        )
        this.visibleCount = rows.filter((row) =>
          this.matches(row.dataset.filterText),
        ).length
      })
    },

    init() {
      this.update()
      ;(this as unknown as AlpineMagic).$watch("query", () => this.update())
    },
  }
}

export function createRevealToggleController(
  _el: HTMLElement,
  props: RevealToggleProps,
) {
  return {
    revealed: Boolean(props.initialRevealed),
  }
}

export function createThemeToggleController() {
  return {
    isDark: false,

    init() {
      this.isDark =
        document.documentElement.getAttribute("data-theme") === "dark"
      window
        .matchMedia("(prefers-color-scheme: dark)")
        .addEventListener("change", (event) => {
          // Follow the OS only while the user has no explicit preference.
          // localStorage can throw where storage is blocked; treat a failed
          // read as "no preference" and fall through to the OS value.
          try {
            if (localStorage.getItem("theme")) return
          } catch {
            // ignore: storage unavailable
          }
          this.isDark = event.matches
          document.documentElement.setAttribute(
            "data-theme",
            event.matches ? "dark" : "light",
          )
        })
    },

    toggle() {
      this.isDark = !this.isDark
      const next = this.isDark ? "dark" : "light"
      document.documentElement.setAttribute("data-theme", next)
      try {
        localStorage.setItem("theme", next)
      } catch {
        // ignore: storage unavailable, theme still applies for this session
      }
    },
  }
}

let deleteTriggersRegistered = false

export function bindDeleteModalTriggers(): void {
  if (deleteTriggersRegistered) return
  deleteTriggersRegistered = true
  document.addEventListener("click", (event) => {
    const target = event.target
    if (!(target instanceof HTMLElement)) return

    const trigger = target.closest<HTMLElement>("[data-floci-delete-trigger]")
    if (!trigger) return

    event.preventDefault()
    openDeleteModalFromDataset(trigger)
  })
}
