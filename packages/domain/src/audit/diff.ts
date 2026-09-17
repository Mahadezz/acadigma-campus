import {
  isContactColumnName,
  isSecretColumnName,
  isSensitiveColumnName,
  maskContactValue,
} from "./redact"

/**
 * Turns `before`/`after` jsonb plus `changed_fields` into rows `DiffView` can
 * render. Pure function — no DB, no React — so it is unit-testable against fixture
 * payloads exactly like the SQL trigger's own diffing (F-ID-09 §10 unit tests).
 */
export type DiffRow = {
  field: string
  before: unknown
  after: unknown
  /** True when the value was nulled by the free-text rule — show a redaction hint. */
  isRedactedValue: boolean
}

export function buildDiffRows(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
  changedFields: readonly string[] | null
): DiffRow[] {
  const fields = changedFields ?? computeChangedFieldNames(before, after)

  return fields
    .filter((field) => !isSecretColumnName(field))
    .map((field) => {
      const beforeValue = redactValue(field, before ? before[field] : undefined)
      const afterValue = redactValue(field, after ? after[field] : undefined)
      return {
        field,
        before: beforeValue ?? null,
        after: afterValue ?? null,
        // A field that changed but both sides read null is either a free-text
        // column (nulled at write time) or a genuine null -> null no-op that
        // never should have been in changed_fields — either way, "redacted"
        // is the safer label than implying nothing happened.
        isRedactedValue: beforeValue == null && afterValue == null,
      }
    })
}

/**
 * Read-time half of the §5.3 matrix. The trigger already nulls health columns
 * and masks contact columns at write time, but rows written before that
 * migration hold raw values, and the viewer must not be the surface that
 * finally discloses them. Applying both ends is deliberate belt-and-braces —
 * a stored value that is already masked masks to itself.
 */
function redactValue(field: string, value: unknown): unknown {
  if (value === undefined || value === null) return null
  if (isSensitiveColumnName(field)) return null
  if (isContactColumnName(field) && typeof value === "string") {
    return maskContactValue(field, value)
  }
  return value
}

/**
 * Mirrors app.tg_audit()'s own changed_fields computation, for the rare caller
 * that has before/after but no precomputed changed_fields (a fixture in a unit
 * test, for instance).
 */
export function computeChangedFieldNames(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null
): string[] {
  const keys = new Set([
    ...Object.keys(before ?? {}),
    ...Object.keys(after ?? {}),
  ])
  const changed: string[] = []
  for (const key of keys) {
    const beforeValue = before ? before[key] : undefined
    const afterValue = after ? after[key] : undefined
    if (!deepEqual(beforeValue, afterValue)) changed.push(key)
  }
  return changed
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === undefined || b === undefined) return a === b
  if (a === null || b === null) return a === b
  if (typeof a !== "object" || typeof b !== "object") return false
  return JSON.stringify(a) === JSON.stringify(b)
}
