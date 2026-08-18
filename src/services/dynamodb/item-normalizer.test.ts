import { describe, expect, it } from "bun:test"
import { findLossyAttributes, normalizeItem } from "./item-normalizer"

describe("normalizeItem", () => {
  it("should render Binary as base64 instead of an indexed object", () => {
    const result = normalizeItem({ blob: { B: new Uint8Array([1, 2, 3]) } })
    expect(result).toEqual({ blob: "AQID" })
  })

  it("should render String and Number sets as arrays instead of empty objects", () => {
    const result = normalizeItem({
      tags: { SS: ["b", "a"] },
      scores: { NS: ["10", "2"] },
    })
    expect(result).toEqual({ tags: ["b", "a"], scores: [10, 2] })
  })

  it("should render Binary sets as base64 arrays", () => {
    const result = normalizeItem({
      blobs: { BS: [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5])] },
    })
    expect(result).toEqual({ blobs: ["AQID", "BAU="] })
  })

  it("should keep numbers that exceed JS precision as their canonical string", () => {
    const result = normalizeItem({
      big: { N: "123456789012345678901234567890" },
      small: { N: "42" },
      negative: { N: "-1.5" },
    })
    expect(result).toEqual({
      big: "123456789012345678901234567890",
      small: 42,
      negative: -1.5,
    })
  })

  it("should normalize values nested in maps and lists", () => {
    const result = normalizeItem({
      payload: {
        M: {
          blob: { B: new Uint8Array([255]) },
          items: { L: [{ N: "1" }, { SS: ["x"] }] },
        },
      },
    })
    expect(result).toEqual({
      payload: { blob: "/w==", items: [1, ["x"]] },
    })
  })

  it("should leave plain scalars untouched", () => {
    const result = normalizeItem({
      name: { S: "hello" },
      active: { BOOL: true },
      missing: { NULL: true },
    })
    expect(result).toEqual({ name: "hello", active: true, missing: null })
  })
})

describe("findLossyAttributes", () => {
  it("should report Binary and Set attributes", () => {
    const lossy = findLossyAttributes({
      blob: { B: new Uint8Array([1]) },
      tags: { SS: ["a"] },
      scores: { NS: ["1"] },
      blobs: { BS: [new Uint8Array([1])] },
      name: { S: "safe" },
    })
    expect(lossy.sort()).toEqual(["blob", "blobs", "scores", "tags"])
  })

  it("should report attributes nested in maps and lists", () => {
    const lossy = findLossyAttributes({
      payload: { M: { inner: { B: new Uint8Array([1]) } } },
      history: { L: [{ S: "ok" }, { SS: ["a"] }] },
    })
    expect(lossy.sort()).toEqual(["history", "payload"])
  })

  it("should report numbers that only survive display as a string", () => {
    const lossy = findLossyAttributes({
      big: { N: "123456789012345678901234567890" },
      small: { N: "42" },
      nested: { M: { precise: { N: "0.1234567890123456789" } } },
    })
    expect(lossy.sort()).toEqual(["big", "nested"])
  })

  it("should report nothing for round-trippable items", () => {
    const lossy = findLossyAttributes({
      id: { S: "pk" },
      count: { N: "1" },
      active: { BOOL: false },
      nested: { M: { list: { L: [{ N: "1" }] } } },
    })
    expect(lossy).toEqual([])
  })
})
