"use client"

import { useCallback, useEffect, useMemo, useState, useTransition } from "react"

import dynamic from "next/dynamic"

import { FilterIcon } from "lucide-react"

import type { AuditEventDto } from "@acadigma/contracts/audit"
import { Alert, AlertDescription } from "@acadigma/ui/components/alert"
import { Avatar, AvatarFallback } from "@acadigma/ui/components/avatar"
import { Button } from "@acadigma/ui/components/button"
import { BnEnText } from "@acadigma/ui/primitives/bn-en-text"
import { DataList, DataListSkeleton } from "@acadigma/ui/primitives/data-list"
import { EmptyState } from "@acadigma/ui/primitives/empty-state"

import { getAuditEvent, listAuditEvents } from "./actions"
import { AUDIT_FILTERS_DEFAULT } from "./schema"
import { AuditSentence, auditSentence } from "./sentence"
import { SeverityChip } from "./severity-chip"

import type { AuditFilterFormValues } from "./schema"

// Code-split: react-hook-form + zodResolver + Select/RadioGroup (filter sheet) and
// the diff/correlation view (detail sheet) are not needed for the first paint of a
// list of rows — loading them as separate chunks keeps `/app/audit`'s first-load JS
// under the 250 kB budget (`scripts/check-bundle-budget.mjs`, TESTING §6).
const AuditFilterSheet = dynamic(() =>
  import("./audit-filter-sheet").then((m) => m.AuditFilterSheet)
)
const AuditDetailSheet = dynamic(() =>
  import("./audit-detail-sheet").then((m) => m.AuditDetailSheet)
)

const PAGE_SIZE = 30

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const diffMinutes = Math.round(diffMs / 60_000)
  if (diffMinutes < 1) return "just now"
  if (diffMinutes < 60) return `${diffMinutes}m ago`
  const diffHours = Math.round(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.round(diffHours / 24)
  return `${diffDays}d ago`
}

function presetToRange(preset: AuditFilterFormValues["datePreset"]): {
  from?: string
  to?: string
} {
  const now = new Date()
  switch (preset) {
    case "today": {
      const start = new Date(now)
      start.setHours(0, 0, 0, 0)
      return { from: start.toISOString() }
    }
    case "7d":
      return { from: new Date(now.getTime() - 7 * 86_400_000).toISOString() }
    case "30d":
      return { from: new Date(now.getTime() - 30 * 86_400_000).toISOString() }
    default:
      return {}
  }
}

/**
 * Phone-first: sticky filter bar + reverse-chronological rows. Desktop: `DataList`
 * switches to a table automatically. Row taps open the detail sheet; infinite
 * scroll is implemented as an explicit "Load more" (a phone-friendly, testable
 * substitute for a scroll observer, cursor-paginated the same way underneath).
 */
