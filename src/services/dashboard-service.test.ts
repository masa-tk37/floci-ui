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

const allLoaders = {
  listTables: listTablesMock,
  listBuckets: listBucketsMock,
  listQueues: listQueuesMock,
  listParameters: listParametersMock,
  listSecrets: listSecretsMock,
  listUserPools: listUserPoolsMock,
}

describe("loadDashboardData", () => {
  it("returns service counts when all services succeed", async () => {
    const result = await loadDashboardData(allLoaders)
    expect(result.dynamodb).toEqual({ count: 2 })
    expect(result.s3).toEqual({ count: 2 })
    expect(result.sqs).toEqual({ count: 1 })
    expect(result.ssm).toEqual({ count: 1 })
    expect(result.secrets).toEqual({ count: 1 })
    expect(result.cognito).toEqual({ count: 1 })
  })

  it("marks failed service as error without affecting the others", async () => {
    listBucketsMock.mockRejectedValueOnce(new Error("connection refused"))

    const result = await loadDashboardData(allLoaders)

    expect(result.s3).toEqual({
      count: 0,
      error: "floci に接続できませんでした。",
    })
    expect(result.dynamodb).toEqual({ count: 2 })
    expect(result.sqs.error).toBeUndefined()
    expect(result.ssm.error).toBeUndefined()
    expect(result.secrets.error).toBeUndefined()
    expect(result.cognito.error).toBeUndefined()
  })
})
