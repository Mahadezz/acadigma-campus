"use client"

import type {
  ApiError,
  Result,
  SectionResults,
  StudentResultRow,
} from "@acadigma/contracts"
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

import type { Messages } from "@/lib/i18n"
import type { Locale } from "@/lib/locale"

type T = Messages["exams"]["results"]

/**
 * One client boundary for the preview (the section picker and the ranked
 * list), so the page's first-load JS stays inside the 250 kB budget (client
 * components referenced straight from the server page pulled the whole
 * radix-ui barrel in: 273 kB).
 */
export function ResultsView({
  t: r,
  locale,
  sections,
  sectionId,
  results,
}: {
  t: T
  locale: Locale
  sections: [string, string][]
  sectionId: string | undefined
  results: Result<SectionResults, ApiError> | null
}) {
  return (
    <>
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
    </>
  )
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
            <AccordionTrigger className="min-h-14 items-center px-4 hover:no-underline">
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
                    tone={
                      row.status === "pass"
                        ? "positive"
                        : row.status === "fail"
                          ? "negative"
                          : "neutral"
                    }
                  >
                    {t[row.status]}
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
