"use client"

import { useEffect, useState, useTransition } from "react"

import type { AuditEventDto } from "@acadigma/contracts/audit"
import { Skeleton } from "@acadigma/ui/components/skeleton"

import { listCorrelatedEvents } from "./actions"
import { AuditSentence } from "./sentence"
import { SeverityChip } from "./severity-chip"

/**
 * "Show everything from this action" (F-ID-09 §4.3): a numbered, chronological
 * timeline of every row sharing one `correlation_id` — the compound-action view
 * that answers "creating a school produced eight rows" (acceptance criterion 4).
 */
export function CorrelationList({
  correlationId,
  language,
  onSelectEvent,
}: {
  correlationId: string
  language: "en" | "bn"
  onSelectEvent: (event: AuditEventDto) => void
}) {
  const [events, setEvents] = useState<AuditEventDto[] | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    // Fetching data when `correlationId` changes is one of the two documented valid
    // uses of an Effect (react.dev/learn/you-might-not-need-an-effect
    // "Fetching data") — synchronizing with the server, not deriving local state.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see above
    setEvents(null)
    setErrorMessage(null)
    startTransition(async () => {
      const result = await listCorrelatedEvents({ correlationId, limit: 200 })
      if (result.ok) setEvents(result.data)
      else setErrorMessage(result.error.message)
    })
  }, [correlationId])

  if (isPending || events === null) {
    return (
      <div className="space-y-2" aria-busy="true">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    )
  }

  if (errorMessage) {
    return (
      <p className="text-destructive text-sm" role="alert">
        {errorMessage}
      </p>
    )
  }

  return (
    <ol className="border-border space-y-3 border-l pl-4">
      {events.map((event, index) => (
        <li key={event.id}>
          <button
            type="button"
            onClick={() => onSelectEvent(event)}
            className="hover:bg-muted focus-visible:ring-ring flex min-h-11 w-full flex-col items-start gap-1 rounded-md p-2 text-left outline-none focus-visible:ring-2"
          >
            <span className="text-muted-foreground text-xs">#{index + 1}</span>
            <span className="text-sm">
              <AuditSentence event={event} language={language} />
            </span>
            <SeverityChip severity={event.severity} />
          </button>
        </li>
      ))}
    </ol>
  )
}
