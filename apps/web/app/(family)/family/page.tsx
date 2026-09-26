import { HeartHandshakeIcon } from "lucide-react"

import type { FamilyChild, FamilyResult } from "@acadigma/contracts"
import { listFamilyChildren } from "@acadigma/db/repositories/guardian-links"
import {
  hasGuardianLink,
  listFamilyResults,
} from "@acadigma/db/repositories/results"
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

  const tr = t.workspace.family.results
  const supabase = await createClient()
  // D-109: whatever the role — a parent, or staff who are also parents here
  // (requireShell let them in on an active link) — this page shows only the
  // caller's own linked children.
  const [linked, results, children] = await Promise.all([
    hasGuardianLink(ctx, supabase),
    listFamilyResults(ctx, supabase),
    listFamilyChildren(ctx, supabase),
  ])

  if (!linked.ok) {
    return <InlineAlert tone="error">{linked.error.message}</InlineAlert>
  }
  if (!results.ok) {
    return <InlineAlert tone="error">{results.error.message}</InlineAlert>
  }
  // F-AC-02 Part 4 (D-108): the children this account is linked to.
  const childList =
    children.ok && children.data.length > 0 ? (
      <Children
        t={t.workspace.family.children}
        kids={children.data}
        bn={locale === "bn"}
      />
    ) : null
  if (results.data.length === 0) {
    // No child linked yet, or nothing published yet (D-306 review).
    const title = linked.data ? tr.emptyTitle : tr.notLinkedTitle
    const description = linked.data
      ? tr.emptyDescription
      : tr.notLinkedDescription
    return (
      <>
        {childList}
        <h2 className="sr-only">{title}</h2>
        <EmptyState
          icon={<HeartHandshakeIcon />}
          title={title}
          description={description}
        />
      </>
    )
  }

  // Bangla month names with Western digits in Bangla (DESIGN-SYSTEM §1.6).
  const date = new Intl.DateTimeFormat(
    locale === "bn" ? "bn-BD-u-nu-latn" : "en-GB",
    {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "Asia/Dhaka",
    }
  )
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {childList}
      <h2 className="text-lg font-semibold tracking-tight">{tr.title}</h2>
      <ul className="space-y-3">
        {results.data.map((r) =>
          r.withheld ? (
            <li
              key={`${r.examId}:${r.studentId}`}
              className="bg-card space-y-1 rounded-lg border p-4"
            >
              <h3 className="font-medium">
                {locale === "bn" ? r.card.studentNameBn : r.card.studentNameEn}
              </h3>
              <p className="text-muted-foreground text-sm">
                {tr.exam
                  .replace("{exam}", r.card.examNameEn)
                  .replace("{class}", r.card.className)
                  .replace("{section}", r.card.sectionName)}
              </p>
              <p className="text-sm font-medium">{tr.withheld}</p>
            </li>
          ) : (
            <ResultCard
              key={`${r.examId}:${r.studentId}`}
              tr={tr}
              result={r}
              bn={locale === "bn"}
              publishedOn={date.format(new Date(r.publishedAt))}
            />
          )
        )}
      </ul>
    </div>
  )
}

function Children({
  t,
  kids,
  bn,
}: {
  t: Messages["workspace"]["family"]["children"]
  kids: FamilyChild[]
  bn: boolean
}) {
  return (
    <section className="mx-auto mb-4 max-w-2xl space-y-2">
      <h2 className="text-lg font-semibold tracking-tight">{t.title}</h2>
      <ul className="space-y-2">
        {kids.map((k) => (
          <li key={k.id} className="bg-card rounded-lg border p-3">
            <p className="font-medium">
              {bn && k.fullNameBn ? k.fullNameBn : k.fullName}
            </p>
            <p className="text-muted-foreground text-xs tabular-nums">
              {t.code.replace("{code}", k.studentCode)}
            </p>
          </li>
        ))}
      </ul>
    </section>
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
  result: Extract<FamilyResult, { withheld: false }>
  bn: boolean
  publishedOn: string
}) {
  const card = result.card
  const name = bn ? card.studentNameBn : card.studentNameEn
  // Exams have one name (examNameBn is the same string, D-305).
  const exam = card.examNameEn
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
