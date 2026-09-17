/**
 * Trial computation (F-CM-06 §4.1, §4.2).
 *
 * A school workspace gets a Pro trial with no card collected. The trigger that
 * creates the row (`app.tg_workspace_billing_bootstrap`) computes the same instant
 * in SQL with `now() + make_interval(days => trial_days)`, reading `trial_days` from
 * the `plans` row — that seeded value is the actual source of truth, and callers
 * should pass it explicitly wherever it is known. This mirrors the same arithmetic
 * in TypeScript for anywhere a preview or a countdown chip needs it without a round
 * trip; the two must never diverge, which is why both are dumb one-line
 * calculations rather than something either side could get creative with.
 *
 * `PRO_TRIAL_DAYS` is only the fallback used when no plan row is at hand (e.g. a
 * unit test); the debate synthesis lengthened the seeded Pro trial from 14 to 30
 * days and folded the old Free tier into it (a school now starts on a 30-day Pro
 * trial rather than choosing Free), so this constant tracks `plans.trial_days` for
 * `code = 'pro'` and must be updated if that seed value changes again.
 */

export const PRO_TRIAL_DAYS = 30
const MILLIS_PER_DAY = 86_400_000

/** `trial_ends_at` for a trial that starts now (or at `startedAt`). */
export function computeTrialEndsAt(
  startedAt: Date,
  trialDays: number = PRO_TRIAL_DAYS
): Date {
  if (!Number.isInteger(trialDays) || trialDays < 0) {
    throw new RangeError(
      `trialDays must be a non-negative integer, got ${trialDays}`
    )
  }
  return new Date(startedAt.getTime() + trialDays * MILLIS_PER_DAY)
}

/** Whole days left until `trialEndsAt`, floored — never negative. 0 means "ends today". */
export function trialDaysRemaining(
  trialEndsAt: Date,
  now: Date = new Date()
): number {
  const millisLeft = trialEndsAt.getTime() - now.getTime()
  return Math.max(Math.floor(millisLeft / MILLIS_PER_DAY), 0)
}

/** `true` while the trial has not yet reached its end instant. */
export function isTrialActive(
  trialEndsAt: Date,
  now: Date = new Date()
): boolean {
  return now.getTime() < trialEndsAt.getTime()
}

/**
 * `true` at the T-3-days nudge point (§4.2) — the daily job's own cron cadence
 * decides *when* it runs; this only answers whether today's run should nudge THIS
 * subscription, so the job stays a thin loop over "is it time yet".
 */
export function isTrialEndingSoon(
  trialEndsAt: Date,
  now: Date = new Date(),
  thresholdDays = 3
): boolean {
  if (!isTrialActive(trialEndsAt, now)) return false
  return trialDaysRemaining(trialEndsAt, now) <= thresholdDays
}
