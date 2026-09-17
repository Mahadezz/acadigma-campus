import { z } from "zod"

import {
  apiError,
  err,
  ok,
  planSchema,
  planWithDetailsSchema,
  type ApiError,
  type Plan,
  type PlanWithDetails,
  type Result,
} from "@acadigma/contracts"

import type { AcadigmaSupabaseClient } from "../client"
import type { WorkspaceContext } from "../workspace-context"

/**
 * The plan catalogue (F-CM-06 Part 1). `plans`/`plan_limits`/`plan_modules`/
 * `plan_prices` are world-readable (RLS §3.10), so the read functions here take a
 * plain client — no `WorkspaceContext` — the same way `listPublicPlans` is
 * documented as an RSC query with no input (§7). `getWorkspacePlan` is the one
 * tenant-scoped read, so it takes `ctx` first per HANDBOOK §8.
 */

// ---------------------------------------------------------------------------
// Row mapping — Postgres snake_case -> the camelCase shape packages/contracts owns.
// ---------------------------------------------------------------------------

const rawRowSchema = z.record(z.string(), z.unknown())

function mapPlanRow(row: unknown): unknown {
  const r = rawRowSchema.parse(row)
  return {
    id: r["id"],
    code: r["code"],
    name: r["name"],
    tagline: r["tagline"] ?? null,
    description: r["description"] ?? null,
    sortOrder: r["sort_order"],
    isPublic: r["is_public"],
    isContactSales: r["is_contact_sales"],
    currency: r["currency"],
    setupFeePaisa: r["setup_fee_paisa"],
    includedSmsPerMonth: r["included_sms_per_month"],
    trialDays: r["trial_days"],
    status: r["status"],
    createdAt: r["created_at"],
    updatedAt: r["updated_at"],
  }
}

function mapLimitRow(row: unknown): unknown {
  const r = rawRowSchema.parse(row)
  return {
    planId: r["plan_id"],
    key: r["key"],
    valueInt: r["value_int"] ?? null,
  }
}

function mapModuleRow(row: unknown): unknown {
  const r = rawRowSchema.parse(row)
  return {
    planId: r["plan_id"],
    module: r["module"],
    isEnabled: r["is_enabled"],
  }
}

function mapPriceRow(row: unknown): unknown {
  const r = rawRowSchema.parse(row)
  return {
    id: r["id"],
    planId: r["plan_id"],
    studentMin: r["student_min"],
    studentMax: r["student_max"] ?? null,
    monthlyPaisa: r["monthly_paisa"],
    yearlyPaisa: r["yearly_paisa"],
    overagePerStudentPaisa: r["overage_per_student_paisa"],
    currency: r["currency"],
  }
}

const DEPENDENCY_UNAVAILABLE: ApiError = apiError(
  "dependency_unavailable",
  "Could not reach the plan catalogue."
)

// ---------------------------------------------------------------------------
// Public catalogue (Part 1 — `listPublicPlans`, §7)
// ---------------------------------------------------------------------------

/**
 * Every public, active plan with its limits, modules and prices — what `/pricing`
 * and `/app/billing/plans` render. RLS already restricts this to
 * `status = 'active' and is_public`, so the query filters match that on purpose
 * rather than relying on RLS alone (defence in depth, HANDBOOK §1 rule 1).
 */
export async function listPublicPlans(
  client: AcadigmaSupabaseClient
): Promise<Result<PlanWithDetails[], ApiError>> {
  const { data, error } = await client
    .from("plans")
    .select("*, plan_limits(*), plan_modules(*), plan_prices(*)")
    .eq("status", "active")
    .eq("is_public", true)
    .order("sort_order", { ascending: true })

  if (error) return err(DEPENDENCY_UNAVAILABLE)

  const rows = rawRowSchema.array().parse(data ?? [])
  const mapped = rows.map((row) => ({
    ...(mapPlanRow(row) as object),
    limits: (Array.isArray(row["plan_limits"]) ? row["plan_limits"] : []).map(
      mapLimitRow
    ),
    modules: (Array.isArray(row["plan_modules"])
      ? row["plan_modules"]
      : []
    ).map(mapModuleRow),
    prices: (Array.isArray(row["plan_prices"]) ? row["plan_prices"] : []).map(
      mapPriceRow
    ),
  }))

  const parsed = z.array(planWithDetailsSchema).safeParse(mapped)
  if (!parsed.success) {
    return err(apiError("internal", "The plan catalogue failed validation."))
  }
  return ok(parsed.data)
}

// ---------------------------------------------------------------------------
// Tenant-scoped: the plan a workspace is entitled to (Part 2/3)
// ---------------------------------------------------------------------------

/**
 * The plan `ctx.workspaceId` is on right now, via `workspaces.plan_id` — the fast
 * denormalised path (PRODUCT-DECISIONS 1.20), not a join through `subscriptions`
 * (a personal workspace has no subscription row at all, §5.9).
 */
export async function getWorkspacePlan(
  ctx: WorkspaceContext,
  client: AcadigmaSupabaseClient
): Promise<Result<Plan, ApiError>> {
  const { data, error } = await client
    .from("workspaces")
    .select("plan_id, plans(*)")
    .eq("id", ctx.workspaceId)
    .maybeSingle()

  if (error) return err(DEPENDENCY_UNAVAILABLE)
  const row = data ? rawRowSchema.parse(data) : null
  if (!row || !row["plans"]) {
    return err(apiError("not_found", "This workspace has no plan assigned."))
  }

  const parsed = planSchema.safeParse(mapPlanRow(row["plans"]))
  if (!parsed.success) {
    return err(apiError("internal", "The workspace's plan failed validation."))
  }
  return ok(parsed.data)
}

/** The enabled module keys for `planId` — the entitlement half of `hasModule`. */
export async function listEnabledModules(
  client: AcadigmaSupabaseClient,
  planId: string
): Promise<Result<string[], ApiError>> {
  const { data, error } = await client
    .from("plan_modules")
    .select("module, is_enabled")
    .eq("plan_id", planId)
    .eq("is_enabled", true)

  if (error) return err(DEPENDENCY_UNAVAILABLE)
  const rows = rawRowSchema.array().parse(data ?? [])
  return ok(rows.map((row) => String(row["module"])))
}

/** The full limit map for `planId`: `{[key]: value_int | null}` — feeds `assertWithinLimit`. */
export async function getPlanLimits(
  client: AcadigmaSupabaseClient,
  planId: string
): Promise<Result<Record<string, number | null>, ApiError>> {
  const { data, error } = await client
    .from("plan_limits")
    .select("key, value_int")
    .eq("plan_id", planId)

  if (error) return err(DEPENDENCY_UNAVAILABLE)
  const rows = rawRowSchema.array().parse(data ?? [])
  const limits: Record<string, number | null> = {}
  for (const row of rows) {
    limits[String(row["key"])] = (row["value_int"] as number | null) ?? null
  }
  return ok(limits)
}
