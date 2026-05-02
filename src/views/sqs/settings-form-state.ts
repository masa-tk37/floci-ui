export interface SQSSettingsInitial {
  name: string
  isFifo: boolean
  visibilityTimeout: number
  messageRetentionPeriod: number
  delaySeconds: number
  receiveMessageWaitTimeSeconds: number
  maximumMessageSize: number
  dlqEnabled: boolean
  dlqTargetArn: string
  dlqMaxReceiveCount: number
  kmsEnabled: boolean
  kmsMasterKeyId: string
  tags: { key: string; value: string }[]
}
