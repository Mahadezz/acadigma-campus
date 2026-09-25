"use client"

import { useState, useTransition } from "react"

import Link from "next/link"
import { useRouter } from "next/navigation"

import { ChevronLeftIcon } from "lucide-react"

import type { ExamDetail, ExamPaper } from "@acadigma/contracts"
import { nextExamStatus, reversalFrom } from "@acadigma/domain/academic"
import { Badge } from "@acadigma/ui/components/badge"
import { Button } from "@acadigma/ui/components/button"
import { Input } from "@acadigma/ui/components/input"
import { Label } from "@acadigma/ui/components/label"
import { Textarea } from "@acadigma/ui/components/textarea"
import { FormSheet } from "@acadigma/ui/primitives/form-sheet"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"

import type { Messages } from "@/lib/i18n"

import { setExamStatus, updateExamSubject } from "../actions"

type T = Messages["exams"]

/**
 * Status actions are explicit and labelled per step (§5.12 — no single
 * "advance" button); the two reversals ask for a reason.
 */
export function ExamDetailView({
  t,
  exam,
  canWrite,
}: {
  t: T
  exam: ExamDetail
  canWrite: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [reversing, setReversing] = useState(false)
  const next = nextExamStatus(exam.status)
  const back = reversalFrom(exam.status)

  function move(status: string, reason?: string) {
    setError(null)
    startTransition(async () => {
      const result = await setExamStatus({ examId: exam.id, status, reason })
      if (!result.ok) {
        setError(result.error.message || t.error)
        return
      }
      setReversing(false)
      router.refresh()
    })
  }

  const sections = [...new Set(exam.papers.map((p) => p.sectionLabel))]

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
          {t.types[exam.examType]}
          {exam.startsOn ? ` · ${exam.startsOn}` : ""}
          {exam.endsOn ? ` – ${exam.endsOn}` : ""}
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

      {canWrite && (next || back) ? (
        <div className="flex flex-wrap gap-2">
          {next ? (
            <Button
              className="h-11"
              disabled={pending}
              onClick={() => move(next)}
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
}: {
  t: T
  paper: ExamPaper
  canWrite: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [date, setDate] = useState(paper.examDate ?? "")
  const [full, setFull] = useState(String(paper.fullMarks))
  const [pass, setPass] = useState(String(paper.passMarks))
  const [notice, setNotice] = useState<string | null>(null)
  const dirty =
    date !== (paper.examDate ?? "") ||
    full !== String(paper.fullMarks) ||
    pass !== String(paper.passMarks)
  const id = `paper-${paper.id}`

  if (!canWrite) {
    return (
      <li className="flex min-h-14 items-center justify-between gap-3 px-4 py-3 text-sm">
        <span className="font-medium">{paper.subjectName}</span>
        <span className="text-muted-foreground">
          {paper.examDate ?? "—"} · {paper.passMarks}/{paper.fullMarks}
        </span>
      </li>
    )
  }

  return (
    <li className="space-y-2 px-4 py-3">
      <p className="font-medium">{paper.subjectName}</p>
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
            })
            setNotice(result.ok ? t.saved : result.error.message || t.error)
            if (result.ok) router.refresh()
          })
        }}
      >
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
