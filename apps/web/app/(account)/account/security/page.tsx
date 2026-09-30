import { redirect } from "next/navigation"

import { listAccountDeletionBlockers } from "@acadigma/db/repositories/account-deletion"
import { listMySessions } from "@acadigma/db/repositories/sessions"
import { ACCOUNT_DELETION_GRACE_DAYS } from "@acadigma/domain/auth"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@acadigma/ui/components/card"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"

import { getPendingDeletion } from "@/lib/account-deletion"
import { formatDhakaDate } from "@/lib/format"
import { getMessages } from "@/lib/i18n"
import { createClient } from "@/lib/supabase/server"

import { ChangePasswordForm } from "./change-password-form"
import { DeleteAccount } from "./delete-account"
import { SignedInDevices } from "./signed-in-devices"

import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Security",
}

/**
 * F-ID-01 Part 4 (change password), Part 6 (signed-in devices, D-116) and
 * Part 7 (delete account, D-113) on the account-level settings page (OQ-3).
 * The grace banner comes from `../layout.tsx`.
 */
export default async function SecurityPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login?next=%2Faccount%2Fsecurity")

  const { t, locale } = await getMessages()
  const d = t.auth.deleteAccount
  const [pending, blockers, sessions] = await Promise.all([
    getPendingDeletion(user.id),
    listAccountDeletionBlockers(supabase),
    listMySessions(supabase),
  ])
  const scheduled = pending.ok && pending.data !== null

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
      <Card>
        <CardHeader>
          <CardTitle>{t.auth.changePassword.title}</CardTitle>
          <CardDescription>{t.auth.changePassword.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm
            t={t.auth.changePassword}
            strengthLabels={t.auth.passwordStrength}
            network={t.auth.network}
          />
        </CardContent>
      </Card>

      <Card id="devices">
        <CardHeader>
          <CardTitle>{t.auth.devices.title}</CardTitle>
          <CardDescription>{t.auth.devices.description}</CardDescription>
        </CardHeader>
        <CardContent>
          {sessions.ok ? (
            <SignedInDevices
              t={t.auth.devices}
              userId={user.id}
              devices={sessions.data.map((s) => ({
                id: s.id,
                label: s.label,
                isCurrent: s.isCurrent,
                signedIn: formatDhakaDate(s.createdAt, locale),
                lastActive: formatDhakaDate(s.lastActiveAt, locale),
              }))}
            />
          ) : (
            <InlineAlert tone="error">{sessions.error.message}</InlineAlert>
          )}
        </CardContent>
      </Card>

      <Card id="delete-account">
        <CardHeader>
          <CardTitle>{d.title}</CardTitle>
          <CardDescription>
            {d.description.replace(
              "{days}",
              String(ACCOUNT_DELETION_GRACE_DAYS)
            )}
          </CardDescription>
        </CardHeader>
        {/* While a deletion is pending the banner above carries the date and
            "Keep my account"; there is nothing more to do here. */}
        {scheduled ? null : (
          <CardContent>
            {blockers.ok ? (
              <DeleteAccount
                t={d}
                userId={user.id}
                graceDays={ACCOUNT_DELETION_GRACE_DAYS}
                blockers={blockers.data}
              />
            ) : (
              <InlineAlert tone="error">{blockers.error.message}</InlineAlert>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  )
}
