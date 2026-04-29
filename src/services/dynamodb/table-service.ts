import {
  type AttributeDefinition,
  type AttributeValue,
  type BillingMode,
  CreateTableCommand,
  DeleteItemCommand,
  DeleteTableCommand,
  DescribeTableCommand,
  DescribeTimeToLiveCommand,
  GetItemCommand,
  type GlobalSecondaryIndex,
  type KeySchemaElement,
  ListTablesCommand,
  type LocalSecondaryIndex,
  PutItemCommand,
  QueryCommand,
  ScanCommand,
  type StreamSpecification,
  type StreamViewType,
  UpdateTableCommand,
  UpdateTimeToLiveCommand,
} from "@aws-sdk/client-dynamodb"
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb"
import { ServiceError, toOperationFailed } from "../../errors"
import { dynamodb } from "../../infrastructure/floci-clients"
import { decodeCursor, encodeCursor } from "./cursor"

const SCAN_PAGE_SIZE = 25

export interface KeyInfo {
  hashKey: string
  hashKeyType: string
  sortKey?: string
  sortKeyType?: string
  tableArn?: string
}

export interface ScanResult {
  items: Record<string, unknown>[]
  nextCursor?: string
  hashKey: string
  sortKey?: string
  tableArn?: string
}

export interface QueryResult {
  items: Record<string, unknown>[]
  cursor?: string
}

export interface ItemDetail {
  item: Record<string, unknown>
  hashKey: string
  sortKey?: string
  tableArn?: string
}

export interface TableDetail {
  tableName: string
  billingMode: string
  rcu: number
  wcu: number
  streamEnabled: boolean
  streamViewType: string
  ttlEnabled: boolean
  ttlAttr: string
  deletionProtection: boolean
}

export interface CreateTableInput {
  TableName: string
  AttributeDefinitions: AttributeDefinition[]
  KeySchema: KeySchemaElement[]
  BillingMode: BillingMode
  ProvisionedThroughput?: {
    ReadCapacityUnits: number
    WriteCapacityUnits: number
  }
  GlobalSecondaryIndexes?: GlobalSecondaryIndex[]
  LocalSecondaryIndexes?: LocalSecondaryIndex[]
  StreamSpecification?: StreamSpecification
}

export interface UpdateTableInput {
  billingMode: BillingMode
  rcu: number
  wcu: number
  streamEnabled: boolean
  streamViewType: StreamViewType
  ttlEnabled: boolean
  ttlAttr: string
  deletionProtection: boolean
}

export interface QueryInput {
  mode: "query" | "scan"
  keyConditionExpression?: string
  filterExpression?: string
  expressionAttributeValuesJson?: string
  indexName?: string
  cursor?: string
}

const keyInfoCache = new Map<string, KeyInfo>()

export function clearKeyInfoCache(): void {
  keyInfoCache.clear()
}

async function getKeyInfo(tableName: string): Promise<KeyInfo> {
  const cached = keyInfoCache.get(tableName)
  if (cached) return cached

  const { Table } = await dynamodb.send(
    new DescribeTableCommand({ TableName: tableName }),
  )
  const schema: KeySchemaElement[] = Table?.KeySchema ?? []
  const defs: AttributeDefinition[] = Table?.AttributeDefinitions ?? []
  const typeFor = (name: string): string =>
    defs.find((d) => d.AttributeName === name)?.AttributeType ?? "S"

  const hash = schema.find((k) => k.KeyType === "HASH")
  const sort = schema.find((k) => k.KeyType === "RANGE")
  if (!hash?.AttributeName) {
    throw new ServiceError(
      "OperationFailed",
      `Table ${tableName} has no hash key`,
    )
  }
  const info: KeyInfo = {
    hashKey: hash.AttributeName,
    hashKeyType: typeFor(hash.AttributeName),
    sortKey: sort?.AttributeName,
    sortKeyType: sort?.AttributeName ? typeFor(sort.AttributeName) : undefined,
    tableArn: Table?.TableArn,
  }
  keyInfoCache.set(tableName, info)
  return info
}

function coerceKeyValue(raw: string, type: string): string | number | boolean {
  if (type === "N") {
    const n = Number(raw)
    if (Number.isNaN(n))
      throw new ServiceError("InvalidInput", `Invalid number key value: ${raw}`)
    return n
  }
  if (type === "BOOL") return raw === "true"
  return raw
}

function buildItemKeyObject(
  keyInfo: KeyInfo,
  pk: string,
  sk?: string,
): Record<string, string | number | boolean> {
  if (sk !== undefined) {
    if (!keyInfo.sortKey || !keyInfo.sortKeyType) {
      throw new ServiceError("InvalidInput", "Table has no sort key")
    }
    return {
      [keyInfo.hashKey]: coerceKeyValue(pk, keyInfo.hashKeyType),
      [keyInfo.sortKey]: coerceKeyValue(sk, keyInfo.sortKeyType),
    }
  }

  if (keyInfo.sortKey) {
    throw new ServiceError(
      "InvalidInput",
      "Table has a composite key; sort key required",
    )
  }

  return {
    [keyInfo.hashKey]: coerceKeyValue(pk, keyInfo.hashKeyType),
  }
}

