"use server"

import { redirect } from "next/navigation"

import { apiError, err, type ApiError, type Result } from "@acadigma/contracts"

import { requestLogger } from "@/lib/logger"
import { createClient } from "@/lib/supabase/server"

import { loginSchema, type LoginInput } from "./schema"

/**
 * Only same-origin, absolute paths are accepted as a post-login destination.
 * `//evil.example` and `https://evil.example` both parse as URLs a browser will
 * follow off-site, which is the classic open redirect.
 */
function safeRedirect(next: string | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return "/app/dashboard"
  }
  return next
}

/**
 * Signs a user in with email and password.
 *
 * Returns a `Result` rather than throwing, so the form can render a message
 * (ARCHITECTURE §5). On success it redirects — which in a Server Action works by
 * throwing Next's redirect signal, so that call must stay outside any try/catch.
 */
export async function signInWithPassword(
  input: LoginInput
): Promise<Result<never, ApiError>> {
  const parsed = loginSchema.safeParse(input)
  if (!parsed.success) {
    return err(
      apiError(
        "validation_failed",
        "Check your email and password and try again."
      )
    )
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  })

  if (error) {
    const log = await requestLogger({ route: "auth.login" })
    // Log the reason, show the user a generic message: telling them apart "no such
    // account" from "wrong password" turns the form into an account enumerator.
    log.warn({ status: error.status, code: error.code }, "sign-in rejected")
    return err(
      apiError(
        "unauthenticated",
        "That email and password do not match an account."
      )
    )
  }

  redirect(safeRedirect(parsed.data.next))
}

/** Ends the session and returns to the marketing page. */
export async function signOut(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/")
}
