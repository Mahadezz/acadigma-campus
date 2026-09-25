import {
  apiError,
  err,
  ok,
  type ApiError,
  type Result,
} from "@acadigma/contracts"

import { getSchoolSettings } from "./settings"

import type { AcadigmaSupabaseClient } from "../client"
import type { WorkspaceContext } from "../workspace-context"

/**
 * Everything the school dashboard (D-400) shows that exists in the database
 * today. Counts are `head: true` count queries — no member or staff row ever
 * reaches the server component, only numbers. RLS decides what a caller may
 * count: owner/admin/teacher/staff see every active membership and the
 * staff directory; a parent never reaches this shell (`requireShell`).
 */
export const MEMBER_ROLES = [
  "owner",
  "admin",
  "teacher",
  "staff",
  "parent",
] as const
export type MemberRole = (typeof MEMBER_ROLES)[number]

export type DashboardSummary = {
  schoolName: string
  /** Letterhead lines from F-OP-07 branding, when the school has set them. */
  headerLine1: string | null
  headerLine2: string | null
  hasLogo: boolean
  timezone: string
  trialEndsAt: string | null
  accessMode: string
  membersByRole: Record<MemberRole, number>
  staffRecordCount: number
  currentAcademicYearCount: number
  gradeLevelCount: number
}

const UNAVAILABLE: ApiError = apiError(
  "dependency_unavailable",
  "Could not load the dashboard. Please try again."
)

export async function getDashboardSummary(
  ctx: WorkspaceContext,
  client: AcadigmaSupabaseClient
): Promise<Result<DashboardSummary, ApiError>> {
  const countMembers = (role: MemberRole) =>
    client
      .from("workspace_members")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", ctx.workspaceId)
      .eq("status", "active")
      .eq("role", role)

  const [workspace, settings, staff, years, grades, ...roleCounts] =
    await Promise.all([
      client
        .from("workspaces")
        .select("name, logo_url, trial_ends_at, access_mode")
        .eq("id", ctx.workspaceId)
        .maybeSingle(),
      getSchoolSettings(client, ctx),
      client
        .from("staff_directory")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", ctx.workspaceId)
        .in("employment_status", ["active", "on_notice"]),
      client
        .from("academic_years")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", ctx.workspaceId)
        .eq("is_current", true),
      client
        .from("grade_levels")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", ctx.workspaceId),
      ...MEMBER_ROLES.map(countMembers),
    ])

  if (workspace.error || !workspace.data) return err(UNAVAILABLE)
  if ([staff, years, grades, ...roleCounts].some((r) => r.error))
    return err(UNAVAILABLE)

  // A school without a school_profiles row still gets a dashboard — it just
  // has no letterhead yet, which is exactly what the checklist reports. Any
  // other settings failure is an error, not "no letterhead, Asia/Dhaka".
  if (!settings.ok && settings.error.code !== "not_found") {
    return err(UNAVAILABLE)
  }
  const branding = settings.ok ? settings.data.branding : null

  return ok({
    schoolName: workspace.data.name,
    headerLine1: branding?.header_line_1 ?? null,
    headerLine2: branding?.header_line_2 ?? null,
    hasLogo: Boolean(workspace.data.logo_url || branding?.logo_file_id),
    timezone: settings.ok ? settings.data.timezone : "Asia/Dhaka",
    trialEndsAt: workspace.data.trial_ends_at,
    accessMode: workspace.data.access_mode,
    membersByRole: Object.fromEntries(
      MEMBER_ROLES.map((role, i) => [role, roleCounts[i]?.count ?? 0])
    ) as Record<MemberRole, number>,
    staffRecordCount: staff.count ?? 0,
    currentAcademicYearCount: years.count ?? 0,
    gradeLevelCount: grades.count ?? 0,
  })
}
