import { listUserPools } from "./cognito/cognito-service"
import { listTables } from "./dynamodb/table-service"
import { listBuckets } from "./s3/bucket-service"
import { listSecrets } from "./secrets/secret-service"
import { listQueueNames } from "./sqs/queue-service"
import { listParameters } from "./ssm/parameter-service"

export interface SidebarData {
  tables: string[]
  buckets: string[]
  queues: string[]
  parameters: string[]
  secrets: string[]
  userPools: string[]
}

export interface SidebarLoaders {
  listTables: typeof listTables
  listBuckets: typeof listBuckets
  listQueueNames: typeof listQueueNames
  listParameters: typeof listParameters
  listSecrets: typeof listSecrets
  listUserPools: typeof listUserPools
}

const defaultSidebarLoaders: SidebarLoaders = {
  listTables,
  listBuckets,
  listQueueNames,
  listParameters,
  listSecrets,
  listUserPools,
}

export async function loadSidebarSafe(
  loaders: SidebarLoaders = defaultSidebarLoaders,
): Promise<SidebarData | undefined> {
  try {
    return await loadSidebar(loaders)
  } catch (e) {
    console.error("[sidebar] failed to load:", e)
    return undefined
  }
}

export async function loadSidebar(
  loaders: SidebarLoaders = defaultSidebarLoaders,
): Promise<SidebarData> {
  const [
    tablesResult,
    bucketsResult,
    queuesResult,
    parametersResult,
    secretsResult,
    userPoolsResult,
  ] = await Promise.allSettled([
    loaders.listTables(),
    loaders.listBuckets().then((bs) => bs.map((b) => b.name)),
    loaders.listQueueNames(),
    loaders.listParameters().then((ps) => ps.map((p) => p.name)),
    loaders.listSecrets().then((ss) => ss.map((s) => s.name)),
    loaders.listUserPools().then((ps) => ps.map((p) => p.name)),
  ])

  return {
    tables: tablesResult.status === "fulfilled" ? tablesResult.value : [],
    buckets: bucketsResult.status === "fulfilled" ? bucketsResult.value : [],
    queues: queuesResult.status === "fulfilled" ? queuesResult.value : [],
    parameters:
      parametersResult.status === "fulfilled" ? parametersResult.value : [],
    secrets: secretsResult.status === "fulfilled" ? secretsResult.value : [],
    userPools:
      userPoolsResult.status === "fulfilled" ? userPoolsResult.value : [],
  }
}
