import Link from "next/link"
import { forbidden, notFound } from "next/navigation"

import { ChevronLeftIcon } from "lucide-react"

import type { StudentResultRow } from "@acadigma/contracts"
import { getExam } from "@acadigma/db/repositories/exams"
import { getSectionResults } from "@acadigma/db/repositories/results"
import { can } from "@acadigma/domain"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"

import { getMessages, type Messages } from "@/lib/i18n"
import type { Locale } from "@/lib/locale"
import { createClient } from "@/lib/supabase/server"
import { requireShell } from "@/lib/workspace"

import { ResultsView } from "./results-view"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Results" }

type T = Messages["exams"]["results"]

const UUID = /^[0-9a-f-]{36}$/i

/**
 * F-AC-06 §6 "Results preview" (Part 5 demo cut, D-305): one section's
 * computed results in rank order; each row opens to its per-subject grades.
 * Western digits in both languages (DESIGN-SYSTEM §1.6).
 */
export default async function ExamResultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ section?: string }>
}) {
  const ctx = await requireShell("school")
  if (!can(ctx.role, "results.read")) forbidden()
  const [{ id }, { section }] = await Promise.all([params, searchParams])
  if (!UUID.test(id)) notFound()

  const { t, locale } = await getMessages()
  const supabase = await createClient()
  const exam = await getExam(ctx, supabase, id)
  if (!exam.ok) {
    if (exam.error.code === "not_found") notFound()
    return (
      <div className="mx-auto max-w-3xl">
        <InlineAlert tone="error">{exam.error.message}</InlineAlert>
      </div>
    )
  }

  const sections = [
    ...new Map(
      exam.data.papers.map((p) => [p.sectionId, p.sectionLabel])
    ).entries(),
  ]
  const sectionId =
    sections.find(([sid]) => sid === section)?.[0] ?? sections[0]?.[0]
  const results = sectionId
    ? await getSectionResults(ctx, supabase, id, sectionId)
    : null
  const r = t.exams.results

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link
        href={`/app/exams/${id}`}
        className="text-muted-foreground inline-flex min-h-11 items-center gap-1 text-sm"
      >
        <ChevronLeftIcon className="size-4" aria-hidden /> {r.back}
      </Link>

      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">
          {r.title} · {exam.data.name}
        </h2>
        {results?.ok && results.data.computedAt ? (
          <p className="text-muted-foreground text-sm">
            {r.computedAt.replace(
              "{date}",
              computedFormatter(locale).format(
                new Date(results.data.computedAt)
              )
            )}
            {" · "}
            {summary(r, results.data.rows)}
          </p>
        ) : null}
      </div>

      <ResultsView
        t={r}
        locale={locale}
        sections={sections}
        sectionId={sectionId}
        results={results}
        reportCard={
          can(ctx.role, "report.render.report_card")
            ? {
                generateReportCard: t.reports.generateReportCard,
                generating: t.reports.generating,
                error: t.reports.error,
              }
            : null
        }
      />
    </div>
  )
}

function computedFormatter(locale: Locale): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(
    locale === "bn" ? "bn-BD-u-nu-latn" : "en-GB",
    {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Dhaka",
    }
  )
}

function summary(t: T, rows: StudentResultRow[]): string {
  const count = (status: StudentResultRow["status"]) =>
    String(rows.filter((row) => row.status === status).length)
  return t.summary
    .replace("{n}", String(rows.length))
    .replace("{passed}", count("pass"))
    .replace("{failed}", count("fail"))
}
