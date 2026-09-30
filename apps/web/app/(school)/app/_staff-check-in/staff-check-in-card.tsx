"use client"

import { useEffect, useState, useTransition } from "react"

import { ClockIcon, LogInIcon, LogOutIcon } from "lucide-react"

import type {
  StaffAttendanceRecord,
  StaffCheckInToday,
} from "@acadigma/contracts"
import { checkInCardState } from "@acadigma/domain/staff-attendance"
import { Button } from "@acadigma/ui/components/button"
import { Card } from "@acadigma/ui/components/card"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"

import type { Messages } from "@/lib/i18n"

import { checkInToday, checkOutToday } from "./actions"

type T = Messages["staffCheckIn"]

const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""))

/** Server error codes -> the reader's language. */
function codeMessage(code: string, t: T): string {
  switch (code) {
    case "forbidden":
      return t.errors.forbidden
    case "payment_required":
      return t.errors.readOnly
    case "conflict":
      return t.errors.noSchool
    default:
      return t.errors.generic
  }
}

/**
 * F-AC-04 Part 1 (D-214): the staff self check-in card, shared by
 * `/app/dashboard` and the basic-mode `/app/home`. One big button (Fitts), one
 * state at a time, no choices (Hick). The recorded time is the server's, so
 * the button shows a pending state rather than guessing it (app-polish:
 * optimistic updates are for actions a wrong guess costs nothing; this writes
 * an attendance record). The live clock is for looking at only — the client's
 * clock is never sent.
 */
export function StaffCheckInCard({
  initial,
  t,
  locale,
}: {
  initial: StaffCheckInToday
  t: T
  locale: string
}) {
  const [record, setRecord] = useState<StaffAttendanceRecord | null>(
    initial.record
  )
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  // Rendered after mount only: the server and the browser disagree on "now".
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    // In timer callbacks only (no synchronous setState in the effect body).
    const first = setTimeout(() => setNow(new Date()), 0)
    const id = setInterval(() => setNow(new Date()), 20_000)
    return () => {
      clearTimeout(first)
      clearInterval(id)
    }
  }, [])

  // Western digits in both languages (DESIGN-SYSTEM §1.6).
  const clock = new Intl.DateTimeFormat(
    locale === "bn" ? "bn-BD-u-nu-latn" : "en-GB",
    { hour: "2-digit", minute: "2-digit", timeZone: initial.timezone }
  )
  const at = (iso: string | null) => (iso ? clock.format(new Date(iso)) : "")

  const state = checkInCardState({
    isSchoolDay: initial.isSchoolDay,
    record,
  })

  function run(action: typeof checkInToday) {
    setError(null)
    startTransition(async () => {
      const result = await action()
      if (result.ok) setRecord(result.data)
      else setError(codeMessage(result.error.code, t))
    })
  }

  return (
    <Card
      className="gap-3 px-5 py-4"
      role="region"
      aria-labelledby="staff-checkin-title"
    >
      <div className="flex items-center justify-between gap-3">
        <h3
          id="staff-checkin-title"
          className="text-base leading-tight font-medium"
        >
          {t.title}
        </h3>
        {state !== "no_school" && now ? (
          <span className="text-muted-foreground inline-flex items-center gap-1.5 text-sm tabular-nums">
            <ClockIcon className="size-4" aria-hidden="true" />
            {clock.format(now)}
          </span>
        ) : null}
      </div>

      {state === "no_school" ? (
        <p className="text-muted-foreground text-base">{t.noSchool}</p>
      ) : null}

      {state === "can_check_in" ? (
        <Button
          type="button"
          size="lg"
          className="min-h-16 w-full text-lg"
          disabled={pending}
          onClick={() => run(checkInToday)}
        >
          <LogInIcon aria-hidden="true" />
          {pending ? t.saving : t.checkIn}
        </Button>
      ) : null}

      {state === "checked_in" || state === "checked_out" ? (
        <p className="text-base font-medium" aria-live="polite">
          {record?.status === "late"
            ? fill(t.lateIn, {
                time: at(record.checkInAt),
                minutes: record.minutesLate ?? 0,
              })
            : fill(t.presentIn, { time: at(record?.checkInAt ?? null) })}
        </p>
      ) : null}

      {state === "checked_in" ? (
        <Button
          type="button"
          size="lg"
          variant="outline"
          className="min-h-16 w-full text-lg"
          disabled={pending}
          onClick={() => run(checkOutToday)}
        >
          <LogOutIcon aria-hidden="true" />
          {pending ? t.saving : t.checkOut}
        </Button>
      ) : null}

      {state === "checked_out" ? (
        <p className="text-muted-foreground text-base">
          {fill(t.checkedOut, { time: at(record?.checkOutAt ?? null) })}
        </p>
      ) : null}

      {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}
    </Card>
  )
}
