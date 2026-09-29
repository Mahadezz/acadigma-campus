import { getPendingAccountDeletion } from "@acadigma/db/repositories/account-deletion"

import { formatDhakaDate } from "@/lib/format"
import { getMessages } from "@/lib/i18n"
import { createClient } from "@/lib/supabase/server"

import { KeepAccountButton } from "./keep-account-button"

/**
 * F-ID-01 §4.9 step 4 / §6 "Deletion-grace banner" (D-113): on every
 * signed-in shell while a deletion is pending — the date and one tap to
 * keep the account. Renders nothing otherwise (and nothing on a failed read:
 * the banner is a reminder, never a gate).
 */
export async function DeletionBanner({ userId }: { userId: string }) {
  const pending = await getPendingAccountDeletion(await createClient(), userId)
  if (!pending.ok || !pending.data) return null

  const { t, locale } = await getMessages()
  const d = t.auth.deleteAccount
  return (
    <div
      role="status"
      className="bg-destructive/10 text-foreground border-destructive/30 mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border px-4 py-2 text-sm"
    >
      <p className="min-w-0 flex-1 font-medium">
        {d.banner.replace(
          "{date}",
          formatDhakaDate(pending.data.scheduledPurgeAt, locale)
        )}
      </p>
      <KeepAccountButton label={d.keepButton} pendingLabel={d.keepingButton} />
    </div>
  )
}
