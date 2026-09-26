"use client"

import { useState, useTransition } from "react"

import { useRouter } from "next/navigation"

import { Button } from "@acadigma/ui/components/button"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"

import { createReportRun } from "./actions"

/**
 * F-OP-03 Part 5 (D-207) demo action: renders the whole Class 6-ক fixture
 * (40 students) as one merged, duplex-padded PDF. Same local-constant
 * pattern as `generate-report-card-button.tsx` — the fixture section id is
 * a fixed uuid, not an import of `report-card-fixture.ts`.
 */
const DEMO_SECTION_ID = "00000000-6000-4000-7000-000000000000"
const DEMO_EXAM_ID = "00000000-6000-4000-9000-000000000000"

export type ReportCardBulkCopy = {
  generateReportCardBulk: string
  generating: string
  error: string
}

export function GenerateReportCardBulkButton({ t }: { t: ReportCardBulkCopy }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function onClick() {
    setError(null)
    startTransition(async () => {
      const result = await createReportRun({
        params: {
          kind: "report_card_bulk",
          sectionId: DEMO_SECTION_ID,
          examId: DEMO_EXAM_ID,
          order: "roll",
          duplex: true,
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
        {pending ? t.generating : t.generateReportCardBulk}
      </Button>
      {error && (
        <InlineAlert tone="error" className="max-w-md">
          {error}
        </InlineAlert>
      )}
    </div>
  )
}
