"use client"

import * as React from "react"

import type { AttendanceStatus } from "@acadigma/contracts"
import { Button } from "@acadigma/ui/components/button"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@acadigma/ui/components/toggle-group"
import { FormSheet } from "@acadigma/ui/primitives/form-sheet"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"
import { StatusChip } from "@acadigma/ui/primitives/status-chip"

import {
  getAttendanceConflict,
  type AttendanceConflict,
} from "@/app/(school)/app/attendance/actions"
import type { Locale } from "@/lib/locale"
import type { OutboxItem } from "@/lib/offline/outbox"
import { deleteItem, resolveItem } from "@/lib/offline/outbox-client"

import type { OfflineCopy } from "./offline-provider"

type Choice = "theirs" | "mine"

const count = (s: string, n: number, one: string) =>
  n === 1 ? one : s.replace("{count}", String(n))

/** "09:12", Western digits in both languages. */
const time = (locale: Locale, iso: string | number) =>
  new Intl.DateTimeFormat(locale === "bn" ? "bn-BD-u-nu-latn" : "en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso))

/**
 * F-ID-11 §4.5 (D-310): a colleague saved the class after the teacher took
 * the roll offline. Who saved when, then only the students whose status
 * differs, each with theirs / mine; nothing is written until she chooses.
 * Keep theirs deletes her item; Use mine and Save my choices re-save on
 * their version (a normal save — the audit keeps both).
 */
export function ConflictSheet({
  item,
  userId,
  copy,
  locale,
  open,
  onOpenChange,
}: {
  item: OutboxItem
  userId: string
  copy: OfflineCopy
  locale: Locale
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [theirs, setTheirs] = React.useState<AttendanceConflict | null>(null)
  const [failed, setFailed] = React.useState(false)
  const [picks, setPicks] = React.useState<Record<string, Choice>>({})
  const [busy, startBusy] = React.useTransition()
  const { sectionId, date } = item.payload

  React.useEffect(() => {
    if (!open) return
    let live = true
    getAttendanceConflict({ sectionId, date })
      .then((r) => {
        if (!live) return
        if (r.ok) setTheirs(r.data)
        else setFailed(true)
      })
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [open, sectionId, date])

  const mine = new Map(item.payload.records.map((r) => [r.studentId, r.status]))
  const differing = (theirs?.students ?? []).filter(
    (s) => mine.has(s.studentId) && s.status !== mine.get(s.studentId)
  )

  function finish(action: () => Promise<void>) {
    startBusy(async () => {
      await action()
      onOpenChange(false)
    })
  }
  const keepTheirs = () => finish(() => deleteItem(userId, item.id))
  const save = (choose: (studentId: string) => Choice) => {
    if (!theirs) return
    const their = new Map(theirs.students.map((s) => [s.studentId, s.status]))
    const records = item.payload.records.map((r) => {
      const status = their.get(r.studentId)
      return choose(r.studentId) === "theirs" && status
        ? { studentId: r.studentId, status: status as AttendanceStatus }
        : r
    })
    finish(() => resolveItem(userId, item.id, records, theirs.updatedAt))
  }

  const mineAt = item.payload.capturedAt ?? item.createdAt
  const name = (s: AttendanceConflict["students"][number]) =>
    locale === "bn" && s.fullNameBn ? s.fullNameBn : s.fullName

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={copy.conflictTitle}
      description={item.summary}
      footer={
        theirs ? (
          <>
            <Button
              variant="outline"
              className="h-11"
              disabled={busy}
              onClick={keepTheirs}
            >
              {copy.keepTheirs}
            </Button>
            {differing.length > 0 ? (
              <>
                <Button
                  variant="outline"
                  className="h-11"
                  disabled={busy}
                  onClick={() => save(() => "mine")}
                >
                  {copy.useMine}
                </Button>
                <Button
                  className="h-11"
                  disabled={busy}
                  onClick={() => save((id) => picks[id] ?? "theirs")}
                >
                  {copy.saveChoices}
                </Button>
              </>
            ) : null}
          </>
        ) : null
      }
    >
      {failed ? (
        <InlineAlert tone="error">{copy.conflictLoadFailed}</InlineAlert>
      ) : !theirs ? (
        <p className="text-muted-foreground py-4 text-sm" role="status">
          {copy.conflictLoading}
        </p>
      ) : (
        <div className="space-y-3 pb-4">
          <p className="text-sm">
            {(theirs.takenByName ? copy.conflictWho : copy.conflictWhoUnknown)
              .replace("{name}", theirs.takenByName ?? "")
              .replace("{time}", time(locale, theirs.updatedAt))
              .replace("{mine}", time(locale, mineAt))}
          </p>
          <p className="text-muted-foreground text-sm">
            {differing.length === 0
              ? copy.conflictSame
              : count(
                  copy.conflictDiffers,
                  differing.length,
                  copy.conflictDiffersOne
                )}
          </p>
          <ul className="divide-y rounded-md border">
            {differing.map((s) => (
              <li
                key={s.studentId}
                className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="font-medium">{name(s)}</span>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  aria-label={name(s)}
                  value={picks[s.studentId] ?? "theirs"}
                  onValueChange={(value) => {
                    if (value === "theirs" || value === "mine") {
                      setPicks((p) => ({ ...p, [s.studentId]: value }))
                    }
                  }}
                >
                  <ToggleGroupItem value="theirs" className="h-11 gap-2 px-3">
                    {copy.theirs}
                    {s.status ? (
                      <StatusChip status={s.status} locale={locale} />
                    ) : null}
                  </ToggleGroupItem>
                  <ToggleGroupItem value="mine" className="h-11 gap-2 px-3">
                    {copy.mine}
                    <StatusChip
                      status={mine.get(s.studentId) as AttendanceStatus}
                      locale={locale}
                    />
                  </ToggleGroupItem>
                </ToggleGroup>
              </li>
            ))}
          </ul>
        </div>
      )}
    </FormSheet>
  )
}
