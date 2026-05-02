export interface S3SettingsInitial {
  bucket: string
  versioning: string
  encryption: string
  kmsKeyId: string
  ownership: string
  blockPublicAcls: boolean
  ignorePublicAcls: boolean
  blockPublicPolicy: boolean
  restrictPublicBuckets: boolean
  tags: { key: string; value: string }[]
  corsRules: {
    allowedMethods: string
    allowedOrigins: string
    allowedHeaders: string
    maxAge: number
  }[]
  lifecycleRules: { id: string; prefix: string; expirationDays: number }[]
}

export function makeS3SettingsAlpineState(init: S3SettingsInitial): string {
  return `{
  bucket: ${JSON.stringify(init.bucket)},
  versioning: ${JSON.stringify(init.versioning)},
  encryption: ${JSON.stringify(init.encryption)},
  kmsKeyId: ${JSON.stringify(init.kmsKeyId)},
  ownership: ${JSON.stringify(init.ownership)},
  blockPublicAcls: ${init.blockPublicAcls},
  ignorePublicAcls: ${init.ignorePublicAcls},
  blockPublicPolicy: ${init.blockPublicPolicy},
  restrictPublicBuckets: ${init.restrictPublicBuckets},
  tags: ${JSON.stringify(init.tags)},
  corsRules: ${JSON.stringify(init.corsRules)},
  lifecycleRules: ${JSON.stringify(init.lifecycleRules)},
  error: null,
  warnings: [],
  submitting: false,

  addTag() { this.tags.push({ key: '', value: '' }); },
  removeTag(i) { this.tags.splice(i, 1); },
  addCors() { this.corsRules.push({ allowedMethods: 'GET', allowedOrigins: '*', allowedHeaders: '', maxAge: 0 }); },
  removeCors(i) { this.corsRules.splice(i, 1); },
  addLifecycle() { this.lifecycleRules.push({ id: '', prefix: '', expirationDays: 30 }); },
  removeLifecycle(i) { this.lifecycleRules.splice(i, 1); },

  buildPayload() {
    return {
      versioning: this.versioning,
      encryption: this.encryption !== 'none' ? {
        type: this.encryption,
        kmsKeyId: this.encryption === 'aws:kms' && this.kmsKeyId ? this.kmsKeyId : undefined,
      } : null,
      ownership: this.ownership,
      publicAccessBlock: {
        blockPublicAcls: this.blockPublicAcls,
        ignorePublicAcls: this.ignorePublicAcls,
        blockPublicPolicy: this.blockPublicPolicy,
        restrictPublicBuckets: this.restrictPublicBuckets,
      },
      tags: this.tags.filter(t => t.key).map(t => ({ key: t.key, value: t.value })),
      corsRules: this.corsRules.map(r => ({
        allowedMethods: r.allowedMethods.split(',').map(s => s.trim()).filter(Boolean),
        allowedOrigins: r.allowedOrigins.split(',').map(s => s.trim()).filter(Boolean),
        allowedHeaders: r.allowedHeaders ? r.allowedHeaders.split(',').map(s => s.trim()).filter(Boolean) : [],
        maxAge: Number(r.maxAge) || 0,
      })),
      lifecycleRules: this.lifecycleRules.filter(r => r.id).map(r => ({
        id: r.id,
        prefix: r.prefix,
        expirationDays: Number(r.expirationDays) || 30,
      })),
    };
  },

  async submit() {
    this.error = null;
    this.warnings = [];
    this.submitting = true;
    try {
      const data = await globalThis.floci.requestJson('/s3/' + encodeURIComponent(this.bucket) + '/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.buildPayload()),
      });
      if (data.warnings && data.warnings.length) { this.warnings = data.warnings; }
      window.dispatchEvent(new CustomEvent('floci:toast', { detail: { kind: 'success', message: '設定を保存しました' } }));
      this.submitting = false;
    } catch (e) {
      this.error = globalThis.floci.errorMessage(e);
      this.submitting = false;
    }
  },
}`
}
