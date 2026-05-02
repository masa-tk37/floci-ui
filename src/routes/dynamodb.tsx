import type { BillingMode, StreamViewType } from "@aws-sdk/client-dynamodb"
import html, { Html } from "@elysiajs/html"
import { Elysia, t } from "elysia"
import { ServiceError } from "../errors"
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
} from "../services/dynamodb/table-service"
import { loadSidebarSafe, toSidebarCounts } from "../services/sidebar-service"
import { CreateTableForm } from "../views/dynamodb/create-form"
import { ItemEditForm } from "../views/dynamodb/item-edit-form"
import { ItemList } from "../views/dynamodb/item-list"
import { QueryBuilder } from "../views/dynamodb/query-builder"
import { TableList } from "../views/dynamodb/table-list"
import { UpdateTableForm } from "../views/dynamodb/update-form"
import {
  jsonData,
  jsonOk,
  respondWithError,
  respondWithFrameworkError,
} from "./route-utils"

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

const dynamodbAttributeTypeSchema = t.Union([
  t.Literal("S"),
  t.Literal("N"),
  t.Literal("B"),
])

const keyTypeSchema = t.Union([t.Literal("HASH"), t.Literal("RANGE")])

const projectionTypeSchema = t.Union([
  t.Literal("ALL"),
  t.Literal("KEYS_ONLY"),
  t.Literal("INCLUDE"),
])

const streamViewTypeSchema = t.Union([
  t.Literal("KEYS_ONLY"),
  t.Literal("NEW_IMAGE"),
  t.Literal("OLD_IMAGE"),
  t.Literal("NEW_AND_OLD_IMAGES"),
])

const billingModeSchema = t.Union([
  t.Literal("PAY_PER_REQUEST"),
  t.Literal("PROVISIONED"),
])

const attributeDefinitionSchema = t.Object({
  AttributeName: t.String({ minLength: 1 }),
  AttributeType: dynamodbAttributeTypeSchema,
})

const keySchemaElementSchema = t.Object({
  AttributeName: t.String({ minLength: 1 }),
  KeyType: keyTypeSchema,
})

const provisionedThroughputSchema = t.Object({
  ReadCapacityUnits: t.Number({ minimum: 1 }),
  WriteCapacityUnits: t.Number({ minimum: 1 }),
})

const projectionSchema = t.Object({
  ProjectionType: projectionTypeSchema,
  NonKeyAttributes: t.Optional(t.Array(t.String({ minLength: 1 }))),
})

const globalSecondaryIndexSchema = t.Object({
  IndexName: t.String({ minLength: 1 }),
  KeySchema: t.Array(keySchemaElementSchema, { minItems: 1 }),
  Projection: projectionSchema,
  ProvisionedThroughput: t.Optional(provisionedThroughputSchema),
})

const localSecondaryIndexSchema = t.Object({
  IndexName: t.String({ minLength: 1 }),
  KeySchema: t.Array(keySchemaElementSchema, { minItems: 2 }),
  Projection: projectionSchema,
})

const createTableSchema = t.Object({
  TableName: t.String({ minLength: 1 }),
  AttributeDefinitions: t.Array(attributeDefinitionSchema, { minItems: 1 }),
  KeySchema: t.Array(keySchemaElementSchema, { minItems: 1 }),
  BillingMode: billingModeSchema,
  ProvisionedThroughput: t.Optional(provisionedThroughputSchema),
  GlobalSecondaryIndexes: t.Optional(t.Array(globalSecondaryIndexSchema)),
  LocalSecondaryIndexes: t.Optional(t.Array(localSecondaryIndexSchema)),
  StreamSpecification: t.Optional(
    t.Object({
      StreamEnabled: t.Boolean(),
      StreamViewType: t.Optional(streamViewTypeSchema),
    }),
  ),
})

const updateTableSchema = t.Object({
  billingMode: billingModeSchema,
  rcu: t.Number({ minimum: 1 }),
  wcu: t.Number({ minimum: 1 }),
  streamEnabled: t.Boolean(),
  streamViewType: streamViewTypeSchema,
  ttlEnabled: t.Boolean(),
  ttlAttr: t.String(),
  deletionProtection: t.Boolean(),
})

