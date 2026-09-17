import { isSecretColumnName } from "./redact"

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
      const beforeValue = before ? before[field] : undefined
      const afterValue = after ? after[field] : undefined
      return {
        field,
        before: beforeValue ?? null,
        after: afterValue ?? null,
        // A field that changed but both sides read null is either a free-text
        // column (nulled at write time) or a genuine null -> null no-op that
        // never should have been in changed_fields — either way, "redacted"
        // is the safer label than implying nothing happened.
        isRedactedValue:
          (before ? before[field] : null) === null &&
          (after ? after[field] : null) === null,
      }
    })
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
