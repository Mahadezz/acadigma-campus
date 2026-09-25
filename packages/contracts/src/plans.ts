import { z } from "zod"

import {
  currencySchema,
  isoDateTimeSchema,
  paisaSchema,
  uuidSchema,
} from "./common"
import { apiError, type ApiError } from "./errors"

/**
 * Zod schemas for F-CM-06 Parts 1-3 (plans, subscriptions, the limits engine).
 * Server contracts §7 names things; this file is the single definition the form,
 * the action, the job and the test all share (HANDBOOK §8). Schemas for Parts 4-8
 * (checkout, invoices, dunning, platform overrides) are added when those Parts land.
 */

// ---------------------------------------------------------------------------
// Enums — mirror the Postgres enums / check constraints exactly.
// ---------------------------------------------------------------------------

/** Mirrors `public.subscription_status`. */
export const subscriptionStatusSchema = z.enum([
  "trialing",
  "active",
  "past_due",
  "cancelled",
  "expired",
])
export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>

/** Mirrors `public.billing_interval`. */
export const billingIntervalSchema = z.enum(["monthly", "yearly"])
export type BillingInterval = z.infer<typeof billingIntervalSchema>

/** Mirrors `public.access_mode` (DECISION-LOG D-29). */
export const accessModeSchema = z.enum(["normal", "read_only"])
export type AccessMode = z.infer<typeof accessModeSchema>

/** Mirrors `plans.code`'s check constraint. */
export const planCodeSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]{1,30}$/, 'Expected a plan code such as "starter"')

/** Mirrors `plan_limits.key` / `plan_modules.module`'s check constraint. */
export const limitKeySchema = z
  .string()
  .regex(
    /^[a-z][a-z0-9_]{1,40}$/,
    'Expected a limit key such as "max_students"'
  )
export const moduleKeySchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]{1,40}$/, 'Expected a module key such as "fees"')

// ---------------------------------------------------------------------------
// Catalogue — plans, plan_limits, plan_modules, plan_prices (Part 1)
// ---------------------------------------------------------------------------

export const planSchema = z.object({
  id: uuidSchema,
  code: planCodeSchema,
  name: z.string().min(1).max(120),
  tagline: z.string().max(160).nullable(),
  description: z.string().max(2000).nullable(),
  sortOrder: z.number().int(),
  isPublic: z.boolean(),
  isContactSales: z.boolean(),
  currency: currencySchema,
  setupFeePaisa: paisaSchema,
  /** SMS is metered pass-through (D-27); this is the monthly included allowance. */
  includedSmsPerMonth: z.number().int().min(0),
  trialDays: z.number().int().min(0).max(90),
  status: z.enum(["active", "archived"]),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
})
export type Plan = z.infer<typeof planSchema>

/** `value_int: null` means unlimited — the table's own sentinel (§3.2). */
export const planLimitSchema = z.object({
  planId: uuidSchema,
  key: limitKeySchema,
  valueInt: z.number().int().min(0).nullable(),
})
export type PlanLimit = z.infer<typeof planLimitSchema>

export const planModuleSchema = z.object({
  planId: uuidSchema,
  module: moduleKeySchema,
  isEnabled: z.boolean(),
})
export type PlanModule = z.infer<typeof planModuleSchema>

export const planPriceSchema = z.object({
  id: uuidSchema,
  planId: uuidSchema,
  studentMin: z.number().int().min(0),
  /** `null` means "and above". */
  studentMax: z.number().int().min(0).nullable(),
  monthlyPaisa: paisaSchema,
  yearlyPaisa: paisaSchema,
  overagePerStudentPaisa: paisaSchema,
  currency: currencySchema,
})
export type PlanPrice = z.infer<typeof planPriceSchema>

/** `listPublicPlans` output row — a plan with its full limits/modules/prices set. */
export const planWithDetailsSchema = planSchema.extend({
  limits: z.array(planLimitSchema),
  modules: z.array(planModuleSchema),
  prices: z.array(planPriceSchema),
})
export type PlanWithDetails = z.infer<typeof planWithDetailsSchema>

export const listPublicPlansOutput = z.object({
  plans: z.array(planWithDetailsSchema),
})
export type ListPublicPlansOutput = z.infer<typeof listPublicPlansOutput>

// ---------------------------------------------------------------------------
// Platform editor inputs (Part 1 — `/platform/plans`)
// ---------------------------------------------------------------------------

export const upsertPlanInput = z.object({
  id: uuidSchema.optional(),
  code: planCodeSchema,
  name: z.string().min(1).max(120),
  tagline: z.string().max(160).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  sortOrder: z.number().int().default(0),
  isPublic: z.boolean().default(true),
  isContactSales: z.boolean().default(false),
  currency: currencySchema.default("BDT"),
  setupFeePaisa: paisaSchema.default(0),
  includedSmsPerMonth: z.number().int().min(0).default(0),
  trialDays: z.number().int().min(0).max(90).default(0),
  status: z.enum(["active", "archived"]).default("active"),
})
export type UpsertPlanInput = z.infer<typeof upsertPlanInput>

