"use client"

import Link from "next/link"

import type { RosterStudent } from "@acadigma/contracts"
import { BnEnText } from "@acadigma/ui/primitives/bn-en-text"
import { EmptyState } from "@acadigma/ui/primitives/empty-state"

import type { Messages } from "@/lib/i18n"
import type { Locale } from "@/lib/locale"

import { fill } from "../../home/format"

/**
 * F-ID-10 §4.5/§8 Part 3 — this section's roster (name, roll, Bangla names
 * via `BnEnText`); a row opens the student's profile, read-only in the
 * basic shell (`/app/students/[id]` has no edit control today — see
 * `student-profile.tsx` — and the whole `/app` shell already switches to
 * `BasicShell` in basic mode, D-405 item 2, not only `/app/home`). Code-split
 * from `class-hub-view.tsx` (`next/dynamic`) since a teacher usually opens
 * Attendance first.
 */
export function StudentsTab({
  t,
  locale,
  students,
  hasMore,
  sectionId,
  totalCount,
}: {
  t: Messages["basicMode"]["classHub"]
  locale: Locale
  students: RosterStudent[]
  /** MEDIUM 1 review fix: `listRoster` returns one page — this class's own
   * "See all N" link when a section outgrows it, instead of silently
   * cutting it off while the header above still shows the full count. */
  hasMore: boolean
  sectionId: string
  totalCount: number
}) {
  if (students.length === 0) return <EmptyState title={t.students.empty} />
  return (
    <>
      <ul className="divide-border divide-y border-y">
        {students.map((student) => {
          const name =
            locale === "bn" && student.fullNameBn
              ? student.fullNameBn
              : student.fullName
          return (
            <li key={student.id}>
              <Link
                href={`/app/students/${student.id}`}
                className="hover:bg-muted/50 flex min-h-14 items-center gap-3 px-2 py-2"
              >
                <span className="text-muted-foreground w-14 shrink-0 text-right text-sm tabular-nums">
                  {student.rollNumber !== null
                    ? fill(t.students.roll, { roll: student.rollNumber })
                    : "—"}
                </span>
                <BnEnText text={name} className="truncate text-base" />
              </Link>
            </li>
          )
        })}
      </ul>
      {hasMore ? (
        <Link
          href={`/app/students?section=${sectionId}`}
          className="text-primary flex min-h-11 items-center justify-center text-sm font-medium underline-offset-4 hover:underline"
        >
          {fill(t.students.seeAll, { count: totalCount })}
        </Link>
      ) : null}
    </>
  )
}
