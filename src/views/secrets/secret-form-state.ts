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
