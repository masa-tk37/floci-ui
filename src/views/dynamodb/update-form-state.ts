export interface UpdateFormInitial {
  tableName: string
  billingMode: string
  rcu: number
  wcu: number
  streamEnabled: boolean
  streamViewType: string
  ttlEnabled: boolean
  ttlAttr: string
  deletionProtection: boolean
}
