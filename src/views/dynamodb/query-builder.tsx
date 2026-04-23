import { Html } from "@elysiajs/html"

import { Layout } from "../layout"
import { makeQueryBuilderAlpineState } from "./query-builder-state"

interface QueryBuilderProps {
  tableName: string
}

export function QueryBuilder({ tableName }: QueryBuilderProps) {
  const tablePath = `/dynamodb/${encodeURIComponent(tableName)}`
  const alpineState = makeQueryBuilderAlpineState(tableName)

  return (
    <Layout
      title={`DynamoDB · ${tableName} · Query`}
      active="dynamodb"
      crumbs={[
        { label: "DynamoDB", href: "/dynamodb" },
        { label: tableName, href: tablePath },
        { label: "Query / Scan", href: `${tablePath}/query` },
      ]}
    >
      <section class="page-header">
        <h1 class="page-title">
          Query / Scan · <span safe>{tableName}</span>
        </h1>
        <p class="page-subtitle">
          DynamoDB
          の式を入力してください。結果はページを再読み込みせずに表示されます。
        </p>
      </section>

      <div x-data={alpineState}>
        <form class="query-form" {...{ "@submit.prevent": "submit()" }}>
          <div class="form-row">
            <label class="form-label">モード</label>
            <div class="radio-group">
              <label class="radio">
                <input type="radio" value="query" x-model="mode" />
                <span>Query</span>
              </label>
              <label class="radio">
                <input type="radio" value="scan" x-model="mode" />
                <span>Scan</span>
              </label>
            </div>
          </div>

          <div class="form-row" x-show="mode === 'query'">
            <label class="form-label" for="keyConditionExpression">
              KeyConditionExpression
            </label>
            <input
              id="keyConditionExpression"
              type="text"
              class="input"
              x-model="keyConditionExpression"
              placeholder="pk = :pk AND begins_with(sk, :sk)"
            />
          </div>

          <div class="form-row">
            <label class="form-label" for="filterExpression">
              FilterExpression <span class="form-label__hint">(省略可)</span>
            </label>
            <input
              id="filterExpression"
              type="text"
              class="input"
              x-model="filterExpression"
              placeholder="attribute_exists(email)"
            />
          </div>

          <div class="form-row">
            <label class="form-label" for="expressionAttributeValues">
              ExpressionAttributeValues{" "}
              <span class="form-label__hint">(JSON)</span>
            </label>
            <textarea
              id="expressionAttributeValues"
              class="textarea"
              rows="5"
              x-model="expressionAttributeValues"
              placeholder={'{ ":pk": "user#123", ":sk": "order#" }'}
            />
          </div>

          <div class="form-row">
            <label class="form-label" for="indexName">
              IndexName <span class="form-label__hint">(省略可)</span>
            </label>
            <input
              id="indexName"
              type="text"
              class="input"
              x-model="indexName"
              placeholder="gsi-1"
            />
          </div>

          <div class="form-actions">
            <button
              type="submit"
              class="btn btn--dynamodb"
              {...{ ":disabled": "loading" }}
            >
              <span x-show="!loading">実行</span>
              <span x-show="loading">実行中…</span>
            </button>
          </div>
        </form>

        <div class="query-error" x-show="error" x-cloak>
          <strong>エラー:</strong> <span x-text="error" />
        </div>

        <section class="query-results" x-show="hasRun" x-cloak>
          <h2 class="section-title">
            結果 (<span x-text="results.length" />)
          </h2>
          <p class="muted">
            ページ <span x-text="currentPageIndex + 1" />
          </p>

          <div class="data-table-wrap" x-show="results.length > 0" x-cloak>
            <table class="data-table">
              <thead>
                <tr>
                  <template x-for="col in columns" {...{ ":key": "col" }}>
                    <th x-text="col" />
                  </template>
                </tr>
              </thead>
              <tbody>
                <template x-for="(item, idx) in results" {...{ ":key": "idx" }}>
                  <tr class="data-table__row">
                    <template x-for="col in columns" {...{ ":key": "col" }}>
                      <td x-text="typeof item[col] === 'object' ? JSON.stringify(item[col]) : String(item[col] ?? '')" />
                    </template>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>

          <p class="empty-state" x-show="results.length === 0" x-cloak>
            このページには結果がありません。
          </p>

          <nav class="pagination">
            <button
              type="button"
              class="btn btn--ghost"
              {...{
                "@click": "previousPage()",
                ":disabled": "loading || currentPageIndex === 0",
              }}
            >
              ← 前のページ
            </button>
            <button
              type="button"
              class="btn btn--ghost"
              {...{
                "@click": "nextPage()",
                ":disabled": "loading || !nextCursor",
              }}
            >
              次のページ →
            </button>
          </nav>
        </section>

        <p class="empty-state" x-show="!loading && !error && !hasRun" x-cloak>
          結果がありません。フォームを入力して実行してください。
        </p>
      </div>
    </Layout>
  )
}
