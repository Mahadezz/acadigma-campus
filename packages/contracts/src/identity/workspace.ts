import { z } from "zod"

import { workspaceIdSchema } from "../common"

/**
 * F-ID-03 §7 "Server contracts" — the switcher actions this Part builds.
 * Only `switchWorkspace` and `listMyWorkspaces` are in scope here (Parts
 * 1-3); the rest of §7's table (`createSchoolWorkspace`, `approveMember`,
 * `transferOwnership`, ...) belongs to later Parts and is not modelled yet.
 */

// ---------------------------------------------------------------------------
// switchWorkspace
// ---------------------------------------------------------------------------
export const switchWorkspaceInputSchema = z.object({
  workspaceId: workspaceIdSchema,
})
export type SwitchWorkspaceInput = z.infer<typeof switchWorkspaceInputSchema>

export const workspaceTypeSchema = z.enum(["school", "personal"])
export type WorkspaceTypeValue = z.infer<typeof workspaceTypeSchema>

export const switchWorkspaceOutputSchema = z.object({
  landingRoute: z.string(),
  workspaceType: workspaceTypeSchema,
})
export type SwitchWorkspaceOutput = z.infer<typeof switchWorkspaceOutputSchema>

// ---------------------------------------------------------------------------
// listMyWorkspaces
// ---------------------------------------------------------------------------
export const listMyWorkspacesInputSchema = z.object({})
export type ListMyWorkspacesInput = z.infer<typeof listMyWorkspacesInputSchema>

export const memberStatusSchema = z.enum(["pending", "active", "removed"])
export type MemberStatusValue = z.infer<typeof memberStatusSchema>

export const memberRoleSchema = z.enum([
  "owner",
  "admin",
  "teacher",
  "staff",
  "parent",
])
export type MemberRoleValue = z.infer<typeof memberRoleSchema>

/** F-ID-03 §7: `MembershipSummary[]` — includes `pending` and `removed` rows so
 * the switcher sheet and `/personal/workspaces` can render them (§4.2, §4.6). */
export const membershipSummarySchema = z.object({
  workspaceId: workspaceIdSchema,
  name: z.string(),
  type: workspaceTypeSchema,
  role: memberRoleSchema,
  status: memberStatusSchema,
  logoUrl: z.string().nullable(),
})
export type MembershipSummary = z.infer<typeof membershipSummarySchema>

export const listMyWorkspacesOutputSchema = z.array(membershipSummarySchema)
export type ListMyWorkspacesOutput = z.infer<
  typeof listMyWorkspacesOutputSchema
>
