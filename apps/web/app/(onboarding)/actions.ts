"use server"

import {
  apiError,
  apiErrorFromZod,
  err,
  ok,
  completeOnboardingInputSchema,
  saveOnboardingDraftInputSchema,
  type ApiError,
  type CompleteOnboardingOutput,
  type GetOnboardingStateOutput,
  type Result,
  type SaveOnboardingDraftOutput,
} from "@acadigma/contracts"
import {
  getOnboardingProgress,
  markOnboardingComplete,
  saveOnboardingDraft as saveOnboardingDraftRow,
} from "@acadigma/db"
import { resolveOnboardingExitRoute } from "@acadigma/domain/onboarding"

import { createClient } from "@/lib/supabase/server"

import { listMyWorkspaces } from "../(shared)/workspace/actions"

/**
 * F-ID-05 Part 2 §7 "Server contracts" — `getOnboardingState`,
 * `saveOnboardingDraft`, `completeOnboarding`. `createSchoolWorkspace`,
 * `getFirstRunChecklist`, `dismissFirstRunChecklist` and the join-code
 * actions belong to Parts 3-5 and are not modelled here.
 *
 * Five-step shape (CLAUDE.md rule 5): parse -> resolve context ->
 * policy -> domain + repository -> return the Result. "Resolve context"
 * here is `auth.getUser()`, not `requireWorkspace()` — onboarding is
 * reachable before any workspace membership exists (§2), so there is no
 * `WorkspaceContext` to resolve. "Policy" is simply "signed in", re-enforced
 * independently by `onboarding_progress`'s RLS
 * (`20260925000300_onboarding_progress.sql`).
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
