import {
  type CORSRule,
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
  type LifecycleRule,
  ListBucketsCommand,
  PutBucketCorsCommand,
  PutBucketEncryptionCommand,
  PutBucketLifecycleConfigurationCommand,
  PutBucketOwnershipControlsCommand,
  PutBucketTaggingCommand,
  PutBucketVersioningCommand,
  PutPublicAccessBlockCommand,
  type ServerSideEncryptionByDefault,
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

/** Error names S3 uses when a bucket has no configuration of that kind. */
const NOT_CONFIGURED_ERRORS = new Set([
  "NoSuchCORSConfiguration",
  "NoSuchLifecycleConfiguration",
  "NoSuchTagSet",
  "ServerSideEncryptionConfigurationNotFoundError",
  "NoSuchPublicAccessBlockConfiguration",
  "OwnershipControlsNotFoundError",
])

function defaultWhenNotConfigured<T>(fallback: T) {
  return (error: unknown): T => {
    if (error instanceof Error && NOT_CONFIGURED_ERRORS.has(error.name)) {
      return fallback
    }
    toOperationFailed(error)
  }
}

function sendPutEncryption(
  bucket: string,
  encryption: NonNullable<BucketSettingsInput["encryption"]>,
  bucketKeyEnabled?: boolean,
) {
  return s3.send(
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
            BucketKeyEnabled: bucketKeyEnabled,
          },
        ],
      },
    }),
  )
}

function putEncryptionOp(
  bucket: string,
  encryption: NonNullable<BucketSettingsInput["encryption"]>,
): SettingOp {
  return { label: "Encryption", promise: sendPutEncryption(bucket, encryption) }
}

function isKmsAlgorithm(algorithm: string | undefined): boolean {
  return algorithm === "aws:kms" || algorithm === "aws:kms:dsse"
}

/** DSSE-KMS is shown as aws:kms, so an aws:kms request with the same key keeps DSSE. */
function encryptionUnchanged(
  requested: NonNullable<BucketSettingsInput["encryption"]>,
  current: ServerSideEncryptionByDefault | undefined,
): boolean {
  if (requested.type === "AES256") return current?.SSEAlgorithm === "AES256"
  return (
    requested.type === "aws:kms" &&
    isKmsAlgorithm(current?.SSEAlgorithm) &&
    (requested.kmsKeyId ?? "") === (current?.KMSMasterKeyID ?? "")
  )
}

async function updateEncryption(
  bucket: string,
  requested: NonNullable<BucketSettingsInput["encryption"]>,
): Promise<void> {
  const { ServerSideEncryptionConfiguration } = await s3
    .send(new GetBucketEncryptionCommand({ Bucket: bucket }))
    .catch(
      defaultWhenNotConfigured({
        ServerSideEncryptionConfiguration: undefined,
      }),
    )
  const currentRule = ServerSideEncryptionConfiguration?.Rules?.[0]
  const current = currentRule?.ApplyServerSideEncryptionByDefault
  if (encryptionUnchanged(requested, current)) return
  const keepBucketKey =
    requested.type === "aws:kms" && isKmsAlgorithm(current?.SSEAlgorithm)
      ? currentRule?.BucketKeyEnabled
      : undefined
  await sendPutEncryption(bucket, requested, keepBucketKey)
}

const VERSIONING_STATUSES = new Set(["Enabled", "Suspended"])

