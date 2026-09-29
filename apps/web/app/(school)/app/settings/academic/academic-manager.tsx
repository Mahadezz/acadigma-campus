"use client"

import { useState, useTransition } from "react"

import { useRouter } from "next/navigation"

import { PlusIcon } from "lucide-react"

import type {
  AcademicYearSummary,
  ExamSummary,
  Term,
} from "@acadigma/contracts"
import { checkExamWeights, examWeightSum } from "@acadigma/domain/academic"
import type { AcademicSettings } from "@acadigma/domain/settings"
import { Button } from "@acadigma/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@acadigma/ui/components/dialog"
import { Input } from "@acadigma/ui/components/input"
import { Label } from "@acadigma/ui/components/label"
import {
  NativeSelect,
  NativeSelectOption,
} from "@acadigma/ui/components/native-select"
import { Switch } from "@acadigma/ui/components/switch"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@acadigma/ui/components/tabs"
import { EmptyState } from "@acadigma/ui/primitives/empty-state"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"

import type { Messages } from "@/lib/i18n"

import { updateSchoolSettings } from "../actions"

import {
  createAcademicYear,
  createTerm,
  deleteTerm,
  setCurrentAcademicYear,
  updateExamWeights,
} from "./actions"

type T = Messages["settings"]["academic"]
type Notice = { tone: "success" | "error"; text: string } | null

function codeMessage(code: string, t: T): string {
  switch (code) {
    case "forbidden":
      return t.errors.forbidden
    case "payment_required":
      return t.errors.readOnly
    case "conflict":
      return t.errors.conflict
    case "not_found":
      return t.errors.notFound
    default:
      return t.error
  }
}

function fieldMessage(code: string, t: T): string {
  switch (code) {
    case "ends_before_starts":
    case "too_long":
    case "TERM_ENDS_BEFORE_STARTS":
      return t.errors.badRange
    case "TERM_OUTSIDE_YEAR":
      return t.errors.termOutsideYear
    case "TERM_OVERLAP":
      return t.errors.termOverlap
    case "YEAR_NAME_TAKEN":
      return t.errors.yearNameTaken
    case "TERM_NAME_TAKEN":
      return t.errors.termNameTaken
    case "WEIGHTS_NOT_100":
      return t.errors.weightsNot100
    default:
      return t.error
  }
}

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
})
const formatDate = (d: string) => dateFormat.format(new Date(`${d}T00:00:00Z`))

/**
 * F-OP-07 Part 2 (D-210) §4 W3, §6: the settings shell's "Academic"
 * sub-page — Years, Terms, Weighting and Rules, one sub-row each (desktop:
 * tabs, per the UI table). The selected year is a `?year=` URL param
 * (`router.push`), so switching years is an ordinary server re-render.
 */
