"use client"

import { useState } from "react"

import type { AuditEventDto } from "@acadigma/contracts/audit"
import { renderAuditSentence } from "@acadigma/domain/audit"
import { Button } from "@acadigma/ui/components/button"
import { FormSheet } from "@acadigma/ui/primitives/form-sheet"

import { CorrelationList } from "./correlation-list"
import { DiffView } from "./diff-view"
import { SeverityChip } from "./severity-chip"

/**
 * The full-height detail sheet (F-ID-09 §4.3): sentence, timestamp in both the
 * workspace timezone and UTC, actor, action + severity, changed fields, the diff,
 * and "Show everything from this action" at the bottom.
 */
export function AuditDetailSheet({
  event,
  language,
  timezone,
  onOpenChange,
  onSelectEvent,
}: {
  event: AuditEventDto | null
  language: "en" | "bn"
  timezone: string
  onOpenChange: (open: boolean) => void
  onSelectEvent: (event: AuditEventDto) => void
}) {
  const [showCorrelation, setShowCorrelation] = useState(false)

  if (!event) return null

  const sentence = renderAuditSentence(event.action, language, {
    actor: event.actorName,
    subject: event.subjectName,
  })

  return (
    <FormSheet
      open={Boolean(event)}
      onOpenChange={(open) => {
        if (!open) setShowCorrelation(false)
        onOpenChange(open)
      }}
      title={sentence}
      description={
        <span className="flex items-center gap-2">
          <SeverityChip severity={event.severity} />
          <code className="text-xs">{event.action}</code>
        </span>
      }
    >
      <div className="space-y-4 pb-4">
        <section aria-label={language === "bn" ? "সময়" : "Time"}>
          <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            {language === "bn" ? "সময়" : "Time"}
          </h3>
          <p className="text-sm">
            {formatInTimezone(event.createdAt, timezone)} ({timezone})
          </p>
          <p className="text-muted-foreground text-xs">
            {formatInTimezone(event.createdAt, "UTC")} UTC
          </p>
        </section>

        <section aria-label={language === "bn" ? "কার্যকারী" : "Actor"}>
          <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            {language === "bn" ? "কার্যকারী" : "Actor"}
          </h3>
          <p className="text-sm">
            {event.actorName ?? (language === "bn" ? "সিস্টেম" : "System")}
            {event.userAgentFamily ? ` · ${event.userAgentFamily}` : ""}
          </p>
        </section>

        {event.tableName || event.rowId ? (
          <section aria-label={language === "bn" ? "রেকর্ড" : "Record"}>
            <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              {language === "bn" ? "রেকর্ড" : "Record"}
            </h3>
            <p className="text-sm break-all">
              {event.tableName ?? "—"} {event.rowId ? `· ${event.rowId}` : ""}
            </p>
          </section>
        ) : null}

        {event.changedFields && event.changedFields.length > 0 ? (
          <section
            aria-label={
              language === "bn" ? "পরিবর্তিত ক্ষেত্র" : "Changed fields"
            }
          >
            <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              {language === "bn" ? "পরিবর্তিত ক্ষেত্র" : "Changed fields"}
            </h3>
            <ul className="mt-1 flex flex-wrap gap-1.5">
              {event.changedFields.map((field) => (
                <li
                  key={field}
                  className="bg-muted rounded px-1.5 py-0.5 text-xs"
                >
                  {field}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section aria-label={language === "bn" ? "পরিবর্তন" : "Diff"}>
          <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            {language === "bn" ? "পরিবর্তন" : "Diff"}
          </h3>
          <DiffView
            before={event.before}
            after={event.after}
            changedFields={event.changedFields}
            language={language}
          />
        </section>

        {event.correlationId ? (
          <section>
            {showCorrelation ? (
              <>
                <h3 className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
                  {language === "bn"
                    ? "এই কার্যক্রমের সবকিছু"
                    : "Everything from this action"}
                </h3>
                <CorrelationList
                  correlationId={event.correlationId}
                  language={language}
                  onSelectEvent={onSelectEvent}
                />
              </>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => setShowCorrelation(true)}
              >
                {language === "bn"
                  ? "এই কার্যক্রমের সবকিছু দেখুন"
                  : "Show everything from this action"}
              </Button>
            )}
          </section>
        ) : null}
      </div>
    </FormSheet>
  )
}

function formatInTimezone(isoDateTime: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone,
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(isoDateTime))
  } catch {
    return isoDateTime
  }
}
