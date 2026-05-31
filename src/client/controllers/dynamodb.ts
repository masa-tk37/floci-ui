import type { ItemEditFormInitial } from "../../views/dynamodb/item-edit-form-state"
import type { UpdateFormInitial } from "../../views/dynamodb/update-form-state"
import { errorMessage, requestJson, splitCommaList } from "../lib/floci"

type CreateTableProps = Record<string, never>

interface QueryBuilderProps {
  tableName: string
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

      const keySchema: Array<{ AttributeName: string; KeyType: string }> = [
        { AttributeName: this.pk.name, KeyType: "HASH" },
      ]
      if (this.hasSk && this.sk.name) {
        keySchema.push({ AttributeName: this.sk.name, KeyType: "RANGE" })
      }

      const payload: Record<string, unknown> = {
        TableName: this.tableName,
        AttributeDefinitions: attributeDefinitions,
        KeySchema: keySchema,
        BillingMode: this.billingMode,
      }

      if (this.billingMode === "PROVISIONED") {
        payload.ProvisionedThroughput = {
          ReadCapacityUnits: Number(this.rcu),
          WriteCapacityUnits: Number(this.wcu),
        }
      }

      if (this.gsi.length > 0) {
        payload.GlobalSecondaryIndexes = this.gsi.map((gsi) => {
          const gsiKeySchema: Array<{
            AttributeName: string
            KeyType: string
          }> = [{ AttributeName: gsi.pk.name, KeyType: "HASH" }]
          if (gsi.hasSk && gsi.sk.name) {
            gsiKeySchema.push({
              AttributeName: gsi.sk.name,
              KeyType: "RANGE",
            })
          }

          const projection: Record<string, unknown> = {
            ProjectionType: gsi.projectionType,
          }
          if (gsi.projectionType === "INCLUDE" && gsi.nonKeyAttrs) {
            projection.NonKeyAttributes = splitCommaList(gsi.nonKeyAttrs)
          }

          const index: Record<string, unknown> = {
            IndexName: gsi.indexName,
            KeySchema: gsiKeySchema,
            Projection: projection,
          }

          if (this.billingMode === "PROVISIONED") {
            index.ProvisionedThroughput = {
              ReadCapacityUnits: Number(gsi.rcu),
              WriteCapacityUnits: Number(gsi.wcu),
            }
          }

          return index
        })
      }

      if (this.lsi.length > 0) {
        payload.LocalSecondaryIndexes = this.lsi.map((lsi) => {
          const projection: Record<string, unknown> = {
            ProjectionType: lsi.projectionType,
          }

          if (lsi.projectionType === "INCLUDE" && lsi.nonKeyAttrs) {
            projection.NonKeyAttributes = splitCommaList(lsi.nonKeyAttrs)
          }

          return {
            IndexName: lsi.indexName,
            KeySchema: [
              { AttributeName: this.pk.name, KeyType: "HASH" },
              { AttributeName: lsi.sk.name, KeyType: "RANGE" },
            ],
            Projection: projection,
          }
        })
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
      this.submitting = true

      try {
        await requestJson("/dynamodb/tables", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(this.buildPayload()),
        })
        window.location.href = "/dynamodb"
      } catch (error) {
        this.error = errorMessage(error)
        this.submitting = false
      }
    },
  }
}

export function createDynamoUpdateTableController(
  _el: HTMLElement,
  init: UpdateFormInitial,
) {
  return {
    tableName: init.tableName,
    billingMode: init.billingMode,
    rcu: init.rcu,
    wcu: init.wcu,
    streamEnabled: init.streamEnabled,
    streamViewType: init.streamViewType,
    ttlEnabled: init.ttlEnabled,
    ttlAttr: init.ttlAttr,
    deletionProtection: init.deletionProtection,
    error: null as string | null,
    submitting: false,

    async submit() {
      this.error = null
      this.submitting = true
      try {
        await requestJson(
          `/dynamodb/tables/${encodeURIComponent(this.tableName)}/update`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              billingMode: this.billingMode,
              rcu: Number(this.rcu),
              wcu: Number(this.wcu),
              streamEnabled: this.streamEnabled,
              streamViewType: this.streamViewType,
              ttlEnabled: this.ttlEnabled,
              ttlAttr: this.ttlAttr,
              deletionProtection: this.deletionProtection,
            }),
          },
        )
        window.location.href = `/dynamodb/${encodeURIComponent(this.tableName)}`
      } catch (error) {
        this.error = errorMessage(error)
        this.submitting = false
      }
    },
  }
}

export function createDynamoItemEditController(
  _el: HTMLElement,
  init: ItemEditFormInitial & { itemPath: string },
) {
  return {
    tableName: init.tableName,
    pk: init.pk,
    sk: init.sk ?? "",
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
      this.error = null
      this.submitting = true
      try {
        await requestJson(`${init.itemPath}/edit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemJson: this.itemJson }),
        })
        window.location.href = init.itemPath
      } catch (error) {
        this.error = errorMessage(error)
        this.submitting = false
      }
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
        const data = await requestJson<{
          items: Record<string, unknown>[]
          cursor?: string
        }>(queryPath, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(this.buildPayload(cursor)),
        })
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
      let formatted: string
      try {
        formatted = JSON.stringify(JSON.parse(raw), null, 2)
      } catch {
        formatted = raw
      }
      this.selectedCell = { fieldName, formatted, raw }
    },

    closeCell() {
      this.selectedCell = null
    },

    async copyCell() {
      if (!this.selectedCell) return
      try {
        await navigator.clipboard.writeText(this.selectedCell.raw)
      } catch {
        // clipboard API が使えない環境では何もしない
      }
    },
  }
}
