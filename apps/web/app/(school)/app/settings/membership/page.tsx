import { getWorkspaceName, listOwnershipCandidates } from "@acadigma/db"
import { can } from "@acadigma/domain"

import { getMessages } from "@/lib/i18n"
import { createClient } from "@/lib/supabase/server"
import { requireShell } from "@/lib/workspace"

import { SubPageHeader } from "../sub-page-header"

import { MembershipView } from "./membership-view"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Your membership" }

/**
 * F-ID-03 Part 7 (D-112): every member's own place in the school — leave it
 * (§4.6) and, for an owner, hand ownership over (§4.7). Reached from "How
 * this school works" (every role) and from an owner's row on Team & access.
 */
export default async function MembershipPage() {
  const ctx = await requireShell("school")
  const { t } = await getMessages()
  const supabase = await createClient()
  const canTransfer = can(ctx.role, "workspace.ownership.transfer")
  const [name, candidates] = await Promise.all([
    getWorkspaceName(ctx, supabase),
    canTransfer ? listOwnershipCandidates(ctx, supabase) : null,
  ])

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <SubPageHeader
        backLabel={t.settings.back}
        title={t.settings.membership.title}
        description={t.settings.membership.description}
      />
      <MembershipView
        t={t.settings.membership}
        roles={t.team.roles}
        capabilities={t.team.manage.capabilities}
        role={ctx.role}
        schoolName={name.ok ? name.data : ""}
        candidates={candidates?.ok ? candidates.data : null}
        candidatesFailed={candidates !== null && !candidates.ok}
      />
    </div>
  )
}
