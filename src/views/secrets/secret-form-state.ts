export interface SecretFormInitial {
  mode: "create" | "edit"
  actionUrl: string
  name: string
  secretString: string
  description: string
  kmsKeyId: string
  tags: { key: string; value: string }[]
  isBinary: boolean
}

export function makeSecretFormAlpineState(init: SecretFormInitial): string {
  return `{
  mode: ${JSON.stringify(init.mode)},
  actionUrl: ${JSON.stringify(init.actionUrl)},
  name: ${JSON.stringify(init.name)},
  secretString: ${JSON.stringify(init.secretString)},
  description: ${JSON.stringify(init.description)},
  kmsKeyId: ${JSON.stringify(init.kmsKeyId)},
  tags: ${JSON.stringify(init.tags)},
  isBinary: ${init.isBinary},
  error: null,
  submitting: false,

  addTag() {
    this.tags.push({ key: '', value: '' });
  },

  removeTag(index) {
    this.tags.splice(index, 1);
  },

  buildPayload() {
    return {
      name: this.name,
      secretString: this.secretString,
      description: this.description,
      kmsKeyId: this.kmsKeyId,
      tags: this.tags
        .filter((tag) => tag.key.trim())
        .map((tag) => ({ key: tag.key.trim(), value: tag.value.trim() })),
    };
  },

  async submit() {
    if (this.isBinary) return;

    this.error = null;
    this.submitting = true;

    try {
      const response = await fetch(this.actionUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.buildPayload()),
      });
      const data = await response.json();

      if (!response.ok || data.error) {
        this.error = data.error || ('エラーが発生しました (HTTP ' + response.status + ')');
        this.submitting = false;
        return;
      }

      if (this.mode === 'create') {
        window.location.href = data.id ? ('/secrets/' + data.id) : '/secrets';
        return;
      }

      window.dispatchEvent(new CustomEvent('floci:toast', { detail: { kind: 'success', message: 'Secret を保存しました' } }));
      this.submitting = false;
    } catch (error) {
      this.error = error?.message || 'ネットワークエラーが発生しました';
      this.submitting = false;
    }
  },
}`
}
