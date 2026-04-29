import { beforeEach, describe, expect, it, mock } from "bun:test"

// Mock the dynamodb client before importing table-service
const mockSend = mock(() => Promise.resolve({}))
mock.module("../../infrastructure/floci-clients", () => ({
  dynamodb: { send: mockSend },
  s3: { send: mockSend },
  sqs: { send: mockSend },
  FLOCI_ENDPOINT: "http://localhost:4566",
  FLOCI_REGION: "us-east-1",
  FLOCI_ACCOUNT_ID: "000000000000",
}))

import {
  clearKeyInfoCache,
  createTable,
  deleteItem,
  deleteTable,
  getItem,
  getTableDetail,
  listTables,
  queryItems,
  saveItem,
  scanItems,
  updateTable,
} from "./table-service"

beforeEach(() => {
  mockSend.mockClear()
  clearKeyInfoCache()
})

describe("listTables", () => {
  it("should return table names", async () => {
    mockSend.mockResolvedValueOnce({ TableNames: ["table1", "table2"] })
    const result = await listTables()
    expect(result).toEqual(["table1", "table2"])
  })

  it("should return empty array when no tables", async () => {
    mockSend.mockResolvedValueOnce({ TableNames: undefined })
    const result = await listTables()
    expect(result).toEqual([])
  })
})

describe("getTableDetail", () => {
  it("should return table detail", async () => {
    // Promise.all calls: [DescribeTable, DescribeTimeToLive]
    mockSend
      .mockResolvedValueOnce({
        Table: {
          BillingModeSummary: { BillingMode: "PAY_PER_REQUEST" },
          ProvisionedThroughput: {
            ReadCapacityUnits: 5,
            WriteCapacityUnits: 5,
          },
          StreamSpecification: {
            StreamEnabled: false,
            StreamViewType: "NEW_AND_OLD_IMAGES",
          },
          DeletionProtectionEnabled: false,
        },
      })
      .mockResolvedValueOnce({
        TimeToLiveDescription: {
          TimeToLiveStatus: "DISABLED",
          AttributeName: "",
        },
      })
    const result = await getTableDetail("my-table")
    expect(result.tableName).toBe("my-table")
    expect(result.billingMode).toBe("PAY_PER_REQUEST")
    expect(result.ttlEnabled).toBe(false)
  })
})

describe("createTable", () => {
  it("should call CreateTableCommand", async () => {
    mockSend.mockResolvedValueOnce({})
    await expect(
      createTable({
        TableName: "new-table",
        AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
        KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
        BillingMode: "PAY_PER_REQUEST",
      }),
    ).resolves.toBeUndefined()
    expect(mockSend).toHaveBeenCalledTimes(1)
  })

  it("should throw ServiceError AlreadyExists on ResourceInUseException", async () => {
    const awsError = Object.assign(new Error("Table already exists"), {
      name: "ResourceInUseException",
    })
    mockSend.mockRejectedValueOnce(awsError)
    await expect(
      createTable({
        TableName: "existing-table",
        AttributeDefinitions: [],
        KeySchema: [],
        BillingMode: "PAY_PER_REQUEST",
      }),
    ).rejects.toMatchObject({ code: "AlreadyExists" })
  })

  it("should throw ServiceError OperationFailed on other errors", async () => {
    mockSend.mockRejectedValueOnce(new Error("some other error"))
    await expect(
      createTable({
        TableName: "table",
        AttributeDefinitions: [],
        KeySchema: [],
        BillingMode: "PAY_PER_REQUEST",
      }),
    ).rejects.toMatchObject({ code: "OperationFailed" })
  })
})

describe("deleteTable", () => {
  it("should call DeleteTableCommand", async () => {
    mockSend.mockResolvedValueOnce({})
    await expect(deleteTable("my-table")).resolves.toBeUndefined()
    expect(mockSend).toHaveBeenCalledTimes(1)
  })

  it("should throw ServiceError NotFound on ResourceNotFoundException", async () => {
    const awsError = Object.assign(new Error("Table not found"), {
      name: "ResourceNotFoundException",
    })
    mockSend.mockRejectedValueOnce(awsError)
    await expect(deleteTable("missing-table")).rejects.toMatchObject({
      code: "NotFound",
    })
  })
})

