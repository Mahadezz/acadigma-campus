import { z } from "zod"

import {
  apiError,
  err,
  ok,
  type ApiError,
  type Result,
} from "@acadigma/contracts"
import { isWorkspaceRole, type WorkspaceRole } from "@acadigma/domain"

import type { AcadigmaSupabaseClient } from "./client"

/** The header the client sends, mirrored by middleware from the `acx_ws` cookie. */
export const WORKSPACE_HEADER = "x-workspace-id"

/**
 * Everything a repository call needs to know about who is asking.
 *
 * This object is *derived*, never received. The browser tells us which workspace it
 * thinks is active; the server decides whether that is true by querying
 * `workspace_members` (DECISION-LOG D-04 — the root cause of the Base44 security
 * review was trusting a client-writable field).
 */
/** `workspaces.type` (F-ID-03 §3) — the two tenant shapes the whole product has. */
export const WORKSPACE_TYPES = ["school", "personal"] as const
export type WorkspaceType = (typeof WORKSPACE_TYPES)[number]

export function isWorkspaceType(value: unknown): value is WorkspaceType {
  return (
    typeof value === "string" &&
    (WORKSPACE_TYPES as readonly string[]).includes(value)
  )
}

export type WorkspaceContext = {
  workspaceId: string
  userId: string
  role: WorkspaceRole
  /** `resolveLandingRoute` (F-ID-03 §4.4) is type ∧ role, so this travels with role. */
  workspaceType: WorkspaceType
  /** Plan slug from the workspace's subscription; drives feature gating. */
  plan: string | null
}

/** Minimal header bag, so this works with `Headers`, middleware and plain objects. */
export type HeaderSource = { get: (name: string) => string | null }

/**
 * The embedded shape every candidate query asks PostgREST for.
 *
 * `public.workspaces` has NO `plan` column — the plan is `workspaces.plan_id`,
 * an FK to `public.plans`, and the human-readable slug this context carries is
 * `plans.code`. Selecting `workspaces(plan, …)` (as this file did until the
 * F-ID-03 review) makes PostgREST answer 400 `column workspaces.plan does not
 * exist` for EVERY request, which `resolveWorkspaceContext` turns into
 * `dependency_unavailable` and `requireWorkspace()` turns into a 403 — the
 * whole app, locked shut, with the forged-header tripwire never reached. Kept
 * as a single constant so the two call sites cannot drift apart again.
 */
const WORKSPACE_EMBED = "workspaces(type, plans(code))"

/** The membership row we rely on, validated rather than assumed. */
const membershipRowSchema = z.object({
  role: z.string(),
  status: z.string(),
  workspaces: z
    .object({
      type: z.string().optional(),
      plans: z
        .object({ code: z.string().nullable().optional() })
        .nullable()
        .optional(),
    })
    .nullable()
    .optional(),
})

const FORBIDDEN: ApiError = apiError(
  "forbidden",
  "You do not have access to this workspace."
)

/**
 * Why `resolveWorkspaceContext` failed, distinct from the generic `ApiError.code`
 * every caller already branches on (ARCHITECTURE §5). Callers that only need the
 * HTTP-shaped error can ignore `reason`; the ones that need to tell "you have not
 * picked a workspace yet" apart from "that workspace rejected you" (F-ID-03 §4.3
 * failure cases) read it.
 */
export const WORKSPACE_CONTEXT_FAILURE_REASONS = [
  "unauthenticated",
  "no_workspace_selected",
  "malformed_workspace_id",
  "not_a_member",
  "invalid_role",
  "invalid_workspace_type",
  "dependency_unavailable",
] as const

export type WorkspaceContextFailureReason =
  (typeof WORKSPACE_CONTEXT_FAILURE_REASONS)[number]

export type WorkspaceContextError = ApiError & {
  reason: WorkspaceContextFailureReason
}

function fail(
  reason: WorkspaceContextFailureReason,
  error: ApiError
): Result<WorkspaceContext, WorkspaceContextError> {
  return err({ ...error, reason })
}

/** A single active-membership row, joined to the fields resolution needs. */
type ActiveMembershipRow = {
  role: string
  status: string
  workspace_id: string
  workspaces?: {
    type?: string
    plans?: { code: string | null } | null
  } | null
}

