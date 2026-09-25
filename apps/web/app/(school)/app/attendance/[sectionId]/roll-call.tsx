"use client"

import { useMemo, useState, useTransition } from "react"

import Link from "next/link"
import { useRouter } from "next/navigation"

import { ArrowLeftIcon, CheckCheckIcon, Undo2Icon } from "lucide-react"

import type {
  ApiError,
  AttendanceStatus,
  RollCallStudent,
} from "@acadigma/contracts"
import { Button } from "@acadigma/ui/components/button"
import { Checkbox } from "@acadigma/ui/components/checkbox"
import { Label } from "@acadigma/ui/components/label"
import { AttendanceToggle } from "@acadigma/ui/primitives/attendance-toggle"
import { BnEnText } from "@acadigma/ui/primitives/bn-en-text"
import { EmptyState } from "@acadigma/ui/primitives/empty-state"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"

import type { Messages } from "@/lib/i18n"
import type { Locale } from "@/lib/locale"

import { saveAttendanceSession } from "../actions"
import { fill } from "../format"

type T = Messages["attendance"]["roll"]
type Marks = Record<string, AttendanceStatus | null>

/** Every error the save can return, in the reader's language. */
export function saveErrorText(t: T, error: ApiError): string {
  if (error.code === "payment_required") return t.errors.readOnly
  const code = error.fieldErrors?._root?.[0]
  if (code && Object.hasOwn(t.errors, code)) {
    return t.errors[code as keyof T["errors"]]
  }
  return t.errors.generic
}

