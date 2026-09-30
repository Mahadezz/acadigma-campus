import { headers } from "next/headers"
import Link from "next/link"
import { redirect } from "next/navigation"

import { resolveWorkspaceContext } from "@acadigma/db"

import { getMessages } from "@/lib/i18n"
import { LEGAL_DOCUMENTS } from "@/lib/legal/documents"
import { LegalLink } from "@/lib/legal/legal-text"
import { getOutstandingDocuments, legalScopeFor } from "@/lib/legal/outstanding"
import { createClient } from "@/lib/supabase/server"

import { AcceptForm } from "./accept-form"

import type { Metadata } from "next"

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getMessages()
  return { title: t.auth.reaccept.metaTitle }
}

/**
 * D-115: where `requireShell` sends a person who has not accepted the
 * current Terms/Privacy (or, as a school's owner, its DPA). Outside every
 * shell, so it never loops; the legal exits (account deletion and, for an
 * owner, the school export) are linked here and are not gated.
 */
export default async function LegalAcceptancePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const ctx = await resolveWorkspaceContext(supabase, await headers())
  const { ownedSchoolId } = ctx.ok
    ? legalScopeFor(ctx.data)
    : { ownedSchoolId: null }
  const outstanding = await getOutstandingDocuments(user.id, ownedSchoolId)
  if (outstanding.length === 0) redirect("/app")

  const { t } = await getMessages()
  const r = t.auth.reaccept

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{r.title}</h1>
        <p className="text-muted-foreground">{r.lead}</p>
      </div>

      <ul className="divide-y rounded-lg border">
        {outstanding.map((doc) => (
          <li
            key={doc}
            className="flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3"
          >
            <LegalLink href={`/legal/${doc}`}>
              {LEGAL_DOCUMENTS[doc].title}
            </LegalLink>
            <span className="text-muted-foreground text-sm">
              {r.version.replace("{version}", LEGAL_DOCUMENTS[doc].version)}
            </span>
          </li>
        ))}
      </ul>

      {outstanding.includes("dpa") ? (
        <p className="text-sm">{r.dpaNote}</p>
      ) : null}

      <AcceptForm
        versions={Object.fromEntries(
          outstanding.map((doc) => [doc, LEGAL_DOCUMENTS[doc].version])
        )}
        t={{
          ...r,
          termsLabel: t.auth.register.termsLabel,
          termsLink: t.auth.register.termsLink,
          privacyLink: t.auth.register.privacyLink,
          dpaLabel: t.onboarding.wizard.dpaLabel,
          dpaLink: t.onboarding.wizard.dpaLink,
        }}
      />

      <section
        aria-labelledby="legal-exits"
        className="text-muted-foreground space-y-2 border-t pt-4 text-sm"
      >
        <h2 id="legal-exits" className="text-foreground font-medium">
          {r.exitsTitle}
        </h2>
        <p>{r.exitsBody}</p>
        <ul className="flex flex-wrap gap-x-6">
          <li>
            <Link
              href="/account/security#delete-account"
              className="inline-flex min-h-11 items-center underline underline-offset-4"
            >
              {r.deleteAccountLink}
            </Link>
          </li>
          {ownedSchoolId ? (
            <li>
              <a
                href="/api/settings/export"
                download
                className="inline-flex min-h-11 items-center underline underline-offset-4"
              >
                {r.exportLink}
              </a>
            </li>
          ) : null}
        </ul>
      </section>
    </div>
  )
}
