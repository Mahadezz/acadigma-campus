"use client"

import { useState } from "react"

import { Button } from "@acadigma/ui/components/button"
import { Label } from "@acadigma/ui/components/label"
import { Textarea } from "@acadigma/ui/components/textarea"
import { FormSheet } from "@acadigma/ui/primitives/form-sheet"

import type { Messages } from "@/lib/i18n"

/** A sheet that asks for a reason before a reversal (§5.12, D-303/D-307). */
export function ReasonSheet({
  t,
  id,
  open,
  onOpenChange,
  title,
  description,
  pending,
  onConfirm,
}: {
  t: Messages["exams"]
  /** The textarea's id; unique per page. */
  id: string
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  pending: boolean
  onConfirm: (reason: string) => void
}) {
  const [reason, setReason] = useState("")
  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
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
            disabled={pending || reason.trim() === ""}
            onClick={() => onConfirm(reason.trim())}
          >
            {t.confirm}
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        <Label htmlFor={id}>{t.reason}</Label>
        <Textarea
          id={id}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={500}
        />
      </div>
    </FormSheet>
  )
}
