"use client"

import { useEffect, useMemo, useState } from "react"

import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2Icon } from "lucide-react"
import { useForm } from "react-hook-form"
import { z } from "zod"

import {
  createSchoolStep1Schema,
  createSchoolStep2Schema,
  eiinSchema,
  schoolBoardSchema,
  schoolMediumSchema,
  type CreateSchoolDraft,
  type CreateSchoolStep1,
  type CreateSchoolStep2,
} from "@acadigma/contracts"
import {
  DEFAULT_WORKING_DAYS,
  SAT_FIRST_ORDER,
  validateAcademicYearRange,
} from "@acadigma/domain/academic"
import { DEFAULT_TIMEZONE } from "@acadigma/domain/time"
import { Button } from "@acadigma/ui/components/button"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@acadigma/ui/components/form"
import { Input } from "@acadigma/ui/components/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@acadigma/ui/components/select"
import { DateField } from "@acadigma/ui/primitives/date-field"
import { DayPickerRow } from "@acadigma/ui/primitives/day-picker-row"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"
import { OnboardingShell } from "@acadigma/ui/primitives/onboarding-shell"
import { SegmentedControl } from "@acadigma/ui/primitives/segmented-control"

import type { Messages } from "@/lib/i18n"

import { checkEiinAvailability, saveOnboardingDraft } from "../../actions"

type WizardMessages = Messages["onboarding"]["wizard"]
type Stage = 1 | 2 | "done"

/** What a step's submit handler reports back: either it advanced, or it
 * did not and says why — a top-level message, a specific field, or both. */
type StepOutcome =
  | { ok: true }
  | { ok: false; message?: string; fieldErrors?: Record<string, string> }

// `Intl.supportedValuesOf` (native, no dependency) lists every IANA zone the
// runtime knows about — the wizard's search-by-typing (Radix `Select`'s
// built-in typeahead) is what makes a ~400-entry list usable, standing in
// for the spec's "searchable" board/timezone selects without a bespoke
// Command+Sheet combobox (§11 records this as a deliberate simplification).
// Cast rather than relying on ambient lib typing: this app's tsconfig lib
// target (ES2023) predates `Intl.supportedValuesOf`'s own lib entry, even
// though every runtime this ships to (Node 24, evergreen browsers) has it.
function listIanaTimezones(): string[] {
  const supportedValuesOf = (
    Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
  ).supportedValuesOf
  return typeof supportedValuesOf === "function"
    ? supportedValuesOf("timeZone")
    : [DEFAULT_TIMEZONE]
}

const TIMEZONES: string[] = listIanaTimezones()

/**
 * `createSchoolStep1Schema`'s own `eiin` accepts a 6-digit string or
 * `undefined` — never `""`. A controlled `<input>` always holds a string,
 * so an untouched, correctly-left-blank field arrives at the resolver as
 * `""`, not `undefined`. This form-only schema accepts that third shape;
 * `handleSubmit` below normalises `""` back to `undefined` before calling
 * the shared `onSubmit(values: CreateSchoolStep1)` contract.
 */
const step1FormSchema = createSchoolStep1Schema.extend({
  eiin: z.union([z.literal(""), eiinSchema]).optional(),
})
type Step1FormValues = z.infer<typeof step1FormSchema>

/**
 * F-ID-05 Part 3 §4.3 — steps 1-2 of the create-school wizard. Steps are one
 * component's local state, not separate routes (§4.3: draft saves on
 * advance, not a URL change per step) — Part 4 owns steps 3-5, so the only
 * things past step 2 are "save and stop here for now" (§8 Part 3 scope:
 * "do not create the workspace yet").
 */
