"use client"

import { useState, useTransition } from "react"

import { useRouter } from "next/navigation"

import { Button } from "@acadigma/ui/components/button"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"

import { createReportRun } from "./actions"

/**
 * F-OP-03 Part 3 (D-206) demo action: renders one Class 6-ক fixture
 * student's report card. Local constants, not an import of
 * `report-card-fixture.ts` — that module also builds all 40 students'
 * marks/GPA (via `@acadigma/domain/grading`), which this client component
 * has no reason to ship to the browser for two fixed uuids.
 */
const DEMO_STUDENT_ID = "00000000-6000-4000-8000-000000000001"
const DEMO_EXAM_ID = "00000000-6000-4000-9000-000000000000"

export type ReportCardCopy = {
  generateReportCard: string
  generating: string
  error: string
}

export function GenerateReportCardButton({ t }: { t: ReportCardCopy }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function onClick() {
    setError(null)
    startTransition(async () => {
      const result = await createReportRun({
        params: {
          kind: "report_card",
          studentId: DEMO_STUDENT_ID,
          examId: DEMO_EXAM_ID,
        },
        locale: "bn",
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
