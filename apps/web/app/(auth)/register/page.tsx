import { redirect } from "next/navigation"

import { AuthCard } from "@acadigma/ui/primitives/auth-card"

import { getMessages } from "@/lib/i18n"
import { createClient } from "@/lib/supabase/server"

import { LanguageToggle } from "../language-toggle"

import { RegisterForm } from "./register-form"

import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Create an account",
}

export default async function RegisterPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) redirect("/app/dashboard")

  const { locale, t } = await getMessages()

  return (
    <AuthCard
      title={t.auth.register.title}
      subtitle={t.auth.register.subtitle}
      footer={
        <>
          <a href="/login" className="block text-center">
            {t.auth.register.alreadyHaveAccount}
          </a>
          <LanguageToggle current={locale} />
        </>
      }
    >
      <RegisterForm
        t={{ ...t.auth.register, strength: t.auth.passwordStrength }}
        network={t.auth.network}
      />
    </AuthCard>
  )
}
