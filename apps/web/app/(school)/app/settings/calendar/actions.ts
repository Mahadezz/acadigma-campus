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
  deleteWorkingDayOverrideInputSchema,
  upsertWorkingDayOverrideInputSchema,
  err,
  planReadOnlyApiError,
  type ApiError,
  type Holiday,
  type Result,
  type WorkingDayOverride,
} from "@acadigma/contracts"
import {
  createHoliday as createHolidayRepo,
  deleteHoliday as deleteHolidayRepo,
  deleteWorkingDayOverride as deleteOverrideRepo,
  upsertWorkingDayOverride as upsertOverrideRepo,
  requireWritable,
  type WorkspaceContext,
} from "@acadigma/db"
import { can } from "@acadigma/domain"

import { createClient } from "@/lib/supabase/server"
import { requireWorkspace } from "@/lib/workspace"

const PATH = "/app/settings/calendar"

async function gateWrite(
  permission:
    | "calendar.holiday.write"
    | "calendar.override.write" = "calendar.holiday.write"
): Promise<
  Result<
    {
      ctx: WorkspaceContext
      supabase: Awaited<ReturnType<typeof createClient>>
    },
    ApiError
  >
> {
  const ctx = await requireWorkspace()
  if (!can(ctx.role, permission)) {
    return err(
      apiError("forbidden", "Only an owner or admin can change the calendar.")
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

/** F-AC-11 §4.3: force a date open or shut. One row per date (upsert). */
export async function saveWorkingDayOverride(
  input: unknown
): Promise<Result<WorkingDayOverride, ApiError>> {
  const parsed = upsertWorkingDayOverrideInputSchema.safeParse(input)
  if (!parsed.success) return err(apiErrorFromZod(parsed.error))

  const gate = await gateWrite("calendar.override.write")
  if (!gate.ok) return gate
  const { ctx, supabase } = gate.data

  const result = await upsertOverrideRepo(ctx, supabase, parsed.data)
  if (result.ok) revalidatePath(PATH)
  return result
}

export async function deleteWorkingDayOverride(
  input: unknown
): Promise<Result<{ deleted: true }, ApiError>> {
  const parsed = deleteWorkingDayOverrideInputSchema.safeParse(input)
  if (!parsed.success) return err(apiErrorFromZod(parsed.error))

  const gate = await gateWrite("calendar.override.write")
  if (!gate.ok) return gate
  const { ctx, supabase } = gate.data

  const result = await deleteOverrideRepo(ctx, supabase, parsed.data.date)
  if (result.ok) revalidatePath(PATH)
  return result
}