describe("updateTable", () => {
  it("should call UpdateTableCommand and UpdateTimeToLiveCommand", async () => {
    mockSend.mockResolvedValueOnce({}).mockResolvedValueOnce({})
    await expect(
      updateTable("my-table", {
        billingMode: "PAY_PER_REQUEST",
        rcu: 5,
        wcu: 5,
        streamEnabled: false,
        streamViewType: "NEW_AND_OLD_IMAGES",
        ttlEnabled: false,
        ttlAttr: "",
        deletionProtection: false,
      }),
    ).resolves.toBeUndefined()
    expect(mockSend).toHaveBeenCalledTimes(2)
  })
})

describe("scanItems", () => {
  it("should return items with key info", async () => {
    mockSend
      .mockResolvedValueOnce({
        Table: {
          KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
          AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
        },
      })
      .mockResolvedValueOnce({
        Items: [{ id: { S: "item1" } }],
        LastEvaluatedKey: undefined,
      })
    const result = await scanItems("my-table")
    expect(result.items).toHaveLength(1)
    expect(result.hashKey).toBe("id")
    expect(result.nextCursor).toBeUndefined()
  })

  it("should encode nextCursor when LastEvaluatedKey exists", async () => {
    mockSend
      .mockResolvedValueOnce({
        Table: {
          KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
          AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
        },
      })
      .mockResolvedValueOnce({
        Items: [],
        LastEvaluatedKey: { id: { S: "last-key" } },
      })
    const result = await scanItems("my-table")
    expect(result.nextCursor).toBeTypeOf("string")
  })
})

describe("queryItems", () => {
  it("should return items for query mode", async () => {
    mockSend.mockResolvedValueOnce({
      Items: [{ id: { S: "item1" } }],
      LastEvaluatedKey: undefined,
    })
    const result = await queryItems("my-table", {
      mode: "query",
      keyConditionExpression: "id = :id",
      expressionAttributeValuesJson: JSON.stringify({ ":id": "item1" }),
    })
    expect(result.items).toHaveLength(1)
  })

  it("should return items for scan mode", async () => {
    mockSend.mockResolvedValueOnce({
      Items: [],
      LastEvaluatedKey: undefined,
    })
    const result = await queryItems("my-table", { mode: "scan" })
    expect(result.items).toHaveLength(0)
  })

  it("should throw ServiceError InvalidInput when keyConditionExpression missing for query mode", async () => {
    await expect(
      queryItems("my-table", { mode: "query" }),
    ).rejects.toMatchObject({ code: "InvalidInput" })
  })
})

describe("getItem", () => {
  it("should return an unmarshalled item for editing", async () => {
    mockSend
      .mockResolvedValueOnce({
        Table: {
          TableArn: "arn:aws:dynamodb:us-east-1:000000000000:table/my-table",
          KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
          AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
        },
      })
      .mockResolvedValueOnce({
        Item: {
          id: { S: "pk-value" },
          email: { S: "user@example.com" },
        },
      })

    const result = await getItem("my-table", "pk-value")

    expect(result.item).toEqual({
      id: "pk-value",
      email: "user@example.com",
    })
    expect(result.hashKey).toBe("id")
    expect(result.tableArn).toContain("my-table")
  })
})

describe("saveItem", () => {
  it("should save an item when route keys match", async () => {
    mockSend
      .mockResolvedValueOnce({
        Table: {
          KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
          AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
        },
      })
      .mockResolvedValueOnce({})

    await expect(
      saveItem("my-table", "pk-value", {
        id: "pk-value",
        email: "user@example.com",
      }),
    ).resolves.toBeUndefined()

    const calls = mockSend.mock.calls as unknown[][]
    expect((calls[1]?.[0] as { input?: unknown })?.input).toMatchObject({
      TableName: "my-table",
    })
  })

  it("should reject item saves that change the hash key", async () => {
    mockSend.mockResolvedValueOnce({
      Table: {
        KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
        AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
      },
    })

    await expect(
      saveItem("my-table", "pk-value", {
        id: "other-value",
      }),
    ).rejects.toMatchObject({
      code: "InvalidInput",
    })
  })
})

