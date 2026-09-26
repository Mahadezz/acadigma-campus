"use client"

import type { RosterStudent, SectionPrintExam } from "@acadigma/contracts"
import { BnEnText } from "@acadigma/ui/primitives/bn-en-text"
import { EmptyState } from "@acadigma/ui/primitives/empty-state"

import type { Messages } from "@/lib/i18n"
import type { Locale } from "@/lib/locale"

import { GenerateReportCardBulkButton } from "../../reports/generate-report-card-bulk-button"
import { GenerateReportCardButton } from "../../reports/generate-report-card-button"

import { fill } from "./format"

/**
 * F-ID-10 §8 Part 3 — the report cards of "the latest published or computed
 * exam" for this section (§7 `getLatestSectionExam`), reusing F-OP-03's
 * existing single (D-206) and bulk (D-207) print actions and permissions
 * unchanged. Code-split from `class-hub-view.tsx` (`next/dynamic`) — the
 * heaviest tab (pulls in `Button`, per D-405 item 8's Radix-barrel cost),
 * and the one a teacher opens least often.
 */
export function PrintTab({
  t,
  locale,
  sectionId,
  latestExam,
  students,
}: {
  t: Messages
  locale: Locale
  sectionId: string
  latestExam: SectionPrintExam | null
  students: RosterStudent[]
}) {
  const s = t.basicMode.classHub
  if (!latestExam) return <EmptyState title={s.print.empty} />
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">
          {fill(s.print.heading, { examName: latestExam.examName })}
        </h2>
        <GenerateReportCardBulkButton
          t={t.reports}
          sectionId={sectionId}
          examId={latestExam.examId}
          locale={locale}
        />
      </div>
      {students.length === 0 ? (
        <EmptyState title={s.students.empty} />
      ) : (
        <ul className="divide-border divide-y border-y">
          {students.map((student) => {
            const name =
              locale === "bn" && student.fullNameBn
                ? student.fullNameBn
                : student.fullName
            return (
              <li
                key={student.id}
                className="flex min-h-14 items-center justify-between gap-3 px-2 py-2"
              >
                <BnEnText text={name} className="truncate text-base" />
                <GenerateReportCardButton
                  t={t.reports}
                  studentId={student.id}
                  examId={latestExam.examId}
                  locale={locale}
                  studentName={name}
                />
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
