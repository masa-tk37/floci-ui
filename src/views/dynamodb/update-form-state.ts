export interface UpdateFormInitial {
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

export function makeUpdateTableAlpineState(init: UpdateFormInitial): string {
  return `{
  tableName: ${JSON.stringify(init.tableName)},
  billingMode: ${JSON.stringify(init.billingMode)},
  rcu: ${init.rcu},
  wcu: ${init.wcu},
  streamEnabled: ${init.streamEnabled},
  streamViewType: ${JSON.stringify(init.streamViewType)},
  ttlEnabled: ${init.ttlEnabled},
  ttlAttr: ${JSON.stringify(init.ttlAttr)},
  deletionProtection: ${init.deletionProtection},
  error: null,
  submitting: false,

  async submit() {
    this.error = null;
    this.submitting = true;
    try {
      const res = await fetch('/dynamodb/tables/' + encodeURIComponent(this.tableName) + '/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      });
      const data = await res.json();
      if (data.error) { this.error = data.error; this.submitting = false; return; }
      window.location.href = '/dynamodb/' + encodeURIComponent(this.tableName);
    } catch (e) {
      this.error = e.message;
      this.submitting = false;
    }
  },
}`
}
