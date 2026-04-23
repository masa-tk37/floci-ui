export interface ItemEditFormInitial {
  tableName: string
  pk: string
  sk?: string
  itemJson: string
  hashKey: string
  sortKey?: string
  tableArn?: string
}

export function makeItemEditAlpineState(
  init: ItemEditFormInitial,
  itemPath: string,
): string {
  return `{
  tableName: ${JSON.stringify(init.tableName)},
  pk: ${JSON.stringify(init.pk)},
  sk: ${JSON.stringify(init.sk ?? "")},
  itemJson: ${JSON.stringify(init.itemJson)},
  error: null,
  submitting: false,

  formatJson() {
    this.error = null;
    try {
      this.itemJson = JSON.stringify(JSON.parse(this.itemJson), null, 2);
    } catch (e) {
      this.error = e.message;
    }
  },

  async submit() {
    this.error = null;
    this.submitting = true;
    try {
      const res = await fetch(${JSON.stringify(`${itemPath}/edit`)}, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemJson: this.itemJson }),
      });
      const data = await res.json();
      if (data.error) { this.error = data.error; this.submitting = false; return; }
      window.location.href = ${JSON.stringify(itemPath)};
    } catch (e) {
      this.error = e.message;
      this.submitting = false;
    }
  },
}`
}
