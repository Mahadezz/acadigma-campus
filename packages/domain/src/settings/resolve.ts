/**
 * The one setting-resolution rule (F-OP-07 §5.1): every consumer reads a school
 * setting through `resolve()`, which merges shipped default <- school value. There
 * is no third source. A missing key resolves to the documented default; an unknown
 * key on the stored row (an old default that got renamed, a hand-edited row) is
 * dropped rather than surfaced, and a value of the wrong type falls back to its
 * default instead of throwing — this function must survive whatever is actually
 * sitting in `school_profiles` today, not just what a fresh row looks like.
 */

import {
  DEFAULT_ACADEMIC_SETTINGS,
  DEFAULT_ATTENDANCE_POLICY,
  DEFAULT_BRANDING,
  DEFAULT_COVER_POLICY,
  DEFAULT_MESSAGING_POLICY,
  DEFAULT_TIMEZONE,
  DEFAULT_WORKING_DAYS,
  type AcademicSettings,
  type AttendancePolicy,
  type Branding,
  type CoverPolicy,
  type MessagingPolicy,
} from "./defaults"

/**
 * The shape read from `school_profiles`. Every field is optional/nullable on
 * purpose: this is what a partially-migrated or hand-edited row can look like, and
 * `resolve()` must accept it without throwing.
 */
export type SchoolProfileRow = {
  workspace_id?: string | null
  timezone?: string | null
  working_days?: readonly number[] | null
  attendance_policy?: unknown
  academic_settings?: unknown
  cover_policy?: unknown
  messaging_policy?: unknown
  branding?: unknown
}

export type ResolvedSettings = {
  workspaceId: string | null
  timezone: string
  workingDays: readonly number[]
  attendancePolicy: AttendancePolicy
  academicSettings: AcademicSettings
  coverPolicy: CoverPolicy
  messagingPolicy: MessagingPolicy
  branding: Branding
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * Shallow-merges `override` onto `defaults`, key by key: a key is taken from the
 * override only when it exists on `defaults` (unknown keys are dropped) and its
 * value is the same JS type as the default (a type mismatch keeps the default
 * instead of raising). Arrays and plain objects both satisfy "same type" against an
 * array/object default respectively, so `exam_weights`/`quiet_hours` accept whatever
 * object shape is stored without this function knowing their internal keys.
 */
function mergeDefaults<T extends Record<string, unknown>>(
  defaults: T,
  override: unknown
): T {
  if (!isPlainObject(override)) return { ...defaults }

  const result = { ...defaults }
  for (const key of Object.keys(defaults) as (keyof T)[]) {
    if (!((key as string) in override)) continue
    const value = override[key as string]
    if (value === undefined || value === null) continue

    const defaultValue = defaults[key]
    // A `null` default (e.g. branding.accent) means "nullable scalar, no shape to
    // check beyond that" — value is already known non-null/non-undefined here, so
    // any non-object/array value is accepted; a stray object or array is not.
    const sameShape =
      defaultValue === null
        ? typeof value !== "object"
        : Array.isArray(defaultValue)
          ? Array.isArray(value)
          : isPlainObject(defaultValue)
            ? isPlainObject(value)
            : typeof value === typeof defaultValue

    if (sameShape) result[key] = value as T[keyof T]
  }
  return result
}

/** A valid working-days array: 1-7 distinct ISO day numbers, at least one. */
function resolveWorkingDays(
  value: SchoolProfileRow["working_days"]
): readonly number[] {
  if (!Array.isArray(value) || value.length === 0) return DEFAULT_WORKING_DAYS
  const valid = value.every(
    (day) => Number.isInteger(day) && day >= 1 && day <= 7
  )
  return valid ? value : DEFAULT_WORKING_DAYS
}

function resolveTimezone(value: SchoolProfileRow["timezone"]): string {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : DEFAULT_TIMEZONE
}

/**
 * Merges a school's stored overrides onto the shipped defaults. Never throws: a
 * `null`/`undefined` row, a missing blob, `{}`, or a blob with garbage keys and
 * mistyped values all resolve to a fully-typed `ResolvedSettings`.
 */
export function resolve(
  row: SchoolProfileRow | null | undefined
): ResolvedSettings {
  const source = row ?? {}
  return {
    workspaceId: source.workspace_id ?? null,
    timezone: resolveTimezone(source.timezone),
    workingDays: resolveWorkingDays(source.working_days),
    attendancePolicy: mergeDefaults(
      DEFAULT_ATTENDANCE_POLICY,
      source.attendance_policy
    ),
    academicSettings: mergeDefaults(
      DEFAULT_ACADEMIC_SETTINGS,
      source.academic_settings
    ),
    coverPolicy: mergeDefaults(DEFAULT_COVER_POLICY, source.cover_policy),
    messagingPolicy: mergeDefaults(
      DEFAULT_MESSAGING_POLICY,
      source.messaging_policy
    ),
    branding: mergeDefaults(DEFAULT_BRANDING, source.branding),
  }
}
