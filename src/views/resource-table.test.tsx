import { describe, expect, it } from "bun:test"
import { Html } from "@elysiajs/html"
import { ResourceTable, type TableColumn } from "./resource-table"

interface Row {
  name: string
}

const columns: TableColumn<Row>[] = [{ label: "Name", text: (row) => row.name }]

function render(element: JSX.Element): string {
  return element as unknown as string
}

describe("ResourceTable", () => {
  it("escapes text columns so a hostile resource name cannot inject markup", () => {
    const html = render(
      <ResourceTable
        items={[{ name: '<img src=x onerror="alert(1)">' }]}
        columns={columns}
        resourceLabel="Row"
        filterText={(row) => row.name}
      />,
    )

    expect(html).not.toContain("<img src=x")
    expect(html).toContain("&lt;img src=x")
  })

  it("escapes the filter text it writes into the data attribute", () => {
    const html = render(
      <ResourceTable
        items={[{ name: 'a" onmouseover="x' }]}
        columns={columns}
        resourceLabel="Row"
        filterText={(row) => row.name}
      />,
    )

    expect(html).toContain('data-filter-text="a&quot; onmouseover=&quot;x"')
  })

  it("renders the empty state instead of a table when there is nothing to show", () => {
    const html = render(
      <ResourceTable
        items={[]}
        columns={columns}
        resourceLabel="Row"
        filterText={(row) => row.name}
      />,
    )

    expect(html).toContain("まだ Row がありません")
    expect(html).not.toContain("<table")
  })

  it("uses the override wording for the empty state when given", () => {
    const html = render(
      <ResourceTable
        items={[]}
        columns={columns}
        resourceLabel="Row"
        emptyMessage="まだテーブルがありません"
        filterText={(row) => row.name}
      />,
    )

    expect(html).toContain("まだテーブルがありません")
  })

  it("spans the no-match row across the action column too", () => {
    const html = render(
      <ResourceTable
        items={[{ name: "one" }]}
        columns={columns}
        resourceLabel="Row"
        filterText={(row) => row.name}
        actions={() => <button type="button">削除</button>}
      />,
    )

    expect(html).toContain('colspan="2"')
    expect(html).toContain('<th class="data-table__actions">操作</th>')
  })

  it("passes markup columns through without double-escaping", () => {
    const html = render(
      <ResourceTable
        items={[{ name: "bucket" }]}
        columns={[
          {
            label: "Name",
            cell: (row) => (
              <a href="/x" safe>
                {row.name}
              </a>
            ),
          },
        ]}
        resourceLabel="Row"
        filterText={(row) => row.name}
      />,
    )

    expect(html).toContain('<a href="/x">bucket</a>')
  })
})
