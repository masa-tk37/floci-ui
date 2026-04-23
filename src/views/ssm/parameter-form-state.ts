export interface ParameterFormInitial {
  mode: "create" | "edit"
  actionUrl: string
  name: string
  type: "String" | "StringList" | "SecureString"
  value: string
  description: string
  tier: string
  keyId: string
  tags: { key: string; value: string }[]
}

export function makeParameterFormAlpineState(
  init: ParameterFormInitial,
): string {
  return `{
  mode: ${JSON.stringify(init.mode)},
  actionUrl: ${JSON.stringify(init.actionUrl)},
  name: ${JSON.stringify(init.name)},
  type: ${JSON.stringify(init.type)},
  value: ${JSON.stringify(init.value)},
  description: ${JSON.stringify(init.description)},
  tier: ${JSON.stringify(init.tier)},
  keyId: ${JSON.stringify(init.keyId)},
  tags: ${JSON.stringify(init.tags)},
  error: null,
  submitting: false,

  get isSecureString() {
    return this.type === 'SecureString';
  },

  addTag() {
    this.tags.push({ key: '', value: '' });
  },

  removeTag(index) {
    this.tags.splice(index, 1);
  },

  buildPayload() {
    return {
      name: this.name,
      type: this.type,
      value: this.value,
      description: this.description,
      tier: this.tier,
      keyId: this.isSecureString ? this.keyId : '',
      tags: this.tags
        .filter((tag) => tag.key.trim())
        .map((tag) => ({ key: tag.key.trim(), value: tag.value.trim() })),
    };
  },

  async submit() {
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
        window.location.href = data.id ? ('/ssm/' + data.id) : '/ssm';
        return;
      }

      window.dispatchEvent(new CustomEvent('floci:toast', { detail: { kind: 'success', message: 'Parameter を保存しました' } }));
      this.submitting = false;
    } catch (error) {
      this.error = error?.message || 'ネットワークエラーが発生しました';
      this.submitting = false;
    }
  },
}`
}
