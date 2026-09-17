import { z } from "zod"

import {
  apiError,
  err,
  getSubscriptionOutput,
  ok,
  type ApiError,
  type GetSubscriptionOutput,
  type Result,
} from "@acadigma/contracts"

import type { AcadigmaSupabaseClient } from "../client"
import type { WorkspaceContext } from "../workspace-context"

/**
 * Read-only access to `subscriptions` (F-CM-06 Part 2). There is deliberately no
 * write function here: subscriptions are not client-writable by any role (§3.10 —
 * "an owner changing plan is an order, not an update"). Parts 5-8 add the checkout,
 * IPN-fulfilment and platform-override paths that write this table with the
 * service role; this file only ever reads it.
 */

const rawRowSchema = z.record(z.string(), z.unknown())

/**
 * The current subscription for `ctx.workspaceId`, mapped to `getSubscriptionOutput`
 * (§7). Returns `not_found` for a personal workspace — it has no subscription row by
 * design (§5.9), and the caller should treat that as "Free, no billing UI" rather
 * than an error state.
 */
export async function getSubscription(
  ctx: WorkspaceContext,
  client: AcadigmaSupabaseClient
): Promise<Result<GetSubscriptionOutput, ApiError>> {
  const { data, error } = await client
    .from("subscriptions")
    .select("*, plans(code)")
    .eq("workspace_id", ctx.workspaceId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    return err(
      apiError("dependency_unavailable", "Could not load the subscription.")
    )
  }
  if (!data) {
    return err(apiError("not_found", "This workspace has no subscription."))
  }

  const row = rawRowSchema.parse(data)
  const plan = row["plans"] ? rawRowSchema.parse(row["plans"]) : null

  const mapped = {
    planCode: plan?.["code"],
    status: row["status"],
    billingInterval: row["billing_interval"],
    currentPeriodStart: row["current_period_start"] ?? null,
    currentPeriodEnd: row["current_period_end"] ?? null,
    trialEndsAt: row["trial_ends_at"] ?? null,
    priceSnapshotPaisa: row["amount_paisa"],
    graceUntil: row["grace_until"] ?? null,
    cancelAt: row["cancel_at"] ?? null,
    cancelledAt: row["cancelled_at"] ?? null,
  }

  const parsed = getSubscriptionOutput.safeParse(mapped)
  if (!parsed.success) {
    return err(apiError("internal", "The subscription row failed validation."))
  }
  return ok(parsed.data)
}

/**
 * `true` when `ctx.workspaceId` has a live subscription row at all. A personal
 * workspace never does (§5.9); callers use this to decide whether to show billing
 * UI rather than treating a missing row as an error.
 */
export async function hasSubscription(
  ctx: WorkspaceContext,
  client: AcadigmaSupabaseClient
): Promise<Result<boolean, ApiError>> {
  const { count, error } = await client
    .from("subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", ctx.workspaceId)

  if (error) {
    return err(
      apiError("dependency_unavailable", "Could not check for a subscription.")
    )
  }
  return ok((count ?? 0) > 0)
}
