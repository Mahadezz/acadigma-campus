import Link from "next/link"
import { forbidden, notFound } from "next/navigation"

import { ChevronLeftIcon } from "lucide-react"

import type { StudentResultRow } from "@acadigma/contracts"
import { getExam } from "@acadigma/db/repositories/exams"
import { getSectionResults } from "@acadigma/db/repositories/results"
import { can } from "@acadigma/domain"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@acadigma/ui/components/accordion"
import { Button } from "@acadigma/ui/components/button"
import { Label } from "@acadigma/ui/components/label"
import {
  NativeSelect,
  NativeSelectOption,
} from "@acadigma/ui/components/native-select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@acadigma/ui/components/table"
import { EmptyState } from "@acadigma/ui/primitives/empty-state"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"
import { StatusChip } from "@acadigma/ui/primitives/status-chip"

import { getMessages, type Messages } from "@/lib/i18n"
import type { Locale } from "@/lib/locale"
import { createClient } from "@/lib/supabase/server"
import { requireShell } from "@/lib/workspace"

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

      {sections.length > 1 ? (
        <form method="get" className="flex items-end gap-2">
          <div className="flex-1 space-y-1">
            <Label htmlFor="results-section">{r.section}</Label>
            <NativeSelect
              id="results-section"
              name="section"
              defaultValue={sectionId}
              className="min-h-11"
            >
              {sections.map(([sid, label]) => (
                <NativeSelectOption key={sid} value={sid}>
                  {label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <Button type="submit" variant="outline" className="h-11">
            {r.show}
          </Button>
        </form>
      ) : null}

      {results && !results.ok ? (
        <InlineAlert tone="error">{results.error.message}</InlineAlert>
      ) : !results || results.data.rows.length === 0 ? (
        <EmptyState title={r.emptyTitle} description={r.emptyBody} />
      ) : (
        <ResultList t={r} locale={locale} rows={results.data.rows} />
      )}
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
  const passed = rows.filter((row) => row.status === "pass").length
  return t.summary
    .replace("{n}", String(rows.length))
    .replace("{passed}", String(passed))
    .replace("{failed}", String(rows.length - passed))
}

const fixed2 = (n: number | null) => (n === null ? "—" : n.toFixed(2))

function ResultList({
  t,
  locale,
  rows,
}: {
  t: T
  locale: Locale
  rows: StudentResultRow[]
}) {
  const rankCounts = new Map<number, number>()
  for (const row of rows) {
    if (row.sectionRank !== null) {
      rankCounts.set(
        row.sectionRank,
        (rankCounts.get(row.sectionRank) ?? 0) + 1
      )
    }
  }

  return (
    <Accordion type="multiple" className="rounded-lg border">
      {rows.map((row) => {
        const name =
          locale === "bn" && row.fullNameBn ? row.fullNameBn : row.fullName
        const tied =
          row.sectionRank !== null && (rankCounts.get(row.sectionRank) ?? 0) > 1
        return (
          <AccordionItem key={row.studentId} value={row.studentId}>
            <AccordionTrigger className="items-center px-4 hover:no-underline">
              <span className="grid flex-1 grid-cols-[3rem_1fr_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[4rem_1fr_5rem_4rem_5rem]">
                <span className="text-base font-semibold tabular-nums">
                  {row.sectionRank ?? "—"}
                  {tied ? (
                    <span className="text-muted-foreground block text-xs font-normal">
                      {t.tied}
                    </span>
                  ) : null}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-medium">{name}</span>
                  <span className="text-muted-foreground block text-xs">
                    {row.rollNumber !== null
                      ? t.roll.replace("{n}", String(row.rollNumber))
                      : row.studentCode}
                    {row.failedSubjects > 0
                      ? ` · ${t.failedPapers.replace("{n}", String(row.failedSubjects))}`
                      : null}
                  </span>
                </span>
                <span className="text-right tabular-nums sm:text-left">
                  <span className="text-muted-foreground block text-xs sm:hidden">
                    {t.gpa}
                  </span>
                  <span className="sr-only sm:not-sr-only">{t.gpa} </span>
                  {fixed2(row.gpa)}
                </span>
                <span className="col-start-2 sm:col-start-auto">
                  <span className="sr-only">{t.grade} </span>
                  {row.letter ?? "—"}
                </span>
                <span className="justify-self-end sm:justify-self-start">
                  <StatusChip
                    tone={row.status === "pass" ? "positive" : "negative"}
                  >
                    {row.status === "pass" ? t.pass : t.fail}
                  </StatusChip>
                </span>
              </span>
            </AccordionTrigger>
            <AccordionContent className="px-4">
              <p className="text-muted-foreground mb-2 text-sm tabular-nums">
                {t.total}: {fixed2(row.totalObtained)}/{fixed2(row.totalFull)}
                {row.percentage !== null
                  ? ` · ${fixed2(row.percentage)} %`
                  : ""}
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t.subject}</TableHead>
                    <TableHead className="text-right">{t.marks}</TableHead>
                    <TableHead className="text-right">{t.percent}</TableHead>
                    <TableHead>{t.grade}</TableHead>
                    <TableHead className="text-right">{t.points}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {row.lines.map((line) => (
                    <TableRow key={line.subjectName}>
                      <TableCell className="whitespace-normal">
                        {locale === "bn" && line.subjectNameBn
                          ? line.subjectNameBn
                          : line.subjectName}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {line.status === "absent"
                          ? t.absent
                          : line.status === "exempt"
                            ? t.exempt
                            : `${fixed2(line.obtained)}/${fixed2(line.fullMarks)}`}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fixed2(line.percentage)}
                      </TableCell>
                      <TableCell>
                        {line.letter ?? "—"}
                        {line.passed === false ? (
                          <span className="sr-only"> ({t.fail})</span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fixed2(line.gradePoint)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </AccordionContent>
          </AccordionItem>
        )
      })}
    </Accordion>
  )
}
