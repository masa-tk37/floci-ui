import type { UserPoolFormInitial } from "../../views/cognito/pool-form-state"
import type { SecretFormInitial } from "../../views/secrets/secret-form-state"
import type { ParameterFormInitial } from "../../views/ssm/parameter-form-state"
import { dispatchToast, submitJson, tagMixin } from "../lib/floci"

export function createSecretFormController(
  _el: HTMLElement,
  init: SecretFormInitial,
) {
  return {
    ...init,
    tags: [...init.tags],
    error: null as string | null,
    submitting: false,

    ...tagMixin,

    buildPayload() {
      return {
        ...(this.mode === "create" ? { name: this.name } : {}),
        secretString: this.secretString,
        description: this.description,
        kmsKeyId: this.kmsKeyId,
        tags: this.tags,
      }
    },

    async submit() {
      if (this.isBinary) return

      const data = await submitJson<{ id?: string }>(
        this,
        this.actionUrl,
        this.buildPayload(),
      )
      if (data === undefined) return

      if (this.mode === "create") {
        window.location.href = data.id ? `/secrets/${data.id}` : "/secrets"
        return
      }

      dispatchToast({
        kind: "success",
        message: "Secret を保存しました",
      })
      this.submitting = false
    },
  }
}

export function createParameterFormController(
  _el: HTMLElement,
  init: ParameterFormInitial,
) {
  return {
    ...init,
    tags: [...init.tags],
    error: null as string | null,
    submitting: false,

    get isSecureString(): boolean {
      return this.type === "SecureString"
    },

    ...tagMixin,

    buildPayload() {
      return {
        ...(this.mode === "create" ? { name: this.name } : {}),
        type: this.type,
        value: this.value,
        description: this.description,
        tier: this.tier,
        keyId: this.isSecureString ? this.keyId : "",
        tags: this.tags,
      }
    },

    async submit() {
      const data = await submitJson<{ id?: string }>(
        this,
        this.actionUrl,
        this.buildPayload(),
      )
      if (data === undefined) return

      if (this.mode === "create") {
        window.location.href = data.id ? `/ssm/${data.id}` : "/ssm"
        return
      }

      dispatchToast({
        kind: "success",
        message: "Parameter を保存しました",
      })
      this.submitting = false
    },
  }
}

export function createUserPoolFormController(
  _el: HTMLElement,
  init: UserPoolFormInitial,
) {
  return {
    actionUrl: init.actionUrl,
    name: init.name,
    usernameMode: init.usernameMode,
    autoVerifyEmail: init.autoVerifiedAttributes.includes("email"),
    autoVerifyPhoneNumber: init.autoVerifiedAttributes.includes("phone_number"),
    mfaConfiguration: init.mfaConfiguration,
    error: null as string | null,
    submitting: false,

    buildPayload() {
      const autoVerifiedAttributes = []
      if (this.autoVerifyEmail) autoVerifiedAttributes.push("email")
      if (this.autoVerifyPhoneNumber) {
        autoVerifiedAttributes.push("phone_number")
      }

      return {
        name: this.name,
        usernameMode: this.usernameMode,
        autoVerifiedAttributes,
        mfaConfiguration: this.mfaConfiguration,
      }
    },

    async submit() {
      const data = await submitJson<{ id?: string }>(
        this,
        this.actionUrl,
        this.buildPayload(),
      )
      if (data === undefined) return

      window.location.href = data.id
        ? `/cognito/${encodeURIComponent(data.id)}`
        : "/cognito"
    },
  }
}
