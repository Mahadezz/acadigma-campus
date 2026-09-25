"use server"

import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"

import {
  apiError,
  apiErrorFromZod,
  err,
  ok,
  checkEiinAvailabilityInputSchema,
  completeOnboardingInputSchema,
  createSchoolWorkspaceInputSchema,
  saveOnboardingDraftInputSchema,
  type ApiError,
  type CheckEiinAvailabilityOutput,
  type CompleteOnboardingOutput,
  type CreateSchoolWorkspaceOutput,
  type GetOnboardingStateOutput,
  type Result,
  type SaveOnboardingDraftOutput,
} from "@acadigma/contracts"
import {
  checkEiinAvailability as checkEiinAvailabilityRow,
  createSchoolWorkspace as createSchoolWorkspaceRow,
  getOnboardingProgress,
  markOnboardingComplete,
  saveOnboardingDraft as saveOnboardingDraftRow,
} from "@acadigma/db"
import { validateAcademicYearRange } from "@acadigma/domain/academic"
import { resolveOnboardingExitRoute } from "@acadigma/domain/onboarding"

import { getMessages } from "@/lib/i18n"
import { createClient } from "@/lib/supabase/server"
import {
  throttleRecordFailure,
  throttleStatus,
  USER_THROTTLE_KEYS,
} from "@/lib/throttle"
import { throttledMessage } from "@/lib/throttle-copy"
import { WORKSPACE_COOKIE } from "@/lib/workspace"

import { listMyWorkspaces } from "../(shared)/workspace/actions"

/**
 * F-ID-05 §7 "Server contracts" — Part 2's `getOnboardingState`,
 * `saveOnboardingDraft`, `completeOnboarding`, plus Part 3's
 * `checkEiinAvailability` (§4.3 step 1, AC6) and Part 4's
 * `createSchoolWorkspace`. `getFirstRunChecklist`,
 * `dismissFirstRunChecklist` and the join-code actions belong to Part 5.
 *
 * Five-step shape (CLAUDE.md rule 5): parse -> resolve context ->
 * policy -> domain + repository -> return the Result. "Resolve context"
 * here is `auth.getUser()`, not `requireWorkspace()` — onboarding is
 * reachable before any workspace membership exists (§2), so there is no
 * `WorkspaceContext` to resolve. "Policy" is simply "signed in", re-enforced
 * independently by `onboarding_progress`'s RLS
 * (`20260925000300_onboarding_progress.sql`) and, for the EIIN probe, by
 * `public.check_eiin_available`'s own grant (authenticated only).
 */

export async function getOnboardingState(): Promise<
  Result<GetOnboardingStateOutput, ApiError>
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return err(apiError("unauthenticated", "Please sign in to continue."))
  }

  const [progress, memberships] = await Promise.all([
    getOnboardingProgress(supabase, user.id),
    listMyWorkspaces(),
  ])

  if (!progress.ok) return progress
  if (!memberships.ok) return memberships

  return ok({
    path: progress.data.path,
    step: progress.data.step,
    draft: progress.data.draft,
    memberships: memberships.data,
    completedAt: progress.data.completedAt,
  })
}

export async function saveOnboardingDraft(
  raw: unknown
): Promise<Result<SaveOnboardingDraftOutput, ApiError>> {
  const parsed = saveOnboardingDraftInputSchema.safeParse(raw)
  if (!parsed.success) return err(apiErrorFromZod(parsed.error))

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return err(apiError("unauthenticated", "Please sign in to continue."))
  }

  return saveOnboardingDraftRow(supabase, user.id, parsed.data)
}

export async function completeOnboarding(
  raw: unknown
): Promise<Result<CompleteOnboardingOutput, ApiError>> {
  const parsed = completeOnboardingInputSchema.safeParse(raw)
  if (!parsed.success) return err(apiErrorFromZod(parsed.error))

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return err(apiError("unauthenticated", "Please sign in to continue."))
  }

  const result = await markOnboardingComplete(supabase, user.id)
  if (!result.ok) return result

  return ok({ landingRoute: resolveOnboardingExitRoute(parsed.data.exit) })
}

/**
 * Security review (PR #34, medium) / D-67: `public.check_eiin_available` is
 * a boolean-only probe, but a signed-in caller with no rate limit at all
 * could call it repeatedly and enumerate which of the ~10^6 possible EIINs
 * are already on the platform. Keyed per user id (there is no IP-based case
 * here — the RPC already requires `authenticated`) and checked/recorded
 * BEFORE the RPC runs, same ordering as every other throttled action in
 * `(auth)/actions.ts`. Every call counts against the bucket, not just a
 * "failed" one (`throttleRecordFailure` runs unconditionally here) — the
 * thing being capped is enumeration volume, not wrong guesses.
 */
export async function checkEiinAvailability(
  raw: unknown
): Promise<Result<CheckEiinAvailabilityOutput, ApiError>> {
  const parsed = checkEiinAvailabilityInputSchema.safeParse(raw)
  if (!parsed.success) return err(apiErrorFromZod(parsed.error))

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return err(apiError("unauthenticated", "Please sign in to continue."))
  }

  // D-101: per-user key, derived from auth.uid() inside the database.
  const key = USER_THROTTLE_KEYS.eiinCheck
  const status = await throttleStatus(supabase, key)
  if (status.blocked) {
    const { t, locale } = await getMessages()
    return err(
      apiError(
        "rate_limited",
        throttledMessage(
          t.auth.login.throttled,
          status.retryAfterSeconds,
          locale
        ),
        { retryAfterSeconds: status.retryAfterSeconds }
      )
    )
  }
  await throttleRecordFailure(supabase, "eiinCheck", key)

  return checkEiinAvailabilityRow(supabase, parsed.data.eiin)
}

/**
 * F-ID-05 Part 4 §4.3 "On submit" / §7. Parse → signed in → the domain's
 * academic-year rule → `public.create_school_workspace` (one transaction;
 * it re-checks everything, since a direct RPC call skips this action) →
 * make the new school the active workspace, exactly as `switchWorkspace`
 * does, so `/app` opens on it.
 */
export async function createSchoolWorkspace(
  raw: unknown
): Promise<Result<CreateSchoolWorkspaceOutput, ApiError>> {
  const parsed = createSchoolWorkspaceInputSchema.safeParse(raw)
  if (!parsed.success) return err(apiErrorFromZod(parsed.error))

  if (!validateAcademicYearRange(parsed.data.academic_year).ok) {
    return err(
      apiError("validation_failed", "Check the academic year dates.", {
        fieldErrors: { academic_year: ["INVALID_ACADEMIC_YEAR"] },
      })
    )
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return err(apiError("unauthenticated", "Please sign in to continue."))
  }

  const created = await createSchoolWorkspaceRow(supabase, parsed.data)
  if (!created.ok) return created

  const cookieStore = await cookies()
  cookieStore.set(WORKSPACE_COOKIE, created.data.workspaceId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  })
  revalidatePath("/", "layout")

  return ok({ workspaceId: created.data.workspaceId, landingRoute: "/app" })
}
