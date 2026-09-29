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
  err,
  memberDecisionInputSchema,
  planReadOnlyApiError,
  type ApiError,
  type MemberDecision,
  type Result,
} from "@acadigma/contracts"
import {
  approveMember as approveMemberRow,
  rejectMember as rejectMemberRow,
  requireWritable,
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
  revalidatePath("/app/staff/team")
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
