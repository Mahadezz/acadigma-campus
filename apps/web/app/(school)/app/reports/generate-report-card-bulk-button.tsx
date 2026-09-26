"use client"

import { useState, useTransition } from "react"

import { useRouter } from "next/navigation"

import { Button } from "@acadigma/ui/components/button"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"

import { OnlineOnly } from "@/app/(shared)/offline/online-only"

import { createReportRun } from "./actions"

/**
 * F-OP-03 Part 5 (D-207): renders one merged, duplex-padded PDF of every
 * student's report card in a section for one exam, ordered by roll number.
 * Shown on the results preview (`/app/exams/[id]/results`), next to the
 * per-student `GenerateReportCardButton` — same real `sectionId`/`examId`
 * the page already resolved, same seam underneath (`getReportCardData`,
 * called once per student by `renderReportCardBulkPdf`).
 */

export type ReportCardBulkCopy = {
  generateReportCardBulk: string
  generating: string
  error: string
}

export function GenerateReportCardBulkButton({
  t,
  sectionId,
  examId,
  locale,
}: {
  t: ReportCardBulkCopy
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
        params: {
          kind: "report_card_bulk",
          sectionId,
          examId,
          order: "roll",
          duplex: true,
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
    <OnlineOnly>
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
    </OnlineOnly>
  )
}
