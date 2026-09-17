import { MailIcon } from "lucide-react"

import { Button } from "@acadigma/ui/components/button"
import { AuthCard } from "@acadigma/ui/primitives/auth-card"

import { maskEmail } from "@/lib/format"
import { getMessages } from "@/lib/i18n"

import { LanguageToggle } from "../language-toggle"

import { ResendForm } from "./resend-form"

import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Check your email",
}

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; error?: string }>
}) {
  const { email, error } = await searchParams
  const { locale, t } = await getMessages()

  if (error === "link_expired") {
    return (
      <AuthCard
        title={t.auth.verify.linkExpiredTitle}
        subtitle={t.auth.verify.linkExpiredMessage}
        footer={<LanguageToggle current={locale} />}
      >
        {email ? (
          <ResendForm
            email={email}
            t={t.auth.verify}
            network={t.auth.network}
          />
        ) : (
          <Button asChild className="h-12 w-full">
            <a href="/register">{t.auth.verify.requestNewLinkButton}</a>
          </Button>
        )}
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title={t.auth.verify.checkYourEmail}
      footer={<LanguageToggle current={locale} />}
    >
      <div className="flex flex-col items-center gap-4 py-2 text-center">
        <div
          className="bg-muted text-muted-foreground flex size-14 items-center justify-center rounded-full"
          aria-hidden="true"
        >
          <MailIcon className="size-6" />
        </div>
        <p className="text-sm">
          {email
            ? t.auth.verify.maskedEmailMessage.replace(
                "{email}",
                maskEmail(email)
              )
            : t.auth.verify.checkYourEmail}
        </p>
        <p className="text-muted-foreground text-sm">
          {t.auth.verify.instructions}
        </p>
      </div>
      {email ? <ResendForm
            email={email}
            t={t.auth.verify}
            network={t.auth.network}
          /> : null}
    </AuthCard>
  )
}
