import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  spyOn,
} from "bun:test"

import { openDeleteModalFromDataset } from "./floci"
import { createMount, readComponentProps } from "./mount"

class FakeHTMLElement extends EventTarget {
  dataset: Record<string, string> = {}
  children: FakeHTMLElement[] = []
  parentElement: FakeHTMLElement | null = null

  constructor(readonly tagName: string) {
    super()
  }

  appendChild(child: FakeHTMLElement) {
    child.parentElement = this
    this.children.push(child)
    return child
  }

  closest(selector: string) {
    if (selector !== "tr") return null

    let current: FakeHTMLElement | null = this
    while (current) {
      if (current.tagName === "tr") return current
      current = current.parentElement
    }
    return null
  }
}

class FakeHTMLScriptElement extends FakeHTMLElement {
  type = ""
  textContent = ""

  constructor() {
    super("script")
  }
}

function createElement(tagName: string) {
  return new FakeHTMLElement(tagName)
}

beforeAll(() => {
  Object.assign(globalThis, {
    HTMLElement: FakeHTMLElement,
    HTMLScriptElement: FakeHTMLScriptElement,
  })
})

beforeEach(() => {
  const windowTarget = new EventTarget()
  Object.assign(globalThis, {
    window: {
      addEventListener: windowTarget.addEventListener.bind(windowTarget),
      removeEventListener: windowTarget.removeEventListener.bind(windowTarget),
      dispatchEvent: windowTarget.dispatchEvent.bind(windowTarget),
    },
  })
})

describe("readComponentProps", () => {
  it("reads embedded JSON props from the component root", () => {
    const el = createElement("div")
    const script = new FakeHTMLScriptElement()
    script.type = "application/json"
    script.dataset.flociProps = ""
    script.textContent = JSON.stringify({ bucket: "demo", prefix: "logs/" })
    el.appendChild(script)

    expect(
      readComponentProps<{ bucket: string; prefix: string }>(
        el as unknown as HTMLElement,
      ),
    ).toEqual({
      bucket: "demo",
      prefix: "logs/",
    })
  })

  it("returns empty object and logs error when textContent is invalid JSON", () => {
    const el = createElement("div")
    el.dataset.flociComponent = "demo"
    const script = new FakeHTMLScriptElement()
    script.type = "application/json"
    script.dataset.flociProps = ""
    script.textContent = "{invalid json"
    el.appendChild(script)

    const spy = spyOn(console, "error").mockImplementation(() => {})
    afterEach(() => spy.mockRestore())

    const result = readComponentProps(el as unknown as HTMLElement)
    expect(result).toEqual({})
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("[floci] Failed to parse props"),
      expect.any(SyntaxError),
    )
  })
})

describe("createMount", () => {
  it("creates a controller from the registry and parsed props", () => {
    const el = createElement("div")
    el.dataset.flociComponent = "demo"
    const script = new FakeHTMLScriptElement()
    script.type = "application/json"
    script.dataset.flociProps = ""
    script.textContent = JSON.stringify({ count: 2 })
    el.appendChild(script)

    const mount = createMount({
      demo: (_el, props) => ({ total: (props as { count: number }).count + 1 }),
    })

    expect(mount(el as unknown as HTMLElement)).toEqual({ total: 3 })
  })

  it("throws for unknown components", () => {
    const el = createElement("div")
    el.dataset.flociComponent = "missing"

    const mount = createMount({})

    expect(() => mount(el as unknown as HTMLElement)).toThrow(
      "Unknown floci component: missing",
    )
  })
})

describe("openDeleteModalFromDataset", () => {
  it("includes the containing table row in the emitted detail", () => {
    const table = createElement("table")
    const row = createElement("tr")
    const cell = createElement("td")
    const button = createElement("button")

    button.dataset.resourceName = "demo"
    button.dataset.deleteUrl = "/demo"
    button.dataset.onSuccess = "remove-row"

    cell.appendChild(button)
    row.appendChild(cell)
    table.appendChild(row)

    let received: Event | null = null
    const handler = (event: Event) => {
      received = event
    }

    window.addEventListener("open-delete-modal", handler, { once: true })
    openDeleteModalFromDataset(button as unknown as HTMLElement)

    expect(received).toBeInstanceOf(CustomEvent)
    expect((received as unknown as CustomEvent).detail).toEqual({
      resourceName: "demo",
      detailText: "",
      deleteUrl: "/demo",
      method: "DELETE",
      body: "",
      contentType: "",
      onSuccess: "remove-row",
      redirectUrl: "",
      rowEl: row,
    })
  })
})
