const FEEDBACK_MS = 2000
const timers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>()
let lastMessage = ""

function copyTextOf(target: HTMLElement): string {
  // biome-ignore lint/performance/useDomNodeTextContent: innerText keeps rendered line breaks, which is what the user sees and expects to paste.
  return target.dataset.copyValue ?? target.innerText.trim()
}

function report(button: HTMLElement, ok: boolean): void {
  const status = button.nextElementSibling
  clearTimeout(timers.get(button))
  button.removeAttribute("data-copied")
  button.removeAttribute("data-failed")
  button.setAttribute(ok ? "data-copied" : "data-failed", "")

  let message = ok ? "コピーしました" : "コピーできませんでした"
  // VoiceOver skips a message identical to the previous one from the same region.
  if (message === lastMessage) message += " "
  lastMessage = message
  if (status) {
    status.textContent = ""
    requestAnimationFrame(() => {
      status.textContent = message
    })
  }

  timers.set(
    button,
    setTimeout(() => {
      button.removeAttribute("data-copied")
      button.removeAttribute("data-failed")
      if (status) status.textContent = ""
    }, FEEDBACK_MS),
  )
}

async function copy(button: HTMLElement, target: HTMLElement): Promise<void> {
  const text = copyTextOf(target)
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    report(button, true)
  } catch {
    report(button, false)
  }
}

export function bindCopyCommands(): void {
  // `command` events do not bubble, so listen in the capture phase.
  document.addEventListener(
    "command",
    (event) => {
      const { command, source } = event as CommandEvent
      if (command !== "--copy") return
      if (!(source instanceof HTMLElement)) return
      if (!(event.target instanceof HTMLElement)) return
      void copy(source, event.target)
    },
    true,
  )
}
