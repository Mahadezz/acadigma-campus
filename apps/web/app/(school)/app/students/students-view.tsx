"use client"

import { useState, useTransition } from "react"

import Link from "next/link"
import { useRouter } from "next/navigation"

import { PlusIcon, SearchIcon } from "lucide-react"

import type {
  ApiError,
  GuardianRelation,
  QuickAdmitResult,
  RosterStudent,
  StudentGender,
  StudentSearchQuery,
} from "@acadigma/contracts"
import { Button } from "@acadigma/ui/components/button"
import { Input } from "@acadigma/ui/components/input"
import { Label } from "@acadigma/ui/components/label"
import {
  NativeSelect,
  NativeSelectOption,
} from "@acadigma/ui/components/native-select"
import { RadioGroup, RadioGroupItem } from "@acadigma/ui/components/radio-group"
import {
  DataList,
  type DataListColumn,
} from "@acadigma/ui/primitives/data-list"
import { EmptyState } from "@acadigma/ui/primitives/empty-state"
import { FormSheet } from "@acadigma/ui/primitives/form-sheet"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"

import type { Messages } from "@/lib/i18n"
import type { Locale } from "@/lib/locale"

import { quickAdmitStudent } from "./actions"
import { classLabel } from "./format"

type T = Messages["students"]

export type SectionOption = { id: string; label: string }

const GENDERS: readonly StudentGender[] = ["male", "female", "other"]
const RELATIONS: readonly GuardianRelation[] = [
  "father",
  "mother",
  "brother",
  "sister",
  "uncle",
  "aunt",
  "grandparent",
  "legal_guardian",
  "other",
]

/** Every error quick admit can return, in the reader's language. */
export function admitErrorText(t: T, error: ApiError): string {
  if (error.code === "payment_required") return t.errors.readOnly
  const code = Object.values(error.fieldErrors ?? {})[0]?.[0]
  if (code && Object.hasOwn(t.errors, code)) {
    return t.errors[code as keyof T["errors"]]
  }
  if (error.code === "validation_failed") return t.errors.invalid
  return t.errors.generic
}

/** The name in the reader's language first, the other underneath. */
function names(locale: Locale, s: RosterStudent): [string, string | null] {
  if (locale === "bn" && s.fullNameBn) return [s.fullNameBn, s.fullName]
  return [s.fullName, s.fullNameBn]
}

function pageHref(query: StudentSearchQuery, page: number): string {
  const params = new URLSearchParams()
  if (query.q) params.set("q", query.q)
  if (query.sectionId) params.set("section", query.sectionId)
  if (page > 1) params.set("page", String(page))
  const qs = params.toString()
  return qs ? `/app/students?${qs}` : "/app/students"
}

