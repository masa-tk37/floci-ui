import type { UserPoolFormInitial } from "../../views/cognito/pool-form-state"
import type { SecretFormInitial } from "../../views/secrets/secret-form-state"
import type { ParameterFormInitial } from "../../views/ssm/parameter-form-state"
import {
  dispatchToast,
  errorMessage,
  requestJson,
  tagMixin,
} from "../lib/floci"

export function createSecretFormController(
  _el: HTMLElement,
  init: SecretFormInitial,
) {
  return {
    mode: init.mode,
    actionUrl: init.actionUrl,
    name: init.name,
    secretString: init.secretString,
    description: init.description,
    kmsKeyId: init.kmsKeyId,
    tags: [...init.tags],
    isBinary: init.isBinary,
    error: null as string | null,
    submitting: false,

    ...tagMixin,

    buildPayload() {
      return {
        name: this.name,
        secretString: this.secretString,
        description: this.description,
        kmsKeyId: this.kmsKeyId,
        tags: this.tags
          .filter((tag) => tag.key.trim())
          .map((tag) => ({ key: tag.key.trim(), value: tag.value.trim() })),
      }
    },

    async submit() {
      if (this.isBinary) return

      this.error = null
      this.submitting = true

      try {
        const data = await requestJson<{ id?: string }>(this.actionUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(this.buildPayload()),
        })

        if (this.mode === "create") {
          window.location.href = data.id ? `/secrets/${data.id}` : "/secrets"
          return
        }

        dispatchToast({
          kind: "success",
          message: "Secret を保存しました",
        })
        this.submitting = false
      } catch (error) {
        this.error = errorMessage(error)
        this.submitting = false
      }
    },
  }
}

export function createParameterFormController(
  _el: HTMLElement,
  init: ParameterFormInitial,
) {
  return {
    mode: init.mode,
    actionUrl: init.actionUrl,
    name: init.name,
    type: init.type,
    value: init.value,
    description: init.description,
    tier: init.tier,
    keyId: init.keyId,
    tags: [...init.tags],
    error: null as string | null,
    submitting: false,

    get isSecureString(): boolean {
      return this.type === "SecureString"
    },

    ...tagMixin,

    buildPayload() {
      return {
        name: this.name,
        type: this.type,
        value: this.value,
        description: this.description,
        tier: this.tier,
        keyId: this.isSecureString ? this.keyId : "",
        tags: this.tags
          .filter((tag) => tag.key.trim())
          .map((tag) => ({ key: tag.key.trim(), value: tag.value.trim() })),
      }
    },

    async submit() {
      this.error = null
      this.submitting = true

      try {
        const data = await requestJson<{ id?: string }>(this.actionUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(this.buildPayload()),
        })

        if (this.mode === "create") {
          window.location.href = data.id ? `/ssm/${data.id}` : "/ssm"
          return
        }

        dispatchToast({
          kind: "success",
          message: "Parameter を保存しました",
        })
        this.submitting = false
      } catch (error) {
        this.error = errorMessage(error)
        this.submitting = false
      }
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
      this.error = null
      this.submitting = true

      try {
        const data = await requestJson<{ id?: string }>(this.actionUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(this.buildPayload()),
        })

        window.location.href = data.id
          ? `/cognito/${encodeURIComponent(data.id)}`
          : "/cognito"
      } catch (error) {
        this.error = errorMessage(error)
        this.submitting = false
      }
    },
  }
}
