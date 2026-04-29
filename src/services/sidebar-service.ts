import { ListTablesCommand } from "@aws-sdk/client-dynamodb"
import { ListBucketsCommand } from "@aws-sdk/client-s3"
import { ListQueuesCommand } from "@aws-sdk/client-sqs"
import { dynamodb, s3, sqs } from "../infrastructure/floci-clients"
import { listUserPools } from "./cognito/cognito-service"
import { listSecrets } from "./secrets/secret-service"
import { queueNameFromUrl } from "./sqs/queue-utils"
import { listParameters } from "./ssm/parameter-service"

export interface SidebarData {
  tables: string[]
  buckets: string[]
  queues: string[]
  parameters: string[]
  secrets: string[]
  userPools: string[]
}

export function toSidebarCounts(data: SidebarData | undefined) {
  if (!data) return undefined
  return {
    tables: data.tables.length,
    buckets: data.buckets.length,
    queues: data.queues.length,
    parameters: data.parameters.length,
    secrets: data.secrets.length,
    userPools: data.userPools.length,
  }
}

export async function loadSidebarSafe(): Promise<SidebarData | undefined> {
  try {
    return await loadSidebar()
  } catch (e) {
    console.error("[sidebar] failed to load:", e)
    return undefined
  }
}

export async function loadSidebar(): Promise<SidebarData> {
  const [
    tablesResult,
    bucketsResult,
    queuesResult,
    parametersResult,
    secretsResult,
    userPoolsResult,
  ] = await Promise.all([
    dynamodb
      .send(new ListTablesCommand({}))
      .catch(() => ({ TableNames: [] as string[] })),
    s3
      .send(new ListBucketsCommand({}))
      .catch(() => ({ Buckets: [] as { Name?: string }[] })),
    sqs
      .send(new ListQueuesCommand({}))
      .catch(() => ({ QueueUrls: [] as string[] })),
    listParameters()
      .then((ps) => ps.map((p) => p.name))
      .catch(() => [] as string[]),
    listSecrets()
      .then((ss) => ss.map((s) => s.name))
      .catch(() => [] as string[]),
    listUserPools()
      .then((ps) => ps.map((p) => p.name))
      .catch(() => [] as string[]),
  ])

  return {
    tables: (tablesResult as { TableNames?: string[] }).TableNames ?? [],
    buckets: (
      (bucketsResult as { Buckets?: { Name?: string }[] }).Buckets ?? []
    )
      .map((bucket) => bucket.Name ?? "")
      .filter(Boolean),
    queues: ((queuesResult as { QueueUrls?: string[] }).QueueUrls ?? []).map(
      queueNameFromUrl,
    ),
    parameters: parametersResult,
    secrets: secretsResult,
    userPools: userPoolsResult,
  }
}
