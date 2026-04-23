import { beforeEach, describe, expect, it, mock } from "bun:test"

import { loadDashboardData } from "./dashboard-service"

const listTablesMock = mock(() => Promise.resolve(["users", "orders"]))
const listBucketsMock = mock(() =>
  Promise.resolve([{ name: "archive" }, { name: "uploads" }]),
)
const listQueuesMock = mock(() =>
  Promise.resolve([{ name: "jobs", depth: 0, dlqName: null }]),
)
const listParametersMock = mock(() =>
  Promise.resolve([
    {
      name: "/app/config",
      type: "String" as const,
      tier: "Standard" as const,
      description: "",
      keyId: "",
    },
  ]),
)
const listSecretsMock = mock(() =>
  Promise.resolve([
    {
      name: "app/dev/db",
      arn: "",
      description: "",
      kmsKeyId: "",
    },
  ]),
)
const listUserPoolsMock = mock(() =>
  Promise.resolve([
    {
      id: "pool-123",
      name: "local-dev-users",
    },
  ]),
)

beforeEach(() => {
  listTablesMock.mockClear()
  listBucketsMock.mockClear()
  listQueuesMock.mockClear()
  listParametersMock.mockClear()
  listSecretsMock.mockClear()
  listUserPoolsMock.mockClear()
})

describe("loadDashboardData", () => {
  it("returns service counts and sidebar counts when all services succeed", async () => {
    const result = await loadDashboardData({
      listTables: listTablesMock,
      listBuckets: listBucketsMock,
      listQueues: listQueuesMock,
      listParameters: listParametersMock,
      listSecrets: listSecretsMock,
      listUserPools: listUserPoolsMock,
    })
    expect(result.dynamodb).toEqual({
      count: 2,
      items: ["users", "orders"],
    })
    expect(result.s3).toEqual({
      count: 2,
      items: ["archive", "uploads"],
    })
    expect(result.sqs).toEqual({
      count: 1,
      items: ["jobs"],
    })
    expect(result.ssm).toEqual({
      count: 1,
      items: ["/app/config"],
    })
    expect(result.secrets).toEqual({
      count: 1,
      items: ["app/dev/db"],
    })
    expect(result.cognito).toEqual({
      count: 1,
      items: [{ id: "pool-123", name: "local-dev-users" }],
    })
    expect(result.sidebarCounts).toEqual({
      tables: 2,
      buckets: 2,
      queues: 1,
      parameters: 1,
      secrets: 1,
      userPools: 1,
    })
  })

  it("marks the dashboard offline when any service fails", async () => {
    listBucketsMock.mockRejectedValueOnce(new Error("connection refused"))

    const result = await loadDashboardData({
      listTables: listTablesMock,
      listBuckets: listBucketsMock,
      listQueues: listQueuesMock,
      listParameters: listParametersMock,
      listSecrets: listSecretsMock,
      listUserPools: listUserPoolsMock,
    })

    expect(result.dynamodb.error).toBeUndefined()
    expect(result.s3).toEqual({
      count: 0,
      items: [],
      error: "floci に接続できませんでした。",
    })
    expect(result.sqs.error).toBeUndefined()
    expect(result.ssm.error).toBeUndefined()
    expect(result.secrets.error).toBeUndefined()
    expect(result.cognito.error).toBeUndefined()
    expect(result.sidebarCounts).toBeUndefined()
  })
})
