import { ValidationError } from "elysia"
import { Elysia } from "elysia"
import { createCognitoRoutes, type CognitoRouteDeps } from "./routes/cognito"
import {
  createDashboardRoutes,
  type DashboardRouteDeps,
} from "./routes/dashboard"
import { createDynamodbRoutes, type DynamodbRouteDeps } from "./routes/dynamodb"
import {
  isJsonApiRequest,
  respondWithFrameworkError,
  respondWithError,
} from "./routes/route-utils"
import { createS3Routes, type S3RouteDeps } from "./routes/s3"
import { createSecretsRoutes, type SecretsRouteDeps } from "./routes/secrets"
import { createSqsRoutes, type SqsRouteDeps } from "./routes/sqs"
import { createSsmRoutes, type SsmRouteDeps } from "./routes/ssm"

export interface AppRouteDeps {
  cognito?: CognitoRouteDeps
  dashboard?: DashboardRouteDeps
  dynamodb?: DynamodbRouteDeps
  s3?: S3RouteDeps
  secrets?: SecretsRouteDeps
  sqs?: SqsRouteDeps
  ssm?: SsmRouteDeps
}

export function createApp(deps: AppRouteDeps = {}) {
  return new Elysia()
    .onError(({ code, error, request, set }) => {
      if (!isJsonApiRequest(request)) {
        return
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
