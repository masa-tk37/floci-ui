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
  type TableDescription,
  UpdateTableCommand,
  UpdateTimeToLiveCommand,
} from "@aws-sdk/client-dynamodb"
import { marshall } from "@aws-sdk/util-dynamodb"
import { ServiceError, toOperationFailed } from "../../errors"
import { dynamodb } from "../../infrastructure/floci-clients"
import { decodeCursor, encodeCursor } from "./cursor"
import { findLossyAttributes, normalizeItem } from "./item-normalizer"

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
  expressionAttributeNamesJson?: string
  indexName?: string
  cursor?: string
}

function isTableNotFound(e: unknown): boolean {
  return e instanceof Error && e.name === "ResourceNotFoundException"
}

function toTableError(e: unknown, tableName: string): never {
  if (isTableNotFound(e)) {
    throw new ServiceError("NotFound", `Table ${tableName} not found`, e)
  }
  toOperationFailed(e)
}

const UNSUPPORTED_OPERATION_ERRORS = new Set([
  "UnknownOperationException",
  "UnsupportedOperationException",
  "NotImplementedException",
  "NotImplemented",
])

/** True only when the emulator lacks the API, so real failures stay visible. */
function isUnsupportedOperation(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false
  const { name, $metadata } = e as {
    name?: unknown
    $metadata?: { httpStatusCode?: number }
  }
  return (
    (typeof name === "string" && UNSUPPORTED_OPERATION_ERRORS.has(name)) ||
    $metadata?.httpStatusCode === 501
  )
}

/** Not cached: a table recreated outside the UI may change its key schema. */
async function getKeyInfo(tableName: string): Promise<KeyInfo> {
  let Table: TableDescription | undefined
  try {
    ;({ Table } = await dynamodb.send(
      new DescribeTableCommand({ TableName: tableName }),
    ))
  } catch (e: unknown) {
    toTableError(e, tableName)
  }
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
  return info
}

type KeyValue = string | number | boolean | Uint8Array

