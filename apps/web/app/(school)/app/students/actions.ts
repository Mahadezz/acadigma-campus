"use server"

/**
 * F-AC-02 demo cut (D-103) — `quickAdmitStudent` (§7). Shape: parse →
 * workspace context → `can()` → `requireWritable` (D-300) → repository →
 * revalidate. `public.admit_student` re-checks the role and every rule.
 */

import { revalidatePath } from "next/cache"

import {
  apiError,
  apiErrorFromZod,
  err,
  inviteGuardianInputSchema,
  planReadOnlyApiError,
  quickAdmitInputSchema,
  revokeGuardianLinkInputSchema,
  type ApiError,
  type GuardianInvite,
  type QuickAdmitResult,
  type Result,
} from "@acadigma/contracts"
import {
  admitStudent,
  inviteGuardian as inviteGuardianRow,
  requireWritable,
  revokeGuardianLink as revokeGuardianLinkRow,
} from "@acadigma/db"
import { can } from "@acadigma/domain"

import { createClient } from "@/lib/supabase/server"
import { requireWorkspace } from "@/lib/workspace"

export async function quickAdmitStudent(
  input: unknown
): Promise<Result<QuickAdmitResult, ApiError>> {
  const parsed = quickAdmitInputSchema.safeParse(input)
  if (!parsed.success) return err(apiErrorFromZod(parsed.error))

  const ctx = await requireWorkspace()
  if (!can(ctx.role, "students.write")) {
    return err(
      apiError("forbidden", "Only an owner or admin can admit students.")
    )
  }
  const supabase = await createClient()
  const writable = await requireWritable(ctx, supabase)
  if (!writable.ok) return err(planReadOnlyApiError(writable.error))

  const result = await admitStudent(supabase, ctx, parsed.data)
  if (result.ok) revalidatePath("/app/students")
  return result
}

const GUARDIAN_FORBIDDEN = apiError(
  "forbidden",
  "Only an owner, an admin or the student's class teacher can manage parent access."
)

/**
 * F-AC-02 Part 4 (D-108) `inviteGuardian`: a single-use link to the parent
 * app for one child. The token comes back once, for the copy/WhatsApp sheet.
 */
export async function inviteGuardian(
  input: unknown
): Promise<Result<GuardianInvite, ApiError>> {
  const parsed = inviteGuardianInputSchema.safeParse(input)
  if (!parsed.success) return err(apiErrorFromZod(parsed.error))

  const ctx = await requireWorkspace()
  if (!can(ctx.role, "students.guardian.invite")) return err(GUARDIAN_FORBIDDEN)
  const supabase = await createClient()
  const writable = await requireWritable(ctx, supabase)
  if (!writable.ok) return err(planReadOnlyApiError(writable.error))

  return inviteGuardianRow(ctx, supabase, parsed.data.guardianId)
}

/** F-AC-02 Part 4 (D-108) `revokeGuardianLink`: the parent loses access at once. */
export async function revokeGuardianLink(
  input: unknown
): Promise<Result<null, ApiError>> {
  const parsed = revokeGuardianLinkInputSchema.safeParse(input)
  if (!parsed.success) return err(apiErrorFromZod(parsed.error))

  const ctx = await requireWorkspace()
  if (!can(ctx.role, "students.guardian.invite")) return err(GUARDIAN_FORBIDDEN)
  const supabase = await createClient()
  const writable = await requireWritable(ctx, supabase)
  if (!writable.ok) return err(planReadOnlyApiError(writable.error))

  const result = await revokeGuardianLinkRow(ctx, supabase, parsed.data.linkId)
  if (result.ok) revalidatePath("/app/students", "layout")
  return result
}
