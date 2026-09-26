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
  RollCallStudent,
  RosterStudent,
  SectionPaper,
  SectionPrintExam,
} from "@acadigma/contracts"
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

// §5.5's bundle budget (150 kB for a hub tab) plus D-405 item 8's Radix-
// barrel cost (any `Button` import pulls the whole `radix-ui` package) push
// Marks/Students/Print out of the page's initial JS: a teacher opens
// Attendance first almost every time (§4.5), so only that tab loads eagerly.
// `ssr: false` is required, not optional, for the split to actually shrink
// first-load JS — with SSR on, Next still ships the chunk for hydration and
// `check-bundle-budget.mjs` (and `next build`'s own "First Load JS" column)
// counts it anyway; none of these three tabs need to render on the server
// (each is empty until its own data is real, and none affects the initial
// paint the way Attendance does).
const MarksTab = dynamic(() => import("./marks-tab").then((m) => m.MarksTab), {
  ssr: false,
})
const StudentsTab = dynamic(
  () => import("./students-tab").then((m) => m.StudentsTab),
  { ssr: false }
)
const PrintTab = dynamic(() => import("./print-tab").then((m) => m.PrintTab), {
  ssr: false,
})

type ClassHubTabId = "attendance" | "marks" | "students" | "print"
const TAB_STORAGE_KEY = (sectionId: string) => `class-hub-tab:${sectionId}`

const TAB_ICONS: Record<ClassHubTabId, LucideIcon> = {
  attendance: ClipboardCheckIcon,
  marks: BookMarkedIcon,
  students: UsersIcon,
  print: PrinterIcon,
}
const TAB_IDS: readonly ClassHubTabId[] = [
  "attendance",
  "marks",
  "students",
  "print",
]

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
  attendance,
  papers,
  students,
  latestExam,
}: {
  t: Messages
  locale: Locale
  sectionId: string
  title: string
  studentCount: number
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
      if (
        stored === "attendance" ||
        stored === "marks" ||
        stored === "students" ||
        stored === "print"
      ) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- see above
        setTab(stored)
      }
    } catch {
      // localStorage unavailable (private browsing, etc.) — default stands.
    }
  }, [sectionId])

  function changeTab(next: string) {
    setTab(next as ClassHubTabId)
    try {
      window.localStorage.setItem(TAB_STORAGE_KEY(sectionId), next)
    } catch {
      // Best-effort convenience only — never blocks the tab switch.
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
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
          {TAB_IDS.map((id) => {
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
                undone: s.attendance.undone,
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
            t={t}
            locale={locale}
            sectionId={sectionId}
            latestExam={latestExam}
            students={students}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
