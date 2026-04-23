export interface SQSSettingsInitial {
  name: string
  isFifo: boolean
  visibilityTimeout: number
  messageRetentionPeriod: number
  delaySeconds: number
  receiveMessageWaitTimeSeconds: number
  maximumMessageSize: number
  dlqEnabled: boolean
  dlqTargetArn: string
  dlqMaxReceiveCount: number
  kmsEnabled: boolean
  kmsMasterKeyId: string
  tags: { key: string; value: string }[]
}

export function makeSQSSettingsAlpineState(init: SQSSettingsInitial): string {
  return `{
  name: ${JSON.stringify(init.name)},
  isFifo: ${init.isFifo},
  visibilityTimeout: ${init.visibilityTimeout},
  messageRetentionPeriod: ${init.messageRetentionPeriod},
  delaySeconds: ${init.delaySeconds},
  receiveMessageWaitTimeSeconds: ${init.receiveMessageWaitTimeSeconds},
  maximumMessageSize: ${init.maximumMessageSize},
  dlqEnabled: ${init.dlqEnabled},
  dlqTargetArn: ${JSON.stringify(init.dlqTargetArn)},
  dlqMaxReceiveCount: ${init.dlqMaxReceiveCount},
  kmsEnabled: ${init.kmsEnabled},
  kmsMasterKeyId: ${JSON.stringify(init.kmsMasterKeyId)},
  tags: ${JSON.stringify(init.tags)},
  error: null,
  submitting: false,

  addTag() { this.tags.push({ key: '', value: '' }); },
  removeTag(i) { this.tags.splice(i, 1); },

  buildAttributes() {
    const attrs = {
      VisibilityTimeout: String(this.visibilityTimeout),
      MessageRetentionPeriod: String(this.messageRetentionPeriod),
      DelaySeconds: String(this.delaySeconds),
      ReceiveMessageWaitTimeSeconds: String(this.receiveMessageWaitTimeSeconds),
      MaximumMessageSize: String(this.maximumMessageSize),
    };
    if (this.dlqEnabled && this.dlqTargetArn) {
      attrs.RedrivePolicy = JSON.stringify({
        deadLetterTargetArn: this.dlqTargetArn,
        maxReceiveCount: Number(this.dlqMaxReceiveCount),
      });
    } else if (!this.dlqEnabled) {
      attrs.RedrivePolicy = '';
    }
    if (this.kmsEnabled && this.kmsMasterKeyId) {
      attrs.KmsMasterKeyId = this.kmsMasterKeyId;
    }
    return attrs;
  },

  async submit() {
    this.error = null;
    this.submitting = true;
    try {
      const res = await fetch('/sqs/' + encodeURIComponent(this.name) + '/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attributes: this.buildAttributes(),
          tags: this.tags.filter(t => t.key).reduce((acc, t) => { acc[t.key] = t.value; return acc; }, {}),
        }),
      });
      const data = await res.json();
      if (data.error) { this.error = data.error; this.submitting = false; return; }
      window.dispatchEvent(new CustomEvent('floci:toast', { detail: { kind: 'success', message: '設定を保存しました' } }));
      this.submitting = false;
    } catch (e) {
      this.error = e.message;
      this.submitting = false;
    }
  },
}`
}
