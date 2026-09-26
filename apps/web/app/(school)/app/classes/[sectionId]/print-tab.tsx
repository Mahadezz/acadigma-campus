"use client"

import type { RosterStudent, SectionPrintExam } from "@acadigma/contracts"
import { BnEnText } from "@acadigma/ui/primitives/bn-en-text"
import { EmptyState } from "@acadigma/ui/primitives/empty-state"

import type { Messages } from "@/lib/i18n"
import type { Locale } from "@/lib/locale"

import { GenerateAttendanceRegisterButton } from "../../reports/generate-attendance-register-button"
import { GenerateMarkSheetButton } from "../../reports/generate-mark-sheet-button"
import { GenerateReportCardBulkButton } from "../../reports/generate-report-card-bulk-button"
import { GenerateReportCardButton } from "../../reports/generate-report-card-button"

import { fill } from "./format"

/**
 * F-ID-10 §4.5/§8 Part 3 — "Print attendance register", "Print mark sheet"
 * for this class: this month's register (always available) and the mark
 * sheet plus report cards of "the latest published or computed exam" (§7
 * `getLatestSectionExam`), once one exists. Reuses F-OP-03's existing print
 * actions and permissions unchanged — register/mark sheet (D-208, Part 6,
 * merged #76), report cards (D-206/D-207). Every button is already
 * `OnlineOnly`-wrapped inside its own component (F-ID-11 §4.9, D-308).
 * Code-split from `class-hub-view.tsx` (`next/dynamic`) — the heaviest tab
 * (pulls in `Button`, per D-405 item 8's Radix-barrel cost), and the one a
 * teacher opens least often.
 */
export function PrintTab({
  t,
  locale,
  sectionId,
  month,
  latestExam,
  students,
}: {
  t: {
    classHub: Messages["basicMode"]["classHub"]
    reports: Messages["reports"]
  }
  locale: Locale
  sectionId: string
  /** `YYYY-MM`, this month — `null` when today's date could not be read. */
  month: string | null
  latestExam: SectionPrintExam | null
  students: RosterStudent[]
}) {
  const s = t.classHub
  return (
    <div className="space-y-4">
      {month ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold">{s.print.registerHeading}</h2>
          <GenerateAttendanceRegisterButton
            t={t.reports}
            sectionId={sectionId}
            month={month}
            locale={locale}
          />
        </div>
      ) : null}

      {latestExam ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold">
              {fill(s.print.heading, { examName: latestExam.examName })}
            </h2>
            <div className="flex flex-wrap gap-2">
              <GenerateMarkSheetButton
                t={t.reports}
                sectionId={sectionId}
                examId={latestExam.examId}
                locale={locale}
              />
              <GenerateReportCardBulkButton
                t={t.reports}
                sectionId={sectionId}
                examId={latestExam.examId}
                locale={locale}
              />
            </div>
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
        </>
      ) : (
        <EmptyState title={s.print.empty} />
      )}
    </div>
  )
}