export function RollCall({
  t,
  locale,
  sectionId,
  title,
  date,
  dateLabel,
  isSchoolDay,
  students,
  sessionUpdatedAt,
  readOnlyReason,
}: {
  t: T
  locale: Locale
  sectionId: string
  title: string
  date: string
  dateLabel: string
  isSchoolDay: boolean
  students: RollCallStudent[]
  sessionUpdatedAt: string | null
  readOnlyReason: "notMine" | "window" | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [marks, setMarks] = useState<Marks>(() =>
    Object.fromEntries(students.map((s) => [s.studentId, s.status]))
  )
  // "Mark all present" is undoable until saved; the save records it (D-22).
  const [beforeBulk, setBeforeBulk] = useState<Marks | null>(null)
  const [bulkMarked, setBulkMarked] = useState(false)
  const [anyway, setAnyway] = useState(false)
  const [version, setVersion] = useState(sessionUpdatedAt)
  // One key per save attempt of this screen state: a double tap replays.
  const [key, setKey] = useState(() => crypto.randomUUID())
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  const readOnly = readOnlyReason !== null
  const counts = useMemo(() => {
    const c = { present: 0, absent: 0, late: 0, unmarked: 0 }
    for (const status of Object.values(marks)) {
      if (status === null) c.unmarked += 1
      else if (status === "present") c.present += 1
      else if (status === "absent") c.absent += 1
      else if (status === "late") c.late += 1
    }
    return c
  }, [marks])

  function change(next: Marks) {
    setMarks(next)
    setSaved(null)
    setError(null)
    setKey(crypto.randomUUID())
  }

  function markAllPresent() {
    setBeforeBulk(marks)
    setBulkMarked(true)
    change(
      Object.fromEntries(
        Object.entries(marks).map(([id, status]) => [id, status ?? "present"])
      )
    )
  }

  function undoBulk() {
    if (!beforeBulk) return
    setBulkMarked(false)
    change(beforeBulk)
    setBeforeBulk(null)
  }

  function save() {
    setError(null)
    startTransition(async () => {
      const result = await saveAttendanceSession({
        idempotencyKey: key,
        sectionId,
        date,
        records: students.map((s) => ({
          studentId: s.studentId,
          status: marks[s.studentId],
        })),
        bulkMarked,
        allowNonSchoolDay: !isSchoolDay && anyway,
        expectedUpdatedAt: version,
      })
      if (!result.ok) {
        setError(saveErrorText(t, result.error))
        return
      }
      setVersion(result.data.updatedAt)
      setBeforeBulk(null)
      setBulkMarked(false)
      setKey(crypto.randomUUID())
      setSaved(
        fill(t.saved, {
          present: result.data.present,
          absent: result.data.absent,
        })
      )
      router.refresh()
    })
  }

  const blocked =
    readOnly || counts.unmarked > 0 || (!isSchoolDay && !anyway) || pending

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Button asChild variant="ghost" className="h-11 px-2">
        <Link href="/app/attendance">
          <ArrowLeftIcon aria-hidden="true" />
          {t.back}
        </Link>
      </Button>

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">{dateLabel}</p>
          <h1 className="text-xl font-bold tracking-tight">{title}</h1>
        </div>
        {!readOnly && students.length > 0 ? (
          beforeBulk ? (
            <Button
              type="button"
              variant="outline"
              className="h-11"
              onClick={undoBulk}
            >
              <Undo2Icon aria-hidden="true" />
              {t.undo}
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="h-11"
              onClick={markAllPresent}
              disabled={counts.unmarked === 0}
            >
              <CheckCheckIcon aria-hidden="true" />
              {t.markAllPresent}
            </Button>
          )
        ) : null}
      </header>

      {readOnlyReason ? (
        <InlineAlert tone="info">
          {readOnlyReason === "notMine" ? t.readOnlyNotMine : t.readOnlyWindow}
        </InlineAlert>
      ) : null}

      {!isSchoolDay && !readOnly ? (
        <InlineAlert tone="info">
          <span className="block">{t.notSchoolDay}</span>
          <span className="mt-2 flex min-h-11 items-center gap-2">
            <Checkbox
              id="roll-anyway"
              checked={anyway}
              onCheckedChange={(value) => setAnyway(value === true)}
            />
            <Label htmlFor="roll-anyway">{t.takeAnyway}</Label>
          </span>
        </InlineAlert>
      ) : null}

      {students.length === 0 ? (
        <EmptyState title={t.noStudents} />
      ) : (
        <ul className="divide-border divide-y border-y lg:grid lg:grid-cols-2 lg:gap-x-8 lg:divide-y-0 lg:border-0">
          {students.map((s) => {
            const name =
              locale === "bn" && s.fullNameBn ? s.fullNameBn : s.fullName
            return (
              <li
                key={s.studentId}
                className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between lg:border-b"
              >
                <div className="flex min-w-0 items-baseline gap-3">
                  <span className="text-muted-foreground w-8 shrink-0 text-right text-sm tabular-nums">
                    {s.rollNumber ?? "—"}
                  </span>
                  <BnEnText text={name} className="truncate font-medium" />
                </div>
                <AttendanceToggle
                  value={marks[s.studentId] ?? "unmarked"}
                  onChange={(status) =>
                    change({ ...marks, [s.studentId]: status })
                  }
                  studentName={name}
                  locale={locale}
                  disabled={readOnly || pending}
                  className="w-full sm:w-72 sm:shrink-0"
                />
              </li>
            )
          })}
        </ul>
      )}

      {!readOnly && students.length > 0 ? (
        // Sticky above the phone's bottom nav (56px + safe area), in the thumb zone.
        <div className="bg-background sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 border-t py-3 lg:bottom-0">
          <div className="space-y-2">
            {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}
            {saved ? <InlineAlert tone="success">{saved}</InlineAlert> : null}
            <div className="flex items-center gap-3">
              <p
                className="min-w-0 flex-1 text-sm tabular-nums"
                aria-live="polite"
              >
                <span className="font-medium">
                  {counts.unmarked > 0
                    ? fill(t.unmarked, { count: counts.unmarked })
                    : t.allMarked}
                </span>
                <span className="text-muted-foreground block text-xs">
                  {counts.unmarked > 0
                    ? t.unmarkedHint
                    : fill(t.counts, counts)}
                </span>
              </p>
              <Button
                type="button"
                className="h-14 min-w-32 text-base"
                onClick={save}
                disabled={blocked}
              >
                {pending ? t.saving : t.save}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
