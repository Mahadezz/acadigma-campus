"use server"

import {
  apiError,
  apiErrorFromZod,
  err,
  listStaffInputSchema,
  uuidSchema,
  type ApiError,
  type Result,
  type StaffDirectoryPage,
  type StaffDirectoryRow,
} from "@acadigma/contracts"
import {
  getStaffDirectoryRow as getStaffDirectoryRowRepo,
  listStaff as listStaffRepo,
} from "@acadigma/db/repositories"
import { can } from "@acadigma/domain/permissions"

import { requestLogger } from "@/lib/logger"
import { createClient } from "@/lib/supabase/server"
import { requireWorkspace } from "@/lib/workspace"

/**
 * Server actions for the staff directory (F-OP-06 Part 2), following
 * CLAUDE.md rule 5: parse -> resolve context -> policy check -> repository
 * -> `Result<T, ApiError>`. Read-only — no write action exists yet
 * (createStaffRecord/setStaffCompensation/... are Parts 3-5).
 */

const FORBIDDEN: ApiError = apiError(
  "forbidden",
  "You do not have access to the staff directory."
)

export async function listStaff(
  input: unknown
): Promise<Result<StaffDirectoryPage, ApiError>> {
  const ctx = await requireWorkspace()
  if (!can(ctx.role, "staff.view")) return err(FORBIDDEN)

  const parsed = listStaffInputSchema.safeParse(input)
  if (!parsed.success) return err(apiErrorFromZod(parsed.error))

  const client = await createClient()
  const result = await listStaffRepo(client, ctx, parsed.data)
  if (!result.ok) {
    const log = await requestLogger({ route: "staff.list" })
    log.warn({ code: result.error.code }, "staff directory list failed")
  }
  return result
}

export async function getStaffDirectoryRow(
  membershipId: string
): Promise<Result<StaffDirectoryRow, ApiError>> {
  const ctx = await requireWorkspace()
  if (!can(ctx.role, "staff.view")) return err(FORBIDDEN)

  const parsed = uuidSchema.safeParse(membershipId)
  if (!parsed.success) return err(apiErrorFromZod(parsed.error))

  const client = await createClient()
  return getStaffDirectoryRowRepo(client, ctx, parsed.data)
}
