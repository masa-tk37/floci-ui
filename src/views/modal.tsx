import { Html } from "@elysiajs/html"
import type { Children } from "@kitajs/html"

interface ModalProps {
  open: string
  /** Alpine method path; called as `close()` to request closing and `close(true)` to force it. */
  close: string
  labelledBy: string
  wide?: boolean
  children: Children
}

export function Modal({
  open,
  close,
  labelledBy,
  wide = false,
  children,
}: ModalProps) {
  return (
    <dialog
      class={wide ? "modal modal--wide" : "modal"}
      aria-labelledby={labelledBy}
      {...{
        closedby: "any",
        "x-effect": `(${open}) ? ($el.open || $el.showModal()) : ($el.open && $el.close())`,
        // `.self`: a file input's `cancel` (picker dismissed) bubbles up and must not close the dialog.
        "x-on:cancel.self.prevent": `${close}()`,
        // `cancel` stops being cancelable after repeated Esc without user activation, so resync state.
        "x-on:close": `(${open}) && ${close}(true)`,
      }}
    >
      {children}
    </dialog>
  )
}