export interface DynamodbRouteDeps {
  createTable: typeof createTable
  deleteItem: typeof deleteItem
  deleteTable: typeof deleteTable
  getItem: typeof getItem
  getTableDetail: typeof getTableDetail
  listTables: typeof listTables
  loadSidebarSafe: typeof loadSidebarSafe
  queryItems: typeof queryItems
  saveItem: typeof saveItem
  scanItems: typeof scanItems
  updateTable: typeof updateTable
}

const defaultDynamodbRouteDeps: DynamodbRouteDeps = {
  createTable,
  deleteItem,
  deleteTable,
  getItem,
  getTableDetail,
  listTables,
  loadSidebarSafe,
  queryItems,
  saveItem,
  scanItems,
  updateTable,
}

export function createDynamodbRoutes(
  deps: DynamodbRouteDeps = defaultDynamodbRouteDeps,
) {
  return new Elysia({ prefix: "/dynamodb" })
    .use(html())
    .get("/", async () => {
      const [tables, sidebarData] = await Promise.all([
        deps.listTables(),
        deps.loadSidebarSafe(),
      ])
      return (
        <TableList
          tables={tables}
          sidebarCounts={toSidebarCounts(sidebarData)}
        />
      )
    })
    .get("/new", async () => {
      const sidebarData = await deps.loadSidebarSafe()
      return <CreateTableForm sidebarCounts={toSidebarCounts(sidebarData)} />
    })
    .post(
      "/tables",
      async ({ body, set }) => {
        try {
          await deps.createTable(body)
          return jsonOk()
        } catch (e) {
          return respondWithError(e, set)
        }
      },
      { body: createTableSchema },
    )
    .delete("/:table", async ({ params, set }) => {
      try {
        await deps.deleteTable(params.table)
        return jsonOk()
      } catch (e) {
        return respondWithError(e, set)
      }
    })
    .get("/:table/edit", async ({ params }) => {
      const [detail, sidebarData] = await Promise.all([
        deps.getTableDetail(params.table),
        deps.loadSidebarSafe(),
      ])
      return (
        <UpdateTableForm
          init={{
            tableName: detail.tableName,
            billingMode: detail.billingMode,
            rcu: detail.rcu,
            wcu: detail.wcu,
            streamEnabled: detail.streamEnabled,
            streamViewType: detail.streamViewType,
            ttlEnabled: detail.ttlEnabled,
            ttlAttr: detail.ttlAttr,
            deletionProtection: detail.deletionProtection,
          }}
          sidebarCounts={toSidebarCounts(sidebarData)}
        />
      )
    })
    .post(
      "/tables/:table/update",
      async ({ params, body, set }) => {
        try {
          await deps.updateTable(params.table, {
            billingMode: body.billingMode as BillingMode,
            rcu: body.rcu,
            wcu: body.wcu,
            streamEnabled: body.streamEnabled,
            streamViewType: body.streamViewType as StreamViewType,
            ttlEnabled: body.ttlEnabled,
            ttlAttr: body.ttlAttr,
            deletionProtection: body.deletionProtection,
          })
          return jsonOk()
        } catch (e) {
          return respondWithError(e, set)
        }
      },
      { body: updateTableSchema },
    )
    .get(
      "/:table",
      async ({ params, query }) => {
        const [result, sidebarData] = await Promise.all([
          deps.scanItems(params.table, query.cursor),
          deps.loadSidebarSafe(),
        ])
        return (
          <ItemList
            tableName={params.table}
            tables={sidebarData?.tables ?? []}
            items={result.items}
            hashKey={result.hashKey}
            sortKey={result.sortKey}
            cursor={query.cursor}
            nextCursor={result.nextCursor}
            tableArn={result.tableArn}
            sidebarCounts={toSidebarCounts(sidebarData)}
          />
        )
      },
      {
        query: t.Object({ cursor: t.Optional(t.String()) }),
      },
    )
    .get("/:table/query", async ({ params }) => {
      const sidebarData = await deps.loadSidebarSafe()
      return (
        <QueryBuilder
          tableName={params.table}
          sidebarCounts={toSidebarCounts(sidebarData)}
        />
      )
    })
    .get("/:table/:pk/edit", async ({ params }) => {
      const [detail, sidebarData] = await Promise.all([
        deps.getItem(params.table, params.pk),
        deps.loadSidebarSafe(),
      ])
      return (
        <ItemEditForm
          init={{
            tableName: params.table,
            pk: params.pk,
            itemJson: JSON.stringify(detail.item, null, 2),
            hashKey: detail.hashKey,
            sortKey: detail.sortKey,
            tableArn: detail.tableArn,
          }}
          sidebarCounts={toSidebarCounts(sidebarData)}
        />
      )
    })
    .get("/:table/:pk/:sk/edit", async ({ params }) => {
      const [detail, sidebarData] = await Promise.all([
        deps.getItem(params.table, params.pk, params.sk),
        deps.loadSidebarSafe(),
      ])
      return (
        <ItemEditForm
          init={{
            tableName: params.table,
            pk: params.pk,
            sk: params.sk,
            itemJson: JSON.stringify(detail.item, null, 2),
            hashKey: detail.hashKey,
            sortKey: detail.sortKey,
            tableArn: detail.tableArn,
          }}
          sidebarCounts={toSidebarCounts(sidebarData)}
        />
      )
    })
    .post(
      "/:table/query",
      async ({ params, body, set }) => {
        try {
          const result = await deps.queryItems(params.table, {
            mode: body.mode,
            keyConditionExpression: body.keyConditionExpression,
            filterExpression: body.filterExpression || undefined,
            expressionAttributeValuesJson: body.expressionAttributeValues,
            indexName: body.indexName || undefined,
            cursor: body.cursor,
          })
          return jsonData({ items: result.items, cursor: result.cursor })
        } catch (e) {
          return respondWithError(e, set)
        }
      },
      {
        body: t.Object({
          mode: t.Union([t.Literal("query"), t.Literal("scan")]),
          keyConditionExpression: t.Optional(t.String()),
          filterExpression: t.Optional(t.String()),
          expressionAttributeValues: t.Optional(t.String()),
          indexName: t.Optional(t.String()),
          cursor: t.Optional(t.String()),
        }),
      },
    )
    .post(
      "/:table/:pk/edit",
      async ({ params, body, set }) => {
        try {
          const parsed = JSON.parse(body.itemJson) as unknown
          if (!isRecord(parsed)) {
            throw new ServiceError(
              "InvalidInput",
              "Item JSON must be an object",
            )
          }
          await deps.saveItem(params.table, params.pk, parsed)
          return jsonOk()
        } catch (e) {
          if (e instanceof SyntaxError) {
            return respondWithFrameworkError(
              "InvalidInput",
              `Invalid JSON: ${e.message}`,
              set,
            )
          }
          return respondWithError(e, set)
        }
      },
      {
        body: t.Object({
          itemJson: t.String({ minLength: 2 }),
        }),
      },
    )
    .post(
      "/:table/:pk/:sk/edit",
      async ({ params, body, set }) => {
        try {
          const parsed = JSON.parse(body.itemJson) as unknown
          if (!isRecord(parsed)) {
            throw new ServiceError(
              "InvalidInput",
              "Item JSON must be an object",
            )
          }
          await deps.saveItem(params.table, params.pk, parsed, params.sk)
          return jsonOk()
        } catch (e) {
          if (e instanceof SyntaxError) {
            return respondWithFrameworkError(
              "InvalidInput",
              `Invalid JSON: ${e.message}`,
              set,
            )
          }
          return respondWithError(e, set)
        }
      },
      {
        body: t.Object({
          itemJson: t.String({ minLength: 2 }),
        }),
      },
    )
    .delete("/:table/:pk", async ({ params, set }) => {
      try {
        await deps.deleteItem(params.table, params.pk)
        return jsonOk()
      } catch (e) {
        return respondWithError(e, set)
      }
    })
    .delete("/:table/:pk/:sk", async ({ params, set }) => {
      try {
        await deps.deleteItem(params.table, params.pk, params.sk)
        return jsonOk()
      } catch (e) {
        return respondWithError(e, set)
      }
    })
}

export const dynamodbRoutes = createDynamodbRoutes()
