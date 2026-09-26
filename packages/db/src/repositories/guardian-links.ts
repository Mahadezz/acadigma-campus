/**
 * F-AC-02 Part 4 demo cut (D-108) — guardian links. The four functions in
 * `20260926025038_guardian_linking.sql` do every check; this maps their
 * named errors. Previewing and accepting a link run before the caller is a
 * member of the school, so they take no `WorkspaceContext` (like creating a
 * school); everything else does.
 */

import { z } from "zod"

import {
  apiError,
  err,
  guardianRelationSchema,
  ok,
  type ApiError,
  type FamilyChild,
  type GuardianInvitationPreview,
  type GuardianInvite,
  type GuardianLink,
  type Result,
} from "@acadigma/contracts"

import type { AcadigmaSupabaseClient } from "../client"
import type { WorkspaceContext } from "../workspace-context"

const UNAVAILABLE: ApiError = apiError(
  "dependency_unavailable",
  "Could not reach the database. Please try again."
)

const ERRORS: Record<string, ApiError> = {
  FORBIDDEN: apiError(
    "forbidden",
    "Only an owner or admin can manage parent access."
  ),
  GUARDIAN_NOT_FOUND: apiError("not_found", "That guardian was not found."),
  GUARDIAN_ALREADY_LINKED: apiError(
    "conflict",
    "This guardian already has the parent app."
  ),
  RATE_LIMITED: apiError(
    "rate_limited",
    "Too many invitations in the last hour. Please try again later."
  ),
  LINK_NOT_FOUND: apiError("not_found", "That link was not found."),
  INVITATION_NOT_FOUND: apiError(
    "not_found",
    "This invitation link is not valid."
  ),
  INVITATION_EXPIRED: apiError(
    "conflict",
    "This invitation has expired. Ask the school for a new link."
  ),
  INVITATION_ACCEPTED: apiError(
    "conflict",
    "This invitation has already been used."
  ),
  INVITATION_REVOKED: apiError(
    "conflict",
    "This link was replaced. Ask the school for the latest one."
  ),
  INVITATION_DECLINED: apiError("conflict", "This invitation was declined."),
  MEMBERSHIP_CONFLICT: apiError(
    "conflict",
    "Your account already belongs to this school in another role. Please contact the school."
  ),
  PLAN_READ_ONLY: apiError(
    "forbidden",
    "This school is read-only. Ask the school to upgrade."
  ),
}

function mapError(message: string): ApiError {
  return (
    (Object.hasOwn(ERRORS, message) ? ERRORS[message] : undefined) ??
    UNAVAILABLE
  )
}

/** A single-use link for one child; the raw token is returned once. */
export async function inviteGuardian(
  ctx: WorkspaceContext,
  client: AcadigmaSupabaseClient,
  guardianId: string
): Promise<Result<GuardianInvite, ApiError>> {
  const { data, error } = await client.rpc("invite_guardian", {
    p_workspace_id: ctx.workspaceId,
    p_guardian_id: guardianId,
  })
  if (error) return err(mapError(error.message))
  const row = z
    .object({ token: z.string(), expires_at: z.string() })
    .safeParse(data)
  return row.success
    ? ok({ token: row.data.token, expiresAt: row.data.expires_at })
    : err(UNAVAILABLE)
}

export async function revokeGuardianLink(
  ctx: WorkspaceContext,
  client: AcadigmaSupabaseClient,
  linkId: string
): Promise<Result<null, ApiError>> {
  const { error } = await client.rpc("revoke_guardian_link", {
    p_workspace_id: ctx.workspaceId,
    p_link_id: linkId,
  })
  return error ? err(mapError(error.message)) : ok(null)
}

/** The accounts linked to a student's guardians (RLS: owner/admin). */
export async function listGuardianLinks(
  ctx: WorkspaceContext,
  client: AcadigmaSupabaseClient,
  studentId: string
): Promise<Result<GuardianLink[], ApiError>> {
  const { data, error } = await client
    .from("guardian_users")
    .select(
      "id, guardian_id, status, accepted_at, profiles!guardian_users_user_id_fkey(full_name, email)"
    )
    .eq("workspace_id", ctx.workspaceId)
    .eq("student_id", studentId)
    .neq("status", "revoked")
    .order("accepted_at")
  if (error) return err(UNAVAILABLE)
  return ok(
    (data ?? []).map((r) => ({
      id: r.id,
      guardianId: r.guardian_id,
      status: r.status,
      accountName: r.profiles?.full_name ?? null,
      accountEmail: r.profiles?.email ?? null,
      acceptedAt: r.accepted_at,
    }))
  )
}

const previewSchema = z.union([
  z.object({
    status: z.literal("pending"),
    school_name: z.string(),
    student_name: z.string(),
    student_name_bn: z.string().nullable(),
    relation: guardianRelationSchema,
    expires_at: z.string(),
  }),
  z.object({
    status: z.enum(["accepted", "revoked", "expired", "declined"]),
    accepted_by_me: z.boolean(),
  }),
])

export async function previewGuardianInvitation(
  client: AcadigmaSupabaseClient,
  token: string
): Promise<Result<GuardianInvitationPreview, ApiError>> {
  const { data, error } = await client.rpc("guardian_invitation_preview", {
    p_token: token,
  })
  if (error) return err(mapError(error.message))
  const row = previewSchema.safeParse(data)
  if (!row.success) return err(UNAVAILABLE)
  const p = row.data
  if (p.status !== "pending") {
    return ok({ status: p.status, acceptedByMe: p.accepted_by_me })
  }
  return ok({
    status: "pending",
    schoolName: p.school_name,
    studentName: p.student_name,
    studentNameBn: p.student_name_bn,
    relation: p.relation,
    expiresAt: p.expires_at,
  })
}

/** Accepts once; returns the school the caller is now a parent of. */
export async function acceptGuardianInvitation(
  client: AcadigmaSupabaseClient,
  token: string
): Promise<Result<{ workspaceId: string }, ApiError>> {
  const { data, error } = await client.rpc("accept_guardian_invitation", {
    p_token: token,
  })
  if (error) return err(mapError(error.message))
  const row = z.object({ workspace_id: z.string() }).safeParse(data)
  return row.success
    ? ok({ workspaceId: row.data.workspace_id })
    : err(UNAVAILABLE)
}

/** A parent's linked children (RLS: `students_select_guardian`). */
export async function listFamilyChildren(
  ctx: WorkspaceContext,
  client: AcadigmaSupabaseClient
): Promise<Result<FamilyChild[], ApiError>> {
  const { data, error } = await client
    .from("students")
    .select("id, full_name, full_name_bn, student_code")
    .eq("workspace_id", ctx.workspaceId)
    .is("deleted_at", null)
    .order("full_name")
  if (error) return err(UNAVAILABLE)
  return ok(
    (data ?? []).map((s) => ({
      id: s.id,
      fullName: s.full_name ?? s.student_code,
      fullNameBn: s.full_name_bn,
      studentCode: s.student_code,
    }))
  )
}
