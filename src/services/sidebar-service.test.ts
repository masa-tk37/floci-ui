import { beforeEach, describe, expect, it, mock } from "bun:test"
import { loadSidebar, loadSidebarSafe } from "./sidebar-service"

const listTablesMock = mock(() => Promise.resolve(["table-a", "table-b"]))
const listBucketsMock = mock(() => Promise.resolve([{ name: "bucket-1" }]))
const listQueueNamesMock = mock(() => Promise.resolve(["queue-1"]))
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
    { name: "app/dev/db", arn: "", description: "", kmsKeyId: "" },
  ]),
)
const listUserPoolsMock = mock(() =>
  Promise.resolve([{ id: "pool-123", name: "local-dev-users" }]),
)

const defaultLoaders = {
  listTables: listTablesMock,
  listBuckets: listBucketsMock,
  listQueueNames: listQueueNamesMock,
  listParameters: listParametersMock,
  listSecrets: listSecretsMock,
  listUserPools: listUserPoolsMock,
}

beforeEach(() => {
  listTablesMock.mockClear()
  listBucketsMock.mockClear()
  listQueueNamesMock.mockClear()
  listParametersMock.mockClear()
  listSecretsMock.mockClear()
  listUserPoolsMock.mockClear()
})

describe("loadSidebar", () => {
  it("returns SidebarData when all services succeed", async () => {
    const result = await loadSidebar(defaultLoaders)
    expect(result).toEqual({
      tables: ["table-a", "table-b"],
      buckets: ["bucket-1"],
      queues: ["queue-1"],
      parameters: ["/app/config"],
      secrets: ["app/dev/db"],
      userPools: ["local-dev-users"],
    })
  })

  it("returns empty array for a failed service", async () => {
    listBucketsMock.mockRejectedValueOnce(new Error("connection refused"))
    const result = await loadSidebar(defaultLoaders)
    expect(result.buckets).toEqual([])
    expect(result.tables).toEqual(["table-a", "table-b"])
  })
})

describe("loadSidebarSafe", () => {
  it("returns SidebarData when loadSidebar succeeds", async () => {
    const result = await loadSidebarSafe(defaultLoaders)
    expect(result).toBeDefined()
    expect(result?.tables).toBeArray()
    expect(result?.buckets).toBeArray()
    expect(result?.queues).toBeArray()
    expect(result?.parameters).toBeArray()
    expect(result?.secrets).toBeArray()
    expect(result?.userPools).toBeArray()
  })
})
