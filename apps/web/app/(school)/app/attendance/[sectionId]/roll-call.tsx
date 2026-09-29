"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"

import dynamic from "next/dynamic"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { ArrowLeftIcon, CheckCheckIcon, Undo2Icon } from "lucide-react"

import type {
  ApiError,
  AttendanceStatus,
  RollCallStudent,
  SaveAttendanceInput,
} from "@acadigma/contracts"
import { Button } from "@acadigma/ui/components/button"
import { Checkbox } from "@acadigma/ui/components/checkbox"
import { Label } from "@acadigma/ui/components/label"
import { cn } from "@acadigma/ui/lib/utils"
import { AttendanceToggle } from "@acadigma/ui/primitives/attendance-toggle"
import { BnEnText } from "@acadigma/ui/primitives/bn-en-text"
import { EmptyState } from "@acadigma/ui/primitives/empty-state"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"

import { useOfflineCopy } from "@/app/(shared)/offline/offline-provider"
import type { Messages } from "@/lib/i18n"
import type { Locale } from "@/lib/locale"
import { serverClockOffset } from "@/lib/offline/check"
import {
  onOutboxSent,
  queuedItem,
  queueSave,
  sendQueued,
  useOutbox,
} from "@/lib/offline/outbox-client"

import { saveAttendanceSession } from "../actions"
import { fill } from "../format"

const ConfirmSheet = dynamic(
  () =>
    import("@acadigma/ui/primitives/confirm-sheet").then((m) => m.ConfirmSheet),
  {
    ssr: false,
    // Review fix (lead): `ConfirmSheet` only ever opens after Save is
    // tapped — it renders nothing at all while `open` is false, so a
    // visible `loading` fallback showed a stray disabled button on every
    // Attendance tab load, before Save was ever pressed. `null` matches
    // what the resolved component itself renders in that state.
    loading: () => null,
  }
)

