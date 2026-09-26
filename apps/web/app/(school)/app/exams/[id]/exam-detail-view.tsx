"use client"

import { useState, useTransition } from "react"

import Link from "next/link"
import { useRouter } from "next/navigation"

import { ChevronLeftIcon } from "lucide-react"

import type {
  ExamDetail,
  ExamPaper,
  PublishCandidate,
  TeacherOption,
} from "@acadigma/contracts"
import {
  nextExamStatus,
  papersLocked,
  reversalFrom,
} from "@acadigma/domain/academic"
import { Badge } from "@acadigma/ui/components/badge"
import { Button } from "@acadigma/ui/components/button"
import { Input } from "@acadigma/ui/components/input"
import { Label } from "@acadigma/ui/components/label"
import {
  NativeSelect,
  NativeSelectOption,
} from "@acadigma/ui/components/native-select"
import { Textarea } from "@acadigma/ui/components/textarea"
import { FormSheet } from "@acadigma/ui/primitives/form-sheet"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"

import type { Messages } from "@/lib/i18n"
import type { Locale } from "@/lib/locale"

import {
  computeResults,
  publishResults,
  setExamStatus,
  updateExamSubject,
} from "../actions"
import { dateRange, examDateFormatter } from "../format"

import { PublishSheet } from "./publish-sheet"

type T = Messages["exams"]

/**
 * Status actions are explicit and labelled per step (§5.12 — no single
 * "advance" button); the two reversals ask for a reason.
 */
