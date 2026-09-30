"use client"

import { useState, useTransition } from "react"

import { useRouter } from "next/navigation"

import type {
  ApiError,
  GuardianRelation,
  QuickAdmitResult,
  StudentGender,
} from "@acadigma/contracts"
import { Button } from "@acadigma/ui/components/button"
import { Input } from "@acadigma/ui/components/input"
import { Label } from "@acadigma/ui/components/label"
import {
  NativeSelect,
  NativeSelectOption,
} from "@acadigma/ui/components/native-select"
import { RadioGroup, RadioGroupItem } from "@acadigma/ui/components/radio-group"
import { FormSheet } from "@acadigma/ui/primitives/form-sheet"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"

import type { Messages } from "@/lib/i18n"

import { quickAdmitStudent } from "./actions"

import type { SectionOption } from "./students-view"

/**
 * The quick-admit form (F-AC-02, D-103). Its own module so `StudentsView`
 * loads it only when the sheet is first opened: the form (sheet, inputs,
 * radio group, select) is not needed to read the roster, and
 * `/app/students` sits at the 250 kB first-load budget (D-408).
 */

type T = Messages["students"]

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

export function AdmitSheet({
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