export function AcademicManager({
  years,
  selectedYearId,
  terms,
  weights,
  exams,
  academicSettings,
  t,
}: {
  years: AcademicYearSummary[]
  selectedYearId: string | null
  terms: Term[]
  weights: Record<string, number>
  exams: ExamSummary[]
  academicSettings: AcademicSettings
  t: T
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [notice, setNotice] = useState<Notice>(null)

  function selectYear(id: string) {
    router.push(`/app/settings/academic?year=${id}`)
  }

  return (
    <div className="space-y-4">
      {notice ? (
        <InlineAlert tone={notice.tone}>{notice.text}</InlineAlert>
      ) : null}
      <Tabs defaultValue="years">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="years">{t.tabs.years}</TabsTrigger>
          <TabsTrigger value="terms">{t.tabs.terms}</TabsTrigger>
          <TabsTrigger value="weighting">{t.tabs.weighting}</TabsTrigger>
          <TabsTrigger value="rules">{t.tabs.rules}</TabsTrigger>
        </TabsList>

        <TabsContent value="years" className="space-y-4">
          <YearsPanel
            years={years}
            pending={pending}
            startTransition={startTransition}
            refresh={() => router.refresh()}
            setNotice={setNotice}
            t={t}
          />
        </TabsContent>

        <TabsContent value="terms" className="space-y-4">
          <YearPicker
            years={years}
            selectedYearId={selectedYearId}
            onSelect={selectYear}
            t={t}
          />
          {selectedYearId ? (
            <TermsPanel
              academicYearId={selectedYearId}
              terms={terms}
              pending={pending}
              startTransition={startTransition}
              refresh={() => router.refresh()}
              setNotice={setNotice}
              t={t}
            />
          ) : (
            <EmptyState title={t.noYear} />
          )}
        </TabsContent>

        <TabsContent value="weighting" className="space-y-4">
          <YearPicker
            years={years}
            selectedYearId={selectedYearId}
            onSelect={selectYear}
            t={t}
          />
          {selectedYearId ? (
            <WeightingPanel
              academicYearId={selectedYearId}
              exams={exams}
              initialWeights={weights}
              pending={pending}
              startTransition={startTransition}
              refresh={() => router.refresh()}
              setNotice={setNotice}
              t={t}
            />
          ) : (
            <EmptyState title={t.noYear} />
          )}
        </TabsContent>

        <TabsContent value="rules" className="space-y-4">
          <RulesPanel
            academicSettings={academicSettings}
            pending={pending}
            startTransition={startTransition}
            refresh={() => router.refresh()}
            setNotice={setNotice}
            t={t}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function YearPicker({
  years,
  selectedYearId,
  onSelect,
  t,
}: {
  years: AcademicYearSummary[]
  selectedYearId: string | null
  onSelect: (id: string) => void
  t: T
}) {
  if (years.length === 0) return null
  return (
    <div className="space-y-1">
      <Label htmlFor="academic-year-picker">{t.yearPickerLabel}</Label>
      <NativeSelect
        id="academic-year-picker"
        value={selectedYearId ?? ""}
        onChange={(e) => onSelect(e.target.value)}
        className="min-h-11"
      >
        {years.map((y) => (
          <NativeSelectOption key={y.id} value={y.id}>
            {y.name}
            {y.isCurrent ? ` (${t.current})` : ""}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  )
}

function YearsPanel({
  years,
  pending,
  startTransition,
  refresh,
  setNotice,
  t,
}: {
  years: AcademicYearSummary[]
  pending: boolean
  startTransition: (fn: () => Promise<void> | void) => void
  refresh: () => void
  setNotice: (n: Notice) => void
  t: T
}) {
  const [adding, setAdding] = useState(false)
  const [switching, setSwitching] = useState<AcademicYearSummary | null>(null)
  const [form, setForm] = useState({ name: "", startsOn: "", endsOn: "" })
  const [fieldError, setFieldError] = useState<string | null>(null)

  function submitAdd() {
    setFieldError(null)
    startTransition(async () => {
      const result = await createAcademicYear({
        name: form.name,
        startsOn: form.startsOn,
        endsOn: form.endsOn,
      })
      if (result.ok) {
        setAdding(false)
        setForm({ name: "", startsOn: "", endsOn: "" })
        setNotice({ tone: "success", text: t.saved })
        refresh()
        return
      }
      const issue = result.error.fieldErrors?.endsOn?.[0]
      if (issue) setFieldError(fieldMessage(issue, t))
      else setNotice({ tone: "error", text: codeMessage(result.error.code, t) })
    })
  }

  function confirmSwitch() {
    if (!switching) return
    const target = switching
    startTransition(async () => {
      const result = await setCurrentAcademicYear({ academicYearId: target.id })
      setSwitching(null)
      setNotice(
        result.ok
          ? { tone: "success", text: t.saved }
          : { tone: "error", text: codeMessage(result.error.code, t) }
      )
      if (result.ok) refresh()
    })
  }

  return (
    <div className="space-y-4">
      <Button
        type="button"
        onClick={() => setAdding(true)}
        className="min-h-11"
      >
        <PlusIcon aria-hidden />
        {t.addYear}
      </Button>

      {years.length === 0 ? (
        <EmptyState title={t.noYear} />
      ) : (
        <ul className="divide-y rounded-lg border">
          {years.map((y) => (
            <li
              key={y.id}
              className="flex min-h-14 items-center gap-3 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {y.name}
                  {y.isCurrent ? (
                    <span className="text-primary ml-2 text-xs font-semibold">
                      {t.current}
                    </span>
                  ) : null}
                </p>
                <p className="text-muted-foreground text-sm">
                  {formatDate(y.startsOn)} – {formatDate(y.endsOn)}
                </p>
              </div>
              {!y.isCurrent ? (
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 shrink-0"
                  onClick={() => setSwitching(y)}
                >
                  {t.setCurrent}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.addYearTitle}</DialogTitle>
            <DialogDescription>{t.addYearDescription}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {fieldError ? (
              <InlineAlert tone="error">{fieldError}</InlineAlert>
            ) : null}
            <div className="space-y-1">
              <Label htmlFor="year-name">{t.fields.name}</Label>
              <Input
                id="year-name"
                className="min-h-11"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="year-starts">{t.fields.startsOn}</Label>
                <Input
                  id="year-starts"
                  type="date"
                  className="min-h-11"
                  value={form.startsOn}
                  onChange={(e) =>
                    setForm({ ...form, startsOn: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="year-ends">{t.fields.endsOn}</Label>
                <Input
                  id="year-ends"
                  type="date"
                  className="min-h-11"
                  value={form.endsOn}
                  onChange={(e) => setForm({ ...form, endsOn: e.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              className="min-h-11"
              onClick={() => setAdding(false)}
            >
              {t.cancel}
            </Button>
            <Button
              type="button"
              className="min-h-11"
              disabled={pending || !form.name || !form.startsOn || !form.endsOn}
              onClick={submitAdd}
            >
              {pending ? t.saving : t.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={switching !== null}
        onOpenChange={(open) => (open ? null : setSwitching(null))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.setCurrentTitle}</DialogTitle>
            <DialogDescription>
              {t.setCurrentDescription.replace("{name}", switching?.name ?? "")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              className="min-h-11"
              onClick={() => setSwitching(null)}
            >
              {t.cancel}
            </Button>
            <Button
              type="button"
              className="min-h-11"
              disabled={pending}
              onClick={confirmSwitch}
            >
              {pending ? t.saving : t.confirmSetCurrent}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function TermsPanel({
  academicYearId,
  terms,
  pending,
  startTransition,
  refresh,
  setNotice,
  t,
}: {
  academicYearId: string
  terms: Term[]
  pending: boolean
  startTransition: (fn: () => Promise<void> | void) => void
  refresh: () => void
  setNotice: (n: Notice) => void
  t: T
}) {
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<Term | null>(null)
  const [form, setForm] = useState({ name: "", startsOn: "", endsOn: "" })
  const [fieldError, setFieldError] = useState<string | null>(null)

  function submitAdd() {
    setFieldError(null)
    startTransition(async () => {
      const result = await createTerm({
        academicYearId,
        name: form.name,
        startsOn: form.startsOn,
        endsOn: form.endsOn,
      })
      if (result.ok) {
        setAdding(false)
        setForm({ name: "", startsOn: "", endsOn: "" })
        setNotice({ tone: "success", text: t.saved })
        refresh()
        return
      }
      const issue =
        result.error.fieldErrors?.endsOn?.[0] ??
        result.error.fieldErrors?.name?.[0]
      if (issue) setFieldError(fieldMessage(issue, t))
      else setNotice({ tone: "error", text: codeMessage(result.error.code, t) })
    })
  }

  function confirmRemove() {
    if (!removing) return
    const target = removing
    startTransition(async () => {
      const result = await deleteTerm({ termId: target.id })
      setRemoving(null)
      setNotice(
        result.ok
          ? { tone: "success", text: t.removed }
          : { tone: "error", text: codeMessage(result.error.code, t) }
      )
      if (result.ok) refresh()
    })
  }

  return (
    <div className="space-y-4">
      <Button
        type="button"
        onClick={() => setAdding(true)}
        className="min-h-11"
      >
        <PlusIcon aria-hidden />
        {t.addTerm}
      </Button>

      {terms.length === 0 ? (
        <EmptyState title={t.noTerms} />
      ) : (
        <ul className="divide-y rounded-lg border">
          {terms.map((term) => (
            <li
              key={term.id}
              className="flex min-h-14 items-center gap-3 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium">{term.name}</p>
                <p className="text-muted-foreground text-sm">
                  {formatDate(term.startsOn)} – {formatDate(term.endsOn)}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                className="min-h-11 shrink-0"
                onClick={() => setRemoving(term)}
              >
                {t.delete}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.addTermTitle}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {fieldError ? (
              <InlineAlert tone="error">{fieldError}</InlineAlert>
            ) : null}
            <div className="space-y-1">
              <Label htmlFor="term-name">{t.fields.name}</Label>
              <Input
                id="term-name"
                className="min-h-11"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="term-starts">{t.fields.startsOn}</Label>
                <Input
                  id="term-starts"
                  type="date"
                  className="min-h-11"
                  value={form.startsOn}
                  onChange={(e) =>
                    setForm({ ...form, startsOn: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="term-ends">{t.fields.endsOn}</Label>
                <Input
                  id="term-ends"
                  type="date"
                  className="min-h-11"
                  value={form.endsOn}
                  onChange={(e) => setForm({ ...form, endsOn: e.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              className="min-h-11"
              onClick={() => setAdding(false)}
            >
              {t.cancel}
            </Button>
            <Button
              type="button"
              className="min-h-11"
              disabled={pending || !form.name || !form.startsOn || !form.endsOn}
              onClick={submitAdd}
            >
              {pending ? t.saving : t.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={removing !== null}
        onOpenChange={(open) => (open ? null : setRemoving(null))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.deleteTermTitle}</DialogTitle>
            <DialogDescription>
              {t.deleteTermDescription.replace("{name}", removing?.name ?? "")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              className="min-h-11"
              onClick={() => setRemoving(null)}
            >
              {t.cancel}
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="min-h-11"
              disabled={pending}
              onClick={confirmRemove}
            >
              {pending ? t.deleting : t.confirmDelete}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function WeightingPanel({
  academicYearId,
  exams,
  initialWeights,
  pending,
  startTransition,
  refresh,
  setNotice,
  t,
}: {
  academicYearId: string
  exams: ExamSummary[]
  initialWeights: Record<string, number>
  pending: boolean
  startTransition: (fn: () => Promise<void> | void) => void
  refresh: () => void
  setNotice: (n: Notice) => void
  t: T
}) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const exam of exams) {
      init[exam.id] = String(initialWeights[exam.id] ?? "")
    }
    return init
  })

  const weights: Record<string, number> = {}
  for (const [id, raw] of Object.entries(values)) {
    const n = Number(raw)
    if (raw.trim() !== "" && Number.isFinite(n) && n > 0) weights[id] = n
  }
  const sum = examWeightSum(weights)
  const invalid = checkExamWeights(weights) !== null

  function submit() {
    startTransition(async () => {
      const result = await updateExamWeights({ academicYearId, weights })
      setNotice(
        result.ok
          ? { tone: "success", text: t.saved }
          : { tone: "error", text: codeMessage(result.error.code, t) }
      )
      if (result.ok) refresh()
    })
  }

  if (exams.length === 0) return <EmptyState title={t.noExams} />

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">{t.weightingHelp}</p>
      <ul className="divide-y rounded-lg border">
        {exams.map((exam) => (
          <li
            key={exam.id}
            className="flex min-h-14 items-center gap-3 px-4 py-3"
          >
            <span className="min-w-0 flex-1 font-medium">{exam.name}</span>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              max={100}
              step="0.01"
              aria-label={`${t.weightLabel}: ${exam.name}`}
              className="min-h-11 w-24 shrink-0"
              value={values[exam.id] ?? ""}
              onChange={(e) =>
                setValues({ ...values, [exam.id]: e.target.value })
              }
            />
          </li>
        ))}
      </ul>
      <p className={invalid ? "text-destructive text-sm" : "text-sm"}>
        {t.weightSum.replace("{sum}", String(sum))}
      </p>
      <Button
        type="button"
        className="min-h-11"
        disabled={pending || invalid}
        onClick={submit}
      >
        {pending ? t.saving : t.save}
      </Button>
    </div>
  )
}

const RANK_BY_OPTIONS = ["gpa_then_total", "total_marks"] as const

function RulesPanel({
  academicSettings,
  pending,
  startTransition,
  refresh,
  setNotice,
  t,
}: {
  academicSettings: AcademicSettings
  pending: boolean
  startTransition: (fn: () => Promise<void> | void) => void
  refresh: () => void
  setNotice: (n: Notice) => void
  t: T
}) {
  const [form, setForm] = useState(academicSettings)

  function submit() {
    startTransition(async () => {
      const result = await updateSchoolSettings({
        academic_settings: {
          grade_scale_code: form.grade_scale_code,
          pass_mark_percent: form.pass_mark_percent,
          fail_any_subject_zero_gpa: form.fail_any_subject_zero_gpa,
          rank_by: form.rank_by,
        },
      })
      setNotice(
        result.ok
          ? { tone: "success", text: t.saved }
          : { tone: "error", text: codeMessage(result.error.code, t) }
      )
      if (result.ok) refresh()
    })
  }

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">{t.rulesHelp}</p>
      <div className="space-y-1">
        <Label htmlFor="pass-mark">{t.fields.passMark}</Label>
        <Input
          id="pass-mark"
          type="number"
          inputMode="numeric"
          min={0}
          max={100}
          className="min-h-11"
          value={form.pass_mark_percent}
          onChange={(e) =>
            setForm({
              ...form,
              pass_mark_percent: Number(e.target.value) || 0,
            })
          }
        />
      </div>
      <div className="flex min-h-11 items-center justify-between gap-4 rounded-lg border p-4">
        <Label htmlFor="fail-zero-gpa" className="font-medium">
          {t.fields.failZeroGpa}
        </Label>
        <Switch
          id="fail-zero-gpa"
          checked={form.fail_any_subject_zero_gpa}
          onCheckedChange={(checked) =>
            setForm({ ...form, fail_any_subject_zero_gpa: checked })
          }
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="rank-by">{t.fields.rankBy}</Label>
        <NativeSelect
          id="rank-by"
          className="min-h-11"
          value={form.rank_by}
          onChange={(e) => setForm({ ...form, rank_by: e.target.value })}
        >
          {RANK_BY_OPTIONS.map((option) => (
            <NativeSelectOption key={option} value={option}>
              {t.rankByOptions[option]}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <div className="space-y-1">
        <Label htmlFor="grade-scale-code">{t.fields.gradeScaleCode}</Label>
        <Input
          id="grade-scale-code"
          className="min-h-11"
          value={form.grade_scale_code}
          onChange={(e) =>
            setForm({ ...form, grade_scale_code: e.target.value })
          }
        />
        <p className="text-muted-foreground text-xs">{t.gradeScaleCodeHelp}</p>
      </div>
      <Button
        type="button"
        className="min-h-11"
        disabled={pending}
        onClick={submit}
      >
        {pending ? t.saving : t.save}
      </Button>
    </div>
  )
}
