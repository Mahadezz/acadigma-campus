import { forbidden } from "next/navigation"

import { can } from "@acadigma/domain/permissions"

import { requireWorkspace } from "@/lib/workspace"

import { getReaderLanguage } from "./actions"
import { AuditViewer } from "./audit-viewer"

import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Audit trail",
}

/**
 * Owner-facing audit viewer (F-ID-09 Parts 1-3), `/app/audit`.
 *
 * A member can resolve a workspace context and still not be allowed to read the
 * trail — an admin, by default (§11 OQ-2: "the log has to be able to record what
 * an admin did without that admin curating it"). `requireWorkspace()` proves
 * membership; the explicit `can()` check here is the SEPARATE permission gate, and
 * both `actions.ts` and the RLS policy on `audit_events` re-check it independently
 * (ARCHITECTURE §3 rule 1 — UI guards are experience only).
 */
export default async function AuditPage() {
  const ctx = await requireWorkspace()
  if (!can(ctx.role, "audit.read")) forbidden()

  const language = await getReaderLanguage()

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">
          {language === "bn" ? "অডিট ট্রেইল" : "Audit trail"}
        </h2>
        <p className="text-muted-foreground text-sm">
          {language === "bn"
            ? "কে কী পরিবর্তন করেছে এবং কখন — সম্পূর্ণ ইতিহাস।"
            : "Who changed what, and when — the complete record."}
        </p>
      </div>
      <AuditViewer language={language} timezone="Asia/Dhaka" />
    </div>
  )
}
