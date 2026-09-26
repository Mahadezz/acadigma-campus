"use client"

import * as React from "react"

import dynamic from "next/dynamic"

import {
  BookMarkedIcon,
  ClipboardCheckIcon,
  PrinterIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react"

import type {
  ClassHubTabId,
  RollCallStudent,
  RosterStudent,
  SectionPaper,
  SectionPrintExam,
} from "@acadigma/contracts"
import { Skeleton } from "@acadigma/ui/components/skeleton"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@acadigma/ui/components/tabs"
import { BnEnText } from "@acadigma/ui/primitives/bn-en-text"
import { EmptyState } from "@acadigma/ui/primitives/empty-state"

import type { Messages } from "@/lib/i18n"
import type { Locale } from "@/lib/locale"

import { RollCall } from "../../attendance/[sectionId]/roll-call"

import { pluralize } from "./format"

// The 250 kB gzipped route budget (`check-bundle-budget.mjs`, BUILDER-BRIEF)
// — not the spec's own stricter, CI-unenforced 150 kB-per-tab target (§5.5)
// — plus D-405 item 8's Radix-barrel cost (any `Button` import pulls the
// whole `radix-ui` package) push Marks/Students/Print out of the page's
// initial JS: a teacher opens Attendance first almost every time (§4.5), so
// only that tab loads eagerly. `ssr: false` is required, not optional, for
// the split to actually shrink first-load JS — with SSR on, Next still
// ships the chunk for hydration and `check-bundle-budget.mjs` (and `next
// build`'s own "First Load JS" column) counts it anyway; none of these three
// tabs need to render on the server (each is empty until its own data is
// real, and none affects the initial paint the way Attendance does). Each
// gets a `Skeleton` `loading` fallback (review fix, react) so switching to
// it shows something immediately on a slow connection, not a blank panel.
const TAB_SKELETON = <Skeleton className="h-40 w-full" />
const MarksTab = dynamic(() => import("./marks-tab").then((m) => m.MarksTab), {
  ssr: false,
  loading: () => TAB_SKELETON,
})
const StudentsTab = dynamic(
  () => import("./students-tab").then((m) => m.StudentsTab),
  { ssr: false, loading: () => TAB_SKELETON }
)
const PrintTab = dynamic(() => import("./print-tab").then((m) => m.PrintTab), {
  ssr: false,
  loading: () => TAB_SKELETON,
})

const TAB_STORAGE_KEY = (sectionId: string) => `class-hub-tab:${sectionId}`

/** Kept in step with `CLASS_HUB_TABS` (`@acadigma/domain/class-hub`) by
 * `class-hub-tabs.test.ts`: every id that registry ships needs an icon here
 * or it renders with no icon at all. */
export const TAB_ICONS: Record<ClassHubTabId, LucideIcon> = {
  attendance: ClipboardCheckIcon,
  marks: BookMarkedIcon,
  students: UsersIcon,
  print: PrinterIcon,
}

/**
 * F-ID-10 §4.5/§8 Part 3 — the class hub's four tabs, pre-fetched
 * server-side by `page.tsx` and switched here client-side (no navigation,
 * so tab switching stays under the §5.5 INP budget once a tab's own chunk
 * has loaded). The last-used tab is remembered per class in `localStorage`
 * (§4.5, "a convenience only" — a read/write failure there never blocks
 * rendering).
 */
export function ClassHubView({
  t,
  locale,
  sectionId,
  title,
  studentCount,
  tabs,
  attendance,
  papers,
  students,
  latestExam,
  month,
}: {
  t: Messages
  locale: Locale
  sectionId: string
  title: string
  studentCount: number
  /** `getClassHub`'s own `tabs` (`CLASS_HUB_TABS`, `@acadigma/domain/class-hub`) — which tabs to render, in order. */
  tabs: ClassHubTabId[]
  attendance: {
    date: string
    dateLabel: string
    isSchoolDay: boolean
    students: RollCallStudent[]
    sessionUpdatedAt: string | null
    readOnlyReason: "cannotMark" | "window" | null
  } | null
  papers: SectionPaper[]
  students: RosterStudent[]
  latestExam: SectionPrintExam | null
  /** `YYYY-MM`, this month — `null` when today's date could not be read. */
  month: string | null
}) {
  const s = t.basicMode.classHub
  const [tab, setTab] = React.useState<ClassHubTabId>("attendance")

  React.useEffect(() => {
    // Reading a value from an external system (localStorage) on mount is one
    // of the two documented valid uses of an Effect (react.dev/learn/
    // you-might-not-need-an-effect) — synchronizing with a browser API, not
    // deriving state from props/state. It also has to run after hydration:
    // the server has no localStorage, so the SSR/first-paint tab must be the
    // fixed default ("attendance") to avoid a hydration mismatch.
    try {
      const stored = window.localStorage.getItem(TAB_STORAGE_KEY(sectionId))
      if (stored && (tabs as readonly string[]).includes(stored)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- see above
        setTab(stored as ClassHubTabId)
      }
    } catch {
      // localStorage unavailable (private browsing, etc.) — default stands.
    }
  }, [sectionId, tabs])

  function changeTab(next: string) {
    setTab(next as ClassHubTabId)
    try {
      window.localStorage.setItem(TAB_STORAGE_KEY(sectionId), next)
    } catch {
      // Best-effort convenience only — never blocks the tab switch.
    }
  }

  return (
    // Review fix (BLOCKER, found running the real journey): `max-w-2xl` here
    // squeezed `RollCall`'s own `max-w-5xl` two-column desktop grid — a
    // child's max-width can only narrow an ancestor's, never widen past it
    // — clipping the 5-segment `AttendanceToggle` below its 56px minimum
    // (AC9). Matches `RollCall`'s own width so nothing constrains it.
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">
          <BnEnText text={title} />
        </h1>
        <p className="text-muted-foreground text-base">
          {pluralize(studentCount, s.studentCountOne, s.studentCountOther)}
        </p>
      </header>

      <Tabs value={tab} onValueChange={changeTab}>
        <TabsList className="bg-muted grid h-auto grid-cols-4 gap-1 rounded-lg p-1">
          {tabs.map((id) => {
            const Icon = TAB_ICONS[id]
            return (
              <TabsTrigger
                key={id}
                value={id}
                className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-md py-2 text-sm font-medium"
              >
                <Icon className="size-7" aria-hidden />
                {s.tabs[id]}
              </TabsTrigger>
            )
          })}
        </TabsList>

        <TabsContent value="attendance" className="pt-2">
          {attendance ? (
            <RollCall
              t={t.attendance.roll}
              locale={locale}
              sectionId={sectionId}
              title={title}
              date={attendance.date}
              dateLabel={attendance.dateLabel}
              isSchoolDay={attendance.isSchoolDay}
              students={attendance.students}
              sessionUpdatedAt={attendance.sessionUpdatedAt}
              readOnlyReason={attendance.readOnlyReason}
              basic
              basicCopy={{
                confirmTemplate: s.attendance.confirmTemplate,
                yesSave: s.attendance.yesSave,
                goBack: s.attendance.goBack,
                undoToast: s.attendance.undoToast,
                undo: s.attendance.undo,
              }}
            />
          ) : (
            <EmptyState title={t.classes.errors.generic} />
          )}
        </TabsContent>
        <TabsContent value="marks" className="pt-2">
          <MarksTab t={s} locale={locale} papers={papers} />
        </TabsContent>
        <TabsContent value="students" className="pt-2">
          <StudentsTab t={s} locale={locale} students={students} />
        </TabsContent>
        <TabsContent value="print" className="pt-2">
          <PrintTab
            t={{ classHub: s, reports: t.reports }}
            locale={locale}
            sectionId={sectionId}
            month={month}
            latestExam={latestExam}
            students={students}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
