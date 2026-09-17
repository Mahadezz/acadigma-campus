import { z } from "zod"

import {
  apiError,
  err,
  ok,
  type ApiError,
  type GetUsageOutput,
  type LimitExceededErrorPayload,
  type PlanReadOnlyErrorPayload,
  type Result,
} from "@acadigma/contracts"
import { assertWithinLimit } from "@acadigma/domain"

import { getPlanLimits, getWorkspacePlan } from "./plans"

import type { AcadigmaSupabaseClient } from "../client"
import type { WorkspaceContext } from "../workspace-context"

/**
 * `usage_counters` reads and the two server-side guards every guarded write site
 * calls (F-CM-06 Part 3, §4.6): `checkLimit` before a create that grows a counter,
 * `requireWritable` before any write on a workspace that might be in read-only
 * over-limit mode (D-29). Both are thin wrappers: the arithmetic lives in
 * `packages/domain/plans` (pure, unit-tested); this file's only job is fetching the
 * two numbers that arithmetic needs and mapping Postgres rows to contract types.
 */

const rawRowSchema = z.record(z.string(), z.unknown())

/**
 * `{[limitKey]: {current, limit, overBy}}` for every limit the workspace's plan
 * defines (§7 `getUsage`). Reads `usage_counters` (period `'all'`) — never
 * `count(*)` on the underlying tables, which is what keeps this under the 120 ms
 * p95 budget (§10).
 */
export async function getUsage(
  ctx: WorkspaceContext,
  client: AcadigmaSupabaseClient
): Promise<Result<GetUsageOutput, ApiError>> {
  const planResult = await getWorkspacePlan(ctx, client)
  if (!planResult.ok) return planResult

  const limitsResult = await getPlanLimits(client, planResult.data.id)
  if (!limitsResult.ok) return limitsResult

  const { data, error } = await client
    .from("usage_counters")
    .select("key, value")
    .eq("workspace_id", ctx.workspaceId)
    .eq("period", "all")

  if (error) {
    return err(apiError("dependency_unavailable", "Could not load usage."))
  }

  const usageRows = rawRowSchema.array().parse(data ?? [])
  const usageByKey: Record<string, number> = {}
  for (const row of usageRows) {
    usageByKey[String(row["key"])] = Number(row["value"] ?? 0)
  }

  const output: GetUsageOutput = {}
  for (const [key, limit] of Object.entries(limitsResult.data)) {
    const current = usageByKey[key] ?? 0
    output[key] = {
      current,
      limit,
      overBy: limit === null ? 0 : Math.max(current - limit, 0),
    }
  }
  return ok(output)
}

/**
 * The one call every guarded write site makes before it writes (§4.6):
 * `await checkLimit(ctx, client, "students", 1)`. Fetches the workspace's plan and
 * its limit for `key`, then delegates the actual comparison to the pure
 * `assertWithinLimit` in `packages/domain` — this function does no arithmetic of
 * its own, only I/O.
 */
export async function checkLimit(
  ctx: WorkspaceContext,
  client: AcadigmaSupabaseClient,
  key: string,
  delta: number
): Promise<Result<void, LimitExceededErrorPayload | ApiError>> {
  const planResult = await getWorkspacePlan(ctx, client)
  if (!planResult.ok) return planResult

  const limitsResult = await getPlanLimits(client, planResult.data.id)
  if (!limitsResult.ok) return limitsResult

  const { data, error } = await client
    .from("usage_counters")
    .select("value")
    .eq("workspace_id", ctx.workspaceId)
    .eq("key", key)
    .eq("period", "all")
    .maybeSingle()

  if (error) {
    return err(
      apiError("dependency_unavailable", "Could not check the plan limit.")
    )
  }

  const current = data ? Number(rawRowSchema.parse(data)["value"] ?? 0) : 0

  return assertWithinLimit({ [key]: current }, limitsResult.data, key, delta, {
    planCode: planResult.data.code,
  })
}

/**
 * The `PLAN_READ_ONLY` guard (D-29). Reads `workspaces.access_mode` fresh — it is
 * never carried on `WorkspaceContext`, because access_mode changes underneath a
 * long-lived session (a trial can expire mid-visit) and RLS deliberately does not
 * enforce it (§5.6), so a server action must check it explicitly on every write.
 * Fails closed: an unreadable workspace is never treated as writable.
 */
export async function requireWritable(
  ctx: WorkspaceContext,
  client: AcadigmaSupabaseClient
): Promise<Result<void, PlanReadOnlyErrorPayload>> {
  const { data, error } = await client
    .from("workspaces")
    .select("access_mode, access_mode_reason")
    .eq("id", ctx.workspaceId)
    .maybeSingle()

  if (error || !data) {
    return err({ code: "PLAN_READ_ONLY", reason: null })
  }

  const row = rawRowSchema.parse(data)
  if (row["access_mode"] === "read_only") {
    return err({
      code: "PLAN_READ_ONLY",
      reason: (row["access_mode_reason"] as string | null | undefined) ?? null,
    })
  }
  return ok(undefined)
}
