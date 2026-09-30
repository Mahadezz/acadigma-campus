import { getStaffCheckInToday, type WorkspaceContext } from "@acadigma/db"
import { can } from "@acadigma/domain"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"

import { getMessages } from "@/lib/i18n"
import { createClient } from "@/lib/supabase/server"

import { StaffCheckInCard } from "./staff-check-in-card"

/**
 * F-AC-04 Part 1 (D-214): loads today's state and renders the shared card.
 * Renders nothing for a role that has no staff attendance, and an inline
 * error (never a blocked page) when the read fails.
 */
export async function StaffCheckInSlot({ ctx }: { ctx: WorkspaceContext }) {
  if (!can(ctx.role, "staff_attendance.self")) return null
  const { t, locale } = await getMessages()
  const today = await getStaffCheckInToday(ctx, await createClient())
  if (!today.ok) {
    return (
      <InlineAlert tone="error">{t.staffCheckIn.errors.generic}</InlineAlert>
    )
  }
  return (
    <StaffCheckInCard initial={today.data} t={t.staffCheckIn} locale={locale} />
  )
}
