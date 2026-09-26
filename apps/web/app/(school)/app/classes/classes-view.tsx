"use client"

import { useState, useTransition } from "react"

import { useRouter } from "next/navigation"

import { PlusIcon } from "lucide-react"

import type {
  ApiError,
  GradeWithSections,
  Section,
  Subject,
  SubjectCategory,
  TeacherOption,
} from "@acadigma/contracts"
import type { ClassesOverview } from "@acadigma/db"
import { nextSectionName, sectionDisplayName } from "@acadigma/domain/academic"
import { Badge } from "@acadigma/ui/components/badge"
import { Button } from "@acadigma/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@acadigma/ui/components/card"
import { Checkbox } from "@acadigma/ui/components/checkbox"
import { Input } from "@acadigma/ui/components/input"
import { Label } from "@acadigma/ui/components/label"
import {
  NativeSelect,
  NativeSelectOption,
} from "@acadigma/ui/components/native-select"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@acadigma/ui/components/tabs"
import { FormSheet } from "@acadigma/ui/primitives/form-sheet"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"

import type { Messages } from "@/lib/i18n"
import type { Locale } from "@/lib/locale"

import {
  archiveSection,
  createSection,
  createSubject,
  seedStarterSubjects,
  setSectionSubjects,
} from "./actions"

type T = Messages["classes"]

const CATEGORIES: readonly SubjectCategory[] = [
  "core",
  "optional",
  "religion",
  "co_curricular",
]

/** Every error the four actions can return, in the reader's language. */
export function errorText(t: T, error: ApiError): string {
  if (error.code === "payment_required") return t.errors.readOnly
  const code = Object.values(error.fieldErrors ?? {})[0]?.[0]
  if (code && Object.hasOwn(t.errors, code)) {
    return t.errors[code as keyof T["errors"]]
  }
  return t.errors.generic
}

function count(t: T, n: number, locale: Locale): string {
  const formatted = new Intl.NumberFormat(`${locale}-u-nu-latn`).format(n)
  return n === 1
    ? t.sectionsCountOne
    : t.sectionsCountOther.replace("{count}", formatted)
}

function subjectCount(t: T, n: number, locale: Locale): string {
  if (n === 0) return t.noSectionSubjects
  const formatted = new Intl.NumberFormat(`${locale}-u-nu-latn`).format(n)
  return n === 1
    ? t.subjectCountOne
    : t.subjectCountOther.replace("{count}", formatted)
}

function subjectName(subject: Subject, locale: Locale): string {
  return locale === "bn" && subject.nameBn ? subject.nameBn : subject.name
}

