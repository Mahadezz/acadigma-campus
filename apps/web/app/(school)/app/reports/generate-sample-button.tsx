"use client"

import { useState, useTransition } from "react"

import { useRouter } from "next/navigation"

import { Button } from "@acadigma/ui/components/button"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"

import { createReportRun } from "./actions"

export type ReportsCopy = {
  generate: string
  generating: string
  error: string
}

/** F-OP-03 Part 1-2 demo action: renders the sample letterhead document. */
export function GenerateSampleButton({ t }: { t: ReportsCopy }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function onClick() {
    setError(null)
    startTransition(async () => {
      const result = await createReportRun({
        params: { kind: "sample" },
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
      <Button onClick={onClick} disabled={pending} className="w-full sm:w-auto">
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
