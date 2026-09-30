"use client"

import { useState } from "react"

import dynamic from "next/dynamic"
import Link from "next/link"

import { FileUpIcon, PlusIcon, SearchIcon } from "lucide-react"

import type {
  QuickAdmitResult,
  RosterStudent,
  StudentSearchQuery,
} from "@acadigma/contracts"
import { Button } from "@acadigma/ui/components/button"
import { Input } from "@acadigma/ui/components/input"
import { Label } from "@acadigma/ui/components/label"
import {
  NativeSelect,
  NativeSelectOption,
} from "@acadigma/ui/components/native-select"
import {
  DataList,
  type DataListColumn,
} from "@acadigma/ui/primitives/data-list"
import { EmptyState } from "@acadigma/ui/primitives/empty-state"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"

import type { Messages } from "@/lib/i18n"
import type { Locale } from "@/lib/locale"

import { classLabel } from "./format"

// D-408: the admit form loads on first open; /app/students is at the budget.
const AdmitSheet = dynamic(() =>
  import("./admit-sheet").then((m) => m.AdmitSheet)
)

type T = Messages["students"]

export type SectionOption = { id: string; label: string }

/** The name in the reader's language first, the other underneath. */
function names(locale: Locale, s: RosterStudent): [string, string | null] {
  if (locale === "bn" && s.fullNameBn) return [s.fullNameBn, s.fullName]
  return [s.fullName, s.fullNameBn]
}

function pageHref(query: StudentSearchQuery, page: number): string {
  const params = new URLSearchParams()
  if (query.q) params.set("q", query.q)
  if (query.sectionId) params.set("section", query.sectionId)
  if (page > 1) params.set("page", String(page))
  const qs = params.toString()
  return qs ? `/app/students?${qs}` : "/app/students"
}

export function StudentsView({
  t,
  locale,
  students,
  hasMore,
  query,
  sections,
  canAdmit,
  canImport,
}: {
  t: T
  locale: Locale
  students: RosterStudent[]
  hasMore: boolean
  query: StudentSearchQuery
  sections: SectionOption[]
  canAdmit: boolean
  canImport: boolean
}) {
  const [admitting, setAdmitting] = useState(false)
  // Mounted from the first open on, so the close animation still plays.
  const [admitOpened, setAdmitOpened] = useState(false)
  const [admitted, setAdmitted] = useState<
    (QuickAdmitResult & { name: string }) | null
  >(null)
  const filtered = Boolean(query.q || query.sectionId)

  const columns: DataListColumn<RosterStudent>[] = [
    {
      key: "name",
      header: t.columns.name,
      hideOnCard: true,
      cell: (s) => <StudentLink locale={locale} student={s} />,
    },
    {
      key: "class",
      header: t.columns.class,
      cell: (s) => classLabel(t, locale, s),
    },
    {
      key: "roll",
      header: t.columns.roll,
      className: "tabular-nums",
      cell: (s) => s.rollNumber ?? "—",
    },
    {
      key: "code",
      header: t.columns.code,
      className: "tabular-nums",
      cell: (s) => s.studentCode,
    },
    {
      key: "gender",
      header: t.columns.gender,
      cell: (s) => t.gender[s.gender],
    },
  ]

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold tracking-tight">{t.title}</h1>
        <div className="flex gap-2">
          {canImport ? (
            <Button asChild variant="outline" className="h-11">
              <Link href="/app/students/import">
                <FileUpIcon aria-hidden="true" />
                {t.importButton}
              </Link>
            </Button>
          ) : null}
          {canAdmit ? (
            <Button
              type="button"
              className="h-11"
              onClick={() => {
                setAdmitted(null)
                setAdmitting(true)
                setAdmitOpened(true)
              }}
            >
              <PlusIcon aria-hidden="true" />
              {t.admit}
            </Button>
          ) : null}
        </div>
      </div>

      {admitted ? (
        <InlineAlert tone="success">
          {t.admitted
            .replace("{name}", admitted.name)
            .replace("{code}", admitted.studentCode)
            .replace("{roll}", String(admitted.rollNumber))}{" "}
          <Link
            href={`/app/students/${admitted.studentId}`}
            className="font-medium underline underline-offset-4"
          >
            {t.viewProfile}
          </Link>
        </InlineAlert>
      ) : null}

      <form
        action="/app/students"
        method="get"
        role="search"
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
      >
        <div className="flex-1 space-y-2">
          <Label htmlFor="students-q">{t.searchLabel}</Label>
          <Input
            id="students-q"
            name="q"
            type="search"
            maxLength={60}
            defaultValue={query.q ?? ""}
            placeholder={t.searchPlaceholder}
            className="h-11"
          />
        </div>
        <div className="space-y-2 sm:w-56">
          <Label htmlFor="students-section">{t.sectionFilter}</Label>
          <NativeSelect
            id="students-section"
            name="section"
            defaultValue={query.sectionId ?? ""}
            className="min-h-11 w-full"
          >
            <NativeSelectOption value="">{t.allSections}</NativeSelectOption>
            {sections.map((section) => (
              <NativeSelectOption key={section.id} value={section.id}>
                {section.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <Button type="submit" variant="outline" className="h-11">
          <SearchIcon aria-hidden="true" />
          {t.search}
        </Button>
      </form>

      <DataList
        items={students}
        columns={columns}
        getRowId={(s) => s.id}
        caption={t.caption}
        virtualize={false}
        renderCardTitle={(s) => <StudentLink locale={locale} student={s} />}
        empty={
          <EmptyState
            title={filtered ? t.noMatches : t.empty}
            description={filtered ? undefined : t.emptyDescription}
          />
        }
      />

      {query.page > 1 || hasMore ? (
        <nav
          aria-label={t.pageLabel.replace("{page}", String(query.page))}
          className="flex items-center justify-between gap-2"
        >
          {query.page > 1 ? (
            <Button asChild variant="outline" className="h-11">
              <Link href={pageHref(query, query.page - 1)}>{t.previous}</Link>
            </Button>
          ) : (
            <span />
          )}
          <span className="text-muted-foreground text-sm tabular-nums">
            {t.pageLabel.replace("{page}", String(query.page))}
          </span>
          {hasMore ? (
            <Button asChild variant="outline" className="h-11">
              <Link href={pageHref(query, query.page + 1)}>{t.next}</Link>
            </Button>
          ) : (
            <span />
          )}
        </nav>
      ) : null}

      {canAdmit && admitOpened ? (
        <AdmitSheet
          t={t}
          open={admitting}
          onOpenChange={setAdmitting}
          sections={sections}
          defaultSectionId={query.sectionId}
          onAdmitted={setAdmitted}
        />
      ) : null}
    </div>
  )
}

function StudentLink({
  locale,
  student,
}: {
  locale: Locale
  student: RosterStudent
}) {
  const [primary, secondary] = names(locale, student)
  return (
    <Link
      href={`/app/students/${student.id}`}
      className="flex min-h-11 flex-col justify-center font-medium underline-offset-4 hover:underline"
    >
      <span>{primary}</span>
      {secondary ? (
        <span className="text-muted-foreground text-xs font-normal">
          {secondary}
        </span>
      ) : null}
    </Link>
  )
}
