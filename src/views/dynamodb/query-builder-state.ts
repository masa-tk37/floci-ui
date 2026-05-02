export function makeQueryBuilderAlpineState(tableName: string): string {
  const queryPath = `/dynamodb/${encodeURIComponent(tableName)}/query`

  return `{
    mode: 'query',
    keyConditionExpression: '',
    filterExpression: '',
    expressionAttributeValues: '',
    indexName: '',
    results: [],
    columns: [],
    loading: false,
    error: '',
    hasRun: false,
    nextCursor: '',
    pageCursors: [''],
    currentPageIndex: 0,

    buildPayload(cursor) {
      return {
        mode: this.mode,
        keyConditionExpression: this.keyConditionExpression,
        filterExpression: this.filterExpression,
        expressionAttributeValues: this.expressionAttributeValues,
        indexName: this.indexName,
        cursor: cursor || undefined,
      };
    },

    async loadPage(cursor, pageIndex, pageCursors) {
      this.loading = true;
      this.error = '';
      try {
        const d = await globalThis.floci.requestJson(${JSON.stringify(queryPath)}, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(this.buildPayload(cursor))
        });
        this.loading = false;
        this.results = d.items || [];
        this.columns = this.results.length > 0 ? Object.keys(this.results[0]) : [];
        this.nextCursor = d.cursor || '';
        this.pageCursors = pageCursors;
        this.currentPageIndex = pageIndex;
        this.hasRun = true;
        return true;
      } catch (e) {
        this.loading = false;
        this.error = globalThis.floci.errorMessage(e);
        return false;
      }
    },

    async submit() {
      await this.loadPage('', 0, ['']);
    },

    async nextPage() {
      if (this.loading || !this.nextCursor) return;
      const nextIndex = this.currentPageIndex + 1;
      const nextHistory = [...this.pageCursors.slice(0, nextIndex), this.nextCursor];
      await this.loadPage(this.nextCursor, nextIndex, nextHistory);
    },

    async previousPage() {
      if (this.loading || this.currentPageIndex === 0) return;
      const previousIndex = this.currentPageIndex - 1;
      const previousCursor = this.pageCursors[previousIndex] || '';
      await this.loadPage(previousCursor, previousIndex, this.pageCursors.slice(0, this.currentPageIndex));
    }
  }`
}
