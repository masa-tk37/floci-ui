import {
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteBucketCorsCommand,
  DeleteBucketEncryptionCommand,
  DeleteBucketLifecycleCommand,
  DeleteBucketTaggingCommand,
  GetBucketCorsCommand,
  GetBucketEncryptionCommand,
  GetBucketLifecycleConfigurationCommand,
  GetBucketOwnershipControlsCommand,
  GetBucketTaggingCommand,
  GetBucketVersioningCommand,
  GetPublicAccessBlockCommand,
  ListBucketsCommand,
  PutBucketCorsCommand,
  PutBucketEncryptionCommand,
  PutBucketLifecycleConfigurationCommand,
  PutBucketOwnershipControlsCommand,
  PutBucketTaggingCommand,
  PutBucketVersioningCommand,
  PutPublicAccessBlockCommand,
} from "@aws-sdk/client-s3"
import { ServiceError, toOperationFailed } from "../../errors"
import { s3 } from "../../infrastructure/floci-clients"
import type { S3SettingsInitial } from "../../views/s3/settings-form-state"
import {
  fromAwsTags,
  normalizeTags,
  type ResourceTag,
  toAwsTags,
} from "../resource-tags"
import type {
  BucketSettingsInput,
  BucketSummary,
  CreateBucketOptions,
  SettingOp,
  UpdateSettingsResult,
} from "./shared"
import { runOps } from "./shared"

export async function listBuckets(): Promise<BucketSummary[]> {
  const { Buckets } = await s3.send(new ListBucketsCommand({}))
  return (Buckets ?? [])
    .map((bucket) => ({ name: bucket.Name ?? "" }))
    .sort((left, right) => left.name.localeCompare(right.name))
}

function putEncryptionOp(
  bucket: string,
  encryption: NonNullable<BucketSettingsInput["encryption"]>,
): SettingOp {
  return {
    label: "Encryption",
    promise: s3.send(
      new PutBucketEncryptionCommand({
        Bucket: bucket,
        ServerSideEncryptionConfiguration: {
          Rules: [
            {
              ApplyServerSideEncryptionByDefault: {
                SSEAlgorithm: encryption.type as "AES256" | "aws:kms",
                KMSMasterKeyID:
                  encryption.type === "aws:kms" && encryption.kmsKeyId
                    ? encryption.kmsKeyId
                    : undefined,
              },
            },
          ],
        },
      }),
    ),
  }
}

function ownershipOp(bucket: string, ownership: string): SettingOp {
  return {
    label: "Ownership",
    promise: s3.send(
      new PutBucketOwnershipControlsCommand({
        Bucket: bucket,
        OwnershipControls: {
          Rules: [
            {
              ObjectOwnership: ownership as
                | "BucketOwnerEnforced"
                | "BucketOwnerPreferred"
                | "ObjectWriter",
            },
          ],
        },
      }),
    ),
  }
}

function publicAccessBlockOp(
  bucket: string,
  block: NonNullable<BucketSettingsInput["publicAccessBlock"]>,
): SettingOp {
  return {
    label: "PublicAccessBlock",
    promise: s3.send(
      new PutPublicAccessBlockCommand({
        Bucket: bucket,
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: block.blockPublicAcls,
          IgnorePublicAcls: block.ignorePublicAcls,
          BlockPublicPolicy: block.blockPublicPolicy,
          RestrictPublicBuckets: block.restrictPublicBuckets,
        },
      }),
    ),
  }
}

function taggingOp(bucket: string, tags: ResourceTag[]): SettingOp {
  const awsTags = toAwsTags(tags)
  return {
    label: "Tagging",
    promise: awsTags
      ? s3.send(
          new PutBucketTaggingCommand({
            Bucket: bucket,
            Tagging: { TagSet: awsTags },
          }),
        )
      : s3.send(new DeleteBucketTaggingCommand({ Bucket: bucket })),
  }
}

