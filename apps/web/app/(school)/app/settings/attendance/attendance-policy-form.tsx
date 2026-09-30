"use client"

import { useId, useState, useTransition } from "react"

import { useRouter } from "next/navigation"

import type { AttendanceStatus } from "@acadigma/contracts"
import { previewAttendanceEffect } from "@acadigma/domain/attendance"
import type { AttendancePolicy } from "@acadigma/domain/settings"
import { Input } from "@acadigma/ui/components/input"
import { Label } from "@acadigma/ui/components/label"
import {
  NativeSelect,
  NativeSelectOption,
} from "@acadigma/ui/components/native-select"
import { Switch } from "@acadigma/ui/components/switch"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"

import type { Messages } from "@/lib/i18n"

import { updateSchoolSettings } from "../actions"
import { SaveNotice, type Notice } from "../save-notice"
import { StickySaveBar } from "../sticky-save-bar"

export type AttendancePolicySample = {
  studentName: string | null
  month: string | null
  statuses: AttendanceStatus[]
}

const fill = (template: string, values: Record<string, string>) =>
  template.replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? "")

/**
 * F-OP-07 Part 3 §4 W4 — every attendance-policy field with the live
 * plain-English effect line. Only the sample's raw statuses ever leave the
 * server (fetched once, in `page.tsx`); every toggle after that is
 * recomputed in the browser with the exact same pure function the register
 * and the SQL mirror use (`previewAttendanceEffect`,
 * `packages/domain/src/attendance/policy-preview.ts`) — no round trip per
 * keystroke, and no stored `attendance_records` row is ever touched (§5.8
 * rule 2, stated again on screen below).
 */
export function AttendancePolicyForm({
  policy,
  sample,
  t,
}: {
  policy: AttendancePolicy
  sample: AttendancePolicySample
  t: Messages["settings"]
}) {
  const router = useRouter()
  const id = useId()
  const a = t.attendance
  const [form, setForm] = useState(policy)
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
          <p className="text-sm" aria-live="polite">
            {fill(a.effectLine, {
              name: sample.studentName ?? "",
              month: sample.month ?? "",
              before: before.percent.toString(),
              after: after.percent.toString(),
            })}
          </p>
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
        <div className="flex min-h-11 items-center justify-between gap-3">
          <Label htmlFor={`${id}-block`}>{a.blockExamOnShortfall}</Label>
          <Switch
            id={`${id}-block`}
            checked={form.block_exam_on_shortfall}
            onCheckedChange={(checked) =>
              patch({ block_exam_on_shortfall: checked })
            }
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor={`${id}-min`}>{a.minAttendancePercent}</Label>
          <Input
            id={`${id}-min`}
            inputMode="decimal"
            className="min-h-11 w-24"
            value={(form.min_attendance_bp / 100).toString()}
            onChange={(e) => {
              const percent = Number(e.target.value)
              if (Number.isNaN(percent)) return
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

        <div className="space-y-1">
          <Label htmlFor={`${id}-cutoff`}>{a.cutoff}</Label>
          <Input
            id={`${id}-cutoff`}
            type="time"
            className="min-h-11 w-32"
            value={form.cutoff}
            onChange={(e) => patch({ cutoff: e.target.value })}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor={`${id}-mode`}>{a.mode}</Label>
          <NativeSelect
            id={`${id}-mode`}
            className="min-h-11"
            value={form.mode}
            onChange={(e) =>
              patch({ mode: e.target.value as AttendancePolicy["mode"] })
            }
          >
            <NativeSelectOption value="daily">{a.modeDaily}</NativeSelectOption>
            <NativeSelectOption value="period">
              {a.modePeriod}
            </NativeSelectOption>
          </NativeSelect>
        </div>
      </div>

      {form.block_exam_on_shortfall ? (
        <InlineAlert tone="error">{a.blockWarning}</InlineAlert>
      ) : null}

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
