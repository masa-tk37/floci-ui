import { errorMessage, requestJson } from "../lib/floci"

interface CreateModalProps {
  poolPath: string
}

interface GroupMemberUser {
  username: string
  email: string
  status: string
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
    createGroup: createModalFormController(`${props.poolPath}/groups`, {
      name: "",
      description: "",
    }),
    createUser: createModalFormController(`${props.poolPath}/users`, {
      username: "",
      temporaryPassword: "",
      email: "",
      phoneNumber: "",
    }),
    groupMembers: {
      isOpen: false,
      groupName: "",
      groupNameEncoded: "",
      users: [] as GroupMemberUser[],
      loading: false,
      newUsername: "",
      adding: false,
      removing: false,
      error: null as string | null,

      async show(groupName: string, groupNameEncoded: string) {
        this.groupName = groupName
        this.groupNameEncoded = groupNameEncoded
        this.isOpen = true
        this.error = null
        this.newUsername = ""
        await this.fetchMembers()
      },

      close() {
        this.isOpen = false
        this.users = []
        this.error = null
        this.newUsername = ""
      },

      async fetchMembers() {
        this.loading = true
        this.error = null
        try {
          const result = await requestJson<{ users: GroupMemberUser[] }>(
            `${props.poolPath}/groups/${this.groupNameEncoded}/users`,
          )
          this.users = result.users
        } catch (error) {
          this.error = errorMessage(error)
        } finally {
          this.loading = false
        }
      },

      async addMember() {
        const username = this.newUsername.trim()
        if (!username) return
        this.error = null
        this.adding = true
        try {
          await requestJson(
            `${props.poolPath}/groups/${this.groupNameEncoded}/users`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ username }),
            },
          )
          this.newUsername = ""
          await this.fetchMembers()
        } catch (error) {
          this.error = errorMessage(error)
        } finally {
          this.adding = false
        }
      },

      async removeMember(username: string) {
        this.error = null
        this.removing = true
        try {
          await requestJson(
            `${props.poolPath}/groups/${this.groupNameEncoded}/users/${encodeURIComponent(username)}`,
            { method: "DELETE" },
          )
          await this.fetchMembers()
        } catch (error) {
          this.error = errorMessage(error)
        } finally {
          this.removing = false
        }
      },
    },
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
