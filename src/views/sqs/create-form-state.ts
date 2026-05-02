export const createQueueAlpineState = `{
  name: '',
  isFifo: false,
  contentBasedDedup: false,
  visibilityTimeout: 30,
  messageRetentionPeriod: 345600,
  delaySeconds: 0,
  receiveMessageWaitTimeSeconds: 0,
  maximumMessageSize: 262144,
  dlqEnabled: false,
  dlqTargetArn: '',
  dlqMaxReceiveCount: 3,
  kmsEnabled: false,
  kmsMasterKeyId: '',
  tags: [],
  error: null,
  submitting: false,

  addTag() { this.tags.push({ key: '', value: '' }); },
  removeTag(i) { this.tags.splice(i, 1); },

  get resolvedName() {
    if (this.isFifo && !this.name.endsWith('.fifo')) return this.name + '.fifo';
    return this.name;
  },

  buildPayload() {
    const attrs = {
      VisibilityTimeout: String(this.visibilityTimeout),
      MessageRetentionPeriod: String(this.messageRetentionPeriod),
      DelaySeconds: String(this.delaySeconds),
      ReceiveMessageWaitTimeSeconds: String(this.receiveMessageWaitTimeSeconds),
      MaximumMessageSize: String(this.maximumMessageSize),
    };
    if (this.isFifo) {
      attrs.FifoQueue = 'true';
      if (this.contentBasedDedup) attrs.ContentBasedDeduplication = 'true';
    }
    if (this.dlqEnabled && this.dlqTargetArn) {
      attrs.RedrivePolicy = JSON.stringify({
        deadLetterTargetArn: this.dlqTargetArn,
        maxReceiveCount: Number(this.dlqMaxReceiveCount),
      });
    }
    if (this.kmsEnabled && this.kmsMasterKeyId) {
      attrs.KmsMasterKeyId = this.kmsMasterKeyId;
    }
    return {
      name: this.resolvedName,
      attributes: attrs,
      tags: this.tags.filter(t => t.key).reduce((acc, t) => { acc[t.key] = t.value; return acc; }, {}),
    };
  },

  async submit() {
    this.error = null;
    this.submitting = true;
    try {
      await globalThis.floci.requestJson('/sqs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.buildPayload()),
      });
      window.location.href = '/sqs';
    } catch (e) {
      this.error = globalThis.floci.errorMessage(e);
      this.submitting = false;
    }
  },
}`
