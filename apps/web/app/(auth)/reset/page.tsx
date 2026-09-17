import { Button } from "@acadigma/ui/components/button"
import { AuthCard } from "@acadigma/ui/primitives/auth-card"

import { getMessages } from "@/lib/i18n"

import { LanguageToggle } from "../language-toggle"

import { ResetForm } from "./reset-form"

import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Set a new password",
}

export default async function ResetPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; error?: string }>
}) {
  const { token_hash: tokenHash, error } = await searchParams
  const { locale, t } = await getMessages()

  if (!tokenHash || error === "link_expired") {
    return (
      <AuthCard
        title={t.auth.reset.invalidTokenTitle}
        subtitle={t.auth.reset.invalidTokenMessage}
        footer={<LanguageToggle current={locale} />}
      >
        <Button asChild className="h-12 w-full">
          <a href="/forgot">{t.auth.reset.requestNewLinkButton}</a>
        </Button>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title={t.auth.reset.title}
      subtitle={t.auth.reset.subtitle}
      footer={<LanguageToggle current={locale} />}
    >
      <ResetForm
        tokenHash={tokenHash}
        t={t.auth.reset}
        strengthLabels={t.auth.passwordStrength}
      />
    </AuthCard>
  )
}
