/**
 * F-ID-03 Part 5 (D-110) — the Team & Access roster. The read goes through
 * `public.list_workspace_members` (owner/admin only; it names pending and
 * removed people whose profiles RLS hides). Approve and reject are plain
 * status UPDATEs: RLS (`workspace_members_update_admin`) and
 * `app.tg_workspace_members_guard` decide who may, and stamp
 * joined_at / removed_at / removed_by.
 */

import { z } from "zod"

import {
  apiError,
  err,
  memberRoleSchema,
  memberStatusSchema,
  ok,
  type ApiError,
  type ListMembersInput,
  type MemberDecision,
  type MemberPage,
  type Result,
} from "@acadigma/contracts"

import type { AcadigmaSupabaseClient } from "../client"
import type { WorkspaceContext } from "../workspace-context"

export const MEMBER_PAGE_SIZE = 25

const UNAVAILABLE: ApiError = apiError(
  "dependency_unavailable",
  "Could not reach the database. Please try again."
)
const FORBIDDEN: ApiError = apiError(
  "forbidden",
  "Only an owner or an admin can manage the team."
)
const NOT_FOUND: ApiError = apiError("not_found", "That member was not found.")
const NOT_PENDING: ApiError = {
  ...apiError("conflict", "This request was already decided."),
  fieldErrors: { _root: ["NOT_PENDING"] },
}

const rowSchema = z.object({
  id: z.string(),
  full_name: z.string(),
  email: z.string().nullable(),
  role: memberRoleSchema,
  status: memberStatusSchema,
  via_invitation: z.boolean(),
  created_at: z.string(),
  joined_at: z.string().nullable(),
  removed_at: z.string().nullable(),
})

/** One page of the roster, newest first; `nextCursor` is the last row's id. */
export async function listMembers(
  ctx: WorkspaceContext,
  client: AcadigmaSupabaseClient,
  input: ListMembersInput
): Promise<Result<MemberPage, ApiError>> {
  const { data, error } = await client.rpc("list_workspace_members", {
    p_workspace_id: ctx.workspaceId,
    p_status: input.status,
    p_q: input.q || undefined,
    p_after: input.after,
    p_limit: MEMBER_PAGE_SIZE + 1,
  })
  if (error) {
    if (error.message === "FORBIDDEN") return err(FORBIDDEN)
    if (error.message === "CURSOR_INVALID") return err(NOT_FOUND)
    return err(UNAVAILABLE)
  }
  const rows = z.array(rowSchema).safeParse(data)
  if (!rows.success) return err(UNAVAILABLE)
  const page = rows.data.slice(0, MEMBER_PAGE_SIZE)
  return ok({
    items: page.map((r) => ({
      id: r.id,
      fullName: r.full_name,
      email: r.email,
      role: r.role,
      status: r.status,
      viaInvitation: r.via_invitation,
      requestedAt: r.created_at,
      joinedAt: r.joined_at,
      removedAt: r.removed_at,
    })),
    nextCursor:
      rows.data.length > MEMBER_PAGE_SIZE ? (page.at(-1)?.id ?? null) : null,
  })
}

/**
 * pending → `to`. Already at `to` is success (a double tap); any other
 * state is NOT_PENDING. A row RLS hides, or a caller the guard refuses,
 * changes nothing.
 */
async function decide(
  ctx: WorkspaceContext,
  client: AcadigmaSupabaseClient,
  memberId: string,
  to: "active" | "removed"
): Promise<Result<MemberDecision, ApiError>> {
  const updated = await client
    .from("workspace_members")
    .update({ status: to })
    .eq("workspace_id", ctx.workspaceId)
    .eq("id", memberId)
    .eq("status", "pending")
    .neq("role", "parent")
    .select("id, status")
  if (updated.error) {
    return err(updated.error.code === "42501" ? FORBIDDEN : UNAVAILABLE)
  }
  if (updated.data.length > 0) return ok({ id: memberId, status: to })

  const current = await client
    .from("workspace_members")
    .select("id, status")
    .eq("workspace_id", ctx.workspaceId)
    .eq("id", memberId)
    .neq("role", "parent")
    .maybeSingle()
  if (current.error) return err(UNAVAILABLE)
  if (!current.data) return err(NOT_FOUND)
  if (current.data.status === to) return ok({ id: memberId, status: to })
  return err(NOT_PENDING)
}

export function approveMember(
  ctx: WorkspaceContext,
  client: AcadigmaSupabaseClient,
  memberId: string
): Promise<Result<MemberDecision, ApiError>> {
  return decide(ctx, client, memberId, "active")
}

export function rejectMember(
  ctx: WorkspaceContext,
  client: AcadigmaSupabaseClient,
  memberId: string
): Promise<Result<MemberDecision, ApiError>> {
  return decide(ctx, client, memberId, "removed")
}
