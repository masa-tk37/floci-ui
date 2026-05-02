import { errorMessage, requestJson } from "../lib/floci"

interface CreateModalProps {
  poolPath: string
}

interface UserDetailActionProps {
  enableUrl: string
  disableUrl: string
  confirmUrl: string
  passwordUrl: string
}

function createModalFormController(
  actionUrl: string,
  fields: Record<string, string>,
) {
  return {
    open: false,
    actionUrl,
    ...fields,
    submitting: false,
    error: null as string | null,

    close() {
      if (this.submitting) return
      this.open = false
      this.error = null
      for (const [key, value] of Object.entries(fields)) {
        ;(this as unknown as Record<string, unknown>)[key] = value
      }
    },

    async submit(payload: Record<string, string>) {
      this.error = null
      this.submitting = true

      try {
        await requestJson(this.actionUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
        window.location.reload()
      } catch (error) {
        this.error = errorMessage(error)
        this.submitting = false
      }
    },
  }
}

export function createCognitoPoolDetailController(
  _el: HTMLElement,
  props: CreateModalProps,
) {
  return {
    createClient: createModalFormController(`${props.poolPath}/clients`, {
      name: "",
    }),
    createUser: createModalFormController(`${props.poolPath}/users`, {
      username: "",
      temporaryPassword: "",
      email: "",
      phoneNumber: "",
    }),
  }
}

export function createCognitoUserDetailController(
  _el: HTMLElement,
  props: UserDetailActionProps,
) {
  return {
    password: "",
    loading: false,
    error: null as string | null,

    async run(url: string, body?: Record<string, unknown>) {
      this.error = null
      this.loading = true

      try {
        await requestJson(url, {
          method: "POST",
          headers: body ? { "Content-Type": "application/json" } : undefined,
          body: body ? JSON.stringify(body) : undefined,
        })
        window.location.reload()
      } catch (error) {
        this.error = errorMessage(error)
        this.loading = false
      }
    },

    enable() {
      return this.run(props.enableUrl)
    },

    disable() {
      return this.run(props.disableUrl)
    },

    confirmUser() {
      return this.run(props.confirmUrl)
    },

    setPassword() {
      if (!this.password.trim()) {
        this.error = "Password is required"
        return
      }

      return this.run(props.passwordUrl, {
        password: this.password,
        permanent: true,
      })
    },
  }
}
