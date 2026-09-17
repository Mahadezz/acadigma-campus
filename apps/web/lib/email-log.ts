import "server-only"

import { withServiceRole } from "@acadigma/db"

/**
 * F-ID-01 Part 2 names "Resend adapter + React Email template, email_log". This PR
 * does not stand up a parallel Resend pipeline for the auth emails: Supabase Auth
 * already sends the signUp-confirmation and password-recovery emails itself (via
 * whatever SMTP the project has configured), and sending a second copy through
 * Resend would double-send to the user. What this module does instead is log a
 * synthetic `email_log` row right after we ask Supabase to send one, so "did the
 * verification email actually go out" is answerable from the same table every
 * other transactional send uses. Swapping Supabase's default templates for a
 * Resend-backed custom domain is a project configuration change, not application
 * code, and is out of scope for this PR (logged in F-ID-01 §11).
 *
 * `withServiceRole` use, reason: `email_log` grants `select` only to
 * `authenticated`; every insert path in the schema is service-role by design.
 */
export type AuthEmailTemplate =
  "auth-verify-email" | "auth-resend-verify-email" | "auth-reset-password"

/**
 * Never throws. This is a best-effort observability side channel, not part of
 * the auth flow's correctness — a missing `SUPABASE_SERVICE_ROLE_KEY` in a
 * given environment, or a transient Postgres error, must not turn a real
 * `signUp`/`resetPasswordForEmail` success into a failed registration or reset
 * for the user.
 */
export async function logAuthEmail(
  toEmail: string,
  template: AuthEmailTemplate,
  subject: string
): Promise<void> {
  try {
    await withServiceRole(
      `auth: record that Supabase Auth was asked to send "${template}"`,
      async (db) => {
        await db.from("email_log").insert({
          to_email: toEmail.toLowerCase(),
          from_email: "no-reply@acadigma.app",
          subject,
          template,
          provider: "supabase-auth",
          status: "queued",
        })
      }
    )
  } catch (error) {
    console.warn(
      JSON.stringify({
        event: "email_log_failed",
        template,
        error: error instanceof Error ? error.message : "unknown error",
      })
    )
  }
}
