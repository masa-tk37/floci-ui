import type { ItemEditFormInitial } from "../../views/dynamodb/item-edit-form-state"
import type { UpdateFormInitial } from "../../views/dynamodb/update-form-state"
import { formatJsonValue } from "../../views/format"
import {
  errorMessage,
  sendJson,
  splitCommaList,
  submitJson,
} from "../lib/floci"

type CreateTableProps = Record<string, never>

interface QueryBuilderProps {
  tableName: string
}

function keySchema(hashKey: string, rangeKey: string) {
  const schema = [{ AttributeName: hashKey, KeyType: "HASH" }]
  if (rangeKey) schema.push({ AttributeName: rangeKey, KeyType: "RANGE" })
  return schema
}

function projection(projectionType: string, nonKeyAttrs: string) {
  if (projectionType === "INCLUDE" && nonKeyAttrs) {
    return {
      ProjectionType: projectionType,
      NonKeyAttributes: splitCommaList(nonKeyAttrs),
    }
  }
  return { ProjectionType: projectionType }
}

function throughput(rcu: number, wcu: number) {
  return { ReadCapacityUnits: Number(rcu), WriteCapacityUnits: Number(wcu) }
}

export function createDynamoCreateTableController(
  _el: HTMLElement,
  _props: CreateTableProps,
) {
  return {
    tableName: "",
    pk: { name: "", type: "S" },
    hasSk: false,
    sk: { name: "", type: "S" },
    billingMode: "PAY_PER_REQUEST",
    rcu: 5,
    wcu: 5,
    gsi: [] as Array<{
      indexName: string
      pk: { name: string; type: string }
      hasSk: boolean
      sk: { name: string; type: string }
      projectionType: string
      nonKeyAttrs: string
      rcu: number
      wcu: number
    }>,
    lsi: [] as Array<{
      indexName: string
      sk: { name: string; type: string }
      projectionType: string
      nonKeyAttrs: string
    }>,
    streamEnabled: false,
    streamViewType: "NEW_AND_OLD_IMAGES",
    error: null as string | null,
    submitting: false,

    addGsi() {
      this.gsi.push({
        indexName: "",
        pk: { name: "", type: "S" },
        hasSk: false,
        sk: { name: "", type: "S" },
        projectionType: "ALL",
        nonKeyAttrs: "",
        rcu: 5,
        wcu: 5,
      })
    },

    removeGsi(index: number) {
      this.gsi.splice(index, 1)
    },

    addLsi() {
      this.lsi.push({
        indexName: "",
        sk: { name: "", type: "S" },
        projectionType: "ALL",
        nonKeyAttrs: "",
      })
    },

    removeLsi(index: number) {
      this.lsi.splice(index, 1)
    },

    buildPayload() {
      const attrMap: Record<string, string> = {}
      const addAttr = (name: string, type: string) => {
        if (name) attrMap[name] = type
      }

      addAttr(this.pk.name, this.pk.type)
      if (this.hasSk) addAttr(this.sk.name, this.sk.type)
      for (const gsi of this.gsi) {
        addAttr(gsi.pk.name, gsi.pk.type)
        if (gsi.hasSk) addAttr(gsi.sk.name, gsi.sk.type)
      }
      for (const lsi of this.lsi) {
        addAttr(lsi.sk.name, lsi.sk.type)
      }

      const attributeDefinitions = Object.entries(attrMap).map(
        ([attributeName, attributeType]) => ({
          AttributeName: attributeName,
          AttributeType: attributeType,
        }),
      )

      const payload: Record<string, unknown> = {
        TableName: this.tableName,
        AttributeDefinitions: attributeDefinitions,
        KeySchema: keySchema(this.pk.name, this.hasSk ? this.sk.name : ""),
        BillingMode: this.billingMode,
      }

      const provisioned = this.billingMode === "PROVISIONED"
      if (provisioned) {
        payload.ProvisionedThroughput = throughput(this.rcu, this.wcu)
      }

      if (this.gsi.length > 0) {
        payload.GlobalSecondaryIndexes = this.gsi.map((gsi) => ({
          IndexName: gsi.indexName,
          KeySchema: keySchema(gsi.pk.name, gsi.hasSk ? gsi.sk.name : ""),
          Projection: projection(gsi.projectionType, gsi.nonKeyAttrs),
          ...(provisioned && {
            ProvisionedThroughput: throughput(gsi.rcu, gsi.wcu),
          }),
        }))
      }

      if (this.lsi.length > 0) {
        payload.LocalSecondaryIndexes = this.lsi.map((lsi) => ({
          IndexName: lsi.indexName,
          KeySchema: keySchema(this.pk.name, lsi.sk.name),
          Projection: projection(lsi.projectionType, lsi.nonKeyAttrs),
        }))
      }

      if (this.streamEnabled) {
        payload.StreamSpecification = {
          StreamEnabled: true,
          StreamViewType: this.streamViewType,
        }
      }

      return payload
    },

    async submit() {
      this.error = null
      for (const [i, g] of this.gsi.entries()) {
        if (!g.indexName) {
          this.error = `GSI ${i + 1}: インデックス名を入力してください`
          return
        }
        if (!g.pk.name) {
          this.error = `GSI ${i + 1}: PK 名を入力してください`
          return
        }
      }
      for (const [i, l] of this.lsi.entries()) {
        if (!l.indexName) {
          this.error = `LSI ${i + 1}: インデックス名を入力してください`
          return
        }
        if (!l.sk.name) {
          this.error = `LSI ${i + 1}: ソートキー名を入力してください`
          return
        }
      }
      const data = await submitJson(
        this,
        "/dynamodb/tables",
        this.buildPayload(),
      )
      if (data === undefined) return
      window.location.href = "/dynamodb"
    },
  }
}

