import { describe, expect, it } from "bun:test"
import { Html } from "@elysiajs/html"

import { Layout } from "./layout"

function render(element: JSX.Element): string {
  return String(element)
}

describe("Layout", () => {
  it("loads local Lism CSS before application styles", () => {
    const html = render(<Layout title="Test">content</Layout>)
    const lismIndex = html.indexOf("/public/assets/lism.css")
    const appIndex = html.indexOf("/public/assets/app.css")

    expect(lismIndex).toBeGreaterThan(-1)
    expect(appIndex).toBeGreaterThan(lismIndex)
    expect(html).not.toContain("cdn.jsdelivr.net/npm/lism-css")
  })

  it("maps content modes to a stable page width class", () => {
    const html = render(
      <Layout title="Form" contentMode="form">
        content
      </Layout>,
    )

    expect(html).toContain('<main class="content c--content content--form">')
  })

  it("keeps workspace scrolling hooks while using the Lism shell", () => {
    const html = render(
      <Layout title="Workspace" contentMode="workspace">
        content
      </Layout>,
    )

    expect(html).toContain("main--resource-workspace")
    expect(html).toContain("content--workspace content--resource-workspace")
    expect(html).toContain("c--appShell l--flex is--container")
  })

  it("renders an accessible delete dialog", () => {
    const html = render(<Layout title="Test">content</Layout>)

    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
    expect(html).toContain('aria-labelledby="delete-modal-title"')
  })
})
