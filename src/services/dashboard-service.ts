import { listUserPools } from "./cognito/cognito-service"
import { listTables } from "./dynamodb/table-service"
import { listBuckets } from "./s3/bucket-service"
import { listSecrets } from "./secrets/secret-service"
import { listQueues } from "./sqs/queue-service"
import { listParameters } from "./ssm/parameter-service"

const CONNECTION_ERROR = "floci に接続できませんでした。"

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
  listQueues: typeof listQueues
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

  return { count: 0, error: CONNECTION_ERROR }
}

export async function loadDashboardData(
  loaders: DashboardLoaders = {
    listTables,
    listBuckets,
    listQueues,
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
    loaders.listQueues(),
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
