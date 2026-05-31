import { ServiceError } from "../errors"

export function encodeResourceName(name: string): string {
  return Buffer.from(name, "utf8").toString("base64url")
}

export function decodeResourceName(encoded: string): string {
  try {
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(
      Buffer.from(encoded, "base64url"),
    )
    if (!decoded) {
      throw new Error("Empty resource name")
    }
    return decoded
  } catch (error) {
    throw new ServiceError("InvalidInput", "Invalid resource identifier", error)
  }
}
