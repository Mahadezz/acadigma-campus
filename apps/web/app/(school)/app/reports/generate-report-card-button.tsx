"use client"

import { useState, useTransition } from "react"

import { useRouter } from "next/navigation"

import { Button } from "@acadigma/ui/components/button"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"

import { createReportRun } from "./actions"

/**
 * F-OP-03 Part 3 (D-206): renders one student's report card for one exam
 * from F-AC-06's computed results (D-305). Shown per student on the results
 * preview (`/app/exams/[id]/results`), so it only ever offers a card that
 * exists; the render still reads through the caller's RLS.
 */

export type ReportCardCopy = {
  generateReportCard: string
  generating: string
  error: string
}

export function GenerateReportCardButton({
  t,
  studentId,
  examId,
  locale,
}: {
  t: ReportCardCopy
  studentId: string
  examId: string
  locale: "en" | "bn"
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function onClick() {
    setError(null)
    startTransition(async () => {
      const result = await createReportRun({
        params: {
          kind: "report_card",
          studentId,
          examId,
        },
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
    <div className="flex flex-col gap-2">
      <Button
        onClick={onClick}
        disabled={pending}
        variant="outline"
        className="w-full sm:w-auto"
      >
        {pending ? t.generating : t.generateReportCard}
      </Button>
      {error && (
        <InlineAlert tone="error" className="max-w-md">
          {error}
        </InlineAlert>
      )}
    </div>
  )
}
