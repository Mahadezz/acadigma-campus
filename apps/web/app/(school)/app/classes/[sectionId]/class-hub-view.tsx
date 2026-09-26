"use client"

import * as React from "react"

import {
  ClipboardCheckIcon,
  NotebookPenIcon,
  PrinterIcon,
  UsersIcon,
} from "lucide-react"

import type { RollCallStudent, RosterStudent, SectionPaper, SectionPrintExam } from "@acadigma/contracts"
import { BnEnText } from "@acadigma/ui/primitives/bn-en-text"
import { EmptyState } from "@acadigma/ui/primitives/empty-state"
import { StatusChip, type ToneStatusChipProps } from "@acadigma/ui/primitives/status-chip"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@acadigma/ui/components/tabs"

import type { Messages } from "@/lib/i18n"
import type { Locale } from "@/lib/locale"

import { GenerateReportCardBulkButton } from "../../reports/generate-report-card-bulk-button"
import { GenerateReportCardButton } from "../../reports/generate-report-card-button"
import { RollCall } from "../../attendance/[sectionId]/roll-call"

import { fill, pluralize } from "./format"

type ClassHubTabId = "attendance" | "marks" | "students" | "print"
const TAB_STORAGE_KEY = (sectionId: string) => `class-hub-tab:${sectionId}`

const PAPER_STATUS_TONE: Record<SectionPaper["status"], ToneStatusChipProps["tone"]> = {
  pending: "neutral",
  entering: "pending",
  submitted: "positive",
  locked: "info",
}

/**
 * F-ID-10 §4.5/§8 Part 3 — the class hub's four tabs, all pre-fetched
 * server-side by `page.tsx` and switched here client-side (no navigation,
 * so tab switching stays under the §5.5 INP budget). The last-used tab is
 * remembered per class in `localStorage` (§4.5, "a convenience only" — a
 * read/write failure there never blocks rendering).
 */
export function ClassHubView({
  t,
  locale,
  sectionId,
  title,
  studentCount,
  attendance,
  papers,
  students,
  latestExam,
}: {
  t: Messages
  locale: Locale
  sectionId: string
  title: string
  studentCount: number
  attendance: {
    date: string
    dateLabel: string
    isSchoolDay: boolean
    students: RollCallStudent[]
    sessionUpdatedAt: string | null
    readOnlyReason: "cannotMark" | "window" | null
  } | null
  papers: SectionPaper[]
  students: RosterStudent[]
  latestExam: SectionPrintExam | null
}) {
  const s = t.basicMode.classHub
  const [tab, setTab] = React.useState<ClassHubTabId>("attendance")

  React.useEffect(() => {
    try {
      const stored = window.localStorage.getItem(TAB_STORAGE_KEY(sectionId))
      if (stored === "attendance" || stored === "marks" || stored === "students" || stored === "print") {
        setTab(stored)
      }
    } catch {
      // localStorage unavailable (private browsing, etc.) — default stands.
    }
  }, [sectionId])

  function changeTab(next: string) {
    setTab(next as ClassHubTabId)
    try {
      window.localStorage.setItem(TAB_STORAGE_KEY(sectionId), next)
    } catch {
      // Best-effort convenience only — never blocks the tab switch.
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">
          <BnEnText text={title} />
        </h1>
        <p className="text-muted-foreground text-base">
          {pluralize(studentCount, s.studentCountOne, s.studentCountOther)}
        </p>
      </header>

      <Tabs value={tab} onValueChange={changeTab}>
        <TabsList className="bg-muted grid h-auto w-full grid-cols-4 gap-1 p-1">
          <TabsTrigger
            value="attendance"
            className="flex min-h-14 flex-col gap-1 py-2 text-sm data-[state=active]:shadow-sm"
          >
            <ClipboardCheckIcon className="size-7" aria-hidden="true" />
            {s.tabs.attendance}
          </TabsTrigger>
          <TabsTrigger
            value="marks"
            className="flex min-h-14 flex-col gap-1 py-2 text-sm data-[state=active]:shadow-sm"
          >
            <NotebookPenIcon className="size-7" aria-hidden="true" />
            {s.tabs.marks}
          </TabsTrigger>
          <TabsTrigger
            value="students"
            className="flex min-h-14 flex-col gap-1 py-2 text-sm data-[state=active]:shadow-sm"
          >
            <UsersIcon className="size-7" aria-hidden="true" />
            {s.tabs.students}
          </TabsTrigger>
          <TabsTrigger
            value="print"
            className="flex min-h-14 flex-col gap-1 py-2 text-sm data-[state=active]:shadow-sm"
          >
            <PrinterIcon className="size-7" aria-hidden="true" />
            {s.tabs.print}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="attendance" className="pt-2">
          {attendance ? (
            <RollCall
              t={t.attendance.roll}
              locale={locale}
              sectionId={sectionId}
              title={title}
              date={attendance.date}
              dateLabel={attendance.dateLabel}
              isSchoolDay={attendance.isSchoolDay}
              students={attendance.students}
              sessionUpdatedAt={attendance.sessionUpdatedAt}
              readOnlyReason={attendance.readOnlyReason}
              basic
              basicCopy={{
                confirmTemplate: s.attendance.confirmTemplate,
                yesSave: s.attendance.yesSave,
                goBack: s.attendance.goBack,
                undoToast: s.attendance.undoToast,
                undo: s.attendance.undo,
                undone: s.attendance.undone,
              }}
            />
          ) : (
            <EmptyState title={t.classes.errors.generic} />
          )}
        </TabsContent>

        <TabsContent value="marks" className="pt-2">
          {papers.length === 0 ? (
            <EmptyState title={s.marks.empty} />
          ) : (
            <ul className="divide-border divide-y border-y">
              {papers.map((paper) => (
                <li key={paper.examSubjectId}>
                  <a
                    href={`/app/marks/${paper.examSubjectId}`}
                    className="hover:bg-muted/50 flex min-h-16 flex-col justify-center gap-1 px-2 py-3"
                  >
                    <span className="flex items-center justify-between gap-2 text-base font-medium">
                      <BnEnText
                        text={
                          locale === "bn" && paper.subjectNameBn
                            ? paper.subjectNameBn
                            : paper.subjectName
                        }
                      />
                      <StatusChip tone={PAPER_STATUS_TONE[paper.status]}>
                        {paper.status === "pending"
                          ? s.marks.statusPending
                          : paper.status === "entering"
                            ? s.marks.statusEntering
                            : paper.status === "submitted"
                              ? s.marks.statusSubmitted
                              : s.marks.statusLocked}
                      </StatusChip>
                    </span>
                    <span className="text-muted-foreground text-sm">
                      {paper.examName} ·{" "}
                      {fill(s.marks.entered, {
                        done: paper.marksDone,
                        total: paper.enrolled,
                      })}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="students" className="pt-2">
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
                    className="flex min-h-14 items-center gap-3 px-2 py-2"
                  >
                    <span className="text-muted-foreground w-14 shrink-0 text-right text-sm tabular-nums">
                      {student.rollNumber !== null
                        ? fill(s.students.roll, { roll: student.rollNumber })
                        : "—"}
                    </span>
                    <BnEnText text={name} className="truncate text-base" />
                  </li>
                )
              })}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="print" className="pt-2 space-y-4">
          {!latestExam ? (
            <EmptyState title={s.print.empty} />
          ) : (
            <>
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
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
