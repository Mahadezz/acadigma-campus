"use client"

import type { RosterStudent } from "@acadigma/contracts"
import { BnEnText } from "@acadigma/ui/primitives/bn-en-text"
import { EmptyState } from "@acadigma/ui/primitives/empty-state"

import type { Messages } from "@/lib/i18n"
import type { Locale } from "@/lib/locale"

import { fill } from "./format"

/**
 * F-ID-10 §8 Part 3 — this section's roster (name, roll, Bangla names via
 * `BnEnText`), read-only. Code-split from `class-hub-view.tsx`
 * (`next/dynamic`) since a teacher usually opens Attendance first.
 */
export function StudentsTab({
  t,
  locale,
  students,
}: {
  t: Messages["basicMode"]["classHub"]
  locale: Locale
  students: RosterStudent[]
}) {
  if (students.length === 0) return <EmptyState title={t.students.empty} />
  return (
    <ul className="divide-border divide-y border-y">
      {students.map((student) => {
        const name =
          locale === "bn" && student.fullNameBn
            ? student.fullNameBn
            : student.fullName
        return (
          <li
            key={student.id}
            className="flex min-h-14 items-center gap-3 px-2 py-2"
          >
            <span className="text-muted-foreground w-14 shrink-0 text-right text-sm tabular-nums">
              {student.rollNumber !== null
                ? fill(t.students.roll, { roll: student.rollNumber })
                : "—"}
            </span>
            <BnEnText text={name} className="truncate text-base" />
          </li>
        )
      })}
    </ul>
  )
}
