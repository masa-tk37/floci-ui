import { beforeEach, describe, expect, it, mock } from "bun:test"

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
  mockSend.mockReset()
  mockSend.mockImplementation(() => Promise.resolve({}))
})

function sentInputs(): Record<string, unknown>[] {
  return (mockSend.mock.calls as unknown[][]).map(
    (call) => (call[0] as { input: Record<string, unknown> }).input,
  )
}

const notFoundError = () =>
  Object.assign(new Error("Requested resource not found"), {
    name: "ResourceNotFoundException",
  })

describe("listTables", () => {
  it("should return table names", async () => {
    mockSend.mockResolvedValueOnce({ TableNames: ["table1", "table2"] })
    const result = await listTables()
    expect(result).toEqual(["table1", "table2"])
  })

  it("should sort table names", async () => {
    mockSend.mockResolvedValueOnce({ TableNames: ["users", "orders"] })
    const result = await listTables()
    expect(result).toEqual(["orders", "users"])
  })

  it("should return empty array when no tables", async () => {
    mockSend.mockResolvedValueOnce({ TableNames: undefined })
    const result = await listTables()
    expect(result).toEqual([])
  })
})

describe("getTableDetail", () => {
  it("should return table detail", async () => {
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

  it("falls back to 5 RCU/WCU when an on-demand table reports 0", async () => {
    mockSend
      .mockResolvedValueOnce({
        Table: {
          BillingModeSummary: { BillingMode: "PAY_PER_REQUEST" },
          ProvisionedThroughput: {
            ReadCapacityUnits: 0,
            WriteCapacityUnits: 0,
          },
        },
      })
      .mockResolvedValueOnce({ TimeToLiveDescription: {} })
    const result = await getTableDetail("my-table")
    expect(result.rcu).toBe(5)
    expect(result.wcu).toBe(5)
  })

  it("infers PROVISIONED when BillingModeSummary is absent but capacity is set", async () => {
    mockSend
      .mockResolvedValueOnce({
        Table: {
          ProvisionedThroughput: {
            ReadCapacityUnits: 3,
            WriteCapacityUnits: 4,
          },
        },
      })
      .mockResolvedValueOnce({ TimeToLiveDescription: {} })
    const result = await getTableDetail("my-table")
    expect(result.billingMode).toBe("PROVISIONED")
    expect(result.rcu).toBe(3)
    expect(result.wcu).toBe(4)
  })

  it("treats ENABLING TTL as enabled", async () => {
    mockSend.mockResolvedValueOnce({ Table: {} }).mockResolvedValueOnce({
      TimeToLiveDescription: {
        TimeToLiveStatus: "ENABLING",
        AttributeName: "expiresAt",
      },
    })
    const result = await getTableDetail("my-table")
    expect(result.ttlEnabled).toBe(true)
    expect(result.ttlAttr).toBe("expiresAt")
  })

  it("propagates DescribeTimeToLive failures other than unsupported operation", async () => {
    mockSend
      .mockResolvedValueOnce({ Table: {} })
      .mockRejectedValueOnce(new Error("throttled"))
    await expect(getTableDetail("my-table")).rejects.toMatchObject({
      code: "OperationFailed",
    })
  })

  it("tolerates an emulator without DescribeTimeToLive", async () => {
    mockSend.mockResolvedValueOnce({ Table: {} }).mockRejectedValueOnce(
      Object.assign(new Error("unknown"), {
        name: "UnknownOperationException",
      }),
    )
    const result = await getTableDetail("my-table")
    expect(result.ttlEnabled).toBe(false)
  })

  it("maps a missing table to NotFound", async () => {
    mockSend
      .mockRejectedValueOnce(notFoundError())
      .mockResolvedValueOnce({ TimeToLiveDescription: {} })
    await expect(getTableDetail("missing")).rejects.toMatchObject({
      code: "NotFound",
    })
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
  const provisionedWithStream = {
    Table: {
      BillingModeSummary: { BillingMode: "PROVISIONED" },
      ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
      StreamSpecification: {
        StreamEnabled: true,
        StreamViewType: "NEW_AND_OLD_IMAGES",
      },
      DeletionProtectionEnabled: false,
    },
  }
  const unchangedInput = {
    billingMode: "PROVISIONED" as const,
    rcu: 5,
    wcu: 5,
    streamEnabled: true,
    streamViewType: "NEW_AND_OLD_IMAGES" as const,
    ttlEnabled: true,
    ttlAttr: "expiresAt",
    deletionProtection: false,
  }
  const enabledTtl = {
    TimeToLiveDescription: {
      TimeToLiveStatus: "ENABLED",
      AttributeName: "expiresAt",
    },
  }

  it("sends only the fields that changed", async () => {
    mockSend
      .mockResolvedValueOnce(provisionedWithStream)
      .mockResolvedValueOnce(enabledTtl)
      .mockResolvedValueOnce({})
    await updateTable("my-table", {
      ...unchangedInput,
      deletionProtection: true,
    })
    expect(mockSend).toHaveBeenCalledTimes(3)
    const update = sentInputs()[2]
    expect(update).toMatchObject({ DeletionProtectionEnabled: true })
    expect(update.BillingMode).toBeUndefined()
    expect(update.ProvisionedThroughput).toBeUndefined()
    expect(update.StreamSpecification).toBeUndefined()
  })

  it("skips both updates when nothing changed", async () => {
    mockSend
      .mockResolvedValueOnce(provisionedWithStream)
      .mockResolvedValueOnce(enabledTtl)
    await updateTable("my-table", unchangedInput)
    expect(mockSend).toHaveBeenCalledTimes(2)
  })

  it("updates only TTL when only TTL changed, naming the current attribute", async () => {
    mockSend
      .mockResolvedValueOnce(provisionedWithStream)
      .mockResolvedValueOnce(enabledTtl)
      .mockResolvedValueOnce({})
    await updateTable("my-table", {
      ...unchangedInput,
      ttlEnabled: false,
      ttlAttr: "",
    })
    expect(mockSend).toHaveBeenCalledTimes(3)
    expect(sentInputs()[2]).toMatchObject({
      TimeToLiveSpecification: { Enabled: false, AttributeName: "expiresAt" },
    })
  })

  it("surfaces UpdateTimeToLive failures", async () => {
    mockSend
      .mockResolvedValueOnce(provisionedWithStream)
      .mockResolvedValueOnce(enabledTtl)
      .mockRejectedValueOnce(
        Object.assign(new Error("TimeToLive is already enabled"), {
          name: "ValidationException",
        }),
      )
    await expect(
      updateTable("my-table", { ...unchangedInput, ttlAttr: "ttl" }),
    ).rejects.toMatchObject({ code: "OperationFailed" })
  })

  it("ignores UpdateTimeToLive when the emulator does not implement it", async () => {
    mockSend
      .mockResolvedValueOnce(provisionedWithStream)
      .mockResolvedValueOnce(enabledTtl)
      .mockRejectedValueOnce(
        Object.assign(new Error("unknown"), {
          name: "UnknownOperationException",
        }),
      )
    await expect(
      updateTable("my-table", { ...unchangedInput, ttlAttr: "ttl" }),
    ).resolves.toBeUndefined()
  })

  it("sends BillingMode and capacity when switching to PROVISIONED", async () => {
    mockSend
      .mockResolvedValueOnce({
        Table: { BillingModeSummary: { BillingMode: "PAY_PER_REQUEST" } },
      })
      .mockResolvedValueOnce({ TimeToLiveDescription: {} })
      .mockResolvedValueOnce({})
    await updateTable("my-table", {
      ...unchangedInput,
      streamEnabled: false,
      ttlEnabled: false,
      ttlAttr: "",
    })
    expect(sentInputs()[2]).toMatchObject({
      BillingMode: "PROVISIONED",
      ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
    })
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

  it.each([['"abc"'], ["[1,2]"], ['{"id": "x"}']])(
    "rejects ExpressionAttributeValues %s as InvalidInput",
    async (json) => {
      await expect(
        queryItems("my-table", {
          mode: "scan",
          expressionAttributeValuesJson: json,
        }),
      ).rejects.toMatchObject({ code: "InvalidInput" })
      expect(mockSend).not.toHaveBeenCalled()
    },
  )

  it.each([['{"name": "n"}'], ['{"#n": 1}']])(
    "rejects ExpressionAttributeNames %s as InvalidInput",
    async (json) => {
      await expect(
        queryItems("my-table", {
          mode: "scan",
          expressionAttributeNamesJson: json,
        }),
      ).rejects.toMatchObject({ code: "InvalidInput" })
    },
  )

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
      // GetItem for the lossy-attribute guard
      .mockResolvedValueOnce({ Item: { id: { S: "pk-value" } } })
      .mockResolvedValueOnce({})

    await expect(
      saveItem("my-table", "pk-value", {
        id: "pk-value",
        email: "user@example.com",
      }),
    ).resolves.toBeUndefined()

    const calls = mockSend.mock.calls as unknown[][]
    expect((calls[2]?.[0] as { input?: unknown })?.input).toMatchObject({
      TableName: "my-table",
      Item: { id: { S: "pk-value" }, email: { S: "user@example.com" } },
      ConditionExpression: "attribute_exists(#hashKey)",
      ExpressionAttributeNames: { "#hashKey": "id" },
    })
  })

  it("returns NotFound instead of recreating an item deleted meanwhile", async () => {
    mockSend
      .mockResolvedValueOnce({
        Table: {
          KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
          AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
        },
      })
      .mockResolvedValueOnce({ Item: undefined })
      .mockRejectedValueOnce(
        Object.assign(new Error("The conditional request failed"), {
          name: "ConditionalCheckFailedException",
        }),
      )
    await expect(
      saveItem("my-table", "pk-value", { id: "pk-value" }),
    ).rejects.toMatchObject({ code: "NotFound" })
  })

  it("should refuse to save an item holding Binary or Set attributes", async () => {
    mockSend
      .mockResolvedValueOnce({
        Table: {
          KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
          AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
        },
      })
      .mockResolvedValueOnce({
        Item: { id: { S: "pk-value" }, thumbnail: { B: new Uint8Array([1]) } },
      })

    await expect(
      saveItem("my-table", "pk-value", {
        id: "pk-value",
        thumbnail: "AQ==",
      }),
    ).rejects.toMatchObject({ code: "InvalidInput" })

    expect(mockSend).toHaveBeenCalledTimes(2)
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

describe("key schema lookup", () => {
  it("picks up a key schema changed outside the UI", async () => {
    mockSend
      .mockResolvedValueOnce({
        Table: {
          KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
          AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
        },
      })
      .mockResolvedValueOnce({})
    await deleteItem("orders", "a")
    expect(sentInputs()[1]).toMatchObject({ Key: { id: { S: "a" } } })

    mockSend.mockClear()
    mockSend
      .mockResolvedValueOnce({
        Table: {
          KeySchema: [{ AttributeName: "pk", KeyType: "HASH" }],
          AttributeDefinitions: [{ AttributeName: "pk", AttributeType: "S" }],
        },
      })
      .mockResolvedValueOnce({})
    await deleteItem("orders", "a")
    expect(sentInputs()[1]).toMatchObject({ Key: { pk: { S: "a" } } })
  })

  it("maps a missing table to NotFound in item operations", async () => {
    mockSend.mockRejectedValueOnce(notFoundError())
    await expect(deleteItem("missing", "a")).rejects.toMatchObject({
      code: "NotFound",
    })
  })

  it("maps a missing table to NotFound in scanItems", async () => {
    mockSend
      .mockRejectedValueOnce(notFoundError())
      .mockRejectedValueOnce(notFoundError())
    await expect(scanItems("missing")).rejects.toMatchObject({
      code: "NotFound",
    })
  })
})

describe("binary keys", () => {
  const binaryKeyTable = {
    Table: {
      KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
      AttributeDefinitions: [{ AttributeName: "id", AttributeType: "B" }],
    },
  }

  it("sends a base64 route key as B", async () => {
    mockSend
      .mockResolvedValueOnce(binaryKeyTable)
      .mockResolvedValueOnce({ Item: { id: { B: new Uint8Array([0, 1, 2]) } } })
    const result = await getItem("bin", "AAEC")
    const key = sentInputs()[1].Key as { id: { B: Uint8Array } }
    expect(Array.from(key.id.B)).toEqual([0, 1, 2])
    expect(result.item.id).toBe("AAEC")
  })

  it("saves an item whose key is binary without tripping the lossy guard", async () => {
    mockSend
      .mockResolvedValueOnce(binaryKeyTable)
      .mockResolvedValueOnce({
        Item: { id: { B: new Uint8Array([0, 1, 2]) }, name: { S: "x" } },
      })
      .mockResolvedValueOnce({})
    await expect(
      saveItem("bin", "AAEC", { id: "AAEC", name: "y" }),
    ).resolves.toBeUndefined()
    const put = sentInputs()[2].Item as {
      id: { B: Uint8Array }
      name: { S: string }
    }
    expect(Array.from(put.id.B)).toEqual([0, 1, 2])
    expect(put.name).toEqual({ S: "y" })
  })
})