describe("deleteItem", () => {
  it("should delete item with hash key only", async () => {
    mockSend
      .mockResolvedValueOnce({
        Table: {
          KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
          AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
        },
      })
      .mockResolvedValueOnce({})
    await expect(deleteItem("my-table", "pk-value")).resolves.toBeUndefined()
    expect(mockSend).toHaveBeenCalledTimes(2)
  })

  it("should throw ServiceError InvalidInput when composite key table has no sk provided", async () => {
    mockSend.mockResolvedValueOnce({
      Table: {
        KeySchema: [
          { AttributeName: "id", KeyType: "HASH" },
          { AttributeName: "sk", KeyType: "RANGE" },
        ],
        AttributeDefinitions: [
          { AttributeName: "id", AttributeType: "S" },
          { AttributeName: "sk", AttributeType: "S" },
        ],
      },
    })
    await expect(deleteItem("my-table", "pk-value")).rejects.toHaveProperty(
      "code",
      "InvalidInput",
    )
  })

  it("should delete item with hash and sort key", async () => {
    mockSend
      .mockResolvedValueOnce({
        Table: {
          KeySchema: [
            { AttributeName: "id", KeyType: "HASH" },
            { AttributeName: "sk", KeyType: "RANGE" },
          ],
          AttributeDefinitions: [
            { AttributeName: "id", AttributeType: "S" },
            { AttributeName: "sk", AttributeType: "S" },
          ],
        },
      })
      .mockResolvedValueOnce({})
    await expect(
      deleteItem("my-table", "pk-value", "sk-value"),
    ).resolves.toBeUndefined()
  })

  it("should throw ServiceError InvalidInput when sk provided but table has no sort key", async () => {
    mockSend.mockResolvedValueOnce({
      Table: {
        KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
        AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
      },
    })
    await expect(
      deleteItem("my-table", "pk-value", "sk-value"),
    ).rejects.toHaveProperty("code", "InvalidInput")
  })
})

describe("getItem (NotFound)", () => {
  it("throws NotFound when Item is undefined in response", async () => {
    mockSend
      .mockResolvedValueOnce({
        Table: {
          KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
          AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
        },
      })
      .mockResolvedValueOnce({ Item: undefined })

    await expect(getItem("my-table", "missing-key")).rejects.toMatchObject({
      code: "NotFound",
    })
  })
})

describe("saveItem (sort key change)", () => {
  it("throws InvalidInput when sort key value differs from route key", async () => {
    mockSend.mockResolvedValueOnce({
      Table: {
        KeySchema: [
          { AttributeName: "id", KeyType: "HASH" },
          { AttributeName: "sk", KeyType: "RANGE" },
        ],
        AttributeDefinitions: [
          { AttributeName: "id", AttributeType: "S" },
          { AttributeName: "sk", AttributeType: "S" },
        ],
      },
    })

    await expect(
      saveItem(
        "my-table",
        "pk-value",
        { id: "pk-value", sk: "changed-sk" },
        "original-sk",
      ),
    ).rejects.toMatchObject({ code: "InvalidInput" })
  })
})

describe("deleteTable (cache eviction)", () => {
  it("re-issues DescribeTableCommand after deleteTable clears the cache", async () => {
    mockSend
      .mockResolvedValueOnce({
        Table: {
          KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
          AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
        },
      })
      .mockResolvedValueOnce({ Items: [], LastEvaluatedKey: undefined })

    await scanItems("my-table")
    expect(mockSend).toHaveBeenCalledTimes(2)

    mockSend.mockClear()
    mockSend.mockResolvedValueOnce({})
    await deleteTable("my-table")
    expect(mockSend).toHaveBeenCalledTimes(1)

    mockSend.mockClear()
    mockSend
      .mockResolvedValueOnce({
        Table: {
          KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
          AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
        },
      })
      .mockResolvedValueOnce({ Items: [], LastEvaluatedKey: undefined })

    await scanItems("my-table")
    expect(mockSend).toHaveBeenCalledTimes(2)
  })
})
