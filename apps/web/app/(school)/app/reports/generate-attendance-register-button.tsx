"use client"

import { useState, useTransition } from "react"

import { useRouter } from "next/navigation"

import { Button } from "@acadigma/ui/components/button"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"

import { OnlineOnly } from "@/app/(shared)/offline/online-only"

import { createReportRun } from "./actions"

/**
 * F-OP-03 Part 6 (D-208): renders the monthly attendance register for one
 * section. Shown on the roll-call page (`/app/attendance/[sectionId]`),
 * where the section and "today's" month are already known — the same place
 * a teacher takes attendance is where they print the record of it.
 */

export type AttendanceRegisterCopy = {
  generate: string
  generating: string
  error: string
}

export function GenerateAttendanceRegisterButton({
  t,
  sectionId,
  month,
  locale,
}: {
  t: AttendanceRegisterCopy
  sectionId: string
  /** `YYYY-MM`, the month to print. */
  month: string
  locale: "en" | "bn"
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function onClick() {
    setError(null)
    startTransition(async () => {
      const result = await createReportRun({
        params: { kind: "attendance_register", sectionId, month },
        locale,
      })
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      router.push(`/app/reports/runs/${result.data.id}`)
    })
  }

  return (
    <OnlineOnly>
      <div className="flex flex-col gap-2">
        <Button
          onClick={onClick}
          disabled={pending}
          variant="outline"
          className="w-full sm:w-auto"
        >
          {pending ? t.generating : t.generate}
        </Button>
        {error && (
          <InlineAlert tone="error" className="max-w-md">
            {error}
          </InlineAlert>
        )}
      </div>
    </OnlineOnly>
  )
}
