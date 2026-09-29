import { forbidden } from "next/navigation"

import { can } from "@acadigma/domain/permissions"

import { getMessages } from "@/lib/i18n"
import { requireShell } from "@/lib/workspace"

import { StaffDirectory } from "./staff-view"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Staff" }

/**
 * F-OP-06 Part 2 — the staff directory, `/app/staff`. Every active
 * non-parent member of the school (spec §2 `staff.view`: owner, admin,
 * teacher, staff — never a parent).
 */
export default async function StaffPage() {
  const ctx = await requireShell("school")
  if (!can(ctx.role, "staff.view")) forbidden()

  const { t } = await getMessages()

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <h1 className="text-xl font-bold tracking-tight">{t.staff.title}</h1>
      <StaffDirectory t={t.staff} currentUserId={ctx.userId} />
    </div>
  )
}