export async function createBucket(
  name: string,
  options: CreateBucketOptions,
): Promise<{ warnings: string[] }> {
  try {
    await s3.send(new CreateBucketCommand({ Bucket: name }))
  } catch (error: unknown) {
    toOperationFailed(error)
  }

  const ops: SettingOp[] = []

  if (options.versioning && options.versioning !== "Suspended") {
    ops.push({
      label: "Versioning",
      promise: s3.send(
        new PutBucketVersioningCommand({
          Bucket: name,
          VersioningConfiguration: {
            Status: options.versioning as "Enabled" | "Suspended",
          },
        }),
      ),
    })
  }

  if (options.encryption && options.encryption.type !== "none") {
    ops.push(putEncryptionOp(name, options.encryption))
  }

  if (options.ownership) {
    ops.push(ownershipOp(name, options.ownership))
  }

  if (options.publicAccessBlock) {
    ops.push(publicAccessBlockOp(name, options.publicAccessBlock))
  }

  const tags = normalizeTags(options.tags)
  if (tags.length > 0) {
    ops.push(taggingOp(name, tags))
  }

  return { warnings: await runOps(ops) }
}

export async function deleteBucket(name: string): Promise<void> {
  try {
    await s3.send(new DeleteBucketCommand({ Bucket: name }))
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "NoSuchBucket") {
      throw new ServiceError("NotFound", `Bucket ${name} not found`, error)
    }
    toOperationFailed(error)
  }
}

function toCorsRules(
  rules:
    | {
        AllowedMethods?: string[]
        AllowedOrigins?: string[]
        AllowedHeaders?: string[]
        MaxAgeSeconds?: number
      }[]
    | undefined,
) {
  return (rules ?? []).map((rule) => ({
    allowedMethods: rule.AllowedMethods ?? [],
    allowedOrigins: rule.AllowedOrigins ?? [],
    allowedHeaders: rule.AllowedHeaders ?? [],
    maxAge: rule.MaxAgeSeconds ?? 0,
  }))
}

function toLifecycleRules(
  rules:
    | {
        ID?: string
        Status?: string
        Filter?: { Prefix?: string }
        Prefix?: string
        Expiration?: { Days?: number }
      }[]
    | undefined,
) {
  return (rules ?? [])
    .filter((rule) => rule.Status === "Enabled")
    .map((rule) => ({
      id: rule.ID ?? "",
      prefix: rule.Filter?.Prefix ?? rule.Prefix ?? "",
      expirationDays: rule.Expiration?.Days ?? 30,
    }))
}

export async function getBucketSettings(
  bucket: string,
): Promise<S3SettingsInitial> {
  const [
    versioningResult,
    encryptionResult,
    taggingResult,
    publicAccessBlockResult,
    ownershipResult,
    corsResult,
    lifecycleResult,
  ] = await Promise.all([
    s3
      .send(new GetBucketVersioningCommand({ Bucket: bucket }))
      .catch(() => ({ Status: undefined })),
    s3
      .send(new GetBucketEncryptionCommand({ Bucket: bucket }))
      .catch(() => ({ ServerSideEncryptionConfiguration: undefined })),
    s3
      .send(new GetBucketTaggingCommand({ Bucket: bucket }))
      .catch(() => ({ TagSet: [] })),
    s3
      .send(new GetPublicAccessBlockCommand({ Bucket: bucket }))
      .catch(() => ({ PublicAccessBlockConfiguration: undefined })),
    s3
      .send(new GetBucketOwnershipControlsCommand({ Bucket: bucket }))
      .catch(() => ({ OwnershipControls: undefined })),
    s3
      .send(new GetBucketCorsCommand({ Bucket: bucket }))
      .catch(() => ({ CORSRules: [] })),
    s3
      .send(new GetBucketLifecycleConfigurationCommand({ Bucket: bucket }))
      .catch(() => ({ Rules: [] })),
  ] as const)

  const encryptionRule =
    encryptionResult.ServerSideEncryptionConfiguration?.Rules?.[0]
      ?.ApplyServerSideEncryptionByDefault
  const publicAccessBlock =
    publicAccessBlockResult.PublicAccessBlockConfiguration ?? {}
  const ownershipRule = ownershipResult.OwnershipControls?.Rules?.[0]

  return {
    bucket,
    versioning: versioningResult.Status ?? "Suspended",
    encryption: encryptionRule?.SSEAlgorithm ?? "none",
    kmsKeyId: encryptionRule?.KMSMasterKeyID ?? "",
    ownership: ownershipRule?.ObjectOwnership ?? "BucketOwnerEnforced",
    blockPublicAcls: publicAccessBlock.BlockPublicAcls ?? false,
    ignorePublicAcls: publicAccessBlock.IgnorePublicAcls ?? false,
    blockPublicPolicy: publicAccessBlock.BlockPublicPolicy ?? false,
    restrictPublicBuckets: publicAccessBlock.RestrictPublicBuckets ?? false,
    tags: fromAwsTags(taggingResult.TagSet),
    corsRules: toCorsRules(corsResult.CORSRules),
    lifecycleRules: toLifecycleRules(lifecycleResult.Rules),
  }
}

