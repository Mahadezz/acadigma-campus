/**
 * F-ID-03 Part 6 (D-111) — custom labels CRUD (§4.8). A label is a display
 * title over a base role ("Vice-Principal" over `admin`); permissions never
 * read it. All four operations are plain writes under the `custom_labels`
 * policies (select for active members; insert/update/delete for owner/admin)
 * and the require-writable guard — no definer needed. Deleting a label nulls
 * it on its members via the FK `on delete set null` (no cascade of people).
 */

import { z } from "zod"

import {
  apiError,
  assignableRoleSchema,
  err,
  MEMBER_ERROR,
  ok,
  type ApiError,
  type CreateCustomLabelInput,
  type CustomLabel,
  type Result,
  type UpdateCustomLabelInput,
} from "@acadigma/contracts"

import type { AcadigmaSupabaseClient } from "../client"
import type { WorkspaceContext } from "../workspace-context"

const UNAVAILABLE: ApiError = apiError(
  "dependency_unavailable",
  "Could not reach the database. Please try again."
)
const FORBIDDEN: ApiError = apiError(
  "forbidden",
  "Only an owner or an admin can manage labels."
)
const NAME_TAKEN: ApiError = {
  ...apiError("conflict", "A label with that name already exists."),
  fieldErrors: {
    name: ["This name is already used."],
    _root: [MEMBER_ERROR.LABEL_NAME_TAKEN],
  },
}
const NOT_FOUND: ApiError = apiError("not_found", "That label was not found.")

const labelRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  base_role: assignableRoleSchema,
  color: z.string(),
})

function toLabel(row: z.infer<typeof labelRowSchema>): CustomLabel {
  return {
    id: row.id,
    name: row.name,
    baseRole: row.base_role,
    color: row.color,
  }
}

/** Every label in this workspace, for the settings list and the assign select. */
export async function listCustomLabels(
  ctx: WorkspaceContext,
  client: AcadigmaSupabaseClient
): Promise<Result<CustomLabel[], ApiError>> {
  const { data, error } = await client
    .from("custom_labels")
    .select("id, name, base_role, color")
    .eq("workspace_id", ctx.workspaceId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true })
  if (error) return err(UNAVAILABLE)
  const rows = z.array(labelRowSchema).safeParse(data)
  if (!rows.success) return err(UNAVAILABLE)
  return ok(rows.data.map(toLabel))
}

export async function createCustomLabel(
  ctx: WorkspaceContext,
  client: AcadigmaSupabaseClient,
  input: CreateCustomLabelInput
): Promise<Result<CustomLabel, ApiError>> {
  const { data, error } = await client
    .from("custom_labels")
    .insert({
      workspace_id: ctx.workspaceId,
      name: input.name,
      base_role: input.baseRole,
      color: input.color,
      created_by: ctx.userId,
    })
    .select("id, name, base_role, color")
    .single()
  if (error) {
    if (error.code === "23505") return err(NAME_TAKEN)
    if (error.code === "42501") return err(FORBIDDEN)
    return err(UNAVAILABLE)
  }
  const row = labelRowSchema.safeParse(data)
  return row.success ? ok(toLabel(row.data)) : err(UNAVAILABLE)
}

export async function updateCustomLabel(
  ctx: WorkspaceContext,
  client: AcadigmaSupabaseClient,
  input: UpdateCustomLabelInput
): Promise<Result<CustomLabel, ApiError>> {
  const { data, error } = await client
    .from("custom_labels")
    .update({ name: input.name, base_role: input.baseRole, color: input.color })
    .eq("workspace_id", ctx.workspaceId)
    .eq("id", input.id)
    .select("id, name, base_role, color")
    .maybeSingle()
  if (error) {
    if (error.code === "23505") return err(NAME_TAKEN)
    if (error.code === "42501") return err(FORBIDDEN)
    return err(UNAVAILABLE)
  }
  if (!data) return err(NOT_FOUND)
  const row = labelRowSchema.safeParse(data)
  return row.success ? ok(toLabel(row.data)) : err(UNAVAILABLE)
}

export async function deleteCustomLabel(
  ctx: WorkspaceContext,
  client: AcadigmaSupabaseClient,
  id: string
): Promise<Result<{ id: string }, ApiError>> {
  const { error } = await client
    .from("custom_labels")
    .delete()
    .eq("workspace_id", ctx.workspaceId)
    .eq("id", id)
  if (error) return err(error.code === "42501" ? FORBIDDEN : UNAVAILABLE)
  return ok({ id })
}
