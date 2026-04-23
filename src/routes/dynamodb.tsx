import { Html } from "@elysiajs/html"
import { Elysia, t } from "elysia"
import html from "@elysiajs/html"
import type { BillingMode, StreamViewType } from "@aws-sdk/client-dynamodb"
import {
  listTables,
  getTableDetail,
  createTable,
  deleteTable,
  updateTable,
  scanItems,
  queryItems,
  getItem,
  saveItem,
  deleteItem,
  type CreateTableInput,
} from "../services/dynamodb/table-service"
import { ServiceError, httpStatusFor } from "../errors"
import { loadSidebarSafe, toSidebarCounts } from "../services/sidebar-service"
import { TableList } from "../views/dynamodb/table-list"
import { CreateTableForm } from "../views/dynamodb/create-form"
import { UpdateTableForm } from "../views/dynamodb/update-form"
import { ItemList } from "../views/dynamodb/item-list"
import { ItemEditForm } from "../views/dynamodb/item-edit-form"
import { QueryBuilder } from "../views/dynamodb/query-builder"

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

export const dynamodbRoutes = new Elysia({ prefix: "/dynamodb" })
  .use(html())
  .get("/", async () => {
    const [tables, sidebarData] = await Promise.all([
      listTables(),
      loadSidebarSafe(),
    ])
    return (
      <TableList tables={tables} sidebarCounts={toSidebarCounts(sidebarData)} />
    )
  })
  .get("/new", () => {
    return <CreateTableForm />
  })
  .post(
    "/tables",
    async ({ body, set }) => {
      try {
        await createTable(body as CreateTableInput)
        return { success: true }
      } catch (e) {
        if (e instanceof ServiceError) {
          set.status = httpStatusFor(e.code)
          return { error: e.message }
        }
        set.status = 500
        return { error: "Internal server error" }
      }
    },
    {
      body: t.Object({
        TableName: t.String({ minLength: 1 }),
        AttributeDefinitions: t.Any(),
        KeySchema: t.Any(),
        BillingMode: t.String(),
        ProvisionedThroughput: t.Optional(t.Any()),
        GlobalSecondaryIndexes: t.Optional(t.Any()),
        LocalSecondaryIndexes: t.Optional(t.Any()),
        StreamSpecification: t.Optional(t.Any()),
      }),
    },
  )
  .delete("/:table", async ({ params, set }) => {
    try {
      await deleteTable(params.table)
      return { success: true }
    } catch (e) {
      if (e instanceof ServiceError) {
        set.status = httpStatusFor(e.code)
        return { error: e.message }
      }
      set.status = 500
      return { error: "Internal server error" }
    }
  })
  .get("/:table/edit", async ({ params }) => {
    const detail = await getTableDetail(params.table)
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
      />
    )
  })
  .post(
    "/tables/:table/update",
    async ({ params, body, set }) => {
      try {
        await updateTable(params.table, {
          billingMode: body.billingMode as BillingMode,
          rcu: body.rcu,
          wcu: body.wcu,
          streamEnabled: body.streamEnabled,
          streamViewType: body.streamViewType as StreamViewType,
          ttlEnabled: body.ttlEnabled,
          ttlAttr: body.ttlAttr,
          deletionProtection: body.deletionProtection,
        })
        return { success: true }
      } catch (e) {
        if (e instanceof ServiceError) {
          set.status = httpStatusFor(e.code)
          return { error: e.message }
        }
        set.status = 500
        return { error: "Internal server error" }
      }
    },
    {
      body: t.Object({
        billingMode: t.String(),
        rcu: t.Number(),
        wcu: t.Number(),
        streamEnabled: t.Boolean(),
        streamViewType: t.String(),
        ttlEnabled: t.Boolean(),
        ttlAttr: t.String(),
        deletionProtection: t.Boolean(),
      }),
    },
  )
  .get(
    "/:table",
    async ({ params, query }) => {
      const [result, sidebarData] = await Promise.all([
        scanItems(params.table, query.cursor),
        loadSidebarSafe(),
      ])
      return (
        <ItemList
          tableName={params.table}
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
  .get("/:table/query", ({ params }) => {
    return <QueryBuilder tableName={params.table} />
  })
  .get("/:table/:pk/edit", async ({ params }) => {
    const [detail, sidebarData] = await Promise.all([
      getItem(params.table, params.pk),
      loadSidebarSafe(),
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
      getItem(params.table, params.pk, params.sk),
      loadSidebarSafe(),
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
    async ({ params, body }) => {
      try {
        const result = await queryItems(params.table, {
          mode: body.mode,
          keyConditionExpression: body.keyConditionExpression,
          filterExpression: body.filterExpression || undefined,
          expressionAttributeValuesJson: body.expressionAttributeValues,
          indexName: body.indexName || undefined,
          cursor: body.cursor,
        })
        return { items: result.items, cursor: result.cursor }
      } catch (e) {
        if (e instanceof ServiceError) {
          return { error: e.message }
        }
        return { error: (e as Error).message }
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
          throw new ServiceError("InvalidInput", "Item JSON must be an object")
        }
        await saveItem(params.table, params.pk, parsed)
        return { success: true }
      } catch (e) {
        if (e instanceof SyntaxError) {
          set.status = 400
          return { error: `Invalid JSON: ${e.message}` }
        }
        if (e instanceof ServiceError) {
          set.status = httpStatusFor(e.code)
          return { error: e.message }
        }
        set.status = 500
        return { error: "Internal server error" }
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
          throw new ServiceError("InvalidInput", "Item JSON must be an object")
        }
        await saveItem(params.table, params.pk, parsed, params.sk)
        return { success: true }
      } catch (e) {
        if (e instanceof SyntaxError) {
          set.status = 400
          return { error: `Invalid JSON: ${e.message}` }
        }
        if (e instanceof ServiceError) {
          set.status = httpStatusFor(e.code)
          return { error: e.message }
        }
        set.status = 500
        return { error: "Internal server error" }
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
      await deleteItem(params.table, params.pk)
      return { success: true }
    } catch (e) {
      if (e instanceof ServiceError) {
        set.status = httpStatusFor(e.code)
        return { success: false, error: e.message }
      }
      set.status = 500
      return { success: false, error: "Internal server error" }
    }
  })
  .delete("/:table/:pk/:sk", async ({ params, set }) => {
    try {
      await deleteItem(params.table, params.pk, params.sk)
      return { success: true }
    } catch (e) {
      if (e instanceof ServiceError) {
        set.status = httpStatusFor(e.code)
        return { success: false, error: e.message }
      }
      set.status = 500
      return { success: false, error: "Internal server error" }
    }
  })
