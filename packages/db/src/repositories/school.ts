import {
  apiError,
  err,
  ok,
  type ApiError,
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