export function StudentsView({
  t,
  locale,
  students,
  hasMore,
  query,
  sections,
  canAdmit,
}: {
  t: T
  locale: Locale
  students: RosterStudent[]
  hasMore: boolean
  query: StudentSearchQuery
  sections: SectionOption[]
  canAdmit: boolean
}) {
  const [admitting, setAdmitting] = useState(false)
  const [admitted, setAdmitted] = useState<
    (QuickAdmitResult & { name: string }) | null
  >(null)
  const filtered = Boolean(query.q || query.sectionId)

  const columns: DataListColumn<RosterStudent>[] = [
    {
      key: "name",
      header: t.columns.name,
      hideOnCard: true,
      cell: (s) => <StudentLink locale={locale} student={s} />,
    },
    {
      key: "class",
      header: t.columns.class,
      cell: (s) => classLabel(t, locale, s),
    },
    {
      key: "roll",
      header: t.columns.roll,
      className: "tabular-nums",
      cell: (s) => s.rollNumber ?? "—",
    },
    {
      key: "code",
      header: t.columns.code,
      className: "tabular-nums",
      cell: (s) => s.studentCode,
    },
    {
      key: "gender",
      header: t.columns.gender,
      cell: (s) => t.gender[s.gender],
    },
  ]

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold tracking-tight">{t.title}</h1>
        {canAdmit ? (
          <Button
            type="button"
            className="h-11"
            onClick={() => {
              setAdmitted(null)
              setAdmitting(true)
            }}
          >
            <PlusIcon aria-hidden="true" />
            {t.admit}
          </Button>
        ) : null}
      </div>

      {admitted ? (
        <InlineAlert tone="success">
          {t.admitted
            .replace("{name}", admitted.name)
            .replace("{code}", admitted.studentCode)
            .replace("{roll}", String(admitted.rollNumber))}{" "}
          <Link
            href={`/app/students/${admitted.studentId}`}
            className="font-medium underline underline-offset-4"
          >
            {t.viewProfile}
          </Link>
        </InlineAlert>
      ) : null}

      <form
        action="/app/students"
        method="get"
        role="search"
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
      >
        <div className="flex-1 space-y-2">
          <Label htmlFor="students-q">{t.searchLabel}</Label>
          <Input
            id="students-q"
            name="q"
            type="search"
            maxLength={60}
            defaultValue={query.q ?? ""}
            placeholder={t.searchPlaceholder}
            className="h-11"
          />
        </div>
        <div className="space-y-2 sm:w-56">
          <Label htmlFor="students-section">{t.sectionFilter}</Label>
          <NativeSelect
            id="students-section"
            name="section"
            defaultValue={query.sectionId ?? ""}
            className="min-h-11 w-full"
          >
            <NativeSelectOption value="">{t.allSections}</NativeSelectOption>
            {sections.map((section) => (
              <NativeSelectOption key={section.id} value={section.id}>
                {section.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <Button type="submit" variant="outline" className="h-11">
          <SearchIcon aria-hidden="true" />
          {t.search}
        </Button>
      </form>

      <DataList
        items={students}
        columns={columns}
        getRowId={(s) => s.id}
        caption={t.caption}
        virtualize={false}
        renderCardTitle={(s) => <StudentLink locale={locale} student={s} />}
        empty={
          <EmptyState
            title={filtered ? t.noMatches : t.empty}
            description={filtered ? undefined : t.emptyDescription}
          />
        }
      />

      {query.page > 1 || hasMore ? (
        <nav
          aria-label={t.pageLabel.replace("{page}", String(query.page))}
          className="flex items-center justify-between gap-2"
        >
          {query.page > 1 ? (
            <Button asChild variant="outline" className="h-11">
              <Link href={pageHref(query, query.page - 1)}>{t.previous}</Link>
            </Button>
          ) : (
            <span />
          )}
          <span className="text-muted-foreground text-sm tabular-nums">
            {t.pageLabel.replace("{page}", String(query.page))}
          </span>
          {hasMore ? (
            <Button asChild variant="outline" className="h-11">
              <Link href={pageHref(query, query.page + 1)}>{t.next}</Link>
            </Button>
          ) : (
            <span />
          )}
        </nav>
      ) : null}

      {canAdmit ? (
        <AdmitSheet
          t={t}
          open={admitting}
          onOpenChange={setAdmitting}
          sections={sections}
          defaultSectionId={query.sectionId}
          onAdmitted={setAdmitted}
        />
      ) : null}
    </div>
  )
}

function StudentLink({
  locale,
  student,
}: {
  locale: Locale
  student: RosterStudent
}) {
  const [primary, secondary] = names(locale, student)
  return (
    <Link
      href={`/app/students/${student.id}`}
      className="flex min-h-11 flex-col justify-center font-medium underline-offset-4 hover:underline"
    >
      <span>{primary}</span>
      {secondary ? (
        <span className="text-muted-foreground text-xs font-normal">
          {secondary}
        </span>
      ) : null}
    </Link>
  )
}

function AdmitSheet({
  t,
  open,
  onOpenChange,
  sections,
  defaultSectionId,
  onAdmitted,
}: {
  t: T
  open: boolean
  onOpenChange: (open: boolean) => void
  sections: SectionOption[]
  defaultSectionId?: string
  onAdmitted: (result: QuickAdmitResult & { name: string }) => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  // One key per filled-in form: a double tap replays, a new form is new.
  const [key, setKey] = useState(() => crypto.randomUUID())
  const formId = "admit-student"

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const text = (name: string) => String(data.get(name) ?? "")
    const roll = text("rollNumber").trim()
    setError(null)
    startTransition(async () => {
      const result = await quickAdmitStudent({
        idempotencyKey: key,
        firstName: text("firstName"),
        lastName: text("lastName"),
        fullNameBn: text("fullNameBn"),
        gender: text("gender"),
        dateOfBirth: text("dateOfBirth"),
        sectionId: text("sectionId"),
        rollNumber: roll ? Number(roll) : null,
        guardian: {
          relation: text("guardianRelation"),
          fullName: text("guardianName"),
          phone: text("guardianPhone"),
        },
      })
      if (!result.ok) {
        setError(admitErrorText(t, result.error))
        return
      }
      setKey(crypto.randomUUID())
      onAdmitted({
        ...result.data,
        name: `${text("firstName").trim()} ${text("lastName").trim()}`,
      })
      onOpenChange(false)
      router.refresh()
    })
  }

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t.admitTitle}
      description={t.admitDescription}
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
            disabled={pending || sections.length === 0}
          >
            {pending ? t.admitting : t.admit}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={onSubmit} className="space-y-4">
        {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}
        {sections.length === 0 ? (
          <InlineAlert tone="info">{t.noSections}</InlineAlert>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <Field id="admit-first" label={t.firstName}>
            <Input
              id="admit-first"
              name="firstName"
              required
              maxLength={60}
              autoComplete="off"
              className="h-11"
            />
          </Field>
          <Field id="admit-last" label={t.lastName}>
            <Input
              id="admit-last"
              name="lastName"
              required
              maxLength={60}
              autoComplete="off"
              className="h-11"
            />
          </Field>
        </div>
        <Field id="admit-bn" label={`${t.nameBn} (${t.optional})`}>
          <Input
            id="admit-bn"
            name="fullNameBn"
            lang="bn"
            maxLength={120}
            autoComplete="off"
            className="h-11"
          />
        </Field>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t.genderLabel}</legend>
          <RadioGroup name="gender" required className="grid grid-cols-3 gap-2">
            {GENDERS.map((gender) => (
              <Label
                key={gender}
                htmlFor={`admit-gender-${gender}`}
                className="border-input flex min-h-11 items-center gap-2 rounded-md border px-3 font-normal"
              >
                <RadioGroupItem value={gender} id={`admit-gender-${gender}`} />
                {t.gender[gender]}
              </Label>
            ))}
          </RadioGroup>
        </fieldset>
        <Field id="admit-dob" label={t.dateOfBirth}>
          <Input
            id="admit-dob"
            name="dateOfBirth"
            type="date"
            required
            min="1950-01-01"
            className="h-11"
          />
        </Field>
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <Field id="admit-section" label={t.section}>
            <NativeSelect
              id="admit-section"
              name="sectionId"
              required
              defaultValue={defaultSectionId ?? ""}
              className="min-h-11 w-full"
            >
              <NativeSelectOption value="" disabled>
                {t.chooseSection}
              </NativeSelectOption>
              {sections.map((section) => (
                <NativeSelectOption key={section.id} value={section.id}>
                  {section.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field id="admit-roll" label={t.rollNumber}>
            <Input
              id="admit-roll"
              name="rollNumber"
              type="number"
              inputMode="numeric"
              min={1}
              max={9999}
              aria-describedby="admit-roll-hint"
              className="h-11 w-24"
            />
          </Field>
        </div>
        <p id="admit-roll-hint" className="text-muted-foreground text-xs">
          {t.rollHint}
        </p>

        <fieldset className="space-y-4 border-t pt-4">
          <legend className="text-sm font-semibold">{t.guardianHeading}</legend>
          <Field id="admit-relation" label={t.guardianRelation}>
            <NativeSelect
              id="admit-relation"
              name="guardianRelation"
              required
              defaultValue="father"
              className="min-h-11 w-full"
            >
              {RELATIONS.map((relation) => (
                <NativeSelectOption key={relation} value={relation}>
                  {t.relation[relation]}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field id="admit-guardian" label={t.guardianName}>
            <Input
              id="admit-guardian"
              name="guardianName"
              required
              maxLength={120}
              autoComplete="off"
              className="h-11"
            />
          </Field>
          <Field id="admit-phone" label={t.guardianPhone}>
            <Input
              id="admit-phone"
              name="guardianPhone"
              type="tel"
              inputMode="tel"
              required
              autoComplete="off"
              aria-describedby="admit-phone-hint"
              className="h-11"
            />
            <p id="admit-phone-hint" className="text-muted-foreground text-xs">
              {t.phoneHint}
            </p>
          </Field>
        </fieldset>
      </form>
    </FormSheet>
  )
}

function Field({
  id,
  label,
  children,
}: {
  id: string
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  )
}
