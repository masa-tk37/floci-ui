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
