import { forbidden } from "next/navigation"

import { listMembersInputSchema } from "@acadigma/contracts"
import { listCustomLabels, listMembers } from "@acadigma/db"
import { can } from "@acadigma/domain"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"

import { getMessages } from "@/lib/i18n"
import { createClient } from "@/lib/supabase/server"
import { requireShell } from "@/lib/workspace"

import { TeamView } from "./team-view"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Team & access" }

/**
 * F-ID-03 §4.5 / Part 5 (D-110): Team & Access — one server-filtered,
 * keyset-paged page of the staff roster per status, and approve / turn down
 * for join requests. Owner and admin only; the colleague directory is
 * F-OP-06's /app/staff.
 */
export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requireShell("school")
  if (!can(ctx.role, "members.approve")) forbidden()

  const raw = await searchParams
  const text = (key: string) =>
    typeof raw[key] === "string" && raw[key] ? raw[key] : undefined
  const parsed = listMembersInputSchema.safeParse({
    status: text("tab"),
    q: text("q"),
    after: text("after"),
  })
  const input = parsed.success ? parsed.data : { status: "active" as const }

  const { t, locale } = await getMessages()
  const supabase = await createClient()
  const [page, labels] = await Promise.all([
    listMembers(ctx, supabase, input),
    listCustomLabels(ctx, supabase),
  ])

  if (!page.ok && page.error.code !== "not_found") {
    return (
      <div className="mx-auto max-w-5xl">
        <InlineAlert tone="error">{t.team.errors.generic}</InlineAlert>
      </div>
    )
  }

  return (
    <TeamView
      t={t.team}
      locale={locale}
      input={input}
      members={page.ok ? page.data.items : []}
      nextCursor={page.ok ? page.data.nextCursor : null}
      labels={labels.ok ? labels.data : []}
      actorRole={ctx.role}
    />
  )
}
