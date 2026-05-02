export const createBucketAlpineState = `{
  name: '',
  versioning: 'Suspended',
  encryption: 'none',
  kmsKeyId: '',
  ownership: 'BucketOwnerEnforced',
  blockPublicAcls: true,
  ignorePublicAcls: true,
  blockPublicPolicy: true,
  restrictPublicBuckets: true,
  tags: [],
  error: null,
  warnings: [],
  submitting: false,

  addTag() { this.tags.push({ key: '', value: '' }); },
  removeTag(i) { this.tags.splice(i, 1); },

  buildPayload() {
    return {
      name: this.name,
      versioning: this.versioning !== 'Suspended' ? this.versioning : null,
      encryption: this.encryption !== 'none' ? {
        type: this.encryption,
        kmsKeyId: this.encryption === 'aws:kms' && this.kmsKeyId ? this.kmsKeyId : undefined,
      } : null,
      ownership: this.ownership !== 'BucketOwnerEnforced' ? this.ownership : null,
      publicAccessBlock: {
        blockPublicAcls: this.blockPublicAcls,
        ignorePublicAcls: this.ignorePublicAcls,
        blockPublicPolicy: this.blockPublicPolicy,
        restrictPublicBuckets: this.restrictPublicBuckets,
      },
      tags: this.tags.filter(t => t.key).map(t => ({ key: t.key, value: t.value })),
    };
  },

  async submit() {
    this.error = null;
    this.warnings = [];
    this.submitting = true;
    try {
      const data = await globalThis.floci.requestJson('/s3/bucket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.buildPayload()),
      });
      if (data.warnings && data.warnings.length) {
        this.warnings = data.warnings;
        this.submitting = false;
        setTimeout(() => { window.location.href = '/s3'; }, 2000);
        return;
      }
      window.location.href = '/s3';
    } catch (e) {
      this.error = globalThis.floci.errorMessage(e);
      this.submitting = false;
    }
  },
}`
