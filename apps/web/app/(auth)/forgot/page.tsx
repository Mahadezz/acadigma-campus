import { AuthCard } from "@acadigma/ui/primitives/auth-card"

import { getMessages } from "@/lib/i18n"

import { LanguageToggle } from "../language-toggle"

import { ForgotForm } from "./forgot-form"

import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Reset your password",
}

export default async function ForgotPage() {
  const { locale, t } = await getMessages()

  return (
    <AuthCard
      title={t.auth.forgot.title}
      subtitle={t.auth.forgot.subtitle}
      footer={<LanguageToggle current={locale} />}
    >
      <ForgotForm t={t.auth.forgot} network={t.auth.network} />
    </AuthCard>
  )
}
