export interface S3SettingsInitial {
  bucket: string
  versioning: string
  encryption: string
  kmsKeyId: string
  ownership: string
  blockPublicAcls: boolean
  ignorePublicAcls: boolean
  blockPublicPolicy: boolean
  restrictPublicBuckets: boolean
  tags: { key: string; value: string }[]
  corsRules: {
    allowedMethods: string[]
    allowedOrigins: string[]
    allowedHeaders: string[]
    maxAge: number
  }[]
  lifecycleRules: { id: string; prefix: string; expirationDays: number }[]
}