export function CreateSchoolWizard({
  t,
  initialStage,
  initialDraft,
}: {
  t: WizardMessages
  initialStage: Stage
  initialDraft: CreateSchoolDraft
}) {
  const [stage, setStage] = useState<Stage>(initialStage)
  const [draft, setDraft] = useState<CreateSchoolDraft>(initialDraft)

  async function saveAndAdvance(
    nextStep: 2 | 3,
    patch: Partial<CreateSchoolDraft>
  ): Promise<StepOutcome> {
    const merged = { ...draft, ...patch }
    const saved = await saveOnboardingDraft({
      path: "create_school",
      step: nextStep,
      draft: merged,
    })
    if (!saved.ok) return { ok: false, message: t.saveError }
    setDraft(merged)
    setStage(nextStep === 2 ? 2 : "done")
    return { ok: true }
  }

  async function handleStep1(values: CreateSchoolStep1): Promise<StepOutcome> {
    if (values.eiin) {
      const check = await checkEiinAvailability({ eiin: values.eiin })
      if (!check.ok) return { ok: false, message: t.eiinCheckError }
      if (!check.data.available) {
        return { ok: false, fieldErrors: { eiin: t.eiinTaken } }
      }
    }
    return saveAndAdvance(2, values)
  }

  async function handleStep2(values: CreateSchoolStep2): Promise<StepOutcome> {
    const range = validateAcademicYearRange(values.academic_year)
    if (!range.ok) {
      return {
        ok: false,
        fieldErrors: {
          academic_year:
            range.issue === "ends_before_starts"
              ? t.dateRangeEndsBeforeStarts
              : t.dateRangeTooLong,
        },
      }
    }
    return saveAndAdvance(3, values)
  }

  if (stage === "done") {
    return (
      <OnboardingShell title={t.moreComingTitle} onBack={() => setStage(2)}>
        <div className="space-y-6">
          <p className="text-muted-foreground text-sm">
            {t.moreComingBody.replace("{name}", draft.name ?? "")}
          </p>
          <Button asChild className="h-12 w-full">
            <a href="/onboarding">{t.backToChooser}</a>
          </Button>
        </div>
      </OnboardingShell>
    )
  }

  if (stage === 1) {
    return <Step1 t={t} draft={draft} onSubmit={handleStep1} />
  }

  return (
    <Step2
      t={t}
      draft={draft}
      onBack={() => setStage(1)}
      onSubmit={handleStep2}
    />
  )
}

