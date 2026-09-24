"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type { RefObject } from "react"

import { zodResolver } from "@hookform/resolvers/zod"
import {
  CheckIcon,
  ChevronsUpDownIcon,
  Loader2Icon,
  PlusIcon,
  XIcon,
} from "lucide-react"
import { useForm } from "react-hook-form"
import { z } from "zod"

import {
  createSchoolStep1Schema,
  createSchoolStep2Schema,
  createSchoolWorkspaceInputSchema,
  eiinSchema,
  schoolBoardSchema,
  schoolMediumSchema,
  type CreateSchoolDraft,
  type CreateSchoolStep1,
  type CreateSchoolStep2,
} from "@acadigma/contracts"
import {
  DEFAULT_WORKING_DAYS,
  GRADE_LEVEL_PRESETS,
  GRADE_LEVEL_RANGES,
  SAT_FIRST_ORDER,
  buildGradeLevels,
  splitGradeLevels,
  validateAcademicYearRange,
  type GradeLevelRange,
} from "@acadigma/domain/academic"
import { DEFAULT_TIMEZONE } from "@acadigma/domain/time"
import { Button } from "@acadigma/ui/components/button"
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@acadigma/ui/components/card"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@acadigma/ui/components/command"
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@acadigma/ui/components/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@acadigma/ui/components/select"
import { Toggle } from "@acadigma/ui/components/toggle"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@acadigma/ui/components/toggle-group"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"
import { OnboardingShell } from "@acadigma/ui/primitives/onboarding-shell"

import type { Messages } from "@/lib/i18n"
import type { Locale } from "@/lib/locale"

import {
  checkEiinAvailability,
  createSchoolWorkspace,
  saveOnboardingDraft,
} from "../../actions"

type WizardMessages = Messages["onboarding"]["wizard"]
export type Stage = 1 | 2 | 3 | 4
/** Four steps, not the spec's five: the logo step waits for file uploads
 * (D-100). */
const TOTAL_STEPS = 4

function stepLabel(t: WizardMessages, current: Stage): string {
  return t.stepOf
    .replace("{current}", String(current))
    .replace("{total}", String(TOTAL_STEPS))
}

/** What a step's submit handler reports back: either it advanced, or it
 * did not and says why — a top-level message, a specific field, or both. */
type StepOutcome =
  | { ok: true }
  | { ok: false; message?: string; fieldErrors?: Record<string, string> }

// `Intl.supportedValuesOf` (native, no dependency) lists every IANA zone the
// runtime knows about. PR #34 follow-up (Opus review + owner instruction):
// a plain `<Select>` over ~400 entries was unusable on touch even with
// typeahead — `timezone`'s field below is now a shadcn combobox
// (`Command` inside `Popover`, real search, not just typeahead), with
// `DEFAULT_TIMEZONE` ("Asia/Dhaka" — this app's primary market) pinned
// first rather than left in alphabetical order.
// Cast rather than relying on ambient lib typing: this app's tsconfig lib
// target (ES2023) predates `Intl.supportedValuesOf`'s own lib entry, even
// though every runtime this ships to (Node 24, evergreen browsers) has it.
function listIanaTimezones(): string[] {
  const supportedValuesOf = (
    Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
  ).supportedValuesOf
  const all =
    typeof supportedValuesOf === "function"
      ? supportedValuesOf("timeZone")
      : [DEFAULT_TIMEZONE]
  return all.includes(DEFAULT_TIMEZONE)
    ? [DEFAULT_TIMEZONE, ...all.filter((zone) => zone !== DEFAULT_TIMEZONE)]
    : all
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

/** REACT HIGH (PR #34 review): each step's `<h1>` (`OnboardingShell`'s own
 * contract, see its docblock lines 15-24) is where focus should land on a
 * client-side step transition. Each step (Step1..Step4) is its own
 * function component, so this fires exactly once per mount — which is
 * exactly once per step transition, since switching `stage` swaps which of
 * them is on screen.
 *
 * `shouldFocusRef` (final react review of a6588dc, blocking): a mount alone
 * is not a "step transition" — the FIRST mount is also just a direct page
 * load (or a resumed session landing straight on step 2), and stealing
 * focus there is wrong. `shouldFocusRef` is `CreateSchoolWizard`'s own
 * ref, flipped `true` by its `useEffect(() => {...}, [])` after its first
 * commit. React fires a subtree's effects bottom-up (children before their
 * parent) on every commit, so on the wizard's very first render this
 * child's mount effect runs BEFORE that parent effect sets the ref —
 * `shouldFocusRef.current` reads `false`, no focus. On every later stage
 * change the parent's own mount effect has already run once (it never
 * re-fires — empty deps), so the ref already reads `true` when the newly
 * mounted step's effect checks it, and focus moves as intended. */
function useFocusHeadingOnMount(shouldFocusRef: RefObject<boolean>) {
  const ref = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (shouldFocusRef.current) {
      ref.current?.focus()
    }
  }, [shouldFocusRef])
  return ref
}