function assertItemMatchesRouteKey(
  keyInfo: KeyInfo,
  item: Record<string, unknown>,
  pk: string,
  sk?: string,
): void {
  const expectedHashValue = coerceKeyValue(pk, keyInfo.hashKeyType)
  if (
    !(keyInfo.hashKey in item) ||
    item[keyInfo.hashKey] !== expectedHashValue
  ) {
    throw new ServiceError(
      "InvalidInput",
      `Item ${keyInfo.hashKey} must remain ${String(expectedHashValue)}`,
    )
  }

  if (keyInfo.sortKey && keyInfo.sortKeyType) {
    if (sk === undefined) {
      throw new ServiceError(
        "InvalidInput",
        "Table has a composite key; sort key required",
      )
    }
    const expectedSortValue = coerceKeyValue(sk, keyInfo.sortKeyType)
    if (
      !(keyInfo.sortKey in item) ||
      item[keyInfo.sortKey] !== expectedSortValue
    ) {
      throw new ServiceError(
        "InvalidInput",
        `Item ${keyInfo.sortKey} must remain ${String(expectedSortValue)}`,
      )
    }
  }
}

export async function listTables(): Promise<string[]> {
  const { TableNames } = await dynamodb.send(new ListTablesCommand({}))
  return TableNames ?? []
}

export async function getTableDetail(tableName: string): Promise<TableDetail> {
  const [descResult, ttlResult] = await Promise.all([
    dynamodb.send(new DescribeTableCommand({ TableName: tableName })),
    dynamodb
      .send(new DescribeTimeToLiveCommand({ TableName: tableName }))
      .catch(() => ({ TimeToLiveDescription: {} })),
  ])
  const table = descResult.Table
  const ttl = (ttlResult.TimeToLiveDescription ?? {}) as {
    TimeToLiveStatus?: string
    AttributeName?: string
  }

  return {
    tableName,
    billingMode: table?.BillingModeSummary?.BillingMode ?? "PAY_PER_REQUEST",
    rcu: table?.ProvisionedThroughput?.ReadCapacityUnits ?? 5,
    wcu: table?.ProvisionedThroughput?.WriteCapacityUnits ?? 5,
    streamEnabled: table?.StreamSpecification?.StreamEnabled ?? false,
    streamViewType:
      table?.StreamSpecification?.StreamViewType ?? "NEW_AND_OLD_IMAGES",
    ttlEnabled: ttl.TimeToLiveStatus === "ENABLED",
    ttlAttr: ttl.AttributeName ?? "",
    deletionProtection: table?.DeletionProtectionEnabled ?? false,
  }
}

export async function createTable(input: CreateTableInput): Promise<void> {
  try {
    await dynamodb.send(
      new CreateTableCommand({
        TableName: input.TableName,
        AttributeDefinitions: input.AttributeDefinitions,
        KeySchema: input.KeySchema,
        BillingMode: input.BillingMode,
        ProvisionedThroughput: input.ProvisionedThroughput,
        GlobalSecondaryIndexes: input.GlobalSecondaryIndexes,
        LocalSecondaryIndexes: input.LocalSecondaryIndexes,
        StreamSpecification: input.StreamSpecification,
      }),
    )
  } catch (e: unknown) {
    if (e instanceof Error && e.name === "ResourceInUseException") {
      throw new ServiceError(
        "AlreadyExists",
        `Table ${input.TableName} already exists`,
        e,
      )
    }
    toOperationFailed(e)
  }
}

export async function deleteTable(tableName: string): Promise<void> {
  try {
    await dynamodb.send(new DeleteTableCommand({ TableName: tableName }))
    keyInfoCache.delete(tableName)
  } catch (e: unknown) {
    if (e instanceof Error && e.name === "ResourceNotFoundException") {
      throw new ServiceError("NotFound", `Table ${tableName} not found`, e)
    }
    toOperationFailed(e)
  }
}

export async function updateTable(
  tableName: string,
  input: UpdateTableInput,
): Promise<void> {
  try {
    await dynamodb.send(
      new UpdateTableCommand({
        TableName: tableName,
        BillingMode: input.billingMode,
        ProvisionedThroughput:
          input.billingMode === "PROVISIONED"
            ? { ReadCapacityUnits: input.rcu, WriteCapacityUnits: input.wcu }
            : undefined,
        StreamSpecification: {
          StreamEnabled: input.streamEnabled,
          StreamViewType: input.streamEnabled
            ? input.streamViewType
            : undefined,
        },
        DeletionProtectionEnabled: input.deletionProtection,
      }),
    )

    await dynamodb
      .send(
        new UpdateTimeToLiveCommand({
          TableName: tableName,
          TimeToLiveSpecification: {
            Enabled: input.ttlEnabled,
            AttributeName: input.ttlEnabled ? input.ttlAttr : "ttl",
          },
        }),
      )
      .catch(() => {
        /* LocalStack may not support TTL */
      })
  } catch (e: unknown) {
    toOperationFailed(e)
  }
}