export function createDynamoUpdateTableController(
  _el: HTMLElement,
  init: UpdateFormInitial,
) {
  return {
    ...init,
    error: null as string | null,
    submitting: false,

    async submit() {
      const data = await submitJson(
        this,
        `/dynamodb/tables/${encodeURIComponent(this.tableName)}/update`,
        {
          billingMode: this.billingMode,
          rcu: Number(this.rcu),
          wcu: Number(this.wcu),
          streamEnabled: this.streamEnabled,
          streamViewType: this.streamViewType,
          ttlEnabled: this.ttlEnabled,
          ttlAttr: this.ttlAttr,
          deletionProtection: this.deletionProtection,
        },
      )
      if (data === undefined) return
      window.location.href = `/dynamodb/${encodeURIComponent(this.tableName)}`
    },
  }
}

export function createDynamoItemEditController(
  _el: HTMLElement,
  init: Pick<ItemEditFormInitial, "itemJson"> & { itemPath: string },
) {
  return {
    itemJson: init.itemJson,
    error: null as string | null,
    submitting: false,

    formatJson() {
      this.error = null
      try {
        this.itemJson = JSON.stringify(JSON.parse(this.itemJson), null, 2)
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error)
      }
    },

    async submit() {
      try {
        JSON.parse(this.itemJson)
      } catch (e) {
        this.error =
          "JSON の形式が正しくありません: " +
          (e instanceof Error ? e.message : String(e))
        return
      }
      const data = await submitJson(this, `${init.itemPath}/edit`, {
        itemJson: this.itemJson,
      })
      if (data === undefined) return
      window.location.href = init.itemPath
    },
  }
}

export function createDynamoQueryBuilderController(
  _el: HTMLElement,
  props: QueryBuilderProps,
) {
  const queryPath = `/dynamodb/${encodeURIComponent(props.tableName)}/query`

  return {
    mode: "query",
    keyConditionExpression: "",
    filterExpression: "",
    expressionAttributeValues: "",
    expressionAttributeNames: "",
    indexName: "",
    results: [] as Record<string, unknown>[],
    columns: [] as string[],
    loading: false,
    error: "",
    hasRun: false,
    nextCursor: "",
    pageCursors: [""],
    currentPageIndex: 0,

    buildPayload(cursor: string) {
      return {
        mode: this.mode,
        keyConditionExpression: this.keyConditionExpression,
        filterExpression: this.filterExpression,
        expressionAttributeValues: this.expressionAttributeValues,
        expressionAttributeNames: this.expressionAttributeNames,
        indexName: this.indexName,
        cursor: cursor || undefined,
      }
    },

    async loadPage(cursor: string, pageIndex: number, pageCursors: string[]) {
      this.loading = true
      this.error = ""

      try {
        const data = await sendJson<{
          items: Record<string, unknown>[]
          cursor?: string
        }>(queryPath, this.buildPayload(cursor))
        this.loading = false
        this.results = data.items || []
        this.columns =
          this.results.length > 0 ? Object.keys(this.results[0] ?? {}) : []
        this.nextCursor = data.cursor || ""
        this.pageCursors = pageCursors
        this.currentPageIndex = pageIndex
        this.hasRun = true
        return true
      } catch (error) {
        this.loading = false
        this.error = errorMessage(error)
        return false
      }
    },

    async submit() {
      if (this.mode === "query" && !this.keyConditionExpression) {
        this.error = "Query モードでは KeyConditionExpression が必須です"
        return
      }
      if (this.expressionAttributeValues) {
        try {
          JSON.parse(this.expressionAttributeValues)
        } catch (e) {
          this.error =
            "ExpressionAttributeValues の JSON が不正です: " +
            (e instanceof Error ? e.message : String(e))
          return
        }
      }
      if (this.expressionAttributeNames) {
        try {
          JSON.parse(this.expressionAttributeNames)
        } catch (e) {
          this.error =
            "ExpressionAttributeNames の JSON が不正です: " +
            (e instanceof Error ? e.message : String(e))
          return
        }
      }
      await this.loadPage("", 0, [""])
    },

    async nextPage() {
      if (this.loading || !this.nextCursor) return
      const nextIndex = this.currentPageIndex + 1
      const history = [...this.pageCursors.slice(0, nextIndex), this.nextCursor]
      await this.loadPage(this.nextCursor, nextIndex, history)
    },

    async previousPage() {
      if (this.loading || this.currentPageIndex === 0) return
      const previousIndex = this.currentPageIndex - 1
      const previousCursor = this.pageCursors[previousIndex] || ""
      await this.loadPage(
        previousCursor,
        previousIndex,
        this.pageCursors.slice(0, this.currentPageIndex),
      )
    },
  }
}

export function createDynamoItemListController() {
  return {
    selectedCell: null as null | {
      fieldName: string
      formatted: string
      raw: string
    },

    openCell(el: HTMLElement) {
      const raw = el.dataset.json ?? ""
      const fieldName = el.dataset.fieldName ?? ""
      this.selectedCell = { fieldName, formatted: formatJsonValue(raw), raw }
    },

    closeCell() {
      this.selectedCell = null
    },

    async copyCell() {
      if (!this.selectedCell) return
      try {
        await navigator.clipboard.writeText(this.selectedCell.raw)
      } catch {}
    },
  }
}
