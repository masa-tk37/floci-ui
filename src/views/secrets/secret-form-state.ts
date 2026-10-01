import type { ResourceTag } from "../../services/resource-tags"

export interface SecretFormInitial {
  mode: "create" | "edit"
  actionUrl: string
  name: string
  secretString: string
  description: string
  kmsKeyId: string
  tags: ResourceTag[]
  isBinary: boolean
}
