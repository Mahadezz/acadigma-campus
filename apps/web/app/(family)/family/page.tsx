import { HeartHandshakeIcon } from "lucide-react"

import type { FamilyResult } from "@acadigma/contracts"
import { listFamilyResults } from "@acadigma/db/repositories/results"
import { can } from "@acadigma/domain"
import { Badge } from "@acadigma/ui/components/badge"
import { Button } from "@acadigma/ui/components/button"
import { EmptyState } from "@acadigma/ui/primitives/empty-state"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"

import { getMessages, type Messages } from "@/lib/i18n"
import { createClient } from "@/lib/supabase/server"
import { requireShell } from "@/lib/workspace"

import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Family",
}

type T = Messages["workspace"]["family"]["results"]

/**
 * Family home (F-ID-03 §8 Part 4 shell) with F-AC-10's results tab, demo cut
 * (D-306): the parent's linked children's published results, newest first,
 * each read from its frozen payload (never recomputed), with "Download report
 * card". RLS decides what is here: only published, non-withheld results of
 * children the parent has an active guardian link to. Western digits in both
 * languages (DESIGN-SYSTEM §1.6); the downloaded card itself uses Bangla
 * numerals in Bangla.
 *
 * With nothing published (or before F-AC-02 Part 4 links a parent to a child)
 * the page is the shell's empty state. `EmptyState`'s title is a `<p>`, so the
 * page carries its own `<h2>` (the shell owns `<h1>`, PR #30).
 */
export default async function FamilyHomePage() {
  const ctx = await requireShell("family")
  const { t, locale } = await getMessages()

  const results = can(ctx.role, "family.results.read")
    ? await listFamilyResults(ctx, await createClient())
    : null

  if (results && !results.ok) {
    return <InlineAlert tone="error">{results.error.message}</InlineAlert>
  }
  if (!results || results.data.length === 0) {
    return (
      <>
        <h2 className="sr-only">{t.workspace.family.emptyTitle}</h2>
        <EmptyState
          icon={<HeartHandshakeIcon />}
          title={t.workspace.family.emptyTitle}
          description={
            results
              ? t.workspace.family.results.emptyDescription
              : t.workspace.family.emptyDescription.replace("{role}", ctx.role)
          }
        />
      </>
    )
  }

  const tr = t.workspace.family.results
  const date = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Dhaka",
  })
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h2 className="text-lg font-semibold tracking-tight">{tr.title}</h2>
      <ul className="space-y-3">
        {results.data.map((r) => (
          <ResultCard
            key={`${r.examId}:${r.studentId}`}
            tr={tr}
            result={r}
            bn={locale === "bn"}
            publishedOn={date.format(new Date(r.publishedAt))}
          />
        ))}
      </ul>
    </div>
  )
}

/** Western digits, always (the screen default). */
function num(n: number | null, digits?: number): string {
  if (n === null) return "—"
  return digits === undefined ? String(n) : n.toFixed(digits)
}

function ResultCard({
  tr,
  result,
  bn,
  publishedOn,
}: {
  tr: T
  result: FamilyResult
  bn: boolean
  publishedOn: string
}) {
  const card = result.card
  const name = bn ? card.studentNameBn : card.studentNameEn
  const exam = bn ? card.examNameBn : card.examNameEn
  const passed = card.result === "pass"
  const query = new URLSearchParams({
    examId: result.examId,
    studentId: result.studentId,
  })

  return (
    <li className="bg-card space-y-3 rounded-lg border p-4">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-medium">{name}</h3>
          <Badge variant={passed ? "outline" : "destructive"}>
            {passed ? tr.pass : tr.fail}
          </Badge>
        </div>
        <p className="text-muted-foreground text-sm">
          {tr.exam
            .replace("{exam}", exam)
            .replace("{class}", card.className)
            .replace("{section}", card.sectionName)}
        </p>
        <p className="text-muted-foreground text-xs">
          {tr.publishedOn.replace("{date}", publishedOn)}
        </p>
      </div>

      <dl className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-md border p-2">
          <dt className="text-muted-foreground text-xs">{tr.gpa}</dt>
          <dd className="text-lg font-semibold tabular-nums">
            {num(card.gpa, 2)}
          </dd>
        </div>
        <div className="rounded-md border p-2">
          <dt className="text-muted-foreground text-xs">{tr.grade}</dt>
          <dd className="text-lg font-semibold">{card.overallLetter ?? "—"}</dd>
        </div>
        <div className="rounded-md border p-2">
          <dt className="text-muted-foreground text-xs">{tr.rank}</dt>
          <dd className="text-lg font-semibold tabular-nums">
            {card.rank === null
              ? "—"
              : card.rankOf === null
                ? num(card.rank)
                : tr.rankOf
                    .replace("{rank}", num(card.rank))
                    .replace("{of}", num(card.rankOf))}
            {card.rankTied ? (
              <span className="text-muted-foreground block text-xs font-normal">
                {tr.tied}
              </span>
            ) : null}
          </dd>
        </div>
      </dl>

      <details className="rounded-md border">
        <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-medium">
          {tr.showSubjects}
        </summary>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground border-t text-left text-xs">
              <th scope="col" className="p-2 font-normal">
                {tr.subject}
              </th>
              <th scope="col" className="p-2 text-right font-normal">
                {tr.marks}
              </th>
              <th scope="col" className="p-2 text-right font-normal">
                {tr.grade}
              </th>
              <th scope="col" className="p-2 text-right font-normal">
                {tr.points}
              </th>
            </tr>
          </thead>
          <tbody>
            {card.subjects.map((s) => (
              <tr key={s.subjectNameEn} className="border-t">
                <td className="p-2">
                  {bn ? s.subjectNameBn : s.subjectNameEn}
                </td>
                <td className="p-2 text-right tabular-nums">
                  {s.status === "absent"
                    ? tr.absent
                    : s.status === "exempt"
                      ? tr.exempt
                      : `${num(s.marksObtained)} / ${num(s.fullMarks)}`}
                </td>
                <td className="p-2 text-right">{s.letter ?? "—"}</td>
                <td className="p-2 text-right tabular-nums">
                  {num(s.gradePoint, 2)}
                </td>
              </tr>
            ))}
            <tr className="border-t font-medium">
              <th scope="row" className="p-2 text-left">
                {tr.total}
              </th>
              <td className="p-2 text-right tabular-nums">
                {`${num(card.totalObtained)} / ${num(card.totalFull)}`}
              </td>
              <td className="p-2" colSpan={2} />
            </tr>
          </tbody>
        </table>
      </details>

      <Button asChild variant="outline" className="h-11 w-full sm:w-auto">
        <a
          href={`/api/family/report-card?${query.toString()}`}
          aria-label={tr.downloadFor
            .replace("{name}", name)
            .replace("{exam}", exam)}
        >
          {tr.download}
        </a>
      </Button>
    </li>
  )
}
