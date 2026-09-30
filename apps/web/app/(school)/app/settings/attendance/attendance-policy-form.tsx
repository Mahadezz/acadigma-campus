"use client"

import { useId, useState, useTransition } from "react"

import { useRouter } from "next/navigation"

import type { AttendancePolicySample } from "@acadigma/db/repositories/attendance-policy-preview"
import { previewAttendanceEffect } from "@acadigma/domain/attendance"
import type { AttendancePolicy } from "@acadigma/domain/settings"
import { Input } from "@acadigma/ui/components/input"
import { Label } from "@acadigma/ui/components/label"
import { Switch } from "@acadigma/ui/components/switch"

import { formatMonthYear } from "@/lib/format"
import type { Messages } from "@/lib/i18n"
import type { Locale } from "@/lib/locale"

import { updateSchoolSettings } from "../actions"
import { SaveNotice, type Notice } from "../save-notice"
import { StickySaveBar } from "../sticky-save-bar"

/** Fills `{name}` placeholders (mirrors `(school)/app/attendance/format.ts`'s
 * `fill` and `(school)/app/home/format.ts`'s own copy — no shared cross-route
 * helper exists in this codebase yet, so this stays local like its siblings). */
const fill = (template: string, values: Record<string, string>) =>
  template.replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? "")

/**
 * F-OP-07 Part 3 §4 W4 — the attendance-policy fields that an actual
 * consumer reads, with the live plain-English effect line. `cutoff`, `mode`
 * and `block_exam_on_shortfall` are real columns in `AttendancePolicy`
 * (Part 1) but have no reader anywhere in the codebase today (no auto-late
 * marking, no period-mode attendance, no exam-entry check) — showing a
 * control for them would tell a school its exams are being blocked when
 * nothing enforces that (lead review of PR #122). Left out of this form
 * until whichever future Part builds the behaviour they'd control; see
 * D-212 and spec §11.
 *
 * Only the sample's raw statuses ever leave the server (fetched once, in
 * `page.tsx`); every toggle after that is recomputed in the browser with
 * the exact same pure function the register and the SQL mirror use
 * (`previewAttendanceEffect`, `packages/domain/src/attendance/policy-preview.ts`)
 * — no round trip per keystroke, and no stored `attendance_records` row is
 * ever touched (§5.8 rule 2, stated again on screen below).
 */
export function AttendancePolicyForm({
  policy,
  sample,
  t,
  locale,
}: {
  policy: AttendancePolicy
  sample: AttendancePolicySample
  t: Messages["settings"]
  locale: Locale
}) {
  const router = useRouter()
  const id = useId()
  const a = t.attendance
  const [form, setForm] = useState(policy)
  // Raw text, not derived from the rounded `min_attendance_bp` — a controlled
  // input whose displayed value comes back from a rounded number strips a
  // decimal point the moment it's typed (review of PR #122; mirrors
  // grade-scale-editor.tsx's `preview` field, which keeps the same split).
  const [minInput, setMinInput] = useState(() =>
    (policy.min_attendance_bp / 100).toString()
  )
  const [dirty, setDirty] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [pending, startTransition] = useTransition()

  const weights = {
    late_counts_present: form.late_counts_present,
    half_day_counts_present: form.half_day_counts_present,
  }
  const savedWeights = {
    late_counts_present: policy.late_counts_present,
    half_day_counts_present: policy.half_day_counts_present,
  }

  const before = previewAttendanceEffect(
    sample.statuses,
    savedWeights,
    policy.min_attendance_bp
  )
  const after = previewAttendanceEffect(
    sample.statuses,
    weights,
    form.min_attendance_bp
  )

  function patch(next: Partial<AttendancePolicy>) {
    setForm((current) => ({ ...current, ...next }))
    setDirty(true)
  }

  function discard() {
    setForm(policy)
    setMinInput((policy.min_attendance_bp / 100).toString())
    setDirty(false)
    setNotice(null)
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    startTransition(async () => {
      const result = await updateSchoolSettings({ attendance_policy: form })
      if (result.ok) {
        setDirty(false)
        setNotice({ tone: "success", text: t.saved })
        router.refresh()
      } else {
        setNotice({ tone: "error", text: result.error.message || t.saveError })
      }
    })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <SaveNotice notice={notice} reloadLabel={t.reload} />

      <div className="bg-muted/40 space-y-1 rounded-lg border p-4">
        <p className="text-sm font-medium">{a.effectTitle}</p>
        {sample.statuses.length === 0 ? (
          <p className="text-muted-foreground text-sm">{a.noSampleYet}</p>
        ) : (
          <>
            <p className="text-sm" aria-live="polite">
              {fill(a.effectLine, {
                name: sample.studentName ?? "",
                month: sample.month
                  ? formatMonthYear(sample.month, locale)
                  : "",
                before: before.percent.toString(),
                after: after.percent.toString(),
              })}
            </p>
            {!after.eligible ? (
              <p className="text-destructive text-sm" aria-live="polite">
                {fill(a.belowMinimum, {
                  min: (form.min_attendance_bp / 100).toString(),
                })}
              </p>
            ) : null}
          </>
        )}
        <p className="text-muted-foreground text-xs">{a.notRewritten}</p>
      </div>

      <div className="space-y-3 rounded-lg border p-4">
        <div className="flex min-h-11 items-center justify-between gap-3">
          <Label htmlFor={`${id}-late`}>{a.lateCountsPresent}</Label>
          <Switch
            id={`${id}-late`}
            checked={form.late_counts_present}
            onCheckedChange={(checked) =>
              patch({ late_counts_present: checked })
            }
          />
        </div>
        <div className="flex min-h-11 items-center justify-between gap-3">
          <Label htmlFor={`${id}-half`}>{a.halfDayCountsPresent}</Label>
          <Switch
            id={`${id}-half`}
            checked={form.half_day_counts_present}
            onCheckedChange={(checked) =>
              patch({ half_day_counts_present: checked })
            }
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${id}-min`}>{a.minAttendancePercent}</Label>
          <Input
            id={`${id}-min`}
            inputMode="decimal"
            className="min-h-11 w-24"
            value={minInput}
            onChange={(e) => {
              const raw = e.target.value
              setMinInput(raw)
              const percent = Number(raw)
              if (raw.trim() === "" || Number.isNaN(percent)) return
              patch({
                min_attendance_bp: Math.max(
                  0,
                  Math.min(10_000, Math.round(percent * 100))
                ),
              })
            }}
          />
          <p className="text-muted-foreground text-xs">{a.minAttendanceHelp}</p>
        </div>
      </div>

      <StickySaveBar
        dirty={dirty}
        pending={pending}
        onDiscard={discard}
        t={{
          unsaved: t.unsaved,
          save: t.save,
          saving: t.saving,
          discard: t.discard,
        }}
      />
    </form>
  )
}
