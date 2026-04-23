import { httpStatusFor, ServiceError } from "../errors"

export function respondWithError(
  error: unknown,
  set: { status?: number | string },
) {
  if (error instanceof ServiceError) {
    set.status = httpStatusFor(error.code)
    return { error: error.message }
  }

  set.status = 500
  return { error: "Internal server error" }
}
