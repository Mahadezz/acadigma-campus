import Link from "next/link"
import { forbidden, notFound } from "next/navigation"

import { ArrowLeftIcon, PhoneIcon } from "lucide-react"

import { uuidSchema } from "@acadigma/contracts"
import { getStaffDirectoryRow, listSubjects } from "@acadigma/db/repositories"
import { can } from "@acadigma/domain/permissions"
import { Avatar, AvatarFallback } from "@acadigma/ui/components/avatar"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"
import { StatusChip } from "@acadigma/ui/primitives/status-chip"

import { getMessages } from "@/lib/i18n"
import { createClient } from "@/lib/supabase/server"
import { requireShell } from "@/lib/workspace"

import { statusTone } from "../format"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Staff" }

/**
 * F-OP-06 Part 2 — the person sheet, `/app/staff/[id]` (`id` is
 * `workspace_members.id`, not `staff_records.id` — every active non-parent
 * member has one of these; not every one yet has a staff record, D-209).
 *
 * Read-only directory-safe fields only. The record editor (identity,
 * employment, compensation, documents) is Part 3 — not built here.
 */
export default async function StaffProfilePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const ctx = await requireShell("school")
  if (!can(ctx.role, "staff.view")) forbidden()

  const { id } = await params
  if (!uuidSchema.safeParse(id).success) notFound()

  const { t } = await getMessages()
  const supabase = await createClient()

  const [rowResult, subjectsResult] = await Promise.all([
    getStaffDirectoryRow(supabase, ctx, id),
    listSubjects(supabase, ctx),
  ])

  if (!rowResult.ok) {
    if (rowResult.error.code === "not_found") notFound()
    return (
      <div className="mx-auto max-w-2xl">
        <InlineAlert tone="error">{t.staff.errorGeneric}</InlineAlert>
      </div>
    )
  }

  const row = rowResult.data
  const subjectNames = subjectsResult.ok
    ? new Map(subjectsResult.data.map((s) => [s.id, s.name]))
    : new Map<string, string>()
  const subjects = row.subjectIds
    .map((subjectId) => subjectNames.get(subjectId))
    .filter((name): name is string => Boolean(name))
  const isSelf = row.userId === ctx.userId

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link
        href="/app/staff"
        className="text-muted-foreground inline-flex min-h-11 items-center gap-1 text-sm underline-offset-4 hover:underline"
      >
        <ArrowLeftIcon aria-hidden="true" className="size-4" />
        {t.staff.profile.backToDirectory}
      </Link>

      <div className="flex items-center gap-3">
        <Avatar className="size-14">
          <AvatarFallback className="text-lg">
            {row.fullName.slice(0, 1).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div>
          <h1 className="text-xl font-bold tracking-tight">
            {row.fullName}
            {isSelf ? (
              <span className="text-muted-foreground ml-2 text-sm font-normal">
                ({t.staff.you})
              </span>
            ) : null}
          </h1>
          <p className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-sm">
            <span>
              {row.designationLabel ?? t.staff.roles[row.baseRole ?? "staff"]}
            </span>
            {row.designationLabel ? (
              <StatusChip tone="neutral">
                {t.staff.roles[row.baseRole ?? "staff"]}
              </StatusChip>
            ) : null}
            <StatusChip tone={statusTone(row.employmentStatus)}>
              {t.staff.status[row.employmentStatus]}
            </StatusChip>
          </p>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        {row.department ? (
          <div>
            <dt className="text-muted-foreground text-xs">
              {t.staff.profile.department}
            </dt>
            <dd>{row.department}</dd>
          </div>
        ) : null}
        {row.staffCode ? (
          <div>
            <dt className="text-muted-foreground text-xs">
              {t.staff.profile.staffCode}
            </dt>
            <dd className="tabular-nums">{row.staffCode}</dd>
          </div>
        ) : null}
        {row.workEmail ? (
          <div>
            <dt className="text-muted-foreground text-xs">
              {t.staff.profile.workEmail}
            </dt>
            <dd className="break-all">{row.workEmail}</dd>
          </div>
        ) : null}
        {row.workPhone ? (
          <div>
            <dt className="text-muted-foreground text-xs">
              {t.staff.profile.workPhone}
            </dt>
            <dd>{row.workPhone}</dd>
          </div>
        ) : null}
        {row.joinedOn ? (
          <div>
            <dt className="text-muted-foreground text-xs">
              {t.staff.profile.joined}
            </dt>
            <dd>{row.joinedOn}</dd>
          </div>
        ) : null}
        {subjects.length > 0 ? (
          <div className="col-span-2">
            <dt className="text-muted-foreground text-xs">
              {t.staff.profile.subjects}
            </dt>
            <dd>{subjects.join(", ")}</dd>
          </div>
        ) : null}
      </dl>

      {/* A plain <a>, not <Button asChild>: this page has no other client
          boundary, and pulling in Button's Slot (radix-ui) here made it the
          route tipping a shared-chunk split that bundled several unrelated
          Radix primitives (Tabs/Popover/Select/Dialog/Toast, ~65 kB gzipped)
          — 275 kB first-load JS, over the 250 kB budget
          (scripts/check-bundle-budget.mjs). Styled to match the outline
          Button variant exactly. */}
      {row.workPhone ? (
        <a
          href={`tel:${row.workPhone}`}
          className="border-input inline-flex h-11 w-full items-center justify-center gap-2 rounded-md border bg-transparent px-4 text-sm font-medium shadow-xs hover:bg-accent hover:text-accent-foreground sm:w-auto"
        >
          <PhoneIcon aria-hidden="true" className="size-4" />
          {t.staff.profile.call}
        </a>
      ) : null}

      {row.id === null ? (
        <InlineAlert tone="info">{t.staff.profile.noRecordYet}</InlineAlert>
      ) : null}
    </div>
  )
}
