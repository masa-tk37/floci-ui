import { ServiceError } from "../errors"
import { listUserPools } from "./cognito/cognito-service"
import { listTables } from "./dynamodb/table-service"
import { listBuckets } from "./s3/bucket-service"
import { listSecrets } from "./secrets/secret-service"
import { listQueueNames } from "./sqs/queue-service"
import { listParameters } from "./ssm/parameter-service"

const CONNECTION_ERROR = "floci に接続できませんでした。"

// Socket-level failures mean floci never answered; any other code came from floci itself.
const UNREACHABLE_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENOTFOUND",
  "EPIPE",
  "ETIMEDOUT",
  "TimeoutError",
])

export interface DashboardServiceStatus {
  count: number
  error?: string
}

export interface DashboardData {
  dynamodb: DashboardServiceStatus
  s3: DashboardServiceStatus
  sqs: DashboardServiceStatus
  ssm: DashboardServiceStatus
  secrets: DashboardServiceStatus
  cognito: DashboardServiceStatus
}

export interface DashboardLoaders {
  listTables: typeof listTables
  listBuckets: typeof listBuckets
  listQueueNames: typeof listQueueNames
  listParameters: typeof listParameters
  listSecrets: typeof listSecrets
  listUserPools: typeof listUserPools
}

function statusFromResult(
  result: PromiseSettledResult<unknown[]>,
): DashboardServiceStatus {
  if (result.status === "fulfilled") {
    return { count: result.value.length }
  }

  const awsCode =
    result.reason instanceof ServiceError ? result.reason.awsCode : undefined
  if (awsCode === undefined || UNREACHABLE_CODES.has(awsCode)) {
    return { count: 0, error: CONNECTION_ERROR }
  }
  return { count: 0, error: `一覧の取得に失敗しました (${awsCode})。` }
}

export async function loadDashboardData(
  loaders: DashboardLoaders = {
    listTables,
    listBuckets,
    listQueueNames,
    listParameters,
    listSecrets,
    listUserPools,
  },
): Promise<DashboardData> {
  const [
    tablesResult,
    bucketsResult,
    queuesResult,
    parametersResult,
    secretsResult,
    userPoolsResult,
  ] = await Promise.allSettled([
    loaders.listTables(),
    loaders.listBuckets(),
    loaders.listQueueNames(),
    loaders.listParameters(),
    loaders.listSecrets(),
    loaders.listUserPools(),
  ])

  return {
    dynamodb: statusFromResult(tablesResult),
    s3: statusFromResult(bucketsResult),
    sqs: statusFromResult(queuesResult),
    ssm: statusFromResult(parametersResult),
    secrets: statusFromResult(secretsResult),
    cognito: statusFromResult(userPoolsResult),
  }
}