export const setPlanLimitInput = z.object({
  planId: uuidSchema,
  key: limitKeySchema,
  /** `null` sets the key to unlimited. */
  valueInt: z.number().int().min(0).nullable(),
})
export type SetPlanLimitInput = z.infer<typeof setPlanLimitInput>

export const setPlanModuleInput = z.object({
  planId: uuidSchema,
  module: moduleKeySchema,
  isEnabled: z.boolean(),
})
export type SetPlanModuleInput = z.infer<typeof setPlanModuleInput>

// ---------------------------------------------------------------------------
// Subscriptions (Part 2)
// ---------------------------------------------------------------------------

export const getSubscriptionOutput = z.object({
  planCode: planCodeSchema,
  status: subscriptionStatusSchema,
  billingInterval: billingIntervalSchema,
  currentPeriodStart: z.string().nullable(),
  currentPeriodEnd: z.string().nullable(),
  trialEndsAt: isoDateTimeSchema.nullable(),
  priceSnapshotPaisa: paisaSchema,
  graceUntil: isoDateTimeSchema.nullable(),
  cancelAt: isoDateTimeSchema.nullable(),
  cancelledAt: isoDateTimeSchema.nullable(),
})
export type GetSubscriptionOutput = z.infer<typeof getSubscriptionOutput>

export const subscriptionEventTypeSchema = z.enum([
  "trial_started",
  "trial_ending_soon",
  "trial_expired",
  "checkout_completed",
  "renewed",
  "upgraded",
  "downgrade_scheduled",
  "downgraded",
  "cancelled",
  "reactivated",
  "payment_failed",
  "grace_started",
  "lapsed",
  "comped",
  "read_only_applied",
  "read_only_cleared",
])
export type SubscriptionEventType = z.infer<typeof subscriptionEventTypeSchema>

// ---------------------------------------------------------------------------
// The limits engine (Part 3)
// ---------------------------------------------------------------------------

/** One entry of `getUsage`'s output: `{[limitKey]: {current, limit, overBy}}` (§7). */
export const usageEntrySchema = z.object({
  current: z.number().int().min(0),
  /** `null` means unlimited. */
  limit: z.number().int().min(0).nullable(),
  overBy: z.number().int().min(0),
})
export type UsageEntry = z.infer<typeof usageEntrySchema>

export const getUsageOutput = z.record(limitKeySchema, usageEntrySchema)
export type GetUsageOutput = z.infer<typeof getUsageOutput>

/**
 * The structured payload a `LIMIT_EXCEEDED` error carries (§4.6), mirroring
 * `packages/domain/plans/limits.ts`'s `LimitExceededError` at the API boundary.
 */
export const limitExceededErrorSchema = z.object({
  code: z.literal("LIMIT_EXCEEDED"),
  limitKey: limitKeySchema,
  limit: z.number().int().min(0),
  current: z.number().int().min(0),
  planCode: planCodeSchema.optional(),
  suggestedPlanCode: planCodeSchema.optional(),
})
export type LimitExceededErrorPayload = z.infer<typeof limitExceededErrorSchema>

/**
 * The error a server action returns when `workspaces.access_mode = 'read_only'`
 * refuses a write (D-29) — `requireWritable` in `packages/db` throws/returns this.
 */
export const planReadOnlyErrorSchema = z.object({
  code: z.literal("PLAN_READ_ONLY"),
  reason: z.string().nullable(),
})
export type PlanReadOnlyErrorPayload = z.infer<typeof planReadOnlyErrorSchema>

/**
 * The `ApiError` a server action returns for `PLAN_READ_ONLY` (D-300): every
 * action already returns `Result<T, ApiError>`, so the refusal travels in that
 * envelope as `payment_required` (402 — paying is what lifts it) with a
 * user-safe message any form can show as-is.
 */
export function planReadOnlyApiError(
  payload: PlanReadOnlyErrorPayload
): ApiError {
  return apiError(
    "payment_required",
    `${payload.reason ?? "This workspace is read-only."} Upgrade to make changes — you can still view and export everything, and nothing has been deleted.`
  )
}

// ---------------------------------------------------------------------------
// Trial expiry job (Part 4) — `GET|POST /api/cron/billing/tick`
// ---------------------------------------------------------------------------

/**
 * `runSubscriptionJobs`'s output (§7), narrowed to what Part 4 actually builds
 * (D-62): only the trial-expiry count. §7's fuller shape
 * (`{remindersSent, pastDue, lapsed, downgradesApplied}`) belongs to Parts 5-8
 * (renewal, dunning, downgrade scheduling), which are not built yet — those keys
 * are added to this schema when those Parts land, not stubbed out now.
 */
export const runBillingTickOutput = z.object({
  trialsExpired: z.number().int().min(0),
})
export type RunBillingTickOutput = z.infer<typeof runBillingTickOutput>
