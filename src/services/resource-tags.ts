import { ServiceError } from "../errors"

export interface ResourceTag {
  key: string
  value: string
}

export interface AwsTag {
  Key: string
  Value: string
}

export function normalizeTags(tags: ResourceTag[] | undefined): ResourceTag[] {
  const map = new Map<string, string>()

  for (const tag of tags ?? []) {
    const key = tag.key.trim()
    if (!key) continue
    map.set(key, tag.value.trim())
  }

  return [...map.entries()].map(([key, value]) => ({ key, value }))
}

export function toAwsTags(tags: ResourceTag[]): AwsTag[] | undefined {
  if (tags.length === 0) return undefined
  return tags.map((tag) => ({ Key: tag.key, Value: tag.value }))
}

export function fromAwsTags(
  tags: { Key?: string; Value?: string }[] | undefined,
): ResourceTag[] {
  return (tags ?? [])
    .map((tag) => ({ key: tag.Key ?? "", value: tag.Value ?? "" }))
    .filter((tag) => tag.key)
}

export function diffTags(
  currentTags: ResourceTag[],
  nextTags: ResourceTag[],
): { removeKeys: string[]; upsertTags: AwsTag[] } {
  const current = new Map(currentTags.map((tag) => [tag.key, tag.value]))
  const next = new Map(nextTags.map((tag) => [tag.key, tag.value]))

  return {
    removeKeys: [...current.keys()].filter((key) => !next.has(key)),
    upsertTags: [...next.entries()]
      .filter(([key, value]) => current.get(key) !== value)
      .map(([key, value]) => ({ Key: key, Value: value })),
  }
}

export function requireTrimmed(value: string, label: string): string {
  const normalized = value.trim()
  if (!normalized) {
    throw new ServiceError("InvalidInput", `${label} is required`)
  }
  return normalized
}

export function optionalTrimmed(value: string | undefined): string | undefined {
  return value?.trim() || undefined
}

export function normalizeDescription(
  value: string | undefined,
  { allowBlank }: { allowBlank: boolean },
): string | undefined {
  const normalized = value?.trim() ?? ""
  if (!normalized) return allowBlank ? "" : undefined
  return normalized
}
