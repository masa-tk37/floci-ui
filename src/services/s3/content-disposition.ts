import { posix as path } from "node:path"

function sanitizeAsciiToken(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]+/g, "_")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

function asciiFallbackFilename(filename: string): string {
  const basename = path.basename(filename) || "download"
  const extension = path.extname(basename)
  const stem = extension ? basename.slice(0, -extension.length) : basename

  const safeStem = sanitizeAsciiToken(stem) || "download"
  const safeExtension = extension
    ? `.${sanitizeAsciiToken(extension.slice(1))}`
    : ""

  return `${safeStem}${safeExtension}`
}

function encodeDispositionFilename(filename: string): string {
  return encodeURIComponent(filename).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  )
}

export function buildAttachmentContentDisposition(filename: string): string {
  const fallback = asciiFallbackFilename(filename)
  const encoded = encodeDispositionFilename(filename)

  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`
}
