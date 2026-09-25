"use client"

import { useState, useTransition } from "react"

import Link from "next/link"
import { useRouter } from "next/navigation"

import { ChevronRightIcon, PlusIcon } from "lucide-react"

import type {
  ExamSummary,
  ExamType,
  GradeWithSections,
  Subject,
} from "@acadigma/contracts"
import { sectionDisplayName } from "@acadigma/domain/academic"
import { Badge } from "@acadigma/ui/components/badge"
import { Button } from "@acadigma/ui/components/button"
import { Checkbox } from "@acadigma/ui/components/checkbox"
import { Input } from "@acadigma/ui/components/input"
import { Label } from "@acadigma/ui/components/label"
import {
  NativeSelect,
  NativeSelectOption,
} from "@acadigma/ui/components/native-select"
import { EmptyState } from "@acadigma/ui/primitives/empty-state"
import { FormSheet } from "@acadigma/ui/primitives/form-sheet"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"

import type { Messages } from "@/lib/i18n"

import { createExam } from "./actions"

type T = Messages["exams"]

const EXAM_TYPES: ExamType[] = [
  "class_test",
  "midterm",
  "term_final",
  "annual",
  "model_test",
  "practical",
  "other",
]

export function ExamsView({
  t,
  year,
  grades,
  subjects,
  exams,
  canWrite,
}: {
  t: T
  year: { id: string; name: string } | null
  grades: GradeWithSections[]
  subjects: Subject[]
  exams: ExamSummary[]
  canWrite: boolean
}) {
  const [open, setOpen] = useState(false)

  if (!year) {
    return (
      <div className="mx-auto max-w-3xl">
        <EmptyState
          title={t.noYear}
          action={
            <Button asChild variant="outline" className="h-11">
              <Link href="/app/classes">{t.noYearAction}</Link>
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            {t.title} · {year.name}
          </h2>
          <p className="text-muted-foreground text-sm">{t.description}</p>
        </div>
        {canWrite ? (
          <Button className="h-11 shrink-0" onClick={() => setOpen(true)}>
            <PlusIcon aria-hidden /> {t.newExam}
          </Button>
        ) : null}
      </div>

      {exams.length === 0 ? (
        <EmptyState title={t.emptyTitle} description={t.emptyBody} />
      ) : (
        <ul className="divide-y rounded-lg border">
          {exams.map((exam) => (
            <li key={exam.id}>
              <Link
                href={`/app/exams/${exam.id}`}
                className="hover:bg-muted/50 flex min-h-14 items-center gap-3 px-4 py-3"
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{exam.name}</span>
                  <span className="text-muted-foreground block text-sm">
                    {t.types[exam.examType]}
                    {exam.startsOn ? ` · ${exam.startsOn}` : ""}
                    {exam.endsOn ? ` – ${exam.endsOn}` : ""}
                    {" · "}
                    {t.papers.replace("{n}", String(exam.paperCount))}
                  </span>
                </span>
                <Badge variant="outline">{t.statuses[exam.status]}</Badge>
                <ChevronRightIcon
                  className="text-muted-foreground size-4 shrink-0"
                  aria-hidden
                />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {canWrite ? (
        <NewExamSheet
          t={t}
          open={open}
          onOpenChange={setOpen}
          yearId={year.id}
          grades={grades}
          subjects={subjects}
        />
      ) : null}
    </div>
  )
}

function NewExamSheet({
  t,
  open,
  onOpenChange,
  yearId,
  grades,
  subjects,
}: {
  t: T
  open: boolean
  onOpenChange: (open: boolean) => void
  yearId: string
  grades: GradeWithSections[]
  subjects: Subject[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<{
    text: string
    gradeScale: boolean
  } | null>(null)
  const formId = "new-exam"

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setError(null)
    startTransition(async () => {
      const result = await createExam({
        academicYearId: yearId,
        name: String(data.get("name") ?? ""),
        examType: String(data.get("examType") ?? "other"),
        startsOn: String(data.get("startsOn") ?? "") || null,
        endsOn: String(data.get("endsOn") ?? "") || null,
        sectionIds: data.getAll("sectionIds").map(String),
        subjectIds: data.getAll("subjectIds").map(String),
        fullMarks: Number(data.get("fullMarks") ?? 100),
      })
      if (!result.ok) {
        setError({
          text: result.error.message || t.error,
          gradeScale: Boolean(result.error.fieldErrors?.["gradeScale"]),
        })
        return
      }
      onOpenChange(false)
      router.push(`/app/exams/${result.data.examId}`)
    })
  }

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t.newExam}
      description={t.newExamDescription}
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
          <Button type="submit" form={formId} className="h-11" disabled={pending}>
            {pending ? t.creating : t.create}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={onSubmit} className="space-y-4">
        {error ? (
          <InlineAlert tone="error">
            {error.text}{" "}
            {error.gradeScale ? (
              <Link className="underline" href="/app/settings/grade-scale">
                {t.needGradeScaleAction}
              </Link>
            ) : null}
          </InlineAlert>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor={`${formId}-name`}>{t.name}</Label>
          <Input
            id={`${formId}-name`}
            name="name"
            required
            maxLength={120}
            className="h-11"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${formId}-type`}>{t.type}</Label>
          <NativeSelect
            id={`${formId}-type`}
            name="examType"
            defaultValue="term_final"
            className="min-h-11"
          >
            {EXAM_TYPES.map((type) => (
              <NativeSelectOption key={type} value={type}>
                {t.types[type]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor={`${formId}-starts`}>{t.startsOn}</Label>
            <Input id={`${formId}-starts`} name="startsOn" type="date" className="h-11" />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${formId}-ends`}>{t.endsOn}</Label>
            <Input id={`${formId}-ends`} name="endsOn" type="date" className="h-11" />
          </div>
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t.sections}</legend>
          {grades.flatMap((grade) =>
            grade.sections.map((section) => (
              <label key={section.id} className="flex min-h-11 items-center gap-3">
                <Checkbox name="sectionIds" value={section.id} defaultChecked />
                {sectionDisplayName(grade.name, section.name)}
              </label>
            ))
          )}
        </fieldset>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t.subjects}</legend>
          {subjects.map((subject) => (
            <label key={subject.id} className="flex min-h-11 items-center gap-3">
              <Checkbox name="subjectIds" value={subject.id} />
              {subject.name}
            </label>
          ))}
        </fieldset>
        <div className="space-y-2">
          <Label htmlFor={`${formId}-full`}>{t.fullMarks}</Label>
          <Input
            id={`${formId}-full`}
            name="fullMarks"
            type="number"
            inputMode="decimal"
            min={1}
            max={1000}
            defaultValue={100}
            className="h-11 w-32"
          />
        </div>
      </form>
    </FormSheet>
  )
}
