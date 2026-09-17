import { redirect } from "next/navigation"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@acadigma/ui/components/card"

import { getMessages } from "@/lib/i18n"
import { createClient } from "@/lib/supabase/server"

import { ChangePasswordForm } from "./change-password-form"

import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Security",
}

/**
 * F-ID-01 Part 4: "the Security section's Change-password card". Sessions,
 * devices and account deletion (Parts 6-7) are out of scope for this PR and
 * are added to this same page later — see F-ID-01 §11 for the OQ-3 default
 * ("shell-local, shared components") this route follows.
 */
export default async function SecurityPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login?next=%2Faccount%2Fsecurity")

  const { t } = await getMessages()

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
    </div>
  )
}
