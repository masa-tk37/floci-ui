import { describe, expect, it } from "bun:test"

import { buildAttachmentContentDisposition } from "./content-disposition"

describe("buildAttachmentContentDisposition", () => {
  it("keeps ascii filenames usable in the fallback", () => {
    expect(buildAttachmentContentDisposition("report.pdf")).toBe(
      `attachment; filename="report.pdf"; filename*=UTF-8''report.pdf`,
    )
  })

  it("encodes unicode filenames without emitting raw unicode in the header", () => {
    const header = buildAttachmentContentDisposition(
      "共有試験環境（MID 30132） 利用手引き_Ver4.1.pdf",
    )

    expect(header).toContain(`filename="`)
    expect(header).toContain(`.pdf"`)
    expect(header).toContain("filename*=UTF-8''")
    // biome-ignore lint/suspicious/noControlCharactersInRegex: testing that the header contains no non-ASCII bytes
    expect(/[^\x00-\x7F]/.test(header)).toBe(false)
    expect(() => new Headers({ "Content-Disposition": header })).not.toThrow()
  })
})

describe("buildAttachmentContentDisposition — edge cases", () => {
  it("uses download fallback when filename is empty string", () => {
    const header = buildAttachmentContentDisposition("")
    expect(header).toContain(`filename="download"`)
    expect(() => new Headers({ "Content-Disposition": header })).not.toThrow()
  })
})
