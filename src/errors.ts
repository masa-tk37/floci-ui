export type ServiceErrorCode =
  | "NotFound"
  | "AlreadyExists"
  | "InvalidInput"
  | "OperationFailed"

export class ServiceError extends Error {
  constructor(
    public readonly code: ServiceErrorCode,
    message: string,
    public readonly cause?: unknown,
    /** Underlying SDK exception or socket error name, when there was one. */
    public readonly awsCode?: string,
  ) {
    super(message)
    this.name = "ServiceError"
  }
}

export function httpStatusFor(code: ServiceErrorCode): number {
  switch (code) {
    case "NotFound":
      return 404
    case "AlreadyExists":
      return 409
    case "InvalidInput":
      return 400
    case "OperationFailed":
      return 500
  }
}

export function toOperationFailed(e: unknown): never {
  if (e instanceof ServiceError) throw e
  throw new ServiceError(
    "OperationFailed",
    e instanceof Error ? e.message : String(e),
    e,
    awsCodeOf(e),
  )
}

function awsCodeOf(e: unknown): string | undefined {
  if (typeof e !== "object" || e === null) return undefined
  const { name, code } = e as { name?: unknown; code?: unknown }
  if (typeof name === "string" && name !== "Error") return name
  if (typeof code === "string") return code
  return undefined
}