// Opened only on a conflict (D-310): kept out of the roll call's first load.
const ConflictSheet = dynamic(() =>
  import("@/app/(shared)/offline/conflict-sheet").then((m) => m.ConflictSheet)
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
  userId,
  workspaceId,
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
  }
  /** Who is taking the roll, where: an offline save is queued for them. */
  userId: string
  workspaceId: string
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
  // Review fix (LOW 5): bumped once per terminal save outcome (queued or
  // sent, success or failure) so the focus effect below fires exactly once
  // per save attempt — never on mount, never on an unrelated re-render (an
  // outbox item arriving for a *different* class, the 30s Undo timeout).
  const [saveTick, setSaveTick] = useState(0)
  const isFirstRender = useRef(true)
  const resultRef = useRef<HTMLDivElement>(null)
  const undoButtonRef = useRef<HTMLButtonElement>(null)
  const [choosing, setChoosing] = useState(false)
  const getOfflineCopy = useOfflineCopy()
  const entityKey = `attendance:${sectionId}:${date}`
  // F-ID-11 Part 2a (D-309): this class's saves still on the phone, live —
  // waiting to send, or refused (a conflict is shown, never swallowed).
  const mine = useOutbox(userId).filter((i) => i.entityKey === entityKey)
  const waiting = mine.some(
    (i) => i.status === "pending" || i.status === "sending"
  )
  const refused = mine.find(
    (i) => i.status === "conflict" || i.status === "needs_attention"
  )

  useEffect(() => {
    // A roll taken offline and not sent yet shows instead of the (older)
    // cached page's, so reopening the class offline shows what she saved.
    let live = true
    void queuedItem(userId, entityKey).then((item) => {
      if (!live || !item) return
      setMarks((m) => ({
        ...m,
        ...Object.fromEntries(
          item.payload.records.map((r) => [r.studentId, r.status])
        ),
      }))
      setBulkMarked(item.payload.bulkMarked)
      setAnyway(item.payload.allowNonSchoolDay)
    })
    // When it lands, the version it created is the next save's base.
    const off = onOutboxSent((key, updatedAt) => {
      if (key !== entityKey) return
      setVersion(updatedAt)
      router.refresh()
    })
    return () => {
      live = false
      off()
    }
  }, [userId, entityKey, router])

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

  // Review fix (LOW 5): Save is disabled while `pending`, so when
  // `ConfirmSheet` returns focus to it on close, focus lands on a disabled
  // element and the browser drops it to `<body>`. Once the save actually
  // finishes, move it somewhere meaningful instead: the Undo button when
  // this save offered one, otherwise the result alert. Gated on `saveTick`
  // (not `undoMarks`/`saved`/`error` directly) so this never fires on mount
  // or on a re-render this screen's own save didn't cause.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    if (basic && undoMarks) {
      undoButtonRef.current?.focus()
    } else {
      resultRef.current?.focus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see comment above: keyed on saveTick only
  }, [saveTick])

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

  // Review fix (HIGH 1/2): the one place a save — sent or queued — commits
  // its values to screen and, in basic mode, updates what Undo points back
  // to. Both `saveMarks`'s online-success branch and `queue`'s own success
  // below call this, so an offline save is no longer invisible on screen
  // (marks stayed at the pre-save value before this fix) and Undo, after a
  // chain of queued saves, always targets the save right before the latest
  // one — never a stale earlier value.
  function recordLocalSave(toSave: Marks) {
    setMarks(toSave)
    setBeforeBulk(null)
    setBulkMarked(false)
    setKey(crypto.randomUUID())
    // §5.3 (basic mode only): only offer Undo once a prior value exists to
    // go back to; a first save (lastSavedMarks still null) offers none.
    if (basic) {
      setUndoMarks(lastSavedMarks)
      setLastSavedMarks(toSave)
    }
  }

  /** What she entered, readable aloud to an admin from the queue sheet. */
  function detail(toSave: Marks): string {
    const c = getOfflineCopy()
    const names = (status: AttendanceStatus) =>
      students
        .filter((s) => toSave[s.studentId] === status)
        .map((s) =>
          locale === "bn" && s.fullNameBn ? s.fullNameBn : s.fullName
        )
    const absent = names("absent")
    const late = names("late")
    if (absent.length === 0 && late.length === 0) return c.detailAllPresent
    return [
      absent.length > 0
        ? c.detailAbsent.replace("{names}", absent.join(", "))
        : "",
      late.length > 0 ? c.detailLate.replace("{names}", late.join(", ")) : "",
    ]
      .filter(Boolean)
      .join(" · ")
  }

  // §4.3: keep the save on the phone; a double tap is one item (same key),
  // the next save takes a new key.
  async function queue(input: SaveAttendanceInput, toSave: Marks) {
    const c = getOfflineCopy()
    let result
    try {
      result = await queueSave({
        userId,
        workspaceId,
        kind: "attendance.save",
        entityKey,
        payload: input,
        summary: c.attendanceSummary
          .replace("{section}", title)
          .replace("{date}", dateLabel),
        detail: detail(toSave),
      })
    } catch {
      // IndexedDB unavailable (private mode, full disk): say so plainly and
      // keep her marks on screen to save again online.
      setError(c.saveOnPhoneFailed)
      setSaveTick((n) => n + 1)
      return
    }
    if (result === "full") {
      setError(c.queueFull)
      setSaveTick((n) => n + 1)
      return
    }
    recordLocalSave(toSave)
    setSaveTick((n) => n + 1)
    if (navigator.onLine) void sendQueued(userId)
  }

  function saveMarks(toSave: Marks, bulk: boolean) {
    setError(null)
    setSaved(null)
    setConfirmOpen(false)
    startTransition(async () => {
      const input: SaveAttendanceInput = {
        idempotencyKey: key,
        sectionId,
        date,
        records: students.map((s) => ({
          studentId: s.studentId,
          status: toSave[s.studentId] as AttendanceStatus,
        })),
        bulkMarked: bulk,
        allowNonSchoolDay: !isSchoolDay && anyway,
        expectedUpdatedAt: version,
      }
      // Offline, or an earlier save of this class still waiting: queue it —
      // sent now, ahead of the waiting one, it would conflict with her own.
      // It carries when the roll was taken, on the server's clock (§5.3,
      // D-310): fixed now, so every replay of the item is the same payload.
      if (!navigator.onLine || (await queuedItem(userId, entityKey))) {
        await queue(
          {
            ...input,
            capturedAt: new Date(
              Date.now() + serverClockOffset()
            ).toISOString(),
          },
          toSave
        )
        return
      }
      let result
      try {
        result = await saveAttendanceSession(input)
      } catch {
        // The request never came back (no signal, or the reply was lost):
        // queued with the same key, a replay returns the stored result.
        await queue(input, toSave)
        return
      }
      if (!result.ok) {
        setError(saveErrorText(t, result.error))
        setSaveTick((n) => n + 1)
        return
      }
      setVersion(result.data.updatedAt)
      setSaved(
        fill(t.saved, {
          present: result.data.present,
          absent: result.data.absent,
        })
      )
      recordLocalSave(toSave)
      setSaveTick((n) => n + 1)
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
  // See the header's own comment: the class hub already has the page's `<h1>`.
  const TitleTag = basic ? "p" : "h1"

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
          {/* Review fix (lead): in the class hub (`basic`), `class-hub-view.tsx`'s
           * own header already has the page's one `<h1>` with this same
           * title — a second `<h1>` here duplicated it. The plain
           * `/app/attendance/[sectionId]` page (`basic` false) keeps its
           * own `<h1>`, unchanged. */}
          <TitleTag
            className={cn(
              "font-bold tracking-tight",
              basic ? "text-2xl" : "text-xl"
            )}
          >
            {title}
          </TitleTag>
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
                  // Review fix (lead): 5 segments at basic size's min-w-16
                  // need >= 320px; `sm:w-72` (288px) clipped "Half day"
                  // under the toggle's own `overflow-hidden`. Default size's
                  // min-w-14 (280px total) still fits `sm:w-72` unchanged.
                  className={cn(
                    "w-full sm:shrink-0",
                    basic ? "sm:w-80" : "sm:w-72"
                  )}
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
            {/* Review fix (LOW 5): focus target once a save finishes — see
             * the `saveTick` effect above. Always mounted (this block's own
             * conditional, `!readOnly && students.length > 0`, is the
             * outermost one already), so the ref is valid whether or not an
             * alert is showing yet. */}
            <div ref={resultRef} tabIndex={-1} className="space-y-2">
              {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}
              {saved ? <InlineAlert tone="success">{saved}</InlineAlert> : null}
              {waiting && !saved ? (
                <InlineAlert tone="offline">
                  {getOfflineCopy().savedOnPhone}
                </InlineAlert>
              ) : null}
              {refused && !waiting ? (
                <InlineAlert tone="error">
                  {refused.status === "conflict" ? (
                    <>
                      <span className="block">
                        {getOfflineCopy().conflictReason}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        className="mt-2 h-11"
                        onClick={() => setChoosing(true)}
                      >
                        {getOfflineCopy().compareAndChoose}
                      </Button>
                    </>
                  ) : (
                    saveErrorText(t, {
                      code: (refused.lastError?.code ??
                        "internal") as ApiError["code"],
                      message: refused.lastError?.message ?? "",
                      ...(refused.lastError?.root
                        ? { fieldErrors: { _root: [refused.lastError.root] } }
                        : {}),
                    })
                  )}
                </InlineAlert>
              ) : null}
            </div>
            {basic && basicCopy ? (
              // Review fix (MEDIUM 4): always mounted rather than appearing
              // together with `undoMarks` — an `aria-live` region has to
              // already exist in the DOM before its content changes for most
              // screen readers to announce it; a region that mounts with its
              // text already inside is frequently skipped. Only the content
              // (and visibility) changes now.
              <InlineAlert
                tone="info"
                className={undoMarks ? undefined : "sr-only"}
              >
                {undoMarks ? (
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    {basicCopy.undoToast}
                    <Button
                      ref={undoButtonRef}
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
                ) : null}
              </InlineAlert>
            ) : null}
            {refused?.status === "conflict" && choosing ? (
              // F-ID-11 §4.5 (D-310): theirs / mine, she chooses.
              <ConflictSheet
                item={refused}
                userId={userId}
                copy={getOfflineCopy()}
                locale={locale}
                open
                onOpenChange={setChoosing}
              />
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
