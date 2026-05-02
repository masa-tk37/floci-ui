import { describe, expect, it } from "bun:test"

import { createDynamoItemEditController } from "./dynamodb"

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