async function loadActiveMembership(
  supabase: AcadigmaSupabaseClient,
  userId: string,
  workspaceId: string
): Promise<{ data: unknown; error: unknown }> {
  return supabase
    .from("workspace_members")
    .select(`role, status, ${WORKSPACE_EMBED}`)
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle()
}

function toContext(
  workspaceId: string,
  userId: string,
  row: unknown
): Result<WorkspaceContext, WorkspaceContextError> {
  const membership = membershipRowSchema.safeParse(row)
  if (!membership.success || !isWorkspaceRole(membership.data.role)) {
    return fail("invalid_role", FORBIDDEN)
  }
  const workspaceType = membership.data.workspaces?.type
  if (!isWorkspaceType(workspaceType)) {
    // Data-integrity failure, not a permission decision — workspaces.type is
    // NOT NULL, so this should be unreachable; fail closed regardless rather
    // than hand a repository call a context with a guessed shell.
    return fail("invalid_workspace_type", FORBIDDEN)
  }
  return ok({
    workspaceId,
    userId,
    role: membership.data.role,
    workspaceType,
    // `plans` is itself RLS-guarded (`plans_select_public`: active ∧ is_public),
    // so a private or contact-sales plan embeds as null here. Feature gating
    // must therefore treat `plan === null` as "unknown", never as "free".
    plan: membership.data.workspaces?.plans?.code ?? null,
  })
}

/**
 * Writes the `tenancy.context_rejected` audit tripwire (F-ID-03 §4.3 failure
 * cases, AC1) via the `public` wrapper (DECISION-LOG D-50: `app` is not
 * PostgREST-exposed). Only called for a *well-formed* workspace id the caller
 * is genuinely not a member of — never for a malformed id (noise, not a
 * targeted attempt) and never for a stale `last_active_workspace_id` falling
 * through the resolution chain (that is an ordinary "you left" case, not a
 * forged header).
 *
 * Best-effort: a failure here must never turn a 403 into a 500, so errors are
 * swallowed. The caller has already decided to deny the request either way.
 */
async function logContextRejected(
  supabase: AcadigmaSupabaseClient,
  attemptedWorkspaceId: string
): Promise<void> {
  try {
    await supabase.rpc("log_tenancy_context_rejected", {
      p_attempted_workspace_id: attemptedWorkspaceId,
    })
  } catch {
    // Swallowed on purpose — see docstring.
  }
}

/**
 * Resolves and verifies the active workspace for a request (F-ID-03 §4.3).
 *
 * Resolution order — each step only runs if the previous one produced nothing:
 *   1. `x-workspace-id` header (middleware mirrors the `acx_ws`/`acadigma_workspace`
 *      cookie into it; a header present with no matching cookie can only mean a
 *      forged request, since the app never sets the header directly).
 *   2. `profiles.last_active_workspace_id` — the UX hint column, re-verified here
 *      exactly like every other candidate; it is never trusted on its own
 *      (`packages/domain`'s own comment on that column: "NEVER used by RLS").
 *   3. The first active membership, personal workspaces first, then earliest
 *      `joined_at` — every user has at least one (their personal workspace), so
 *      this step is expected to always resolve *something* once the header and
 *      the hint are both empty.
 *
 * Every candidate is re-queried against `workspace_members` for
 * `(workspace_id, auth.uid(), status='active')` — the header and the hint are
 * both *hints*; only that query is the authority (DECISION-LOG D-04). A
 * well-formed but non-member header id writes the `tenancy.context_rejected`
 * tripwire before failing.
 *
 * On `set_config('app.workspace_id', ...)`: PostgREST/Supabase-js gives every
 * `.from()`/`.rpc()` call its own transaction, so a GUC set here cannot be
 * "seen" by a later, separate call — there is no persistent session to carry
 * it. Functions that need `app.current_workspace_id()` inside a trigger (the
 * generic audit trigger's workspace-id fallback) therefore call
 * `app.set_workspace_context()` themselves, as the first statement of the
 * *same* SECURITY DEFINER function that does the write (e.g.
 * `public.switch_workspace`) — not from here. This function's job is strictly
 * verification; every repository call still takes the resulting
 * `WorkspaceContext` explicitly (ARCHITECTURE §3 rule 6), which is the
 * mechanism that actually carries tenancy across calls in this architecture.
 */
