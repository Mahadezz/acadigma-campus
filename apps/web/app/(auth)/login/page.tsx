import { redirect } from "next/navigation"

import { AuthCard } from "@acadigma/ui/primitives/auth-card"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"

import { getMessages } from "@/lib/i18n"
import { createClient } from "@/lib/supabase/server"

import { LanguageToggle } from "../language-toggle"

import { LoginForm } from "./login-form"

import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Sign in",
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>
}) {
  const { next, error } = await searchParams

  // Already signed in? Skip the form. getUser() re-validates with the auth server,
  // unlike getSession(), which only reads the cookie.
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) redirect("/app/dashboard")

  const { locale, t } = await getMessages()

  return (
    <AuthCard
      title={t.auth.login.title}
      subtitle={t.auth.login.subtitle}
      footer={
        <>
          <a href="/register" className="block text-center">
            {t.auth.login.createAccountLink}
          </a>
          <LanguageToggle current={locale} />
        </>
      }
    >
      {error === "link_expired" ? (
        <div className="mb-4">
          <InlineAlert tone="error">
            {t.auth.login.linkExpiredBanner}
          </InlineAlert>
        </div>
      ) : null}
      <LoginForm t={t.auth.login} next={next} />
    </AuthCard>
  )
}
