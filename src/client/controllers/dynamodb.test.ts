import { afterEach, describe, expect, it } from "bun:test"

import {
  createDynamoCreateTableController,
  createDynamoItemEditController,
  createDynamoQueryBuilderController,
} from "./dynamodb"

function makeEl(): HTMLElement {
  return {} as HTMLElement
}

function makeItemEditInit(itemJson = '{"pk": "1"}') {
  return {
    tableName: "users",
    pk: "1",
    itemJson,
    hashKey: "pk",
    itemPath: "/dynamodb/users/item/1",
  }
}

describe("createDynamoItemEditController.formatJson", () => {
  it("formats valid JSON with 2-space indentation", () => {
    const ctrl = createDynamoItemEditController(
      makeEl(),
      makeItemEditInit('{"a":1,"b":2}'),
    )
    ctrl.formatJson()
    expect(ctrl.itemJson).toBe('{\n  "a": 1,\n  "b": 2\n}')
    expect(ctrl.error).toBeNull()
  })

  it("sets error when itemJson is invalid JSON", () => {
    const ctrl = createDynamoItemEditController(
      makeEl(),
      makeItemEditInit("{invalid"),
    )
    ctrl.formatJson()
    expect(ctrl.error).toBeTypeOf("string")
    expect((ctrl.error as string).length).toBeGreaterThan(0)
    expect(ctrl.itemJson).toBe("{invalid")
  })
})

describe("createDynamoItemEditController.returnPath", () => {
  it("returns to the table page because bare item paths have no GET route", () => {
    const ctrl = createDynamoItemEditController(makeEl(), {
      itemJson: "{}",
      itemPath: "/dynamodb/my%2Ftable/pk1/sk1",
    })
    expect(ctrl.returnPath).toBe("/dynamodb/my%2Ftable")
  })
})

describe("createDynamoCreateTableController.submit validation", () => {
  it("rejects a checked sort key without a name", async () => {
    const ctrl = createDynamoCreateTableController(makeEl(), {})
    ctrl.pk.name = "id"
    ctrl.hasSk = true
    await ctrl.submit()
    expect(ctrl.error).toContain("ソートキー名")
  })

  it("rejects a GSI sort key without a name", async () => {
    const ctrl = createDynamoCreateTableController(makeEl(), {})
    ctrl.pk.name = "id"
    ctrl.addGsi()
    const gsi = ctrl.gsi[0]
    if (!gsi) throw new Error("gsi missing")
    gsi.indexName = "gsi1"
    gsi.pk.name = "owner"
    gsi.hasSk = true
    await ctrl.submit()
    expect(ctrl.error).toContain("GSI 1: ソートキー名")
  })

  it("rejects one attribute name declared with conflicting types", async () => {
    const ctrl = createDynamoCreateTableController(makeEl(), {})
    ctrl.pk = { name: "id", type: "S" }
    ctrl.addGsi()
    const gsi = ctrl.gsi[0]
    if (!gsi) throw new Error("gsi missing")
    gsi.indexName = "gsi1"
    gsi.pk = { name: "id", type: "N" }
    await ctrl.submit()
    expect(ctrl.error).toContain("異なる型")
  })

  it("rejects a missing table PK name", async () => {
    const ctrl = createDynamoCreateTableController(makeEl(), {})
    await ctrl.submit()
    expect(ctrl.error).toContain("PK 名")
  })
})

describe("createDynamoQueryBuilderController", () => {
  const originalFetch = globalThis.fetch
  let requests: Record<string, unknown>[] = []

  function stubFetch(pages: unknown[]) {
    requests = []
    let call = 0
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      requests.push(JSON.parse(String(init?.body)))
      const data = pages[Math.min(call++, pages.length - 1)]
      return new Response(JSON.stringify({ ok: true, data }))
    }) as typeof fetch
  }

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it("collects columns from every result item", async () => {
    stubFetch([
      {
        items: [
          { id: 1, name: "a" },
          { id: 2, email: "b", age: 3 },
        ],
      },
    ])
    const ctrl = createDynamoQueryBuilderController(makeEl(), {
      tableName: "t",
    })
    ctrl.mode = "scan"
    await ctrl.submit()
    expect(ctrl.columns).toEqual(["id", "name", "email", "age"])
  })

  it("pages with the submitted query even after the form was edited", async () => {
    stubFetch([{ items: [{ id: 1 }], cursor: "c1" }, { items: [{ id: 2 }] }])
    const ctrl = createDynamoQueryBuilderController(makeEl(), {
      tableName: "t",
    })
    ctrl.mode = "scan"
    await ctrl.submit()
    ctrl.indexName = "gsi1"
    await ctrl.nextPage()
    expect(requests[1]).toMatchObject({ indexName: "", cursor: "c1" })
  })
})
