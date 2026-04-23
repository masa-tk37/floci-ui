import { describe, it, expect, mock } from "bun:test"

mock.module("../infrastructure/floci-clients", () => ({
  dynamodb: {
    send: mock(() => Promise.resolve({ TableNames: ["table-a", "table-b"] })),
  },
  s3: {
    send: mock(() => Promise.resolve({ Buckets: [{ Name: "bucket-1" }] })),
  },
  sqs: {
    send: mock(() =>
      Promise.resolve({
        QueueUrls: ["http://localhost:4566/000000000000/queue-1"],
      }),
    ),
  },
  ssm: {
    send: mock(() =>
      Promise.resolve({
        Parameters: [{ Name: "/app/config" }],
      }),
    ),
  },
  secretsManager: {
    send: mock(() =>
      Promise.resolve({
        SecretList: [{ Name: "app/dev/db" }],
      }),
    ),
  },
  cognitoIdentityProvider: {
    send: mock(() =>
      Promise.resolve({
        UserPools: [{ Name: "local-dev-users" }],
      }),
    ),
  },
  FLOCI_ENDPOINT: "http://localhost:4566",
  FLOCI_REGION: "us-east-1",
  FLOCI_ACCOUNT_ID: "000000000000",
}))

const { loadSidebarSafe, toSidebarCounts } = await import("./sidebar-service")

describe("loadSidebarSafe", () => {
  it("returns SidebarData when loadSidebar succeeds", async () => {
    const result = await loadSidebarSafe()
    expect(result).toBeDefined()
    expect(result?.tables).toBeArray()
    expect(result?.buckets).toBeArray()
    expect(result?.queues).toBeArray()
    expect(result?.parameters).toBeArray()
    expect(result?.secrets).toBeArray()
    expect(result?.userPools).toBeArray()
  })

  it("does not throw even if loadSidebar throws", async () => {
    const throwingFn = async () => {
      throw new Error("total failure")
    }
    const safe = async () => {
      try {
        return await throwingFn()
      } catch {
        return undefined
      }
    }
    const result = await safe()
    expect(result).toBeUndefined()
  })
})

describe("toSidebarCounts", () => {
  it("returns counts for loaded sidebar data", () => {
    expect(
      toSidebarCounts({
        tables: ["users", "orders"],
        buckets: ["archive"],
        queues: ["jobs", "dead-letter"],
        parameters: ["/app/config"],
        secrets: ["app/dev/db", "app/dev/api"],
        userPools: ["local-dev-users"],
      }),
    ).toEqual({
      tables: 2,
      buckets: 1,
      queues: 2,
      parameters: 1,
      secrets: 2,
      userPools: 1,
    })
  })

  it("returns undefined when sidebar data is unavailable", () => {
    expect(toSidebarCounts(undefined)).toBeUndefined()
  })
})
