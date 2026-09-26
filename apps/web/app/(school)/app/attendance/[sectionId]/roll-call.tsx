"use client"

import { useEffect, useMemo, useState, useTransition } from "react"

import dynamic from "next/dynamic"
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
import { cn } from "@acadigma/ui/lib/utils"
import { AttendanceToggle } from "@acadigma/ui/primitives/attendance-toggle"
import { BnEnText } from "@acadigma/ui/primitives/bn-en-text"
import { EmptyState } from "@acadigma/ui/primitives/empty-state"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"

import type { Messages } from "@/lib/i18n"
import type { Locale } from "@/lib/locale"

import { saveAttendanceSession } from "../actions"
import { fill } from "../format"

const ConfirmSheet = dynamic(
  () =>
    import("@acadigma/ui/primitives/confirm-sheet").then((m) => m.ConfirmSheet),
  { ssr: false }
)

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
  basic = false,
  basicCopy,
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
  readOnlyReason: "cannotMark" | "window" | null
  /**
   * F-ID-10 §4.5/§4.6/§5.1/§5.3 (Part 3) — the class hub's Attendance tab
   * renders this same screen with `basic` on: bigger tap targets, a
   * `ConfirmSheet` before Save names the counts in plain words, and a
   * post-save Undo toast (30s, §5.3) that re-saves the values this save is
   * about to overwrite as one ordinary, audited edit. `undefined`/`false`
   * (the plain `/app/attendance/[sectionId]` page) keeps today's direct-save
   * behaviour byte-for-byte unchanged.
   */
  basic?: boolean
  basicCopy?: {
    /** "Save attendance for {className}? {present} present, {absent} absent." */
    confirmTemplate: string
    yesSave: string
    goBack: string
    undoToast: string
    undo: string
    undone: string
  }
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
  const [confirmOpen, setConfirmOpen] = useState(false)
  // §5.3: "the previous values" this save is about to overwrite — only set
  // when a session already existed, so a first save (nothing to go back to)
  // never offers Undo, only the ConfirmSheet guards it.
  const [lastSavedMarks, setLastSavedMarks] = useState<Marks | null>(() =>
    sessionUpdatedAt !== null
      ? Object.fromEntries(students.map((s) => [s.studentId, s.status]))
      : null
  )
  const [undoMarks, setUndoMarks] = useState<Marks | null>(null)

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

  // §5.3: the Undo toast lasts 30s in basic mode, then disappears — the
  // save it points back to is still safe, it just stops being one tap away.
  useEffect(() => {
    if (!undoMarks) return
    const timer = setTimeout(() => setUndoMarks(null), 30_000)
    return () => clearTimeout(timer)
  }, [undoMarks])

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

  function saveMarks(toSave: Marks, bulk: boolean) {
    setError(null)
    setConfirmOpen(false)
    startTransition(async () => {
      const result = await saveAttendanceSession({
        idempotencyKey: key,
        sectionId,
        date,
        records: students.map((s) => ({
          studentId: s.studentId,
          status: toSave[s.studentId],
        })),
        bulkMarked: bulk,
        allowNonSchoolDay: !isSchoolDay && anyway,
        expectedUpdatedAt: version,
      })
      if (!result.ok) {
        setError(saveErrorText(t, result.error))
        return
      }
      setMarks(toSave)
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
      // §5.3 (basic mode only — the full app has no post-save Undo today):
      // only offer it when this save overwrote values already on the
      // server; a first save has nothing to go back to.
      if (basic) {
        setUndoMarks(lastSavedMarks)
        setLastSavedMarks(toSave)
      }
      router.refresh()
    })
  }

  function save() {
    saveMarks(marks, bulkMarked)
  }

  function undoSave() {
    if (!undoMarks) return
    const restore = undoMarks
    setUndoMarks(null)
    saveMarks(restore, false)
  }

  const blocked =
    readOnly || counts.unmarked > 0 || (!isSchoolDay && !anyway) || pending

  const bigButton = basic ? "min-h-14 text-base" : "h-11"

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      {!basic ? (
        <Button asChild variant="ghost" className="h-11 px-2">
          <Link href="/app/attendance">
            <ArrowLeftIcon aria-hidden="true" />
            {t.back}
          </Link>
        </Button>
      ) : null}

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">{dateLabel}</p>
          <h1
            className={cn(
              "font-bold tracking-tight",
              basic ? "text-2xl" : "text-xl"
            )}
          >
            {title}
          </h1>
        </div>
        {!readOnly && students.length > 0 ? (
          beforeBulk ? (
            <Button
              type="button"
              variant="outline"
              className={bigButton}
              onClick={undoBulk}
            >
              <Undo2Icon aria-hidden="true" />
              {t.undo}
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              className={bigButton}
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
          {readOnlyReason === "cannotMark"
            ? t.readOnlyCannotMark
            : t.readOnlyWindow}
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
                  size={basic ? "basic" : "default"}
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
            {basic && basicCopy && undoMarks ? (
              <InlineAlert tone="info">
                <span className="flex flex-wrap items-center justify-between gap-2">
                  {basicCopy.undoToast}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-11"
                    onClick={undoSave}
                    disabled={pending}
                  >
                    {basicCopy.undo}
                  </Button>
                </span>
              </InlineAlert>
            ) : null}
            <div className="flex items-center gap-3">
              <p
                className={cn(
                  "min-w-0 flex-1 tabular-nums",
                  basic ? "text-base" : "text-sm"
                )}
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
                className={cn("h-14 min-w-32", basic ? "text-lg" : "text-base")}
                onClick={basic ? () => setConfirmOpen(true) : save}
                disabled={blocked}
              >
                {pending ? t.saving : t.save}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {basic && basicCopy ? (
        <ConfirmSheet
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={fill(basicCopy.confirmTemplate, {
            className: title,
            present: counts.present,
            absent: counts.absent,
          })}
          confirmLabel={basicCopy.yesSave}
          cancelLabel={basicCopy.goBack}
          onConfirm={save}
          pending={pending}
        />
      ) : null}
    </div>
  )
}
