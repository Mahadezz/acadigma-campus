"use client"

import { useState } from "react"

import type { PublishCandidate } from "@acadigma/contracts"
import { Button } from "@acadigma/ui/components/button"
import { Checkbox } from "@acadigma/ui/components/checkbox"
import { Input } from "@acadigma/ui/components/input"
import { Label } from "@acadigma/ui/components/label"
import { FormSheet } from "@acadigma/ui/primitives/form-sheet"

import type { Messages } from "@/lib/i18n"

type T = Messages["exams"]

/**
 * F-AC-06 §4.5 (D-306): what publishing does, and which students' results
 * to withhold, each with a reason. Everyone else's result is frozen and
 * shown to their linked parents.
 */
export function PublishSheet({
  t,
  open,
  onOpenChange,
  candidates,
  examName,
  pending,
  onConfirm,
}: {
  t: T
  open: boolean
  onOpenChange: (open: boolean) => void
  candidates: PublishCandidate[]
  examName: string
  pending: boolean
  onConfirm: (withhold: { studentId: string; reason: string }[]) => void
}) {
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const withheld = Object.entries(reasons)
  const ready = withheld.every(([, reason]) => reason.trim() !== "")
  const classes = [...new Set(candidates.map((c) => c.sectionLabel))].join(", ")

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t.publish.title
        .replace("{exam}", examName)
        .replace("{class}", classes)
        .replace("{n}", String(candidates.length))}
      description={t.publish.description}
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
            type="button"
            className="h-11"
            disabled={pending || !ready}
            onClick={() =>
              onConfirm(
                withheld.map(([studentId, reason]) => ({
                  studentId,
                  reason: reason.trim(),
                }))
              )
            }
          >
            {t.publish.confirm.replace(
              "{n}",
              String(candidates.length - withheld.length)
            )}
          </Button>
        </>
      }
    >
      <fieldset className="space-y-1">
        <legend className="mb-2 text-sm font-medium">
          {t.publish.withholdLegend}
        </legend>
        <ul className="divide-y rounded-lg border">
          {candidates.map((c) => {
            const id = `withhold-${c.studentId}`
            const checked = c.studentId in reasons
            return (
              <li key={c.studentId} className="space-y-2 p-3">
                <div className="flex min-h-11 items-center gap-3">
                  <Checkbox
                    id={id}
                    checked={checked}
                    onCheckedChange={(value) =>
                      setReasons((current) => {
                        const next = { ...current }
                        if (value === true) next[c.studentId] = ""
                        else delete next[c.studentId]
                        return next
                      })
                    }
                  />
                  <Label htmlFor={id} className="flex-1 font-normal">
                    {t.publish.withholdStudent
                      .replace("{name}", c.fullName)
                      .replace("{section}", c.sectionLabel)
                      .replace("{roll}", c.rollNumber?.toString() ?? "—")}
                  </Label>
                </div>
                {checked ? (
                  <div className="space-y-1 ps-7">
                    <Label htmlFor={`${id}-reason`}>
                      {t.publish.reasonFor.replace("{name}", c.fullName)}
                    </Label>
                    <Input
                      id={`${id}-reason`}
                      className="h-11"
                      maxLength={500}
                      placeholder={t.publish.reasonPlaceholder}
                      value={reasons[c.studentId] ?? ""}
                      onChange={(e) =>
                        setReasons((current) => ({
                          ...current,
                          [c.studentId]: e.target.value,
                        }))
                      }
                    />
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      </fieldset>
    </FormSheet>
  )
}
