import { Html } from "@elysiajs/html"
import { IconCheck, IconCopy } from "./icons"

interface CopyButtonProps {
  /** id of the element whose text (or `data-copy-value`) is copied. */
  target: string
  label: string
}

export function CopyButton({ target, label }: CopyButtonProps) {
  return (
    <span class="copy">
      <button
        type="button"
        class="btn btn--ghost btn--sm copy__button"
        aria-label={label}
        {...{ command: "--copy", commandfor: target }}
      >
        <span class="copy__icon copy__icon--idle" aria-hidden="true">
          {IconCopy}
        </span>
        <span class="copy__icon copy__icon--done" aria-hidden="true">
          {IconCheck}
        </span>
      </button>
      {/* A button's children are presentational, so the live region sits beside it. */}
      <span class="copy__status" role="status" />
    </span>
  )
}
