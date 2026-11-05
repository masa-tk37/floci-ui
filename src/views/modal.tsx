import { Html } from "@elysiajs/html"

interface ModalProps {
  show: string
  close: string
  wide?: boolean
  children: JSX.Element | JSX.Element[]
}

export function Modal({ show, close, wide = false, children }: ModalProps) {
  return (
    <div x-show={show} class="modal-overlay" x-cloak {...{ "@click": close }}>
      <div
        class={wide ? "modal modal--wide" : "modal"}
        {...{
          "@click.stop": "",
          "@keydown.escape.window": close,
        }}
      >
        {children}
      </div>
    </div>
  )
}