// ---------------------------------------------------------------------------
// Step 1 — Identity (§4.3)
// ---------------------------------------------------------------------------
function Step1({
  t,
  draft,
  onSubmit,
}: {
  t: WizardMessages
  draft: CreateSchoolDraft
  onSubmit: (values: CreateSchoolStep1) => Promise<StepOutcome>
}) {
  const [formError, setFormError] = useState<string | null>(null)
  const form = useForm<Step1FormValues>({
    resolver: zodResolver(step1FormSchema),
    defaultValues: {
      name: draft.name ?? "",
      eiin: draft.eiin ?? "",
      board: draft.board,
      medium: draft.medium,
    },
  })

  async function handleSubmit(values: Step1FormValues) {
    setFormError(null)
    const outcome = await onSubmit({
      ...values,
      eiin: values.eiin ? values.eiin : undefined,
    })
    if (outcome.ok) return
    if (outcome.fieldErrors?.eiin) {
      form.setError("eiin", {
        type: "manual",
        message: outcome.fieldErrors.eiin,
      })
    }
    if (outcome.message) setFormError(outcome.message)
  }

  return (
    <OnboardingShell
      title={t.step1Title}
      progress={{ current: 1, total: 5 }}
      backHref="/onboarding"
    >
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(handleSubmit)}
          className="space-y-5"
          noValidate
        >
          {formError ? (
            <InlineAlert tone="error">{formError}</InlineAlert>
          ) : null}

          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t.nameLabel}</FormLabel>
                <FormControl>
                  <Input autoComplete="organization" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="eiin"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t.eiinLabel}</FormLabel>
                <FormControl>
                  <Input
                    inputMode="numeric"
                    maxLength={6}
                    {...field}
                    value={field.value ?? ""}
                  />
                </FormControl>
                <details>
                  <summary className="text-muted-foreground w-fit cursor-pointer text-xs underline underline-offset-2">
                    {t.eiinHelperTitle}
                  </summary>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {t.eiinHelperBody}
                  </p>
                </details>
                <FormMessage />
                {form.formState.errors.eiin?.type === "manual" ? (
                  <a
                    href="mailto:support@acadigma.com"
                    className="text-primary block text-xs underline underline-offset-2"
                  >
                    {t.eiinTakenContact}
                  </a>
                ) : null}
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="medium"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t.mediumLabel}</FormLabel>
                {/* Not wrapped in FormControl: SegmentedControl is a
                    multi-button radiogroup, not a single focusable input —
                    it already carries its own accessible name via
                    `label`/`aria-label`, so there is no single element for
                    FormControl's Slot to attach `id`/`aria-describedby` to. */}
                <SegmentedControl
                  label={t.mediumLabel}
                  options={schoolMediumSchema.options.map((value) => ({
                    value,
                    label: t.mediums[value],
                  }))}
                  value={field.value}
                  onChange={field.onChange}
                />
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="board"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t.boardLabel}</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={t.boardPlaceholder} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {schoolBoardSchema.options.map((value) => (
                      <SelectItem key={value} value={value}>
                        {t.boards[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button
            type="submit"
            className="h-12 w-full"
            disabled={form.formState.isSubmitting}
          >
            {form.formState.isSubmitting ? (
              <>
                <Loader2Icon className="animate-spin" aria-hidden="true" />
                {t.continuingButton}
              </>
            ) : (
              t.continueButton
            )}
          </Button>
        </form>
      </Form>
    </OnboardingShell>
  )
}

// ---------------------------------------------------------------------------
// Step 2 — Where and when (§4.3)
// ---------------------------------------------------------------------------
function Step2({
  t,
  draft,
  onBack,
  onSubmit,
}: {
  t: WizardMessages
  draft: CreateSchoolDraft
  onBack: () => void
  onSubmit: (values: CreateSchoolStep2) => Promise<StepOutcome>
}) {
  const [formError, setFormError] = useState<string | null>(null)
  const [dateRangeError, setDateRangeError] = useState<string | null>(null)
  const [detectedTimezone, setDetectedTimezone] = useState<string | null>(null)

  const currentYear = useMemo(() => new Date().getFullYear(), [])
  const defaultAcademicYear = useMemo(
    () => ({
      name: String(currentYear),
      starts_on: `${currentYear}-01-01`,
      ends_on: `${currentYear}-12-31`,
    }),
    [currentYear]
  )

  const form = useForm<CreateSchoolStep2>({
    resolver: zodResolver(createSchoolStep2Schema),
    defaultValues: {
      timezone: draft.timezone ?? DEFAULT_TIMEZONE,
      working_days: draft.working_days ?? [...DEFAULT_WORKING_DAYS],
      academic_year: {
        name: draft.academic_year?.name ?? defaultAcademicYear.name,
        starts_on:
          draft.academic_year?.starts_on ?? defaultAcademicYear.starts_on,
        ends_on: draft.academic_year?.ends_on ?? defaultAcademicYear.ends_on,
      },
    },
  })

  // Browser-only: the server has no meaningful "local" zone, so this is
  // computed after mount rather than during render (avoids an SSR/client
  // hydration mismatch) and is offered as a suggestion chip only — never
  // silently applied (§5).
  useEffect(() => {
    try {
      setDetectedTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone)
    } catch {
      // Stays null; the chip simply does not render.
    }
  }, [])

  // Keyed on the exact literal union `SAT_FIRST_ORDER` produces (not a
  // general `Record<number, string>`) so indexing stays `string`, not
  // `string | undefined`, under this project's `noUncheckedIndexedAccess`.
  const dayLabels: Record<(typeof SAT_FIRST_ORDER)[number], string> = {
    6: t.days["6"],
    7: t.days["7"],
    1: t.days["1"],
    2: t.days["2"],
    3: t.days["3"],
    4: t.days["4"],
    5: t.days["5"],
  }
  const dayFullLabels: Record<(typeof SAT_FIRST_ORDER)[number], string> = {
    6: t.daysFull["6"],
    7: t.daysFull["7"],
    1: t.daysFull["1"],
    2: t.daysFull["2"],
    3: t.daysFull["3"],
    4: t.daysFull["4"],
    5: t.daysFull["5"],
  }
  const dayOptions = SAT_FIRST_ORDER.map((value) => ({
    value,
    label: dayLabels[value],
    fullLabel: dayFullLabels[value],
  }))

  async function handleSubmit(values: CreateSchoolStep2) {
    setFormError(null)
    setDateRangeError(null)
    const outcome = await onSubmit(values)
    if (outcome.ok) return
    if (outcome.fieldErrors?.academic_year) {
      setDateRangeError(outcome.fieldErrors.academic_year)
    }
    if (outcome.message) setFormError(outcome.message)
  }

  const startsOn = form.watch("academic_year.starts_on")

  return (
    <OnboardingShell
      title={t.step2Title}
      progress={{ current: 2, total: 5 }}
      onBack={onBack}
    >
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(handleSubmit)}
          className="space-y-6"
          noValidate
        >
          {formError ? (
            <InlineAlert tone="error">{formError}</InlineAlert>
          ) : null}

          <FormField
            control={form.control}
            name="timezone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t.timezoneLabel}</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {TIMEZONES.map((zone) => (
                      <SelectItem key={zone} value={zone}>
                        {zone}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {detectedTimezone && detectedTimezone !== field.value ? (
                  <button
                    type="button"
                    onClick={() => field.onChange(detectedTimezone)}
                    className="text-primary w-fit text-xs underline underline-offset-2"
                  >
                    {t.timezoneSuggestion.replace(
                      "{timezone}",
                      detectedTimezone
                    )}
                  </button>
                ) : null}
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="working_days"
            render={({ field }) => (
              <FormItem>
                {/* Not wrapped in FormControl — DayPickerRow is a
                    `fieldset` of seven chips, not one focusable input; its
                    own `legend` already gives it an accessible name. */}
                <DayPickerRow
                  legend={t.workingDaysLabel}
                  options={dayOptions}
                  value={field.value}
                  onChange={field.onChange}
                />
                <p className="text-muted-foreground text-xs">
                  {t.workingDaysHelp}
                </p>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="space-y-4">
            <FormField
              control={form.control}
              name="academic_year.name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.academicYearNameLabel}</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="academic_year.starts_on"
                render={({ field }) => (
                  <FormItem>
                    {/* Not wrapped in FormControl — DateField renders its
                        own <Label>/<Input> pair and manages its own
                        aria-describedby; FormMessage still works here since
                        it only needs the surrounding FormItem/FormField
                        context, not FormControl. */}
                    <DateField
                      id="academic-year-starts-on"
                      label={t.academicYearStartLabel}
                      value={field.value}
                      onChange={field.onChange}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="academic_year.ends_on"
                render={({ field }) => (
                  <FormItem>
                    <DateField
                      id="academic-year-ends-on"
                      label={t.academicYearEndLabel}
                      value={field.value}
                      onChange={field.onChange}
                      min={startsOn}
                      errorText={dateRangeError ?? undefined}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>

          <Button
            type="submit"
            className="h-12 w-full"
            disabled={form.formState.isSubmitting}
          >
            {form.formState.isSubmitting ? (
              <>
                <Loader2Icon className="animate-spin" aria-hidden="true" />
                {t.continuingButton}
              </>
            ) : (
              t.continueButton
            )}
          </Button>
        </form>
      </Form>
    </OnboardingShell>
  )
}