function coerceKeyValue(raw: string, type: string): KeyValue {
  if (type === "B") return Buffer.from(raw, "base64")
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
): Record<string, KeyValue> {
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

/** The key as the editor shows it: normalizeItem renders Binary as base64. */
function routeKeyAsItemValue(raw: string, type: string): KeyValue {
  return type === "B" ? raw : coerceKeyValue(raw, type)
}

function assertItemMatchesRouteKey(
  keyInfo: KeyInfo,
  item: Record<string, unknown>,
  pk: string,
  sk?: string,
): void {
  const expectedHashValue = routeKeyAsItemValue(pk, keyInfo.hashKeyType)
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
    const expectedSortValue = routeKeyAsItemValue(sk, keyInfo.sortKeyType)
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
  const names: string[] = []
  let lastTableName: string | undefined
  do {
    const result = await dynamodb.send(
      new ListTablesCommand({ ExclusiveStartTableName: lastTableName }),
    )
    names.push(...(result.TableNames ?? []))
    lastTableName = result.LastEvaluatedTableName
  } while (lastTableName !== undefined)
  return names.sort((left, right) => left.localeCompare(right))
}

export async function getTableDetail(tableName: string): Promise<TableDetail> {
  let descResult: { Table?: TableDescription }
  let ttlResult: {
    TimeToLiveDescription?: {
      TimeToLiveStatus?: string
      AttributeName?: string
    }
  }
  try {
    ;[descResult, ttlResult] = await Promise.all([
      dynamodb.send(new DescribeTableCommand({ TableName: tableName })),
      dynamodb
        .send(new DescribeTimeToLiveCommand({ TableName: tableName }))
        .catch((e: unknown) => {
          if (isUnsupportedOperation(e)) return { TimeToLiveDescription: {} }
          throw e
        }),
    ])
  } catch (e: unknown) {
    toTableError(e, tableName)
  }
  const table = descResult.Table
  const ttl = ttlResult.TimeToLiveDescription ?? {}
  const rcu = table?.ProvisionedThroughput?.ReadCapacityUnits ?? 0
  const wcu = table?.ProvisionedThroughput?.WriteCapacityUnits ?? 0

  return {
    tableName,
    // A PROVISIONED table created without an explicit BillingMode may have no summary.
    billingMode:
      table?.BillingModeSummary?.BillingMode ??
      (rcu > 0 ? "PROVISIONED" : "PAY_PER_REQUEST"),
    // On-demand tables report 0/0, which the update form's minimum of 1 would reject.
    rcu: rcu || 5,
    wcu: wcu || 5,
    streamEnabled: table?.StreamSpecification?.StreamEnabled ?? false,
    streamViewType:
      table?.StreamSpecification?.StreamViewType ?? "NEW_AND_OLD_IMAGES",
    ttlEnabled:
      ttl.TimeToLiveStatus === "ENABLED" || ttl.TimeToLiveStatus === "ENABLING",
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
  const current = await getTableDetail(tableName)
  const billingChanged = input.billingMode !== current.billingMode
  const throughputChanged =
    input.billingMode === "PROVISIONED" &&
    (billingChanged || input.rcu !== current.rcu || input.wcu !== current.wcu)
  const streamChanged =
    input.streamEnabled !== current.streamEnabled ||
    (input.streamEnabled && input.streamViewType !== current.streamViewType)
  const deletionProtectionChanged =
    input.deletionProtection !== current.deletionProtection
  const ttlChanged =
    input.ttlEnabled !== current.ttlEnabled ||
    (input.ttlEnabled && input.ttlAttr !== current.ttlAttr)

  // DynamoDB rejects UpdateTable fields that would not change anything.
  try {
    if (
      billingChanged ||
      throughputChanged ||
      streamChanged ||
      deletionProtectionChanged
    ) {
      await dynamodb.send(
        new UpdateTableCommand({
          TableName: tableName,
          BillingMode: billingChanged ? input.billingMode : undefined,
          ProvisionedThroughput: throughputChanged
            ? { ReadCapacityUnits: input.rcu, WriteCapacityUnits: input.wcu }
            : undefined,
          StreamSpecification: streamChanged
            ? {
                StreamEnabled: input.streamEnabled,
                StreamViewType: input.streamEnabled
                  ? input.streamViewType
                  : undefined,
              }
            : undefined,
          DeletionProtectionEnabled: deletionProtectionChanged
            ? input.deletionProtection
            : undefined,
        }),
      )
    }

    if (!ttlChanged) return
    await dynamodb
      .send(
        new UpdateTimeToLiveCommand({
          TableName: tableName,
          TimeToLiveSpecification: {
            Enabled: input.ttlEnabled,
            // Disabling must name the attribute TTL is currently enabled on.
            AttributeName: input.ttlAttr || current.ttlAttr || "ttl",
          },
        }),
      )
      .catch((e: unknown) => {
        if (!isUnsupportedOperation(e)) throw e
      })
  } catch (e: unknown) {
    toTableError(e, tableName)
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
    const items = (scanResult.Items ?? []).map(normalizeItem)
    const nextCursor = encodeCursor(scanResult.LastEvaluatedKey)
    return {
      items,
      nextCursor,
      hashKey: keyInfo.hashKey,
      sortKey: keyInfo.sortKey,
      tableArn: keyInfo.tableArn,
    }
  } catch (e: unknown) {
    toTableError(e, tableName)
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function parseExpressionJson(
  json: string,
  label: string,
  prefix: string,
): Record<string, unknown> {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch (err) {
    throw new ServiceError(
      "InvalidInput",
      `Invalid ${label} JSON: ${(err as Error).message}`,
    )
  }
  if (
    !isPlainObject(parsed) ||
    !Object.keys(parsed).every((key) => key.startsWith(prefix))
  ) {
    throw new ServiceError(
      "InvalidInput",
      `${label} must be a JSON object whose keys start with "${prefix}"`,
    )
  }
  return parsed
}

export async function queryItems(
  tableName: string,
  input: QueryInput,
): Promise<QueryResult> {
  const startKey = decodeCursor(input.cursor)

  let expressionAttributeValues: Record<string, AttributeValue> | undefined
  if (input.expressionAttributeValuesJson?.trim()) {
    const parsed = parseExpressionJson(
      input.expressionAttributeValuesJson,
      "ExpressionAttributeValues",
      ":",
    )
    try {
      expressionAttributeValues = marshall(parsed, {
        removeUndefinedValues: true,
      })
    } catch (err) {
      throw new ServiceError(
        "InvalidInput",
        `Invalid ExpressionAttributeValues: ${(err as Error).message}`,
      )
    }
  }

  let expressionAttributeNames: Record<string, string> | undefined
  if (input.expressionAttributeNamesJson?.trim()) {
    const parsed = parseExpressionJson(
      input.expressionAttributeNamesJson,
      "ExpressionAttributeNames",
      "#",
    )
    if (!Object.values(parsed).every((value) => typeof value === "string")) {
      throw new ServiceError(
        "InvalidInput",
        "ExpressionAttributeNames values must be strings",
      )
    }
    expressionAttributeNames = parsed as Record<string, string>
  }

  if (input.mode === "query" && !input.keyConditionExpression) {
    throw new ServiceError(
      "InvalidInput",
      "KeyConditionExpression is required for Query",
    )
  }

  const params = {
    TableName: tableName,
    FilterExpression: input.filterExpression || undefined,
    ExpressionAttributeValues: expressionAttributeValues,
    ExpressionAttributeNames: expressionAttributeNames,
    IndexName: input.indexName || undefined,
    Limit: SCAN_PAGE_SIZE,
    ExclusiveStartKey: startKey,
  }
  try {
    const result = await dynamodb.send(
      input.mode === "query"
        ? new QueryCommand({
            ...params,
            KeyConditionExpression: input.keyConditionExpression,
          })
        : new ScanCommand(params),
    )
    return {
      items: (result.Items ?? []).map(normalizeItem),
      cursor: encodeCursor(result.LastEvaluatedKey),
    }
  } catch (e: unknown) {
    toTableError(e, tableName)
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
      item: normalizeItem(result.Item),
      hashKey: keyInfo.hashKey,
      sortKey: keyInfo.sortKey,
      tableArn: keyInfo.tableArn,
    }
  } catch (e: unknown) {
    toTableError(e, tableName)
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
  await assertNoLossyAttributes(tableName, keyInfo, pk, sk)

  try {
    await dynamodb.send(
      new PutItemCommand({
        TableName: tableName,
        // Keys come from the route so a Binary key is written as B, not its base64 string.
        Item: marshall(
          { ...item, ...buildItemKeyObject(keyInfo, pk, sk) },
          { removeUndefinedValues: true },
        ),
        // The editor only edits existing items; refuse to recreate one deleted meanwhile.
        ConditionExpression: "attribute_exists(#hashKey)",
        ExpressionAttributeNames: { "#hashKey": keyInfo.hashKey },
      }),
    )
  } catch (e: unknown) {
    if (e instanceof Error && e.name === "ConditionalCheckFailedException") {
      throw new ServiceError(
        "NotFound",
        `Item no longer exists in ${tableName}`,
        e,
      )
    }
    toTableError(e, tableName)
  }
}

/** Guards the save against the JSON round-trip retyping documented on LOSSY_TYPES in item-normalizer. */
async function assertNoLossyAttributes(
  tableName: string,
  keyInfo: KeyInfo,
  pk: string,
  sk?: string,
): Promise<void> {
  let existing: Record<string, AttributeValue> | undefined
  try {
    const result = await dynamodb.send(
      new GetItemCommand({
        TableName: tableName,
        Key: marshall(buildItemKeyObject(keyInfo, pk, sk)),
      }),
    )
    existing = result.Item
  } catch (e: unknown) {
    toTableError(e, tableName)
  }
  if (!existing) return

  // Key attributes are rewritten from the route, so their type is preserved.
  const lossy = findLossyAttributes(existing).filter(
    (name) => name !== keyInfo.hashKey && name !== keyInfo.sortKey,
  )
  if (lossy.length === 0) return
  throw new ServiceError(
    "InvalidInput",
    `Cannot save: ${lossy.join(", ")} hold Binary, Set or high-precision Number values, which the JSON editor cannot write back without changing their stored type.`,
  )
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
    toTableError(e, tableName)
  }
}
