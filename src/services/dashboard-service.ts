import { listUserPools } from "./cognito/cognito-service"
import { listTables } from "./dynamodb/table-service"
import { listBuckets } from "./s3/bucket-service"
import { listSecrets } from "./secrets/secret-service"
import { listQueues } from "./sqs/queue-service"
import { listParameters } from "./ssm/parameter-service"

const CONNECTION_ERROR = "floci に接続できませんでした。"

export interface DashboardServiceStatus {
  count: number
  items: string[]
  error?: string
}

export interface DashboardNamedStatus {
  count: number
  items: { id: string; name: string }[]
  error?: string
}

export interface DashboardData {
  dynamodb: DashboardServiceStatus
  s3: DashboardServiceStatus
  sqs: DashboardServiceStatus
  ssm: DashboardServiceStatus
  secrets: DashboardServiceStatus
  cognito: DashboardNamedStatus
  sidebarCounts?:
    | {
        tables: number
        buckets: number
        queues: number
        parameters: number
        secrets: number
        userPools: number
      }
    | undefined
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
  result: PromiseSettledResult<string[]>,
): DashboardServiceStatus {
  if (result.status === "fulfilled") {
    return {
      count: result.value.length,
      items: result.value.slice(0, 5),
    }
  }

  return {
    count: 0,
    items: [],
    error: CONNECTION_ERROR,
  }
}

function namedStatusFromResult(
  result: PromiseSettledResult<{ id: string; name: string }[]>,
): DashboardNamedStatus {
  if (result.status === "fulfilled") {
    return {
      count: result.value.length,
      items: result.value.slice(0, 5),
    }
  }

  return {
    count: 0,
    items: [],
    error: CONNECTION_ERROR,
  }
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
    loaders
      .listBuckets()
      .then((buckets) => buckets.map((bucket) => bucket.name)),
    loaders.listQueues().then((queues) => queues.map((queue) => queue.name)),
    loaders
      .listParameters()
      .then((parameters) => parameters.map((parameter) => parameter.name)),
    loaders
      .listSecrets()
      .then((secrets) => secrets.map((secret) => secret.name)),
    loaders
      .listUserPools()
      .then((userPools) =>
        userPools.map((userPool) => ({ id: userPool.id, name: userPool.name })),
      ),
  ])

  return {
    dynamodb: statusFromResult(tablesResult),
    s3: statusFromResult(bucketsResult),
    sqs: statusFromResult(queuesResult),
    ssm: statusFromResult(parametersResult),
    secrets: statusFromResult(secretsResult),
    cognito: namedStatusFromResult(userPoolsResult),
    sidebarCounts:
      tablesResult.status === "fulfilled" &&
      bucketsResult.status === "fulfilled" &&
      queuesResult.status === "fulfilled" &&
      parametersResult.status === "fulfilled" &&
      secretsResult.status === "fulfilled" &&
      userPoolsResult.status === "fulfilled"
        ? {
            tables: tablesResult.value.length,
            buckets: bucketsResult.value.length,
            queues: queuesResult.value.length,
            parameters: parametersResult.value.length,
            secrets: secretsResult.value.length,
            userPools: userPoolsResult.value.length,
          }
        : undefined,
  }
}
