"use client"

import { useState, useTransition } from "react"

import { useRouter } from "next/navigation"

import { Button } from "@acadigma/ui/components/button"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"

import { createReportRun } from "./actions"

/**
 * F-OP-03 Part 6 (D-208): renders the exam mark sheet for one section x
 * exam. Shown on the results preview (`/app/exams/[id]/results`), next to
 * the report-card buttons — same real `sectionId`/`examId` the page already
 * resolved.
 */

export type MarkSheetCopy = {
  generate: string
  generating: string
  error: string
}

export function GenerateMarkSheetButton({
  t,
  sectionId,
  examId,
  locale,
}: {
  t: MarkSheetCopy
  sectionId: string
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
        params: { kind: "mark_sheet", sectionId, examId },
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
        {pending ? t.generating : t.generate}
      </Button>
      {error && (
        <InlineAlert tone="error" className="max-w-md">
          {error}
        </InlineAlert>
      )}
    </div>
  )
}