export function ExamDetailView({
  t,
  locale,
  exam,
  canWrite,
  canCompute,
  canReadResults,
  publishCandidates,
  teachers,
}: {
  t: T
  locale: Locale
  exam: ExamDetail
  canWrite: boolean
  /** results.compute (owner/admin). */
  canCompute: boolean
  /** results.read; RLS narrows a teacher to their own class. */
  canReadResults: boolean
  /** results.publish on a marks_locked exam: the publish sheet's students
   * (D-306). Null otherwise: "Publish" then moves the status directly. */
  publishCandidates: PublishCandidate[] | null
  teachers: TeacherOption[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [reversing, setReversing] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const next = nextExamStatus(exam.status)
  const back = reversalFrom(exam.status)
  const fmt = examDateFormatter(locale)
  const locked = papersLocked(exam.status)

  function move(status: string, reason?: string) {
    setError(null)
    startTransition(async () => {
      const result = await setExamStatus({ examId: exam.id, status, reason })
      if (!result.ok) {
        setError(
          result.error.fieldErrors?._root?.[0] === "MARKS_INCOMPLETE"
            ? t.publishBlocked
            : result.error.message || t.error
        )
        return
      }
      setReversing(false)
      router.refresh()
    })
  }

  function publish(withhold: { studentId: string; reason: string }[]) {
    setError(null)
    setNotice(null)
    startTransition(async () => {
      const result = await publishResults({ examId: exam.id, withhold })
      if (!result.ok) {
        setPublishing(false)
        setError(result.error.message || t.error)
        return
      }
      setPublishing(false)
      setNotice(
        t.publish.done
          .replace("{n}", String(result.data.published))
          .replace("{withheld}", String(result.data.withheld))
      )
      router.refresh()
    })
  }

  function compute() {
    setError(null)
    setNotice(null)
    startTransition(async () => {
      const result = await computeResults({ examId: exam.id })
      if (!result.ok) {
        setError(result.error.message || t.error)
        return
      }
      setNotice(
        t.computed
          .replace("{n}", String(result.data.computed))
          .replace("{passed}", String(result.data.passed))
          .replace("{failed}", String(result.data.failed))
          .replace("{incomplete}", String(result.data.incomplete))
      )
      router.refresh()
    })
  }

  const sections = [...new Set(exam.papers.map((p) => p.sectionLabel))]
  const resultsVisible =
    canReadResults &&
    ["marks_locked", "published", "archived"].includes(exam.status)

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link
        href="/app/exams"
        className="text-muted-foreground inline-flex min-h-11 items-center gap-1 text-sm"
      >
        <ChevronLeftIcon className="size-4" aria-hidden /> {t.back}
      </Link>

      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold tracking-tight">{exam.name}</h2>
          <Badge variant="outline">{t.statuses[exam.status]}</Badge>
        </div>
        <p className="text-muted-foreground text-sm">
          {[t.types[exam.examType], dateRange(fmt, exam.startsOn, exam.endsOn)]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {exam.gradeScaleName ? (
          <p className="text-muted-foreground text-sm">
            {t.grading
              .replace("{scale}", exam.gradeScaleName)
              .replace("{pass}", String(exam.passMarkPercent ?? ""))}
          </p>
        ) : null}
        {exam.statusReason ? (
          <p className="text-muted-foreground text-sm">
            {t.lastReason.replace("{reason}", exam.statusReason)}
          </p>
        ) : null}
      </div>

      {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}
      <p className="text-sm empty:hidden" role="status">
        {notice}
      </p>

      {resultsVisible ? (
        <div className="flex flex-wrap gap-2">
          {canCompute && exam.status === "marks_locked" ? (
            <Button className="h-11" disabled={pending} onClick={compute}>
              {pending ? t.computing : t.computeResults}
            </Button>
          ) : null}
          <Button asChild variant="outline" className="h-11">
            <Link href={`/app/exams/${exam.id}/results`}>{t.viewResults}</Link>
          </Button>
        </div>
      ) : null}

      {canWrite && (next || back) ? (
        <div className="flex flex-wrap gap-2">
          {next ? (
            <Button
              className="h-11"
              disabled={pending}
              onClick={() =>
                next === "published" && publishCandidates
                  ? setPublishing(true)
                  : move(next)
              }
            >
              {t.advance[next as keyof T["advance"]]}
            </Button>
          ) : null}
          {back ? (
            <Button
              variant="outline"
              className="h-11"
              disabled={pending}
              onClick={() => setReversing(true)}
            >
              {t.reverse[back as keyof T["reverse"]]}
            </Button>
          ) : null}
        </div>
      ) : null}

      {publishCandidates ? (
        <PublishSheet
          t={t}
          open={publishing}
          onOpenChange={setPublishing}
          candidates={publishCandidates}
          pending={pending}
          onConfirm={publish}
        />
      ) : null}

      {back ? (
        <ReverseSheet
          t={t}
          open={reversing}
          onOpenChange={setReversing}
          title={t.reverse[back as keyof T["reverse"]]}
          pending={pending}
          onConfirm={(reason) => move(back, reason)}
        />
      ) : null}

      {sections.map((label) => (
        <section key={label} className="space-y-2">
          <h3 className="font-medium">{label}</h3>
          <ul className="divide-y rounded-lg border">
            {exam.papers
              .filter((p) => p.sectionLabel === label)
              .map((paper) => (
                <PaperRow
                  key={paper.id}
                  t={t}
                  paper={paper}
                  canWrite={canWrite}
                  locked={locked}
                  marksOpen={exam.status === "marks_entry"}
                  marksVisible={locked}
                  teachers={teachers}
                  subjectName={
                    locale === "bn" && paper.subjectNameBn
                      ? paper.subjectNameBn
                      : paper.subjectName
                  }
                  fmt={fmt}
                />
              ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function ReverseSheet({
  t,
  open,
  onOpenChange,
  title,
  pending,
  onConfirm,
}: {
  t: T
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  pending: boolean
  onConfirm: (reason: string) => void
}) {
  const [reason, setReason] = useState("")
  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={t.reasonHelp}
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            className="h-11"
            onClick={() => onOpenChange(false)}
          >
            {t.cancel}
          </Button>
          <Button
            type="button"
            className="h-11"
            disabled={pending || reason.trim() === ""}
            onClick={() => onConfirm(reason.trim())}
          >
            {t.confirm}
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        <Label htmlFor="exam-reverse-reason">{t.reason}</Label>
        <Textarea
          id="exam-reverse-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={500}
        />
      </div>
    </FormSheet>
  )
}

function PaperRow({
  t,
  paper,
  canWrite,
  locked,
  marksOpen,
  marksVisible,
  teachers,
  subjectName,
  fmt,
}: {
  t: T
  paper: ExamPaper
  canWrite: boolean
  /** The exam is in marks entry: the paper's marks can be entered. */
  marksOpen: boolean
  /** Marks entry has opened (now or earlier): the marks can be viewed. */
  marksVisible: boolean
  teachers: TeacherOption[]
  /** From marks_entry on, full/pass marks are locked; the date still moves. */
  locked: boolean
  subjectName: string
  fmt: (iso: string) => string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [date, setDate] = useState(paper.examDate ?? "")
  const [full, setFull] = useState(String(paper.fullMarks))
  const [pass, setPass] = useState(String(paper.passMarks))
  const [teacher, setTeacher] = useState(paper.teacherId ?? "")
  const [notice, setNotice] = useState<string | null>(null)
  const dirty =
    teacher !== (paper.teacherId ?? "") ||
    date !== (paper.examDate ?? "") ||
    full !== String(paper.fullMarks) ||
    pass !== String(paper.passMarks)
  const id = `paper-${paper.id}`

  const marksLink = marksVisible ? (
    <Button
      asChild
      variant={marksOpen ? "default" : "outline"}
      className="h-11"
    >
      <Link href={`/app/marks/${paper.id}`}>
        {marksOpen ? t.enterMarks : t.viewMarks}
        <span className="sr-only"> — {subjectName}</span>
      </Link>
    </Button>
  ) : null

  if (!canWrite) {
    return (
      <li className="flex min-h-14 flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
        <span className="font-medium">{subjectName}</span>
        <span className="text-muted-foreground">
          {paper.examDate ? fmt(paper.examDate) : "—"} · {paper.passMarks}/
          {paper.fullMarks}
        </span>
        {marksLink}
      </li>
    )
  }

  return (
    <li className="space-y-2 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">{subjectName}</p>
        {marksVisible ? (
          <span className="text-muted-foreground text-sm tabular-nums">
            {t.marksProgress
              .replace("{done}", String(paper.marksDone))
              .replace("{total}", String(paper.enrolled))}
          </span>
        ) : null}
        {marksLink}
      </div>
      <form
        className="grid grid-cols-3 items-end gap-2 sm:grid-cols-[1fr_6rem_6rem_auto]"
        onSubmit={(event) => {
          event.preventDefault()
          setNotice(null)
          startTransition(async () => {
            const result = await updateExamSubject({
              id: paper.id,
              examDate: date || null,
              fullMarks: Number(full),
              passMarks: Number(pass),
              teacherId: teacher || null,
            })
            setNotice(result.ok ? t.saved : result.error.message || t.error)
            if (result.ok) router.refresh()
          })
        }}
      >
        <div className="col-span-3 space-y-1 sm:col-span-4">
          <Label htmlFor={`${id}-teacher`}>{t.teacher}</Label>
          <NativeSelect
            id={`${id}-teacher`}
            value={teacher}
            onChange={(e) => setTeacher(e.target.value)}
            className="min-h-11"
          >
            <NativeSelectOption value="">{t.noTeacher}</NativeSelectOption>
            {teachers.map((option) => (
              <NativeSelectOption key={option.memberId} value={option.memberId}>
                {option.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="col-span-3 space-y-1 sm:col-span-1">
          <Label htmlFor={`${id}-date`}>{t.examDate}</Label>
          <Input
            id={`${id}-date`}
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-11"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${id}-full`}>{t.fullMarks}</Label>
          <Input
            id={`${id}-full`}
            inputMode="decimal"
            value={full}
            onChange={(e) => setFull(e.target.value)}
            disabled={locked}
            className="h-11"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${id}-pass`}>{t.passMarks}</Label>
          <Input
            id={`${id}-pass`}
            inputMode="decimal"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            disabled={locked}
            className="h-11"
          />
        </div>
        <Button
          type="submit"
          variant="outline"
          className="h-11"
          disabled={pending || !dirty}
        >
          {pending ? t.saving : t.save}
        </Button>
      </form>
      {notice ? (
        <p className="text-muted-foreground text-sm" aria-live="polite">
          {notice}
        </p>
      ) : null}
    </li>
  )
}