export async function updateBucketSettings(
  bucket: string,
  settings: BucketSettingsInput,
): Promise<UpdateSettingsResult> {
  const ops: SettingOp[] = []

  ops.push({
    label: "Versioning",
    promise: s3.send(
      new PutBucketVersioningCommand({
        Bucket: bucket,
        VersioningConfiguration: {
          Status:
            (settings.versioning as "Enabled" | "Suspended") ?? "Suspended",
        },
      }),
    ),
  })

  if (settings.encryption && settings.encryption.type !== "none") {
    ops.push(putEncryptionOp(bucket, settings.encryption))
  } else if (settings.encryption === null) {
    ops.push({
      label: "Encryption",
      promise: s3.send(new DeleteBucketEncryptionCommand({ Bucket: bucket })),
    })
  }

  if (settings.ownership) {
    ops.push(ownershipOp(bucket, settings.ownership))
  }

  if (settings.publicAccessBlock) {
    ops.push(publicAccessBlockOp(bucket, settings.publicAccessBlock))
  }

  if (settings.tags !== undefined) {
    ops.push(taggingOp(bucket, normalizeTags(settings.tags)))
  }

  if (settings.corsRules !== undefined) {
    if (settings.corsRules.length > 0) {
      ops.push({
        label: "CORS",
        promise: s3.send(
          new PutBucketCorsCommand({
            Bucket: bucket,
            CORSConfiguration: {
              CORSRules: settings.corsRules.map((rule) => ({
                AllowedMethods: rule.allowedMethods as (
                  | "GET"
                  | "PUT"
                  | "POST"
                  | "DELETE"
                  | "HEAD"
                )[],
                AllowedOrigins: rule.allowedOrigins,
                AllowedHeaders:
                  rule.allowedHeaders.length > 0
                    ? rule.allowedHeaders
                    : undefined,
                MaxAgeSeconds: rule.maxAge || undefined,
              })),
            },
          }),
        ),
      })
    } else {
      ops.push({
        label: "CORS",
        promise: s3.send(new DeleteBucketCorsCommand({ Bucket: bucket })),
      })
    }
  }

  if (settings.lifecycleRules !== undefined) {
    if (settings.lifecycleRules.length > 0) {
      ops.push({
        label: "Lifecycle",
        promise: s3.send(
          new PutBucketLifecycleConfigurationCommand({
            Bucket: bucket,
            LifecycleConfiguration: {
              Rules: settings.lifecycleRules.map((rule) => ({
                ID: rule.id,
                Status: "Enabled",
                Filter: { Prefix: rule.prefix },
                Expiration: { Days: rule.expirationDays },
              })),
            },
          }),
        ),
      })
    } else {
      ops.push({
        label: "Lifecycle",
        promise: s3.send(
          new DeleteBucketLifecycleCommand({
            Bucket: bucket,
          }),
        ),
      })
    }
  }

  return { warnings: await runOps(ops) }
}
