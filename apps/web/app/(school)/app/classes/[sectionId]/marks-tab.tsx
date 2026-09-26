"use client"

import type { SectionPaper } from "@acadigma/contracts"
import { BnEnText } from "@acadigma/ui/primitives/bn-en-text"
import { EmptyState } from "@acadigma/ui/primitives/empty-state"
import {
  StatusChip,
  type ToneStatusChipProps,
} from "@acadigma/ui/primitives/status-chip"

import type { Messages } from "@/lib/i18n"
import type { Locale } from "@/lib/locale"

import { fill } from "./format"

const PAPER_STATUS_TONE: Record<
  SectionPaper["status"],
  ToneStatusChipProps["tone"]
> = {
  pending: "neutral",
  entering: "pending",
  submitted: "positive",
  locked: "info",
}

/**
 * F-ID-10 §8 Part 3 — "papers of this section's exams" the caller teaches,
 * n/N entered, tap through to the existing marks entry screen (§7
 * `listSectionPapers`). This tab adds no new entry screen, only a way to
 * find one — code-split from `class-hub-view.tsx` (`next/dynamic`) since a
 * teacher usually opens Attendance first (§5.5 bundle budget).
 */
export function MarksTab({
  t,
  locale,
  papers,
}: {
  t: Messages["basicMode"]["classHub"]
  locale: Locale
  papers: SectionPaper[]
}) {
  if (papers.length === 0) return <EmptyState title={t.marks.empty} />
  return (
    <ul className="divide-border divide-y border-y">
      {papers.map((paper) => (
        <li key={paper.examSubjectId}>
          <a
            href={`/app/marks/${paper.examSubjectId}`}
            className="hover:bg-muted/50 flex min-h-16 flex-col justify-center gap-1 px-2 py-3"
          >
            <span className="flex items-center justify-between gap-2 text-base font-medium">
              <BnEnText
                text={
                  locale === "bn" && paper.subjectNameBn
                    ? paper.subjectNameBn
                    : paper.subjectName
                }
              />
              <StatusChip tone={PAPER_STATUS_TONE[paper.status]}>
                {paper.status === "pending"
                  ? t.marks.statusPending
                  : paper.status === "entering"
                    ? t.marks.statusEntering
                    : paper.status === "submitted"
                      ? t.marks.statusSubmitted
                      : t.marks.statusLocked}
              </StatusChip>
            </span>
            <span className="text-muted-foreground text-sm">
              {paper.examName} ·{" "}
              {fill(t.marks.entered, {
                done: paper.marksDone,
                total: paper.enrolled,
              })}
            </span>
          </a>
        </li>
      ))}
    </ul>
  )
}
