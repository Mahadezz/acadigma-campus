"use client"

import { useState, useTransition } from "react"

import { useRouter } from "next/navigation"

import type { ExamDetail, TeacherOption } from "@acadigma/contracts"
import { marksEntryWindow } from "@acadigma/domain/academic"
import { Badge } from "@acadigma/ui/components/badge"
import { Button } from "@acadigma/ui/components/button"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"

import type { Messages } from "@/lib/i18n"
import type { Locale } from "@/lib/locale"

import {
  lockExamSubject,
  reopenMarksEntry,
  unlockExamSubject,
} from "../../marks/actions"
import { examDateFormatter } from "../format"

import { ReasonSheet } from "./reason-sheet"

type T = Messages["exams"]

/**
 * F-AC-06 §6 "Marks progress" (Part 4, D-307), for owner/admin: per paper
 * the teacher, marked n/N, and whether it is submitted or locked, with
 * Lock (a submitted paper) and Unlock (with a reason). The completeness
 * gate for publishing (D-304) is unchanged.
 */
export function MarksProgress({
  t,
  locale,
  exam,
  teachers,
  today,
}: {
  t: T
  locale: Locale
  exam: ExamDetail
  teachers: TeacherOption[]
  today: string
}) {
  const fmt = examDateFormatter(locale)
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [unlocking, setUnlocking] = useState<string | null>(null)

  const names = new Map(teachers.map((o) => [o.memberId, o.name]))
  const frozen = exam.status === "published" || exam.status === "archived"
  const submitted = exam.papers.filter(
    (p) => p.status === "submitted" || p.status === "locked"
  ).length
  const locked = exam.papers.filter((p) => p.status === "locked").length
  const subjectOf = (p: ExamDetail["papers"][number]) =>
    `${locale === "bn" && p.subjectNameBn ? p.subjectNameBn : p.subjectName} · ${p.sectionLabel}`
  const target = exam.papers.find((p) => p.id === unlocking)

  function run(action: () => ReturnType<typeof lockExamSubject>, done: string) {
    setError(null)
    setNotice(null)
    startTransition(async () => {
      const result = await action()
      if (!result.ok) {
        setError(result.error.message || t.error)
        return
      }
      setUnlocking(null)
      setNotice(done)
      router.refresh()
    })
  }

  return (
    <section className="space-y-2" aria-labelledby="marks-progress-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="marks-progress-title" className="font-medium">
          {t.progressTitle}
        </h3>
        <p className="text-muted-foreground text-sm tabular-nums">
          {t.progressSummary
            .replace("{submitted}", String(submitted))
            .replace("{total}", String(exam.papers.length))
            .replace("{locked}", String(locked))}
        </p>
      </div>
      {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}
      <p className="text-sm empty:hidden" role="status">
        {notice}
      </p>
      <ul className="divide-y rounded-lg border">
        {exam.papers.map((p) => {
          const closesOn = marksEntryWindow({
            examDate: p.examDate,
            entryOpensOn: p.entryOpensOn,
            entryClosesOn: p.entryClosesOn,
            examEndsOn: exam.endsOn,
          }).closesOn
          const closed =
            closesOn !== null && today > closesOn && p.status !== "locked"
          return (
            <li
              key={p.id}
              className="flex min-h-[72px] flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{subjectOf(p)}</p>
                <p className="text-muted-foreground truncate text-sm">
                  {(p.teacherId && names.get(p.teacherId)) || t.noTeacher}
                  {closesOn ? (
                    <span className="tabular-nums">
                      {" · "}
                      {t.closesOn.replace("{date}", fmt(closesOn))}
                    </span>
                  ) : null}
                </p>
              </div>
              <span className="text-sm tabular-nums">
                {t.marksProgress
                  .replace("{done}", String(p.marksDone))
                  .replace("{total}", String(p.enrolled))}
              </span>
              <Badge variant={p.status === "locked" ? "default" : "outline"}>
                {t.paperStatuses[p.status]}
              </Badge>
              {closed ? <Badge variant="outline">{t.closed}</Badge> : null}
              {closed && !frozen ? (
                <Button
                  variant="outline"
                  className="h-11"
                  disabled={pending}
                  onClick={() =>
                    run(
                      () => reopenMarksEntry({ examSubjectId: p.id }),
                      t.reopenedDone
                    )
                  }
                >
                  {t.reopen}
                  <span className="sr-only"> — {subjectOf(p)}</span>
                </Button>
              ) : null}
              {p.status === "submitted" && !frozen ? (
                <Button
                  variant="outline"
                  className="h-11"
                  disabled={pending}
                  onClick={() =>
                    run(
                      () => lockExamSubject({ examSubjectId: p.id }),
                      t.lockedDone
                    )
                  }
                >
                  {t.lock}
                  <span className="sr-only"> — {subjectOf(p)}</span>
                </Button>
              ) : null}
              {p.status === "locked" && !frozen ? (
                <Button
                  variant="outline"
                  className="h-11"
                  disabled={pending}
                  onClick={() => setUnlocking(p.id)}
                >
                  {t.unlock}
                  <span className="sr-only"> — {subjectOf(p)}</span>
                </Button>
              ) : null}
            </li>
          )
        })}
      </ul>
      {target ? (
        <ReasonSheet
          key={target.id}
          t={t}
          id="paper-unlock-reason"
          open
          onOpenChange={(open) => {
            if (!open) setUnlocking(null)
          }}
          title={t.unlockTitle.replace("{subject}", subjectOf(target))}
          description={t.unlockHelp}
          pending={pending}
          onConfirm={(reason) =>
            run(
              () => unlockExamSubject({ examSubjectId: target.id, reason }),
              t.unlockedDone
            )
          }
        />
      ) : null}
    </section>
  )
}