export async function scanItems(
  tableName: string,
  cursor?: string,
): Promise<ScanResult> {
  try {
    const [keyInfo, scanResult] = await Promise.all([
      getKeyInfo(tableName),
      dynamodb.send(
        new ScanCommand({
          TableName: tableName,
          Limit: SCAN_PAGE_SIZE,
          ExclusiveStartKey: decodeCursor(cursor),
        }),
      ),
    ])
    const items = (scanResult.Items ?? []).map((item) => unmarshall(item))
    const nextCursor = encodeCursor(scanResult.LastEvaluatedKey)
    return {
      items,
      nextCursor,
      hashKey: keyInfo.hashKey,
      sortKey: keyInfo.sortKey,
      tableArn: keyInfo.tableArn,
    }
  } catch (e: unknown) {
    toOperationFailed(e)
  }
}

export async function queryItems(
  tableName: string,
  input: QueryInput,
): Promise<QueryResult> {
  const startKey = decodeCursor(input.cursor)

  let expressionAttributeValues: Record<string, AttributeValue> | undefined
  if (input.expressionAttributeValuesJson?.trim()) {
    try {
      const parsed = JSON.parse(input.expressionAttributeValuesJson) as Record<
        string,
        unknown
      >
      expressionAttributeValues = marshall(parsed, {
        removeUndefinedValues: true,
      })
    } catch (err) {
      throw new ServiceError(
        "InvalidInput",
        `Invalid ExpressionAttributeValues JSON: ${(err as Error).message}`,
      )
    }
  }

  if (input.mode === "query") {
    if (!input.keyConditionExpression) {
      throw new ServiceError(
        "InvalidInput",
        "KeyConditionExpression is required for Query",
      )
    }
    try {
      const result = await dynamodb.send(
        new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: input.keyConditionExpression,
          FilterExpression: input.filterExpression || undefined,
          ExpressionAttributeValues: expressionAttributeValues,
          IndexName: input.indexName || undefined,
          Limit: SCAN_PAGE_SIZE,
          ExclusiveStartKey: startKey,
        }),
      )
      return {
        items: (result.Items ?? []).map((item) => unmarshall(item)),
        cursor: encodeCursor(result.LastEvaluatedKey),
      }
    } catch (e: unknown) {
      toOperationFailed(e)
    }
  }

  try {
    const result = await dynamodb.send(
      new ScanCommand({
        TableName: tableName,
        FilterExpression: input.filterExpression || undefined,
        ExpressionAttributeValues: expressionAttributeValues,
        IndexName: input.indexName || undefined,
        Limit: SCAN_PAGE_SIZE,
        ExclusiveStartKey: startKey,
      }),
    )
    return {
      items: (result.Items ?? []).map((item) => unmarshall(item)),
      cursor: encodeCursor(result.LastEvaluatedKey),
    }
  } catch (e: unknown) {
    toOperationFailed(e)
  }
}

export async function getItem(
  tableName: string,
  pk: string,
  sk?: string,
): Promise<ItemDetail> {
  const keyInfo = await getKeyInfo(tableName)
  const key = marshall(buildItemKeyObject(keyInfo, pk, sk))
  try {
    const result = await dynamodb.send(
      new GetItemCommand({
        TableName: tableName,
        Key: key,
      }),
    )
    if (!result.Item) {
      throw new ServiceError("NotFound", `Item not found in ${tableName}`)
    }
    return {
      item: unmarshall(result.Item),
      hashKey: keyInfo.hashKey,
      sortKey: keyInfo.sortKey,
      tableArn: keyInfo.tableArn,
    }
  } catch (e: unknown) {
    toOperationFailed(e)
  }
}

export async function saveItem(
  tableName: string,
  pk: string,
  item: Record<string, unknown>,
  sk?: string,
): Promise<void> {
  const keyInfo = await getKeyInfo(tableName)
  assertItemMatchesRouteKey(keyInfo, item, pk, sk)

  try {
    await dynamodb.send(
      new PutItemCommand({
        TableName: tableName,
        Item: marshall(item, { removeUndefinedValues: true }),
      }),
    )
  } catch (e: unknown) {
    toOperationFailed(e)
  }
}

export async function deleteItem(
  tableName: string,
  pk: string,
  sk?: string,
): Promise<void> {
  const keyInfo = await getKeyInfo(tableName)
  const key = marshall(buildItemKeyObject(keyInfo, pk, sk))
  try {
    await dynamodb.send(
      new DeleteItemCommand({
        TableName: tableName,
        Key: key,
      }),
    )
  } catch (e: unknown) {
    toOperationFailed(e)
  }
}
