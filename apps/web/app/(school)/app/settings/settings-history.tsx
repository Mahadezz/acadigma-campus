import { listAuditEvents, type WorkspaceContext } from "@acadigma/db"
import { can } from "@acadigma/domain"

import { toIntlLocale, type Locale } from "@/lib/locale"
import { createClient } from "@/lib/supabase/server"

import { historyLine } from "./history-line"

type HistoryMessages = {
  title: string
  empty: string
  line: string
  someone: string
}

/**
 * F-OP-07 §3.7 / AC6: the inline "changed by {name}, {date}" trail, read from
 * the generic `audit_events` trigger rows for this school's `school_profiles`
 * row. `audit_events` is owner-readable only (F-ID-09 OQ-2), so an admin sees
 * no trail here — the same boundary the full audit viewer has.
 */
export async function SettingsHistory({
  ctx,
  fieldLabels,
  t,
  locale,
}: {
  ctx: WorkspaceContext
  fieldLabels: Record<string, string>
  t: HistoryMessages
  locale: Locale
}) {
  if (!can(ctx.role, "audit.read")) return null

  const client = await createClient()
  const result = await listAuditEvents(ctx, client, {
    // The generic audit trigger stores `schema.table` (tg_table_schema || '.' || tg_table_name).
    tableName: "public.school_profiles",
    limit: 5,
  })
  const events = result.ok ? result.data.items : []
  // `toIntlLocale` pins `-u-nu-latn` on bn (DESIGN-SYSTEM §1.6): Bengali
  // month names, Western digits. The bare bn-BD tag renders Bengali digits,
  // which this trail (and every other UI date) never should by default.
  const dateFormat = new Intl.DateTimeFormat(toIntlLocale(locale), {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Dhaka",
  })

  return (
    <section aria-labelledby="settings-history" className="space-y-2 pt-4">
      <h3 id="settings-history" className="text-sm font-semibold">
        {t.title}
      </h3>
      {events.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t.empty}</p>
      ) : (
        <ul className="text-muted-foreground space-y-1 text-sm">
          {events.map((event) => {
            const line = historyLine(event, fieldLabels, t, (iso) =>
              dateFormat.format(new Date(iso))
            )
            return line ? <li key={event.id}>{line}</li> : null
          })}
        </ul>
      )}
    </section>
  )
}
