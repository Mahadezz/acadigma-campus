import { z } from "zod"

import {
  apiError,
  err,
  ok,
  type ApiError,
  type CreateSchoolWorkspaceInput,
  type Result,
} from "@acadigma/contracts"

import type { AcadigmaSupabaseClient } from "../client"

/**
 * F-ID-05 Part 3 §4.3 step 1 / §7 — the EIIN availability probe. Calls
 * `public.check_eiin_available` (SECURITY DEFINER,
 * `20260925000700_school_eiin_availability.sql`): `school_profiles`' RLS
 * (DATA-MODEL.md §1.3, class T2) only lets an active member of a school
 * read its row, so a caller filling in the wizard for a brand-new school —
 * a member of nothing yet — has no RLS path at all to "does anyone already
 * have this EIIN". The boolean-only RPC is the escape hatch, same shape as
 * `public.throttle_status` and this codebase's other `public` SECURITY
 * DEFINER wrappers (D-50): it answers the one question the wizard needs
 * without exposing which school holds the EIIN or any other column.
 *
 * Deliberately takes no `WorkspaceContext` (same reasoning D-60 already
 * recorded for `onboarding_progress`'s repository): onboarding runs before
 * any workspace membership is resolvable.
 */
export async function checkEiinAvailability(
  client: AcadigmaSupabaseClient,
  eiin: string
): Promise<Result<{ available: boolean }, ApiError>> {
  const { data, error } = await client.rpc("check_eiin_available", { eiin })

  if (error) {
    return err(
      apiError(
        "dependency_unavailable",
        "Could not check that EIIN right now. Please try again."
      )
    )
  }

  return ok({ available: Boolean(data) })
}

/** Codes `public.create_school_workspace` raises by name (its exception
 * message), mapped to the envelope. Anything else is a dependency failure. */
const CREATE_SCHOOL_ERRORS: Record<string, ApiError> = {
  EIIN_TAKEN: apiError(
    "conflict",
    "This EIIN is already registered to another school.",
    { fieldErrors: { eiin: ["EIIN_TAKEN"] } }
  ),
  RATE_LIMITED: apiError(
    "rate_limited",
    "You've created three schools today. Try again tomorrow or contact support."
  ),
  WORKSPACE_LIMIT_REACHED: apiError(
    "forbidden",
    "You've reached the limit of workspaces for one account."
  ),
  ACCOUNT_SUSPENDED: apiError("forbidden", "This account is suspended."),
  INVALID_TIMEZONE: apiError("validation_failed", "Pick a valid timezone.", {
    fieldErrors: { timezone: ["INVALID_TIMEZONE"] },
  }),
  INVALID_ACADEMIC_YEAR: apiError(
    "validation_failed",
    "Check the academic year dates.",
    { fieldErrors: { academic_year: ["INVALID_ACADEMIC_YEAR"] } }
  ),
  VALIDATION: apiError(
    "validation_failed",
    "Some of the details you entered are not valid."
  ),
  IDEMPOTENCY_KEY_REUSED: apiError(
    "conflict",
    "This request was already used for different details. Reload and try again."
  ),
}

const createSchoolRpcSchema = z.object({
  workspace_id: z.string().uuid(),
  replayed: z.boolean(),
})

/**
 * F-ID-05 Part 4 §7 `createSchoolWorkspace`: one call to
 * `public.create_school_workspace` (SECURITY DEFINER,
 * `20260925100100_create_school_workspace.sql`), which does every write in
 * one transaction. No `WorkspaceContext` for the same reason as above — the
 * workspace does not exist until this returns.
 */
export async function createSchoolWorkspace(
  client: AcadigmaSupabaseClient,
  input: CreateSchoolWorkspaceInput
): Promise<Result<{ workspaceId: string; replayed: boolean }, ApiError>> {
  const { data, error } = await client.rpc("create_school_workspace", {
    p_input: input,
  })

  if (error) {
    return err(
      CREATE_SCHOOL_ERRORS[error.message] ??
        apiError(
          "dependency_unavailable",
          "Could not create the school right now. Your details are saved — try again."
        )
    )
  }

  const row = createSchoolRpcSchema.safeParse(data)
  if (!row.success) {
    return err(apiError("internal", "Could not create the school."))
  }
  return ok({ workspaceId: row.data.workspace_id, replayed: row.data.replayed })
}