async function updateVersioning(
  bucket: string,
  requested: "Enabled" | "Suspended",
): Promise<void> {
  const { Status } = await s3.send(
    new GetBucketVersioningCommand({ Bucket: bucket }),
  )
  // Suspending an unversioned bucket would make it permanently versioning-aware.
  if (Status === requested || (requested === "Suspended" && !Status)) return
  await s3.send(
    new PutBucketVersioningCommand({
      Bucket: bucket,
      VersioningConfiguration: { Status: requested },
    }),
  )
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

function toCorsRules(rules: CORSRule[] | undefined) {
  return (rules ?? []).map((rule) => ({
    allowedMethods: rule.AllowedMethods ?? [],
    allowedOrigins: rule.AllowedOrigins ?? [],
    allowedHeaders: rule.AllowedHeaders ?? [],
    maxAge: rule.MaxAgeSeconds ?? 0,
  }))
}

type CorsRuleInput = NonNullable<BucketSettingsInput["corsRules"]>[number]
type LifecycleRuleInput = NonNullable<
  BucketSettingsInput["lifecycleRules"]
>[number]

function sameStrings(left: string[], right: string[]): boolean {
  return (
    left.length === right.length && left.every((value, i) => value === right[i])
  )
}

function sameCorsTarget(left: CorsRuleInput, right: CorsRuleInput): boolean {
  return (
    sameStrings(left.allowedMethods, right.allowedMethods) &&
    sameStrings(left.allowedOrigins, right.allowedOrigins) &&
    sameStrings(left.allowedHeaders, right.allowedHeaders)
  )
}

function sameCorsRules(left: CorsRuleInput[], right: CorsRuleInput[]): boolean {
  return (
    left.length === right.length &&
    left.every((rule, i) => {
      const other = right[i]
      return (
        other !== undefined &&
        sameCorsTarget(rule, other) &&
        rule.maxAge === other.maxAge
      )
    })
  )
}

/**
 * The form cannot show ID or ExposeHeaders, so carry them over from the existing
 * rule with the same methods, origins and headers.
 */
function toAwsCorsRules(
  submitted: CorsRuleInput[],
  existing: CORSRule[],
): CORSRule[] {
  const unmatched = [...existing]
  return submitted.map((rule) => {
    const index = unmatched.findIndex((candidate) => {
      const [view] = toCorsRules([candidate])
      return view !== undefined && sameCorsTarget(view, rule)
    })
    const match = index === -1 ? undefined : unmatched.splice(index, 1)[0]
    return {
      ID: match?.ID,
      AllowedMethods: rule.allowedMethods as (
        | "GET"
        | "PUT"
        | "POST"
        | "DELETE"
        | "HEAD"
      )[],
      AllowedOrigins: rule.allowedOrigins,
      AllowedHeaders:
        rule.allowedHeaders.length > 0 ? rule.allowedHeaders : undefined,
      ExposeHeaders: match?.ExposeHeaders,
      // The form sends 0 for an unset max age; keep an explicit 0 the bucket already had.
      MaxAgeSeconds:
        rule.maxAge !== 0 || match?.MaxAgeSeconds === 0
          ? rule.maxAge
          : undefined,
    }
  })
}

async function updateCors(
  bucket: string,
  submitted: CorsRuleInput[],
): Promise<void> {
  const { CORSRules } = await s3
    .send(new GetBucketCorsCommand({ Bucket: bucket }))
    .catch(defaultWhenNotConfigured({ CORSRules: [] }))
  if (sameCorsRules(submitted, toCorsRules(CORSRules))) return
  if (submitted.length === 0) {
    await s3.send(new DeleteBucketCorsCommand({ Bucket: bucket }))
    return
  }
  await s3.send(
    new PutBucketCorsCommand({
      Bucket: bucket,
      CORSConfiguration: {
        CORSRules: toAwsCorsRules(submitted, CORSRules ?? []),
      },
    }),
  )
}

/** Whether the form's id / prefix / expiration-days fields fully describe the rule. */
function isEditableLifecycleRule(rule: LifecycleRule): boolean {
  const filter = rule.Filter
  return (
    Boolean(rule.ID) &&
    rule.Status === "Enabled" &&
    rule.Expiration?.Days !== undefined &&
    rule.Expiration.Date === undefined &&
    rule.Expiration.ExpiredObjectDeleteMarker === undefined &&
    !rule.Transitions?.length &&
    !rule.NoncurrentVersionTransitions?.length &&
    rule.NoncurrentVersionExpiration === undefined &&
    rule.AbortIncompleteMultipartUpload === undefined &&
    filter?.And === undefined &&
    filter?.Tag === undefined &&
    filter?.ObjectSizeGreaterThan === undefined &&
    filter?.ObjectSizeLessThan === undefined
  )
}

function toLifecycleRules(rules: LifecycleRule[] | undefined) {
  return (rules ?? []).filter(isEditableLifecycleRule).map((rule) => ({
    id: rule.ID ?? "",
    prefix: rule.Filter?.Prefix ?? rule.Prefix ?? "",
    expirationDays: rule.Expiration?.Days ?? 0,
  }))
}

function sameLifecycleRules(
  left: LifecycleRuleInput[],
  right: LifecycleRuleInput[],
): boolean {
  return (
    left.length === right.length &&
    left.every((rule, i) => {
      const other = right[i]
      return (
        other !== undefined &&
        rule.id === other.id &&
        rule.prefix === other.prefix &&
        rule.expirationDays === other.expirationDays
      )
    })
  )
}

/** Rules the form cannot show are kept verbatim; only the editable ones are replaced. */
async function updateLifecycle(
  bucket: string,
  submitted: LifecycleRuleInput[],
): Promise<void> {
  const { Rules } = await s3
    .send(new GetBucketLifecycleConfigurationCommand({ Bucket: bucket }))
    .catch(defaultWhenNotConfigured({ Rules: [] }))
  if (sameLifecycleRules(submitted, toLifecycleRules(Rules))) return

  const preserved = (Rules ?? []).filter(
    (rule) => !isEditableLifecycleRule(rule),
  )
  const preservedIds = new Set(preserved.map((rule) => rule.ID))
  const collision = submitted.find((rule) => preservedIds.has(rule.id))
  if (collision) {
    throw new Error(
      `Rule ID "${collision.id}" is already used by a rule this form cannot edit`,
    )
  }

  const rules: LifecycleRule[] = [
    ...preserved,
    ...submitted.map((rule) => ({
      ID: rule.id,
      Status: "Enabled" as const,
      Filter: { Prefix: rule.prefix },
      Expiration: { Days: rule.expirationDays },
    })),
  ]
  if (rules.length === 0) {
    await s3.send(new DeleteBucketLifecycleCommand({ Bucket: bucket }))
    return
  }
  await s3.send(
    new PutBucketLifecycleConfigurationCommand({
      Bucket: bucket,
      LifecycleConfiguration: { Rules: rules },
    }),
  )
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
      .catch(toOperationFailed),
    s3.send(new GetBucketEncryptionCommand({ Bucket: bucket })).catch(
      defaultWhenNotConfigured({
        ServerSideEncryptionConfiguration: undefined,
      }),
    ),
    s3
      .send(new GetBucketTaggingCommand({ Bucket: bucket }))
      .catch(defaultWhenNotConfigured({ TagSet: [] })),
    s3
      .send(new GetPublicAccessBlockCommand({ Bucket: bucket }))
      .catch(
        defaultWhenNotConfigured({ PublicAccessBlockConfiguration: undefined }),
      ),
    s3
      .send(new GetBucketOwnershipControlsCommand({ Bucket: bucket }))
      .catch(defaultWhenNotConfigured({ OwnershipControls: undefined })),
    s3
      .send(new GetBucketCorsCommand({ Bucket: bucket }))
      .catch(defaultWhenNotConfigured({ CORSRules: [] })),
    s3
      .send(new GetBucketLifecycleConfigurationCommand({ Bucket: bucket }))
      .catch(defaultWhenNotConfigured({ Rules: [] })),
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
    encryption: isKmsAlgorithm(encryptionRule?.SSEAlgorithm)
      ? "aws:kms"
      : (encryptionRule?.SSEAlgorithm ?? "none"),
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
  const { versioning } = settings
  if (versioning !== undefined && !VERSIONING_STATUSES.has(versioning)) {
    throw new ServiceError(
      "InvalidInput",
      `Versioning must be Enabled or Suspended, got ${versioning}`,
    )
  }

  const ops: SettingOp[] = []

  if (versioning !== undefined) {
    ops.push({
      label: "Versioning",
      promise: updateVersioning(bucket, versioning as "Enabled" | "Suspended"),
    })
  }

  if (settings.encryption && settings.encryption.type !== "none") {
    ops.push({
      label: "Encryption",
      promise: updateEncryption(bucket, settings.encryption),
    })
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
    ops.push({ label: "CORS", promise: updateCors(bucket, settings.corsRules) })
  }

  if (settings.lifecycleRules !== undefined) {
    ops.push({
      label: "Lifecycle",
      promise: updateLifecycle(bucket, settings.lifecycleRules),
    })
  }

  return { warnings: await runOps(ops) }
}
