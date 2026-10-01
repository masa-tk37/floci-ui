import { Html } from "@elysiajs/html"
import { IconCheck, IconCopy } from "./icons"

export function CopyButton() {
  return (
    <button
      type="button"
      class="btn btn--ghost btn--sm"
      x-data="{ copied: false }"
      {...{
        "@click":
          "navigator.clipboard.writeText($el.previousElementSibling.textContent); copied = true; setTimeout(() => copied = false, 1500)",
      }}
    >
      <span x-show="!copied">{IconCopy}</span>
      <span x-show="copied" x-cloak>
        {IconCheck}
      </span>
    </button>
  )
}
