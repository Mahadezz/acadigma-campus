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
  MEMBER_ERROR,
  memberRoleSchema,
  memberStatusSchema,
  ok,
  type ApiError,
  type AssignableRole,
  type AssignMemberLabelInput,
  type ListMembersInput,
  type MemberDecision,
  type MemberDetail,
  type MemberErrorMarker,
  type MemberPage,
  type MemberStaffFields,
  type Result,
  type UpdateMemberStaffFieldsInput,
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
    // SQLSTATE, not message text: 42501 FORBIDDEN, 22023 CURSOR_INVALID.
    if (error.code === "42501") return err(FORBIDDEN)
    if (error.code === "22023") return err(NOT_FOUND)
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

// ---------------------------------------------------------------------------
// Part 6 (D-111) — role changes, staff fields, labels
// ---------------------------------------------------------------------------

/** A named error the UI branches on, carried in `fieldErrors._root`. */
function marked(
  code: ApiError["code"],
  message: string,
  marker: MemberErrorMarker
): ApiError {
  return { ...apiError(code, message), fieldErrors: { _root: [marker] } }
}

const LAST_OWNER = marked(
  "conflict",
  "A school must always have at least one owner. Transfer ownership first.",
  MEMBER_ERROR.LAST_OWNER_BLOCKED
)
const OWNER_TARGET = marked(
  "forbidden",
  "Only an owner can change another owner.",
  MEMBER_ERROR.FORBIDDEN_OWNER_TARGET
)
const SELF_EDIT = marked(
  "forbidden",
  "You cannot change your own role.",
  MEMBER_ERROR.SELF_EDIT_FORBIDDEN
)

/**
 * Owner/admin change a member's role. The guard trigger is the real wall (it
 * blocks self-edits, an admin touching an owner and the last owner losing the
 * role); the pre-checks here only exist to name those cases for the UI before
 * the round trip. `role` is already narrowed to admin|teacher|staff by the
 * contract, so the dropdown can never grant ownership (§4.7) or a parent role.
 */
export async function changeMemberRole(
  ctx: WorkspaceContext,
  client: AcadigmaSupabaseClient,
  memberId: string,
  role: AssignableRole
): Promise<Result<{ id: string; role: AssignableRole }, ApiError>> {
  const target = await client
    .from("workspace_members")
    .select("id, user_id, role")
    .eq("workspace_id", ctx.workspaceId)
    .eq("id", memberId)
    .neq("role", "parent")
    .maybeSingle()
  if (target.error) return err(UNAVAILABLE)
  if (!target.data) return err(NOT_FOUND)
  if (target.data.user_id === ctx.userId) return err(SELF_EDIT)
  if (target.data.role === "owner" && ctx.role !== "owner") {
    return err(OWNER_TARGET)
  }
  if (target.data.role === role) return ok({ id: memberId, role })

  const updated = await client
    .from("workspace_members")
    .update({ role })
    .eq("workspace_id", ctx.workspaceId)
    .eq("id", memberId)
    .select("id")
  if (updated.error) {
    if (updated.error.code === "23514") return err(LAST_OWNER)
    if (updated.error.code === "42501") return err(FORBIDDEN)
    return err(UNAVAILABLE)
  }
  if (updated.data.length === 0) return err(NOT_FOUND)
  return ok({ id: memberId, role })
}

const memberDetailRowSchema = z.object({
  id: z.string(),
  role: memberRoleSchema,
  status: memberStatusSchema,
  employee_code: z.string().nullable(),
  department: z.string().nullable(),
  phone: z.string().nullable(),
  label_id: z.string().nullable(),
  custom_labels: z
    .object({ id: z.string(), name: z.string(), color: z.string() })
    .nullable(),
})

/** The staff fields and label behind a member's detail sheet (owner/admin). */
export async function getMemberDetail(
  ctx: WorkspaceContext,
  client: AcadigmaSupabaseClient,
  memberId: string
): Promise<Result<MemberDetail, ApiError>> {
  const { data, error } = await client
    .from("workspace_members")
    .select(
      "id, role, status, employee_code, department, phone, label_id, custom_labels(id, name, color)"
    )
    .eq("workspace_id", ctx.workspaceId)
    .eq("id", memberId)
    .neq("role", "parent")
    .maybeSingle()
  if (error) return err(error.code === "42501" ? FORBIDDEN : UNAVAILABLE)
  if (!data) return err(NOT_FOUND)
  const row = memberDetailRowSchema.safeParse(data)
  if (!row.success) return err(UNAVAILABLE)
  return ok({
    id: row.data.id,
    role: row.data.role,
    status: row.data.status,
    employeeCode: row.data.employee_code,
    department: row.data.department,
    phone: row.data.phone,
    labelId: row.data.label_id,
    label: row.data.custom_labels,
  })
}

const staffRowSchema = z.object({
  id: z.string(),
  employee_code: z.string().nullable(),
  department: z.string().nullable(),
  phone: z.string().nullable(),
})

/**
 * Owner/admin set a member's employee code, department and work phone. The
 * definer RPC generates the code from `app.next_id` when it is left blank and
 * the member has none (§5). A duplicate code inside the school is
 * `EMPLOYEE_NO_TAKEN`.
 */
export async function updateMemberStaffFields(
  ctx: WorkspaceContext,
  client: AcadigmaSupabaseClient,
  input: UpdateMemberStaffFieldsInput
): Promise<Result<MemberStaffFields, ApiError>> {
  const { data, error } = await client.rpc("update_member_staff_fields", {
    p_workspace_id: ctx.workspaceId,
    p_member_id: input.memberId,
    p_employee_code: input.employeeCode,
    p_department: input.department,
    p_phone: input.phone,
  })
  if (error) {
    if (error.code === "23505") {
      return err(
        marked(
          "conflict",
          "Another member already has that employee code.",
          MEMBER_ERROR.EMPLOYEE_NO_TAKEN
        )
      )
    }
    if (error.code === "P0002") return err(NOT_FOUND)
    if (error.code === "42501") return err(FORBIDDEN)
    return err(UNAVAILABLE)
  }
  const row = staffRowSchema.safeParse(Array.isArray(data) ? data[0] : data)
  if (!row.success) return err(UNAVAILABLE)
  return ok({
    id: row.data.id,
    employeeCode: row.data.employee_code,
    department: row.data.department,
    phone: row.data.phone,
  })
}

/**
 * Owner/admin set (or clear, with `null`) a member's custom label. The label
 * must belong to this workspace (a composite FK enforces it) — else `LABEL_NOT_FOUND`.
 * Changing a label never changes the role (§4.8).
 */
export async function assignMemberLabel(
  ctx: WorkspaceContext,
  client: AcadigmaSupabaseClient,
  input: AssignMemberLabelInput
): Promise<Result<{ id: string; labelId: string | null }, ApiError>> {
  const updated = await client
    .from("workspace_members")
    .update({ label_id: input.labelId })
    .eq("workspace_id", ctx.workspaceId)
    .eq("id", input.memberId)
    .neq("role", "parent")
    .select("id")
  if (updated.error) {
    // 23503: the composite FK (workspace_id, label_id) -> custom_labels
    // refuses a label that is missing or belongs to another school.
    if (updated.error.code === "23503") {
      return err(
        marked(
          "not_found",
          "That label was not found.",
          MEMBER_ERROR.LABEL_NOT_FOUND
        )
      )
    }
    return err(updated.error.code === "42501" ? FORBIDDEN : UNAVAILABLE)
  }
  if (updated.data.length === 0) return err(NOT_FOUND)
  return ok({ id: input.memberId, labelId: input.labelId })
}
