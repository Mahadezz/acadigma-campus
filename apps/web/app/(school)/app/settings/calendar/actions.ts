"use server"

/**
 * F-AC-11 Part 1 (D-202) — declare and remove holidays from settings.
 * parse -> context -> `can("calendar.holiday.write")` -> `requireWritable`
 * -> repository. RLS (`holidays_*`, owner/admin) and
 * `app.tg_require_writable` refuse the same writes again in the database.
 */

import { revalidatePath } from "next/cache"

import {
  apiError,
  apiErrorFromZod,
  createHolidayInputSchema,
  deleteHolidayInputSchema,
  err,
  planReadOnlyApiError,
  type ApiError,
  type Holiday,
  type Result,
} from "@acadigma/contracts"
import {
  createHoliday as createHolidayRepo,
  deleteHoliday as deleteHolidayRepo,
  requireWritable,
  type WorkspaceContext,
} from "@acadigma/db"
import { can } from "@acadigma/domain"

import { createClient } from "@/lib/supabase/server"
import { requireWorkspace } from "@/lib/workspace"

const PATH = "/app/settings/calendar"

async function gateWrite(): Promise<
  Result<
    {
      ctx: WorkspaceContext
      supabase: Awaited<ReturnType<typeof createClient>>
    },
    ApiError
  >
> {
  const ctx = await requireWorkspace()
  if (!can(ctx.role, "calendar.holiday.write")) {
    return err(
      apiError("forbidden", "Only an owner or admin can change holidays.")
    )
  }
  const supabase = await createClient()
  const writable = await requireWritable(ctx, supabase)
  if (!writable.ok) return err(planReadOnlyApiError(writable.error))
  return { ok: true, data: { ctx, supabase } }
}

export async function createHoliday(
  input: unknown
): Promise<Result<Holiday, ApiError>> {
  const parsed = createHolidayInputSchema.safeParse(input)
  if (!parsed.success) return err(apiErrorFromZod(parsed.error))

  const gate = await gateWrite()
  if (!gate.ok) return gate
  const { ctx, supabase } = gate.data

  const result = await createHolidayRepo(ctx, supabase, parsed.data)
  if (result.ok) revalidatePath(PATH)
  return result
}

export async function deleteHoliday(
  input: unknown
): Promise<Result<{ deleted: true }, ApiError>> {
  const parsed = deleteHolidayInputSchema.safeParse(input)
  if (!parsed.success) return err(apiErrorFromZod(parsed.error))

  const gate = await gateWrite()
  if (!gate.ok) return gate
  const { ctx, supabase } = gate.data

  const result = await deleteHolidayRepo(ctx, supabase, parsed.data.holidayId)
  if (result.ok) revalidatePath(PATH)
  return result
}
