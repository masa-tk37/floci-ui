import { Elysia, ValidationError } from "elysia"
import { httpStatusFor, ServiceError } from "./errors"
import { FLOCI_ENDPOINT } from "./infrastructure/floci-clients"
import { type CognitoRouteDeps, createCognitoRoutes } from "./routes/cognito"
import {
  createDashboardRoutes,
  type DashboardRouteDeps,
} from "./routes/dashboard"
import { createDynamodbRoutes, type DynamodbRouteDeps } from "./routes/dynamodb"
import {
  isJsonApiRequest,
  respondWithError,
  respondWithFrameworkError,
} from "./routes/route-utils"
import { createS3Routes, type S3RouteDeps } from "./routes/s3"
import { createSecretsRoutes, type SecretsRouteDeps } from "./routes/secrets"
import { createSqsRoutes, type SqsRouteDeps } from "./routes/sqs"
import { createSsmRoutes, type SsmRouteDeps } from "./routes/ssm"
import { renderErrorPage, serviceFromPath } from "./views/error-page"

export interface AppRouteDeps {
  cognito?: CognitoRouteDeps
  dashboard?: DashboardRouteDeps
  dynamodb?: DynamodbRouteDeps
  s3?: S3RouteDeps
  secrets?: SecretsRouteDeps
  sqs?: SqsRouteDeps
  ssm?: SsmRouteDeps
}

function pageErrorStatus(error: unknown): number {
  if (error instanceof ValidationError) return httpStatusFor("InvalidInput")
  if (error instanceof ServiceError) return httpStatusFor(error.code)
  return 500
}

function renderPageError(
  code: string | number,
  error: unknown,
  request: Request,
): Response {
  const { pathname, search } = new URL(request.url)
  const notFound = code === "NOT_FOUND"
  const status = notFound ? 404 : pageErrorStatus(error)

  return new Response(
    renderErrorPage({
      service: serviceFromPath(pathname),
      status,
      message: notFound
        ? "このパスに対応する画面がない。"
        : error instanceof Error
          ? error.message
          : String(error),
      awsCode: error instanceof ServiceError ? error.awsCode : undefined,
      endpoint: FLOCI_ENDPOINT,
      // Keeps the query string so 再試行 reloads the same page, not its bare path.
      path: `${pathname}${search}`,
    }),
    { status, headers: { "content-type": "text/html; charset=utf-8" } },
  )
}

export function createApp(deps: AppRouteDeps = {}) {
  return new Elysia()
    .onError(({ code, error, request, set }) => {
      if (!isJsonApiRequest(request)) {
        return renderPageError(code, error, request)
      }

      if (error instanceof ValidationError) {
        return respondWithFrameworkError("InvalidInput", error.message, set)
      }

      if (code === "NOT_FOUND") {
        return respondWithFrameworkError("NotFound", "Route not found", set)
      }

      return respondWithError(error, set)
    })
    .use(createDashboardRoutes(deps.dashboard))
    .use(createDynamodbRoutes(deps.dynamodb))
    .use(createS3Routes(deps.s3))
    .use(createSqsRoutes(deps.sqs))
    .use(createSsmRoutes(deps.ssm))
    .use(createSecretsRoutes(deps.secrets))
    .use(createCognitoRoutes(deps.cognito))
}
