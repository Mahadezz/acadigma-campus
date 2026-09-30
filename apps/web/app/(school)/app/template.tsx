import { getDangerZoneState } from "@acadigma/db"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"

import { getMessages } from "@/lib/i18n"
import { toIntlLocale } from "@/lib/locale"
import { createClient } from "@/lib/supabase/server"
import { requireShell } from "@/lib/workspace"

/**
 * F-OP-07 W8 (D-211): while a deletion is scheduled, every member sees the
 * date above every school screen until the owner cancels it or the school is
 * deleted. A template rather than `layout.tsx` so this banner stays one small
 * file; the layout's own read-only banner already covers an archived school
 * (`requireWritable` → "This school is archived.").
 */
export default async function SchoolTemplate({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const ctx = await requireShell("school")
  const state = await getDangerZoneState(ctx, await createClient())
  const scheduled = state.ok ? state.data.deletionScheduledAt : null
  if (!scheduled || !state.ok) return children

  const { t, locale } = await getMessages()
  const date = new Intl.DateTimeFormat(toIntlLocale(locale), {
    timeZone: "Asia/Dhaka",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(scheduled))
  const text = t.dangerZone.scheduled.banner.replace(
    /\{(school|date)\}/g,
    (_, key: string) => (key === "school" ? state.data.name : date)
  )

  return (
    <>
      <InlineAlert tone="error" className="mb-4">
        {text}
      </InlineAlert>
      {children}
    </>
  )
}