/**
 * F-ID-05 §4.3 — the create-school wizard: identity, where and when
 * (Part 3), classes and review-and-create (Part 4). Steps are one
 * component's local state, not separate routes; every advance saves the
 * draft (including the idempotency key minted by `page.tsx`), so a closed
 * tab resumes where it left off.
 */
export function CreateSchoolWizard({
  t,
  initialStage,
  initialDraft,
  backLabel,
  locale,
  trialDays,
}: {
  t: WizardMessages
  initialStage: Stage
  initialDraft: CreateSchoolDraft
  locale: Locale
  /** `plans.trial_days` for Pro — the review step's trial line. */
  trialDays: number
  /** OPUS 1 (PR #34 review): none of this wizard's `OnboardingShell`
   * screens passed `backLabel`, so every locale saw the component's
   * hardcoded English default ("Back") regardless of `bn`. The caller
   * (`page.tsx`) supplies the localised `common.actions.back` string. */
  backLabel: string
}) {
  const [stage, setStage] = useState<Stage>(initialStage)
  const [draft, setDraft] = useState<CreateSchoolDraft>(initialDraft)
  const [eiinChecking, setEiinChecking] = useState(false)
  // Flips true after this component's own first commit — see
  // `useFocusHeadingOnMount`'s docblock. Never reset back to `false`
  // (empty deps): once the wizard has rendered once, every later stage
  // swap is a real transition.
  const hasRenderedOnceRef = useRef(false)
  useEffect(() => {
    hasRenderedOnceRef.current = true
  }, [])

  async function saveAndAdvance(
    nextStep: Stage,
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
    setStage(nextStep)
    return { ok: true }
  }

  async function handleStep1(values: CreateSchoolStep1): Promise<StepOutcome> {
    if (values.eiin) {
      setEiinChecking(true)
      const check = await checkEiinAvailability({ eiin: values.eiin })
      setEiinChecking(false)
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

  if (stage === 1) {
    return (
      <Step1
        t={t}
        draft={draft}
        onSubmit={handleStep1}
        eiinChecking={eiinChecking}
        backLabel={backLabel}
        shouldFocusRef={hasRenderedOnceRef}
      />
    )
  }

  if (stage === 2) {
    return (
      <Step2
        t={t}
        draft={draft}
        onBack={() => setStage(1)}
        onSubmit={handleStep2}
        backLabel={backLabel}
        shouldFocusRef={hasRenderedOnceRef}
      />
    )
  }

  if (stage === 3) {
    return (
      <Step3
        t={t}
        draft={draft}
        locale={locale}
        onBack={() => setStage(2)}
        onSubmit={(grade_levels) => saveAndAdvance(4, { grade_levels })}
        backLabel={backLabel}
        shouldFocusRef={hasRenderedOnceRef}
      />
    )
  }

  return (
    <Step4
      t={t}
      draft={draft}
      locale={locale}
      trialDays={trialDays}
      onBack={() => setStage(3)}
      onEdit={setStage}
      backLabel={backLabel}
      shouldFocusRef={hasRenderedOnceRef}
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
  eiinChecking,
  backLabel,
  shouldFocusRef,
}: {
  t: WizardMessages
  draft: CreateSchoolDraft
  onSubmit: (values: CreateSchoolStep1) => Promise<StepOutcome>
  eiinChecking: boolean
  backLabel: string
  shouldFocusRef: RefObject<boolean>
}) {
  const headingRef = useFocusHeadingOnMount(shouldFocusRef)
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
      ref={headingRef}
      title={t.step1Title}
      progress={{ current: 1, total: TOTAL_STEPS }}
      progressLabel={stepLabel(t, 1)}
      backHref="/onboarding"
      backLabel={backLabel}
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
                  <Input
                    autoComplete="organization"
                    className="h-11"
                    {...field}
                  />
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
                    className="h-11"
                    inputMode="numeric"
                    maxLength={6}
                    {...field}
                    value={field.value ?? ""}
                  />
                </FormControl>
                {eiinChecking ? (
                  <p
                    className="text-muted-foreground text-xs"
                    aria-live="polite"
                  >
                    {t.eiinChecking}
                  </p>
                ) : null}
                <details>
                  <summary className="text-muted-foreground inline-flex min-h-11 w-fit cursor-pointer items-center text-xs underline underline-offset-2">
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
                    className="text-primary inline-flex min-h-11 items-center text-xs underline underline-offset-2"
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
                {/* fieldset/legend, not FormLabel: ToggleGroup's root is a
                    `role="radiogroup"`, not a single focusable input, so
                    FormLabel's `htmlFor` would point at a form-item id no
                    element in this field ever carries (OPUS 6, PR #34
                    review) — the same reasoning `working_days` below
                    already used for `DayPickerRow`. */}
                <fieldset className="min-w-0 border-0 p-0">
                  <legend className="text-foreground mb-2 p-0 text-sm font-medium">
                    {t.mediumLabel}
                  </legend>
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    value={field.value ?? ""}
                    onValueChange={(value) => {
                      if (value) field.onChange(value)
                    }}
                    aria-label={t.mediumLabel}
                    className="flex-wrap"
                  >
                    {schoolMediumSchema.options.map((value) => (
                      <ToggleGroupItem
                        key={value}
                        value={value}
                        className="min-h-11 flex-1"
                      >
                        {t.mediums[value]}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </fieldset>
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
                    <SelectTrigger className="w-full data-[size=default]:h-11">
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
  backLabel,
  shouldFocusRef,
}: {
  t: WizardMessages
  draft: CreateSchoolDraft
  onBack: () => void
  onSubmit: (values: CreateSchoolStep2) => Promise<StepOutcome>
  backLabel: string
  shouldFocusRef: RefObject<boolean>
}) {
  const headingRef = useFocusHeadingOnMount(shouldFocusRef)
  const [formError, setFormError] = useState<string | null>(null)
  const [detectedTimezone, setDetectedTimezone] = useState<string | null>(null)
  const [timezoneOpen, setTimezoneOpen] = useState(false)

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
    const outcome = await onSubmit(values)
    if (outcome.ok) return
    if (outcome.fieldErrors?.academic_year) {
      // OPUS 6 (PR #34 review): a manual RHF error, not local state — it
      // gets FormControl's aria-describedby/aria-invalid wiring and
      // FormMessage rendering for free, and `clearErrors` below (called
      // from both date fields' onChange) clears it the moment the user
      // edits either date, instead of it lingering until the next submit.
      form.setError("academic_year.ends_on", {
        type: "manual",
        message: outcome.fieldErrors.academic_year,
      })
    }
    if (outcome.message) setFormError(outcome.message)
  }

  const startsOn = form.watch("academic_year.starts_on")

  return (
    <OnboardingShell
      ref={headingRef}
      title={t.step2Title}
      progress={{ current: 2, total: TOTAL_STEPS }}
      progressLabel={stepLabel(t, 2)}
      onBack={onBack}
      backLabel={backLabel}
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
                {/* PR #34 follow-up: a shadcn combobox (Command inside
                    Popover) replaces the plain ~400-entry Select — real
                    search, not just typeahead, and DEFAULT_TIMEZONE
                    ("Asia/Dhaka") sorts first (see `listIanaTimezones`
                    above). Resolves OPUS 3's "unusable on touch" finding. */}
                <Popover open={timezoneOpen} onOpenChange={setTimezoneOpen}>
                  <FormControl>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        role="combobox"
                        aria-expanded={timezoneOpen}
                        className="h-11 w-full justify-between font-normal"
                      >
                        {field.value}
                        <ChevronsUpDownIcon
                          className="text-muted-foreground"
                          aria-hidden="true"
                        />
                      </Button>
                    </PopoverTrigger>
                  </FormControl>
                  <PopoverContent
                    align="start"
                    className="w-(--radix-popover-trigger-width) p-0"
                  >
                    <Command>
                      <CommandInput placeholder={t.timezoneSearchPlaceholder} />
                      <CommandList>
                        <CommandEmpty>{t.timezoneNoResults}</CommandEmpty>
                        <CommandGroup>
                          {TIMEZONES.map((zone) => (
                            <CommandItem
                              key={zone}
                              value={zone}
                              onSelect={() => {
                                field.onChange(zone)
                                setTimezoneOpen(false)
                              }}
                            >
                              <CheckIcon
                                aria-hidden="true"
                                className={
                                  zone === field.value
                                    ? "opacity-100"
                                    : "opacity-0"
                                }
                              />
                              {zone}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {detectedTimezone && detectedTimezone !== field.value ? (
                  <button
                    type="button"
                    onClick={() => field.onChange(detectedTimezone)}
                    className="text-primary inline-flex min-h-11 w-fit items-center text-xs underline underline-offset-2"
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
                {/* fieldset/legend, not FormLabel — same reasoning as the
                    medium field above; ToggleGroup's root here is
                    `role="toolbar"` (Radix's `type="multiple"` shape). */}
                <fieldset className="min-w-0 border-0 p-0">
                  <legend className="text-foreground mb-2 p-0 text-sm font-medium">
                    {t.workingDaysLabel}
                  </legend>
                  <ToggleGroup
                    type="multiple"
                    variant="outline"
                    value={field.value.map(String)}
                    onValueChange={(values) =>
                      field.onChange(values.map(Number))
                    }
                    aria-label={t.workingDaysLabel}
                    className="flex-wrap"
                  >
                    {dayOptions.map((option) => (
                      <ToggleGroupItem
                        key={option.value}
                        value={String(option.value)}
                        aria-label={option.fullLabel}
                        className="min-h-11 min-w-11 rounded-full"
                      >
                        {option.label}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                  <p className="text-muted-foreground mt-2 text-xs">
                    {t.workingDaysHelp}
                  </p>
                </fieldset>
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
                    <Input className="h-11" {...field} />
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
                    {/* PR #34 follow-up (ponytail): the platform's own
                        `<input type="date">` is already accessible and
                        keyboard-operable — no reason for a bespoke
                        `DateField` primitive over one native input inside
                        the same `FormControl` every other field here uses. */}
                    <FormLabel>{t.academicYearStartLabel}</FormLabel>
                    <FormControl>
                      <Input
                        className="h-11"
                        type="date"
                        {...field}
                        onChange={(event) => {
                          field.onChange(event)
                          form.clearErrors("academic_year.ends_on")
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="academic_year.ends_on"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.academicYearEndLabel}</FormLabel>
                    <FormControl>
                      <Input
                        className="h-11"
                        type="date"
                        min={startsOn}
                        {...field}
                        onChange={(event) => {
                          field.onChange(event)
                          form.clearErrors("academic_year.ends_on")
                        }}
                      />
                    </FormControl>
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

// ---------------------------------------------------------------------------
// Step 3 — Classes (§4.3)
// ---------------------------------------------------------------------------
const RANGE_LABEL_KEYS = {
  primary: "presetPrimary",
  secondary: "presetSecondary",
  hsc: "presetHsc",
} as const satisfies Record<GradeLevelRange, keyof WizardMessages>

type GradeLevels = NonNullable<CreateSchoolDraft["grade_levels"]>

function Step3({
  t,
  draft,
  locale,
  onBack,
  onSubmit,
  backLabel,
  shouldFocusRef,
}: {
  t: WizardMessages
  draft: CreateSchoolDraft
  locale: Locale
  onBack: () => void
  onSubmit: (gradeLevels: GradeLevels) => Promise<StepOutcome>
  backLabel: string
  shouldFocusRef: RefObject<boolean>
}) {
  const headingRef = useFocusHeadingOnMount(shouldFocusRef)
  const [initial] = useState(() => splitGradeLevels(draft.grade_levels ?? []))
  const [selectedKeys, setSelectedKeys] = useState<string[]>(
    initial.selectedKeys
  )
  const [customNames, setCustomNames] = useState<string[]>(initial.customNames)
  const [customInput, setCustomInput] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const levels = buildGradeLevels(selectedKeys, customNames)
  const count = levels.length

  function toggleRange(range: GradeLevelRange, pressed: boolean) {
    const keys: readonly string[] = GRADE_LEVEL_RANGES[range]
    setSelectedKeys((current) =>
      pressed
        ? [...new Set([...current, ...keys])]
        : current.filter((key) => !keys.includes(key))
    )
    setError(null)
  }

  function addCustom() {
    const name = customInput.trim()
    if (!name) return
    // buildGradeLevels drops a duplicate; keep the name only if it survives.
    if (buildGradeLevels(selectedKeys, [...customNames, name]).length > count) {
      setCustomNames((current) => [...current, name])
    }
    setCustomInput("")
    setError(null)
  }

  async function handleContinue() {
    if (count === 0) {
      setError(t.classesRequired)
      return
    }
    setSubmitting(true)
    const outcome = await onSubmit(levels)
    setSubmitting(false)
    if (!outcome.ok) setError(outcome.message ?? t.saveError)
  }

  return (
    <OnboardingShell
      ref={headingRef}
      title={t.step3Title}
      progress={{ current: 3, total: TOTAL_STEPS }}
      progressLabel={stepLabel(t, 3)}
      onBack={onBack}
      backLabel={backLabel}
    >
      <div className="space-y-6">
        {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}

        <fieldset className="min-w-0 border-0 p-0">
          <legend className="text-foreground mb-2 p-0 text-sm font-medium">
            {t.classesPresetsLabel}
          </legend>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(GRADE_LEVEL_RANGES) as GradeLevelRange[]).map(
              (range) => (
                <Toggle
                  key={range}
                  variant="outline"
                  pressed={GRADE_LEVEL_RANGES[range].every((key) =>
                    selectedKeys.includes(key)
                  )}
                  onPressedChange={(next) => toggleRange(range, next)}
                  className="group min-h-11 px-3"
                >
                  <CheckIcon
                    aria-hidden="true"
                    className="hidden group-data-[state=on]:inline"
                  />
                  {t[RANGE_LABEL_KEYS[range]]}
                </Toggle>
              )
            )}
          </div>
        </fieldset>

        <fieldset className="min-w-0 border-0 p-0">
          <legend className="text-foreground mb-2 p-0 text-sm font-medium">
            {t.classesIndividualLabel}
          </legend>
          <ToggleGroup
            type="multiple"
            variant="outline"
            value={selectedKeys}
            onValueChange={(value) => {
              setSelectedKeys(value)
              setError(null)
            }}
            aria-label={t.classesIndividualLabel}
            className="flex-wrap justify-start gap-2"
          >
            {GRADE_LEVEL_PRESETS.map((preset) => (
              <ToggleGroupItem
                key={preset.key}
                value={preset.key}
                className="group min-h-11 min-w-11 flex-none px-3"
              >
                <CheckIcon
                  aria-hidden="true"
                  className="hidden group-data-[state=on]:inline"
                />
                {locale === "bn" ? preset.name_bn : preset.name}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </fieldset>

        <div className="space-y-2">
          <label
            htmlFor="custom-grade-level"
            className="text-foreground block text-sm font-medium"
          >
            {t.customLabel}
          </label>
          <div className="flex gap-2">
            <Input
              id="custom-grade-level"
              value={customInput}
              maxLength={60}
              placeholder={t.customPlaceholder}
              onChange={(event) => setCustomInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  addCustom()
                }
              }}
              className="h-11"
            />
            <Button
              type="button"
              variant="outline"
              className="h-11"
              onClick={addCustom}
            >
              <PlusIcon aria-hidden="true" />
              {t.customAdd}
            </Button>
          </div>
          {customNames.length > 0 ? (
            <ul className="flex flex-wrap gap-2 pt-1">
              {customNames.map((name) => (
                <li
                  key={name}
                  className="border-input flex min-h-11 items-center gap-1 rounded-md border pl-3 text-sm"
                >
                  {name}
                  <button
                    type="button"
                    onClick={() =>
                      setCustomNames((current) =>
                        current.filter((n) => n !== name)
                      )
                    }
                    aria-label={t.customRemove.replace("{name}", name)}
                    className="text-muted-foreground hover:text-foreground inline-flex size-11 items-center justify-center"
                  >
                    <XIcon className="size-4" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <p className="text-muted-foreground text-sm" aria-live="polite">
          {count === 1
            ? t.classesCountOne
            : t.classesCountOther.replace("{count}", String(count))}
        </p>

        <Button
          type="button"
          className="h-12 w-full"
          disabled={submitting}
          onClick={handleContinue}
        >
          {submitting ? (
            <>
              <Loader2Icon className="animate-spin" aria-hidden="true" />
              {t.continuingButton}
            </>
          ) : (
            t.continueButton
          )}
        </Button>
      </div>
    </OnboardingShell>
  )
}

// ---------------------------------------------------------------------------
// Step 4 — Review and create (spec §4.3 step 5; the logo step is deferred,
// D-100)
// ---------------------------------------------------------------------------
type ReviewError = { message: string; editStage?: Stage }

function Step4({
  t,
  draft,
  locale,
  trialDays,
  onBack,
  onEdit,
  backLabel,
  shouldFocusRef,
}: {
  t: WizardMessages
  draft: CreateSchoolDraft
  locale: Locale
  trialDays: number
  onBack: () => void
  onEdit: (stage: Stage) => void
  backLabel: string
  shouldFocusRef: RefObject<boolean>
}) {
  const headingRef = useFocusHeadingOnMount(shouldFocusRef)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<ReviewError | null>(null)
  const errorRef = useRef<HTMLDivElement>(null)

  // Move focus to a failure so a screen-reader user hears it (§6: "a single
  // InlineAlert naming the failed step").
  useEffect(() => {
    if (error) errorRef.current?.focus()
  }, [error])

  const workingDays = SAT_FIRST_ORDER.filter((day) =>
    (draft.working_days ?? []).includes(day)
  )
    .map((day) => t.daysFull[String(day) as keyof WizardMessages["daysFull"]])
    .join(", ")
  const levels = draft.grade_levels ?? []
  const year = draft.academic_year

  async function handleCreate() {
    setError(null)
    const input = createSchoolWorkspaceInputSchema.safeParse(draft)
    if (!input.success) {
      setError({ message: t.createIncomplete, editStage: 1 })
      return
    }
    setCreating(true)
    const result = await createSchoolWorkspace(input.data)
    if (result.ok) {
      // A full navigation, so /app renders against the new workspace cookie.
      window.location.assign(result.data.landingRoute)
      return
    }
    setCreating(false)
    if (result.error.fieldErrors?.["eiin"]) {
      setError({ message: t.eiinTaken, editStage: 1 })
    } else if (result.error.code === "rate_limited") {
      setError({ message: t.createRateLimited })
    } else {
      setError({ message: t.createError })
    }
  }

  const sections: { stage: Stage; title: string; rows: [string, string][] }[] =
    [
      {
        stage: 1,
        title: t.reviewIdentity,
        rows: [
          [t.reviewName, draft.name ?? ""],
          [t.reviewEiin, draft.eiin ?? t.reviewEiinNone],
          [t.reviewMedium, draft.medium ? t.mediums[draft.medium] : ""],
          [t.reviewBoard, draft.board ? t.boards[draft.board] : ""],
        ],
      },
      {
        stage: 2,
        title: t.reviewWhereWhen,
        rows: [
          [t.reviewTimezone, draft.timezone ?? ""],
          [t.reviewWorkingDays, workingDays],
          [
            t.reviewAcademicYear,
            `${year?.name ?? ""} (${year?.starts_on ?? ""} – ${year?.ends_on ?? ""})`,
          ],
        ],
      },
    ]

  function editButton(stage: Stage, title: string) {
    return (
      <CardAction>
        <Button
          type="button"
          variant="ghost"
          className="h-11"
          onClick={() => onEdit(stage)}
          aria-label={t.reviewEditLabel.replace("{section}", title)}
        >
          {t.reviewEdit}
        </Button>
      </CardAction>
    )
  }

  return (
    <OnboardingShell
      ref={headingRef}
      title={t.step4Title}
      progress={{ current: 4, total: TOTAL_STEPS }}
      progressLabel={stepLabel(t, 4)}
      onBack={onBack}
      backLabel={backLabel}
    >
      <div className="space-y-4">
        {error ? (
          <div ref={errorRef} tabIndex={-1} className="space-y-2 outline-none">
            <InlineAlert tone="error">{error.message}</InlineAlert>
            {error.editStage ? (
              <Button
                type="button"
                variant="outline"
                className="h-11"
                onClick={() => onEdit(error.editStage ?? 1)}
              >
                {t.reviewEditLabel.replace("{section}", t.reviewIdentity)}
              </Button>
            ) : null}
          </div>
        ) : null}

        {sections.map((section) => (
          <Card key={section.stage} className="gap-3 py-4">
            <CardHeader className="px-4">
              <CardTitle>
                <h2 className="text-base">{section.title}</h2>
              </CardTitle>
              {editButton(section.stage, section.title)}
            </CardHeader>
            <CardContent className="px-4">
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                {section.rows.map(([label, value]) => (
                  <div key={label} className="contents">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="min-w-0 break-words">{value}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
        ))}

        <Card className="gap-3 py-4">
          <CardHeader className="px-4">
            <CardTitle>
              <h2 className="text-base">{t.reviewClasses}</h2>
            </CardTitle>
            {editButton(3, t.reviewClasses)}
          </CardHeader>
          <CardContent className="px-4">
            <p className="text-muted-foreground mb-2 text-sm">
              {levels.length === 1
                ? t.classesCountOne
                : t.classesCountOther.replace("{count}", String(levels.length))}
            </p>
            <ul className="flex flex-wrap gap-1.5 text-sm">
              {levels.map((level) => (
                <li
                  key={level.level_number}
                  className="bg-muted rounded-md px-2 py-1"
                >
                  {locale === "bn" ? level.name_bn : level.name}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <p className="text-sm font-medium">
          {t.trialLine.replace("{days}", String(trialDays))}
        </p>

        <Button
          type="button"
          className="h-12 w-full"
          disabled={creating}
          onClick={handleCreate}
        >
          {creating ? (
            <>
              <Loader2Icon className="animate-spin" aria-hidden="true" />
              {t.creatingButton}
            </>
          ) : (
            t.createButton
          )}
        </Button>
      </div>
    </OnboardingShell>
  )
}
