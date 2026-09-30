"use server"

/**
 * F-ID-03 Part 5 (D-110) — `approveMember` / `rejectMember` (§7). Shape:
 * parse → workspace context → `can()` → `requireWritable` (D-300) →
 * repository → revalidate. RLS and `app.tg_workspace_members_guard` re-check
 * every rule.
 */

import { revalidatePath } from "next/cache"

import {
  apiError,
  apiErrorFromZod,
  assignMemberLabelInputSchema,
  changeMemberRoleInputSchema,
  err,
  memberDecisionInputSchema,
  planReadOnlyApiError,
  updateMemberStaffFieldsInputSchema,
  type ApiError,
  type AssignableRole,
  type MemberDecision,
  type MemberDetail,
  type MemberStaffFields,
  type Result,
} from "@acadigma/contracts"
import {
  approveMember as approveMemberRow,
  assignMemberLabel as assignMemberLabelRow,
  changeMemberRole as changeMemberRoleRow,
  getMemberDetail as getMemberDetailRow,
  rejectMember as rejectMemberRow,
  removeMember as removeMemberRow,
  requireWritable,
  updateMemberStaffFields as updateMemberStaffFieldsRow,
} from "@acadigma/db"
import { can } from "@acadigma/domain"

import { createClient } from "@/lib/supabase/server"
import { requireWorkspace } from "@/lib/workspace"

const FORBIDDEN = apiError(
  "forbidden",
  "Only an owner or an admin can manage the team."
)

async function decide(
  input: unknown,
  write: typeof approveMemberRow
): Promise<Result<MemberDecision, ApiError>> {
  const parsed = memberDecisionInputSchema.safeParse(input)
  if (!parsed.success) return err(apiErrorFromZod(parsed.error))

  const ctx = await requireWorkspace()
  if (!can(ctx.role, "members.approve")) return err(FORBIDDEN)
  const supabase = await createClient()
  const writable = await requireWritable(ctx, supabase)
  if (!writable.ok) return err(planReadOnlyApiError(writable.error))

  const result = await write(ctx, supabase, parsed.data.memberId)
  if (result.ok) revalidatePath("/app/staff/team")
  return result
}

export async function approveMember(
  input: unknown
): Promise<Result<MemberDecision, ApiError>> {
  return decide(input, approveMemberRow)
}

export async function rejectMember(
  input: unknown
): Promise<Result<MemberDecision, ApiError>> {
  return decide(input, rejectMemberRow)
}

// ---------------------------------------------------------------------------
// Part 6 (D-111) — role changes, staff fields, labels
// ---------------------------------------------------------------------------

/** Read a member's staff fields and label for the detail sheet (owner/admin). */
export async function getMemberDetail(
  input: unknown
): Promise<Result<MemberDetail, ApiError>> {
  const parsed = memberDecisionInputSchema.safeParse(input)
  if (!parsed.success) return err(apiErrorFromZod(parsed.error))
  const ctx = await requireWorkspace()
  if (!can(ctx.role, "members.contact.read")) return err(FORBIDDEN)
  return getMemberDetailRow(ctx, await createClient(), parsed.data.memberId)
}

export async function changeMemberRole(
  input: unknown
): Promise<Result<{ id: string; role: AssignableRole }, ApiError>> {
  const parsed = changeMemberRoleInputSchema.safeParse(input)
  if (!parsed.success) return err(apiErrorFromZod(parsed.error))
  const ctx = await requireWorkspace()
  if (!can(ctx.role, "members.role.write")) return err(FORBIDDEN)
  const supabase = await createClient()
  const writable = await requireWritable(ctx, supabase)
  if (!writable.ok) return err(planReadOnlyApiError(writable.error))

  const result = await changeMemberRoleRow(
    ctx,
    supabase,
    parsed.data.memberId,
    parsed.data.role
  )
  if (result.ok) revalidatePath("/app/staff/team")
  return result
}

export async function updateMemberStaffFields(
  input: unknown
): Promise<Result<MemberStaffFields, ApiError>> {
  const parsed = updateMemberStaffFieldsInputSchema.safeParse(input)
  if (!parsed.success) return err(apiErrorFromZod(parsed.error))
  const ctx = await requireWorkspace()
  if (!can(ctx.role, "members.staff_fields.write")) return err(FORBIDDEN)
  const supabase = await createClient()
  const writable = await requireWritable(ctx, supabase)
  if (!writable.ok) return err(planReadOnlyApiError(writable.error))

  const result = await updateMemberStaffFieldsRow(ctx, supabase, parsed.data)
  if (result.ok) revalidatePath("/app/staff/team")
  return result
}

export async function assignMemberLabel(
  input: unknown
): Promise<Result<{ id: string; labelId: string | null }, ApiError>> {
  const parsed = assignMemberLabelInputSchema.safeParse(input)
  if (!parsed.success) return err(apiErrorFromZod(parsed.error))
  const ctx = await requireWorkspace()
  if (!can(ctx.role, "labels.assign")) return err(FORBIDDEN)
  const supabase = await createClient()
  const writable = await requireWritable(ctx, supabase)
  if (!writable.ok) return err(planReadOnlyApiError(writable.error))

  const result = await assignMemberLabelRow(ctx, supabase, parsed.data)
  if (result.ok) revalidatePath("/app/staff/team")
  return result
}

// ---------------------------------------------------------------------------
// Part 7 (D-112) — removal
// ---------------------------------------------------------------------------

/**
 * End a member's access (§4.5 action 6). Deliberately NOT gated by
 * `requireWritable` (EXEMPT in scripts/check-require-writable.mjs): removing
 * access is always allowed, even on a read-only plan (D-300, D-112) — a
 * school whose trial lapsed must still be able to lock out a dismissed
 * teacher. The database agrees (app.tg_require_writable passes a removal).
 */
export async function removeMember(
  input: unknown
): Promise<Result<MemberDecision, ApiError>> {
  const parsed = memberDecisionInputSchema.safeParse(input)
  if (!parsed.success) return err(apiErrorFromZod(parsed.error))
  const ctx = await requireWorkspace()
  if (!can(ctx.role, "members.remove")) return err(FORBIDDEN)

  const result = await removeMemberRow(
    ctx,
    await createClient(),
    parsed.data.memberId
  )
  if (result.ok) revalidatePath("/app/staff/team")
  return result
}
