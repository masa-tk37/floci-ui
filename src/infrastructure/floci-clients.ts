import { CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider"
import { DynamoDBClient } from "@aws-sdk/client-dynamodb"
import { S3Client } from "@aws-sdk/client-s3"
import { SecretsManagerClient } from "@aws-sdk/client-secrets-manager"
import { SQSClient } from "@aws-sdk/client-sqs"
import { SSMClient } from "@aws-sdk/client-ssm"

export const FLOCI_ENDPOINT =
  process.env.FLOCI_ENDPOINT ?? "http://localhost:4566"
export const FLOCI_REGION = process.env.FLOCI_DEFAULT_REGION ?? "us-east-1"
export const FLOCI_ACCOUNT_ID =
  process.env.FLOCI_DEFAULT_ACCOUNT_ID ?? "000000000000"

const credentials = { accessKeyId: "test", secretAccessKey: "test" }

/**
 * Bounds how long a page waits on an unreachable emulator. requestTimeout is a
 * socket-inactivity timeout, so a slow but progressing scan or download is not
 * cut off — this only catches a runtime that never answers.
 */
const requestHandler = { connectionTimeout: 3_000, requestTimeout: 10_000 }

export const dynamodb = new DynamoDBClient({
  endpoint: FLOCI_ENDPOINT,
  region: FLOCI_REGION,
  credentials,
  requestHandler,
})

export const s3 = new S3Client({
  endpoint: FLOCI_ENDPOINT,
  region: FLOCI_REGION,
  credentials,
  forcePathStyle: true,
  requestHandler,
})

export const sqs = new SQSClient({
  endpoint: FLOCI_ENDPOINT,
  region: FLOCI_REGION,
  credentials,
  requestHandler,
})

export const ssm = new SSMClient({
  endpoint: FLOCI_ENDPOINT,
  region: FLOCI_REGION,
  credentials,
  requestHandler,
})

export const secretsManager = new SecretsManagerClient({
  endpoint: FLOCI_ENDPOINT,
  region: FLOCI_REGION,
  credentials,
  requestHandler,
})

export const cognitoIdentityProvider = new CognitoIdentityProviderClient({
  endpoint: FLOCI_ENDPOINT,
  region: FLOCI_REGION,
  credentials,
  requestHandler,
})