export function ClassesView({
  t,
  locale,
  overview,
  subjects,
  teachers,
  canWriteSections,
  canWriteSubjects,
}: {
  t: T
  locale: Locale
  overview: ClassesOverview
  subjects: Subject[]
  teachers: TeacherOption[]
  canWriteSections: boolean
  canWriteSubjects: boolean
}) {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="space-y-1">
        <h1 className="text-xl font-bold tracking-tight">{t.title}</h1>
        {overview.year ? (
          <p className="text-muted-foreground text-sm">
            {t.yearLabel.replace("{year}", overview.year.name)}
          </p>
        ) : null}
      </div>

      {!canWriteSections ? (
        <p className="text-muted-foreground text-sm">{t.readOnlyNote}</p>
      ) : null}

      <Tabs defaultValue="classes">
        <TabsList className="w-full">
          <TabsTrigger value="classes" className="min-h-11 flex-1">
            {t.tabs.classes}
          </TabsTrigger>
          <TabsTrigger value="subjects" className="min-h-11 flex-1">
            {t.tabs.subjects}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="classes" className="space-y-3 pt-2">
          {overview.year ? (
            overview.grades.map((grade) => (
              <GradeCard
                key={grade.id}
                t={t}
                locale={locale}
                grade={grade}
                subjects={subjects}
                teachers={teachers}
                canWrite={canWriteSections}
              />
            ))
          ) : (
            <InlineAlert tone="info">{t.noYear}</InlineAlert>
          )}
        </TabsContent>

        <TabsContent value="subjects" className="pt-2">
          <SubjectsPanel
            t={t}
            locale={locale}
            subjects={subjects}
            canWrite={canWriteSubjects}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Grades and sections
// ---------------------------------------------------------------------------
function GradeCard({
  t,
  locale,
  grade,
  subjects,
  teachers,
  canWrite,
}: {
  t: T
  locale: Locale
  grade: GradeWithSections
  subjects: Subject[]
  teachers: TeacherOption[]
  canWrite: boolean
}) {
  const [adding, setAdding] = useState(false)
  const [archiving, setArchiving] = useState<Section | null>(null)
  const [editing, setEditing] = useState<Section | null>(null)
  // Archived subjects are not offered and not counted.
  const liveSubjectIds = new Set(subjects.map((s) => s.id))
  const gradeName = locale === "bn" ? grade.nameBn : grade.name

  return (
    <Card className="gap-3 py-4">
      <CardHeader className="flex flex-row items-center justify-between gap-2 px-4">
        <div>
          <CardTitle>
            <h2 className="text-base">{gradeName}</h2>
          </CardTitle>
          <p className="text-muted-foreground text-xs">
            {grade.sections.length === 0
              ? t.noSections
              : count(t, grade.sections.length, locale)}
          </p>
        </div>
        {canWrite ? (
          <Button
            type="button"
            variant="outline"
            className="h-11"
            onClick={() => setAdding(true)}
            aria-label={t.addSectionTo.replace("{grade}", gradeName)}
          >
            <PlusIcon aria-hidden="true" />
            {t.addSection}
          </Button>
        ) : null}
      </CardHeader>
      {grade.sections.length > 0 ? (
        <CardContent className="px-4">
          <ul className="divide-border divide-y">
            {grade.sections.map((section) => (
              <li
                key={section.id}
                className="flex min-h-14 items-center justify-between gap-2 py-2"
              >
                <div className="min-w-0">
                  <p className="font-medium">
                    {sectionDisplayName(gradeName, section.name)}
                  </p>
                  <p className="text-muted-foreground truncate text-xs">
                    {[
                      section.classTeacherName
                        ? t.classTeacherShort.replace(
                            "{name}",
                            section.classTeacherName
                          )
                        : t.noClassTeacher,
                      section.room
                        ? t.roomShort.replace("{room}", section.room)
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {subjectCount(
                      t,
                      section.subjects.filter((s) =>
                        liveSubjectIds.has(s.subjectId)
                      ).length,
                      locale
                    )}
                  </p>
                </div>
                {canWrite ? (
                  <div className="flex shrink-0 gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11"
                      onClick={() => setEditing(section)}
                      aria-label={t.sectionSubjectsTitle.replace(
                        "{section}",
                        sectionDisplayName(gradeName, section.name)
                      )}
                    >
                      {t.subjectsButton}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-11"
                      onClick={() => setArchiving(section)}
                      aria-label={t.archiveSection.replace(
                        "{section}",
                        sectionDisplayName(gradeName, section.name)
                      )}
                    >
                      {t.archive}
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </CardContent>
      ) : null}

      {canWrite ? (
        <>
          <AddSectionSheet
            t={t}
            locale={locale}
            open={adding}
            onOpenChange={setAdding}
            grade={grade}
            gradeName={gradeName}
            teachers={teachers}
          />
          <ArchiveSectionSheet
            t={t}
            section={archiving}
            label={
              archiving ? sectionDisplayName(gradeName, archiving.name) : ""
            }
            onClose={() => setArchiving(null)}
          />
          <SectionSubjectsSheet
            key={editing?.id ?? "none"}
            t={t}
            locale={locale}
            section={editing}
            label={editing ? sectionDisplayName(gradeName, editing.name) : ""}
            subjects={subjects}
            teachers={teachers}
            onClose={() => setEditing(null)}
          />
        </>
      ) : null}
    </Card>
  )
}

function AddSectionSheet({
  t,
  locale,
  open,
  onOpenChange,
  grade,
  gradeName,
  teachers,
}: {
  t: T
  locale: Locale
  open: boolean
  onOpenChange: (open: boolean) => void
  grade: GradeWithSections
  gradeName: string
  teachers: TeacherOption[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const formId = `add-section-${grade.id}`

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const capacity = String(data.get("capacity") ?? "").trim()
    setError(null)
    startTransition(async () => {
      const result = await createSection({
        gradeLevelId: grade.id,
        name: String(data.get("name") ?? ""),
        classTeacherId: String(data.get("classTeacherId") ?? "") || null,
        room: String(data.get("room") ?? ""),
        capacity: capacity ? Number(capacity) : null,
      })
      if (!result.ok) {
        setError(errorText(t, result.error))
        return
      }
      onOpenChange(false)
      router.refresh()
    })
  }

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t.addSectionTo.replace("{grade}", gradeName)}
      description={t.addSectionDescription}
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
            type="submit"
            form={formId}
            className="h-11"
            disabled={pending}
          >
            {pending ? t.saving : t.save}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={onSubmit} className="space-y-4">
        {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}
        <div className="space-y-2">
          <Label htmlFor={`${formId}-name`}>{t.sectionName}</Label>
          <Input
            id={`${formId}-name`}
            name="name"
            required
            maxLength={20}
            defaultValue={nextSectionName(
              grade.sections.map((s) => s.name),
              locale
            )}
            className="h-11"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${formId}-teacher`}>
            {t.classTeacher} ({t.optional})
          </Label>
          <NativeSelect
            id={`${formId}-teacher`}
            name="classTeacherId"
            defaultValue=""
            className="min-h-11"
          >
            <NativeSelectOption value="">{t.noClassTeacher}</NativeSelectOption>
            {teachers.map((teacher) => (
              <NativeSelectOption
                key={teacher.memberId}
                value={teacher.memberId}
              >
                {teacher.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor={`${formId}-room`}>
              {t.room} ({t.optional})
            </Label>
            <Input
              id={`${formId}-room`}
              name="room"
              maxLength={40}
              className="h-11"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${formId}-capacity`}>
              {t.capacity} ({t.optional})
            </Label>
            <Input
              id={`${formId}-capacity`}
              name="capacity"
              type="number"
              inputMode="numeric"
              min={1}
              max={500}
              className="h-11"
            />
          </div>
        </div>
      </form>
    </FormSheet>
  )
}

function ArchiveSectionSheet({
  t,
  section,
  label,
  onClose,
}: {
  t: T
  section: Section | null
  label: string
  onClose: () => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function onConfirm() {
    if (!section) return
    setError(null)
    startTransition(async () => {
      const result = await archiveSection({ sectionId: section.id })
      if (!result.ok) {
        setError(errorText(t, result.error))
        return
      }
      onClose()
      router.refresh()
    })
  }

  return (
    <FormSheet
      open={section !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={t.archiveSection.replace("{section}", label)}
      description={t.archiveDescription}
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            className="h-11"
            onClick={onClose}
          >
            {t.cancel}
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="h-11"
            disabled={pending}
            onClick={onConfirm}
          >
            {pending ? t.archiving : t.archive}
          </Button>
        </>
      }
    >
      {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}
    </FormSheet>
  )
}

/** F-AC-01 §4.3, demo cut (D-107): tick the section's subjects and pick
 * each one's teacher; one Save sends the whole list. */
function SectionSubjectsSheet({
  t,
  locale,
  section,
  label,
  subjects,
  teachers,
  onClose,
}: {
  t: T
  locale: Locale
  section: Section | null
  label: string
  subjects: Subject[]
  teachers: TeacherOption[]
  onClose: () => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  // subjectId -> teacherId ("" = no teacher); absent = not taken. A subject
  // archived after it was assigned is not shown but stays in the saved list
  // (the database refuses only a newly added archived subject).
  const [initial] = useState(
    () =>
      new Map(
        (section?.subjects ?? []).map((s) => [s.subjectId, s.teacherId ?? ""])
      )
  )
  const [picked, setPicked] = useState<Map<string, string>>(
    () => new Map(initial)
  )
  // The section's subjects first, sorted once so rows do not jump on tick.
  const [ordered] = useState(() =>
    [...subjects].sort(
      (a, b) => Number(initial.has(b.id)) - Number(initial.has(a.id))
    )
  )
  const isDirty =
    picked.size !== initial.size ||
    [...picked].some(([id, teacher]) => initial.get(id) !== teacher)

  function setTeacher(subjectId: string, teacherId: string | undefined) {
    setPicked((prev) => {
      const next = new Map(prev)
      if (teacherId === undefined) next.delete(subjectId)
      else next.set(subjectId, teacherId)
      return next
    })
  }

  function onSave() {
    if (!section) return
    setError(null)
    startTransition(async () => {
      const result = await setSectionSubjects({
        sectionId: section.id,
        subjects: [...picked].map(([subjectId, teacherId]) => ({
          subjectId,
          teacherId: teacherId || null,
        })),
      })
      if (!result.ok) {
        setError(errorText(t, result.error))
        return
      }
      onClose()
      router.refresh()
    })
  }

  return (
    <FormSheet
      open={section !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={t.sectionSubjectsTitle.replace("{section}", label)}
      description={t.sectionSubjectsDescription}
      isDirty={isDirty && !pending}
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            className="h-11"
            onClick={onClose}
          >
            {t.cancel}
          </Button>
          <Button
            type="button"
            className="h-11"
            disabled={pending || subjects.length === 0}
            onClick={onSave}
          >
            {pending ? t.saving : t.save}
          </Button>
        </>
      }
    >
      {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}
      {subjects.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t.needSubjectsFirst}</p>
      ) : (
        <ul className="divide-border divide-y">
          {ordered.map((subject) => {
            const name = subjectName(subject, locale)
            const id = `ss-${subject.id}`
            const teacherId = picked.get(subject.id)
            return (
              <li key={subject.id} className="space-y-2 py-2">
                <div className="flex min-h-11 items-center gap-3">
                  <Checkbox
                    id={id}
                    checked={teacherId !== undefined}
                    onCheckedChange={(value) =>
                      setTeacher(
                        subject.id,
                        value === true ? (teacherId ?? "") : undefined
                      )
                    }
                    className="size-5"
                  />
                  <Label htmlFor={id} className="flex-1">
                    {name}
                  </Label>
                </div>
                {teacherId !== undefined ? (
                  <NativeSelect
                    aria-label={t.subjectTeacher.replace("{subject}", name)}
                    value={teacherId}
                    onChange={(event) =>
                      setTeacher(subject.id, event.target.value)
                    }
                    className="min-h-11"
                  >
                    <NativeSelectOption value="">
                      {t.noTeacher}
                    </NativeSelectOption>
                    {teachers.map((teacher) => (
                      <NativeSelectOption
                        key={teacher.memberId}
                        value={teacher.memberId}
                      >
                        {teacher.name}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </FormSheet>
  )
}

// ---------------------------------------------------------------------------
// Subjects
// ---------------------------------------------------------------------------
function SubjectsPanel({
  t,
  locale,
  subjects,
  canWrite,
}: {
  t: T
  locale: Locale
  subjects: Subject[]
  canWrite: boolean
}) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [pending, startTransition] = useTransition()
  const [notice, setNotice] = useState<{
    tone: "success" | "error"
    text: string
  } | null>(null)

  function useStarter() {
    setNotice(null)
    startTransition(async () => {
      const result = await seedStarterSubjects()
      if (!result.ok) {
        setNotice({ tone: "error", text: errorText(t, result.error) })
        return
      }
      setNotice({
        tone: "success",
        text:
          result.data.created === 0
            ? t.starterNothing
            : t.starterAdded.replace(
                "{count}",
                new Intl.NumberFormat(`${locale}-u-nu-latn`).format(
                  result.data.created
                )
              ),
      })
      router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      {canWrite ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            className="h-11"
            onClick={() => setAdding(true)}
          >
            <PlusIcon aria-hidden="true" />
            {t.addSubject}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11"
            disabled={pending}
            onClick={useStarter}
          >
            {pending ? t.addingStarter : t.useStarter}
          </Button>
        </div>
      ) : null}
      {notice ? (
        <InlineAlert tone={notice.tone}>{notice.text}</InlineAlert>
      ) : null}

      {subjects.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t.subjectsEmpty}</p>
      ) : (
        <Card className="py-0">
          <ul className="divide-border divide-y">
            {subjects.map((subject) => (
              <li
                key={subject.id}
                className="flex min-h-14 items-center justify-between gap-2 px-4 py-2"
              >
                <div className="min-w-0">
                  <p className="font-medium">{subjectName(subject, locale)}</p>
                  <p className="text-muted-foreground text-xs">
                    {[subject.code, t.categories[subject.category]]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                {subject.subjectKind === "optional_fourth" ? (
                  <Badge variant="outline">{t.fourthBadge}</Badge>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {canWrite ? (
        <AddSubjectSheet t={t} open={adding} onOpenChange={setAdding} />
      ) : null}
    </div>
  )
}

function AddSubjectSheet({
  t,
  open,
  onOpenChange,
}: {
  t: T
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [fourth, setFourth] = useState(false)
  const formId = "add-subject"

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setError(null)
    startTransition(async () => {
      const result = await createSubject({
        name: String(data.get("name") ?? ""),
        nameBn: String(data.get("nameBn") ?? ""),
        code: String(data.get("code") ?? ""),
        category: String(data.get("category") ?? "core"),
        subjectKind: fourth ? "optional_fourth" : "compulsory",
      })
      if (!result.ok) {
        setError(errorText(t, result.error))
        return
      }
      onOpenChange(false)
      setFourth(false)
      router.refresh()
    })
  }

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t.addSubject}
      description={t.addSubjectDescription}
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
            type="submit"
            form={formId}
            className="h-11"
            disabled={pending}
          >
            {pending ? t.saving : t.save}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={onSubmit} className="space-y-4">
        {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}
        <div className="space-y-2">
          <Label htmlFor="subject-name">{t.subjectName}</Label>
          <Input
            id="subject-name"
            name="name"
            required
            maxLength={80}
            className="h-11"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="subject-name-bn">
            {t.subjectNameBn} ({t.optional})
          </Label>
          <Input
            id="subject-name-bn"
            name="nameBn"
            maxLength={80}
            className="h-11"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="subject-code">
              {t.subjectCode} ({t.optional})
            </Label>
            <Input
              id="subject-code"
              name="code"
              maxLength={12}
              autoCapitalize="characters"
              className="h-11"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="subject-category">{t.category}</Label>
            <NativeSelect
              id="subject-category"
              name="category"
              defaultValue="core"
              className="min-h-11"
            >
              {CATEGORIES.map((category) => (
                <NativeSelectOption key={category} value={category}>
                  {t.categories[category]}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        </div>
        <div className="flex min-h-11 items-center gap-3">
          <Checkbox
            id="subject-fourth"
            checked={fourth}
            onCheckedChange={(value) => setFourth(value === true)}
            className="size-5"
          />
          <Label htmlFor="subject-fourth">{t.fourthSubject}</Label>
        </div>
      </form>
    </FormSheet>
  )
}