export function AuditViewer({
  language,
  timezone,
}: {
  language: "en" | "bn"
  timezone: string
}) {
  const [filters, setFilters] = useState<AuditFilterFormValues>(
    AUDIT_FILTERS_DEFAULT
  )
  const [filterSheetOpen, setFilterSheetOpen] = useState(false)
  const [events, setEvents] = useState<AuditEventDto[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<AuditEventDto | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)

  const activeFilterCount = useMemo(
    () =>
      [filters.category, filters.severity, filters.q].filter(Boolean).length +
      (filters.datePreset !== "all" ? 1 : 0),
    [filters]
  )

  const load = useCallback(
    (append: boolean, cursorValue: string | null) => {
      setErrorMessage(null)
      startTransition(async () => {
        const { from, to } = presetToRange(filters.datePreset)
        const result = await listAuditEvents({
          from,
          to,
          category: filters.category,
          severity: filters.severity,
          q: filters.q || undefined,
          cursor: cursorValue ?? undefined,
          limit: PAGE_SIZE,
        })
        setHasLoadedOnce(true)
        if (!result.ok) {
          setErrorMessage(result.error.message)
          return
        }
        setEvents((prev) =>
          append ? [...prev, ...result.data.items] : result.data.items
        )
        setCursor(result.data.nextCursor)
      })
    },
    [filters]
  )

  useEffect(() => {
    // Fetching data when a dependency (the filter set) changes is one of the two
    // documented valid uses of an Effect (react.dev/learn/you-might-not-need-an-effect
    // "Fetching data") — synchronizing with the server, not deriving local state.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see above
    load(false, null)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `load` already depends on `filters`
  }, [filters])

  async function openDetail(event: AuditEventDto) {
    // Re-fetch by id so opening a row from the correlation view (which may belong
    // to a different page than the one currently loaded) always shows fresh data.
    const result = await getAuditEvent({ id: event.id })
    setSelectedEvent(result.ok ? result.data : event)
  }

  return (
    <div className="space-y-4">
      <div className="bg-background sticky top-0 z-10 flex items-center gap-2 py-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setFilterSheetOpen(true)}
        >
          <FilterIcon aria-hidden="true" />
          {language === "bn" ? "ফিল্টার" : "Filter"}
          {activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
        </Button>
      </div>

      <AuditFilterSheet
        open={filterSheetOpen}
        onOpenChange={setFilterSheetOpen}
        value={filters}
        onApply={setFilters}
        language={language}
      />

      {errorMessage ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>
            {errorMessage}{" "}
            <button
              type="button"
              className="underline underline-offset-2"
              onClick={() => load(false, null)}
            >
              {language === "bn" ? "আবার চেষ্টা করুন" : "Retry"}
            </button>
          </AlertDescription>
        </Alert>
      ) : null}

      <DataList
        items={events}
        isLoading={isPending && !hasLoadedOnce}
        loadingRows={8}
        getRowId={(event) => event.id}
        caption={language === "bn" ? "অডিট ইভেন্ট" : "Audit events"}
        renderCardTitle={(event) => (
          <span className="flex items-center gap-2">
            <SeverityChip severity={event.severity} />
            <span className="line-clamp-2">
              <AuditSentence event={event} language={language} />
            </span>
          </span>
        )}
        renderRowAction={(event, children) => (
          <button
            type="button"
            onClick={() => openDetail(event)}
            className="focus-visible:ring-ring block w-full rounded-lg text-left outline-none focus-visible:ring-2"
            aria-label={auditSentence(event, language)}
          >
            {children}
          </button>
        )}
        columns={[
          {
            key: "actor",
            header: language === "bn" ? "কার্যকারী" : "Actor",
            cell: (event) => (
              <span className="flex items-center gap-2">
                <Avatar className="size-6">
                  <AvatarFallback className="text-[10px]">
                    {(event.actorName ?? "S").slice(0, 1).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <BnEnText
                  text={
                    event.actorName ??
                    (language === "bn" ? "সিস্টেম" : "System")
                  }
                />
              </span>
            ),
          },
          {
            key: "action",
            header: language === "bn" ? "কার্যক্রম" : "Action",
            hideOnCard: true,
            // The sentence, not the raw action code (F-ID-09 §4.1); the code
            // stays in the detail sheet for anyone who needs it.
            cell: (event) => (
              <AuditSentence event={event} language={language} />
            ),
          },
          {
            key: "changedFields",
            header: language === "bn" ? "পরিবর্তিত ক্ষেত্র" : "Changed fields",
            hideOnCard: true,
            cell: (event) =>
              event.changedFields
                ?.map((f) => f.replace(/_/g, " "))
                .join(", ") ?? "—",
          },
          {
            key: "time",
            header: language === "bn" ? "সময়" : "Time",
            cell: (event) => (
              <span className="text-muted-foreground text-xs">
                {relativeTime(event.createdAt)}
              </span>
            ),
          },
        ]}
        empty={
          <EmptyState
            title={
              activeFilterCount > 0
                ? language === "bn"
                  ? "এই ফিল্টারের সাথে কোনো ইভেন্ট মেলেনি"
                  : "No events match these filters"
                : language === "bn"
                  ? "এখনো কোনো কার্যক্রম রেকর্ড হয়নি"
                  : "No activity recorded yet"
            }
            action={
              activeFilterCount > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setFilters(AUDIT_FILTERS_DEFAULT)}
                >
                  {language === "bn" ? "ফিল্টার সাফ করুন" : "Clear filters"}
                </Button>
              ) : undefined
            }
          />
        }
      />

      {isPending && hasLoadedOnce ? <DataListSkeleton rows={3} /> : null}

      {cursor && !isPending ? (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => load(true, cursor)}
        >
          {language === "bn" ? "আরও লোড করুন" : "Load more"}
        </Button>
      ) : null}

      <AuditDetailSheet
        event={selectedEvent}
        language={language}
        timezone={timezone}
        onOpenChange={(open) => {
          if (!open) setSelectedEvent(null)
        }}
        onSelectEvent={(event) => {
          setSelectedEvent(null)
          // Let the sheet close before reopening with the new event so screen
          // readers announce the change rather than a silent content swap.
          setTimeout(() => setSelectedEvent(event), 0)
        }}
      />
    </div>
  )
}