export async function resolveWorkspaceContext(
  supabase: AcadigmaSupabaseClient,
  headers: HeaderSource
): Promise<Result<WorkspaceContext, WorkspaceContextError>> {
  // getUser() re-validates the JWT with the auth server. getSession() only reads the
  // cookie, which a caller can forge, so it is never enough on the server.
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) {
    return fail(
      "unauthenticated",
      apiError("unauthenticated", "Please sign in to continue.")
    )
  }
  const userId = userData.user.id

  // ---- step 1: the header (hint) ---------------------------------------
  const rawWorkspaceId = headers.get(WORKSPACE_HEADER)
  if (rawWorkspaceId) {
    const parsed = z.string().uuid().safeParse(rawWorkspaceId)
    if (!parsed.success) {
      // A malformed id is never a legitimate client; do not echo it back, and do
      // not treat it as a targeted forgery attempt worth a tripwire row either.
      return fail("malformed_workspace_id", FORBIDDEN)
    }
    const workspaceId = parsed.data

    const { data, error } = await loadActiveMembership(
      supabase,
      userId,
      workspaceId
    )
    if (error) {
      return fail(
        "dependency_unavailable",
        apiError(
          "dependency_unavailable",
          "Could not verify your workspace access."
        )
      )
    }
    if (!data) {
      await logContextRejected(supabase, workspaceId)
      return fail("not_a_member", FORBIDDEN)
    }
    return toContext(workspaceId, userId, data)
  }

  // ---- step 2: profiles.last_active_workspace_id (hint) -----------------
  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select("last_active_workspace_id")
    .eq("id", userId)
    .maybeSingle()

  if (profileError) {
    return fail(
      "dependency_unavailable",
      apiError(
        "dependency_unavailable",
        "Could not verify your workspace access."
      )
    )
  }

  const lastActiveWorkspaceId = (
    profileData as { last_active_workspace_id?: string | null } | null
  )?.last_active_workspace_id

  if (lastActiveWorkspaceId) {
    const { data, error } = await loadActiveMembership(
      supabase,
      userId,
      lastActiveWorkspaceId
    )
    if (error) {
      return fail(
        "dependency_unavailable",
        apiError(
          "dependency_unavailable",
          "Could not verify your workspace access."
        )
      )
    }
    // A stale hint (the membership was since removed) is not a forged attempt —
    // fall through to step 3 without a tripwire.
    if (data) return toContext(lastActiveWorkspaceId, userId, data)
  }

  // ---- step 3: first active membership, personal first ------------------
  const { data: firstRows, error: firstError } = await supabase
    .from("workspace_members")
    .select(`workspace_id, role, status, joined_at, ${WORKSPACE_EMBED}`)
    .eq("user_id", userId)
    .eq("status", "active")
    .order("joined_at", { ascending: true })

  if (firstError) {
    return fail(
      "dependency_unavailable",
      apiError(
        "dependency_unavailable",
        "Could not verify your workspace access."
      )
    )
  }

  const rows = (firstRows ?? []) as unknown as (ActiveMembershipRow & {
    joined_at: string | null
  })[]
  if (rows.length === 0) {
    // Should not happen — registration always creates a personal workspace
    // (PRODUCT-DECISIONS §1.2) — but fail closed rather than assume one exists.
    return fail(
      "no_workspace_selected",
      apiError(
        "forbidden",
        "No workspace selected. Choose a workspace and try again."
      )
    )
  }

  const personalFirst = [...rows].sort((a, b) => {
    const aPersonal = a.workspaces?.type === "personal" ? 0 : 1
    const bPersonal = b.workspaces?.type === "personal" ? 0 : 1
    return aPersonal - bPersonal
  })
  const chosen = personalFirst[0]
  if (!chosen) {
    return fail(
      "no_workspace_selected",
      apiError(
        "forbidden",
        "No workspace selected. Choose a workspace and try again."
      )
    )
  }
  return toContext(chosen.workspace_id, userId, chosen)
}

/**
 * True when the signed-in user is Acadigma platform staff (DECISION-LOG D-16).
 * Read from `profiles`, which only the platform console can write.
 */
export async function isPlatformAdmin(
  supabase: AcadigmaSupabaseClient
): Promise<boolean> {
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return false

  const { data, error } = await supabase
    .from("profiles")
    .select("is_platform_admin")
    .eq("id", userData.user.id)
    .maybeSingle()

  if (error || !data) return false
  return data["is_platform_admin"] === true
}
