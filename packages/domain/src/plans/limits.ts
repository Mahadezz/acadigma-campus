/**
 * The limits engine (F-CM-06 Parts 1-3, §4.6, §5.6).
 *
 * Pure rules only — no I/O. `packages/db/src/repositories/usage.ts` looks up the
 * plan's `plan_limits` row and the workspace's `usage_counters` row and hands both
 * here; this module never queries anything itself, so it is trivially unit-testable
 * and cannot accidentally trust a client-supplied number (HANDBOOK §1: money and
 * limits are computed server-side, and even server-side the arithmetic lives in one
 * place instead of being re-derived at every call site).
 */

import { err, ok, type Result } from "@acadigma/contracts"

import { DEFAULT_TIMEZONE, todayIn } from "../time"

/** `plan_limits.value_int` per key. `null`/absent = unlimited (the table's own convention). */
export type PlanLimits = Readonly<Record<string, number | null>>

/** `usage_counters.value` per key, for the workspace and period being checked. */
export type UsageCounters = Readonly<Record<string, number>>

/**
 * Which `usage_counters.period` bucket a limit key is counted in.
 *
 * `usage_counters` is keyed `(workspace_id, key, period)`. Standing counters
 * (`max_students`, `storage_gb`) live in the `'all'` bucket; anything measured
 * per calendar month — `ai_actions_per_month` above all, whose hard cap is the
 * whole of D-39's cost control — lives in a `'YYYY-MM'` bucket. Reading the
 * wrong bucket does not error, it silently returns zero, which turns a hard cap
 * into no cap at all; so the period is DERIVED from the key here rather than
 * passed in, and no call site can get it wrong.
 *
 * `app.within_limit`'s `p_period` argument takes the same string, and the month
 * is computed in the workspace timezone (Asia/Dhaka by default) so a reset
 * happens at local midnight on the 1st, not at 06:00 on the last day.
 */
export function usagePeriodForKey(
  key: string,
  now: Date = new Date(),
  timeZone: string = DEFAULT_TIMEZONE
): string {
  if (!key.endsWith("_per_month")) return "all"
  return todayIn(timeZone, now).slice(0, 7)
}

/**
 * The structured payload a `LIMIT_EXCEEDED` error carries (F-CM-06 §4.6), so the UI
 * can render a specific message and a direct upgrade link instead of a generic
 * "something went wrong".
 */
export type LimitExceededError = {
  code: "LIMIT_EXCEEDED"
  limitKey: string
  limit: number
  current: number
  planCode?: string
  suggestedPlanCode?: string
}

export type LimitCheckContext = {
  planCode?: string
  suggestedPlanCode?: string
}

/**
 * Would adding `delta` to `usage[key]` cross `limits[key]`?
 *
 * A missing or explicitly `null` limit means unlimited — "adding a limit is a row,
 * not a migration" (F-CM-06 §3.2), so a key nobody has gated yet must default open,
 * never closed. `current + delta <= limit` is `<=`, not `<`, so a write that lands
 * a workspace exactly AT its limit succeeds and the NEXT one is what is refused —
 * matching the acceptance criteria's "you have 340 students; Free includes 150"
 * wording, where 340 stays readable and the 341st is blocked.
 */
export function assertWithinLimit(
  usage: UsageCounters,
  limits: PlanLimits,
  key: string,
  delta: number,
  context: LimitCheckContext = {}
): Result<void, LimitExceededError> {
  const limit = limits[key]
  if (limit === null || limit === undefined) return ok(undefined)

  const current = usage[key] ?? 0
  if (current + delta <= limit) return ok(undefined)

  return err({
    code: "LIMIT_EXCEEDED",
    limitKey: key,
    limit,
    current,
    planCode: context.planCode,
    suggestedPlanCode: context.suggestedPlanCode,
  })
}

/** `true` when this key has no ceiling at all — `-1`/`null` sentinel, per §3.2. */
export function isUnlimited(limits: PlanLimits, key: string): boolean {
  const limit = limits[key]
  return limit === null || limit === undefined
}

/** How much headroom is left before `key` is exceeded. `null` when unlimited. */
export function remainingCapacity(
  usage: UsageCounters,
  limits: PlanLimits,
  key: string
): number | null {
  const limit = limits[key]
  if (limit === null || limit === undefined) return null
  return Math.max(limit - (usage[key] ?? 0), 0)
}

// ---------------------------------------------------------------------------
// Module entitlements (§3.3)
// ---------------------------------------------------------------------------

/** The set of module keys a plan enables — from `plan_modules` rows where `is_enabled`. */
export type PlanModuleSet = ReadonlySet<string> | readonly string[]

/**
 * Nav visibility AND the 404 (not 403) a deep link gets when a plan does not include
 * a module (F-CM-06 §4.6) — the one deliberate exception being `fees`, whose
 * *existence* is the sales message for a Free school (D-31), which is a UI concern
 * layered on top of this same boolean.
 */
export function hasModule(modules: PlanModuleSet, moduleKey: string): boolean {
  if (Array.isArray(modules)) return modules.includes(moduleKey)
  return (modules as ReadonlySet<string>).has(moduleKey)
}

// ---------------------------------------------------------------------------
// Read-only over-limit mode (§5.6, exact semantics)
// ---------------------------------------------------------------------------

/**
 * The five things a write to a guarded resource can be. `read`/`export` are never
 * guarded at all — this type exists to make the read-only rule below exhaustive and
 * self-documenting at the call site, not because those kinds ever reach it.
 */
export type WriteKind = "read" | "export" | "create" | "update" | "delete"

/**
 * §5.6, verbatim: read and export are always allowed; updating an existing row is
 * allowed (it does not worsen an overage); deleting is allowed and reduces the
 * counter; only a CREATE that increases the counter is blocked. This function is the
 * one place that rule is encoded, so "is over-limit" and "is this write allowed
 * over-limit" can never drift apart.
 */
export function isWriteAllowedOverLimit(kind: WriteKind): boolean {
  return kind !== "create"
}
