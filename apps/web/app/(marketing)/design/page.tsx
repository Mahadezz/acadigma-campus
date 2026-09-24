"use client"

import * as React from "react"

import Link from "next/link"
import { notFound } from "next/navigation"

import { Button } from "@acadigma/ui/components/button"
import { AppShell } from "@acadigma/ui/primitives/app-shell"
import {
  AttendanceToggle,
  type AttendanceToggleValue,
} from "@acadigma/ui/primitives/attendance-toggle"
import { BnEnText } from "@acadigma/ui/primitives/bn-en-text"
import {
  BottomNavFromConfig,
  type NavLinkRenderer,
} from "@acadigma/ui/primitives/bottom-nav"
import {
  DataList,
  type DataListColumn,
} from "@acadigma/ui/primitives/data-list"
import { EmptyState } from "@acadigma/ui/primitives/empty-state"
import { FormSheet } from "@acadigma/ui/primitives/form-sheet"
import { MarkCell } from "@acadigma/ui/primitives/mark-cell"
import { MoneyText } from "@acadigma/ui/primitives/money-text"
import { schoolTeacherNav } from "@acadigma/ui/primitives/nav-config"
import { PeriodGrid } from "@acadigma/ui/primitives/period-grid"
import {
  StatusChip,
  type AttendanceStatus,
} from "@acadigma/ui/primitives/status-chip"
import { TopBar } from "@acadigma/ui/primitives/top-bar"

/**
 * Visual smoke page for every `packages/ui` primitive (M0 chunk 0.9). Dev-only:
 * a route that renders every primitive at once is a debugging surface, not a
 * product page, and must never ship.
 *
 * Deliberately **not** `app/(marketing)/_design/` — Next's App Router treats an
 * `_`-prefixed segment as a private folder excluded from routing entirely
 * (https://nextjs.org/docs/app/building-your-application/routing/colocation#private-folders),
 * which would make this page unreachable for the Playwright smoke test below.
 *
 * Gated on `VERCEL_ENV === "production"`, not `NODE_ENV`: `next start` — which
 * is what both the e2e suite (`playwright.config.ts`) and a Vercel *preview*
 * deployment run — always reports `NODE_ENV=production` (Next.js hardcodes it
 * for `build`/`start`), so a `NODE_ENV` guard would 404 this page in the exact
 * CI run that is supposed to exercise it. `VERCEL_ENV` is unset locally/in CI
 * and only ever `"production"` on the real production deployment, which is the
 * actual thing this route must never reach (same pattern already used for the
 * observability environment tag in `apps/web/instrumentation.ts`).
 *
 * Playwright drives it at 360×800 and 1280×800 with axe
 * (`apps/web/e2e/design-smoke.spec.ts`).
 */
export default function DesignSmokePage() {
  if (process.env.VERCEL_ENV === "production") {
    notFound()
  }
  return <DesignSmoke />
}

const ATTENDANCE_STATUSES: readonly AttendanceStatus[] = [
  "present",
  "absent",
  "late",
  "excused",
  "half_day",
]

const renderLink: NavLinkRenderer = ({
  href,
  className,
  active,
  children,
  onNavigate,
}) => (
  <Link
    href={href}
    className={className}
    aria-current={active ? "page" : undefined}
    onClick={onNavigate}
  >
    {children}
  </Link>
)

type StudentRow = { id: string; name: string; grade: string; feesPaisa: number }

const STUDENT_ROWS: StudentRow[] = [
  { id: "1", name: "Ayaan Rahman", grade: "Class 6A", feesPaisa: 125_000_00 },
  { id: "2", name: "রহিম উদ্দিন", grade: "Class 6B", feesPaisa: 45_000 },
]

const columns: DataListColumn<StudentRow>[] = [
  { key: "grade", header: "Class", cell: (row) => row.grade },
  {
    key: "fees",
    header: "Fees due",
    cell: (row) => <MoneyText paisa={row.feesPaisa} />,
  },
]

const PERIOD_DAYS = [
  { id: "sat", labelEn: "Sat", labelBn: "শনি" },
  { id: "sun", labelEn: "Sun", labelBn: "রবি" },
  { id: "mon", labelEn: "Mon", labelBn: "সোম" },
]
const PERIODS = [
  { id: "p1", labelEn: "Period 1", timeRange: "8:00–8:45" },
  { id: "p2", labelEn: "Period 2", timeRange: "8:45–9:30" },
]

function DesignSmoke() {
  const [attendance, setAttendance] =
    React.useState<AttendanceToggleValue>("unmarked")
  const [markValue, setMarkValue] = React.useState<number | null>(78)
  const [formOpen, setFormOpen] = React.useState(false)

  return (
    <AppShell
      topBar={<TopBar title="Design smoke" subtitle="packages/ui primitives" />}
      bottomNav={
        <BottomNavFromConfig
          config={schoolTeacherNav}
          filter={{ role: "teacher", hasModule: () => true }}
          pathname="/design"
          renderLink={renderLink}
        />
      }
    >
      <div className="flex flex-col gap-10 pb-10">
        <section
          aria-labelledby="status-chip-heading"
          className="flex flex-col gap-3"
        >
          <h2 id="status-chip-heading" className="text-lg font-semibold">
            StatusChip
          </h2>
          <div className="flex flex-wrap gap-2">
            {ATTENDANCE_STATUSES.map((status) => (
              <StatusChip key={status} status={status} />
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {ATTENDANCE_STATUSES.map((status) => (
              <StatusChip key={status} status={status} variant="solid" />
            ))}
          </div>
        </section>

        <section
          aria-labelledby="money-text-heading"
          className="flex flex-col gap-2"
        >
          <h2 id="money-text-heading" className="text-lg font-semibold">
            MoneyText
          </h2>
          <p>
            <MoneyText paisa={125_000_000} /> ·{" "}
            <MoneyText paisa={125_000_000} numerals="bn" /> ·{" "}
            <MoneyText paisa={125_000_00} compact /> ·{" "}
            <MoneyText paisa={-50_000} signed />
          </p>
        </section>

        <section
          aria-labelledby="attendance-toggle-heading"
          className="flex flex-col gap-2"
        >
          <h2 id="attendance-toggle-heading" className="text-lg font-semibold">
            AttendanceToggle
          </h2>
          <AttendanceToggle
            value={attendance}
            onChange={setAttendance}
            studentName="Ayaan Rahman"
          />
        </section>

        <section
          aria-labelledby="mark-cell-heading"
          className="flex flex-col gap-2"
        >
          <h2 id="mark-cell-heading" className="text-lg font-semibold">
            MarkCell
          </h2>
          <MarkCell
            value={markValue}
            onCommit={setMarkValue}
            maxMarks={100}
            aria-label="Mathematics mark for Ayaan Rahman"
            getGrade={(value) =>
              value >= 80
                ? { band: "a-plus", label: "A+" }
                : value >= 33
                  ? { band: "c", label: "C" }
                  : { band: "f", label: "F" }
            }
          />
        </section>

        <section
          aria-labelledby="period-grid-heading"
          className="flex flex-col gap-2"
        >
          <h2 id="period-grid-heading" className="text-lg font-semibold">
            PeriodGrid
          </h2>
          <PeriodGrid
            days={PERIOD_DAYS}
            periods={PERIODS}
            currentDayId="sat"
            currentPeriodId="p1"
            getCell={(dayId, periodId) =>
              dayId === "sat" && periodId === "p1"
                ? { subjectLabel: "Math", subjectKey: "math", room: "204" }
                : undefined
            }
          />
        </section>

        <section
          aria-labelledby="bn-en-text-heading"
          className="flex flex-col gap-2"
        >
          <h2 id="bn-en-text-heading" className="text-lg font-semibold">
            BnEnText
          </h2>
          <p>
            <BnEnText text="Ayaan Rahman · রহিম উদ্দিন · Class 6" />
          </p>
        </section>

        <section
          aria-labelledby="data-list-heading"
          className="flex flex-col gap-2"
        >
          <h2 id="data-list-heading" className="text-lg font-semibold">
            DataList
          </h2>
          <DataList
            items={STUDENT_ROWS}
            columns={columns}
            getRowId={(row) => row.id}
            renderCardTitle={(row) => <BnEnText text={row.name} />}
            caption="Students"
          />
        </section>

        <section
          aria-labelledby="empty-state-heading"
          className="flex flex-col gap-2"
        >
          <h2 id="empty-state-heading" className="text-lg font-semibold">
            EmptyState
          </h2>
          <EmptyState
            title="No attendance taken yet"
            description="Mark today's register for Class 6 – A."
            action={<Button size="lg">Take attendance</Button>}
          />
        </section>

        <section
          aria-labelledby="form-sheet-heading"
          className="flex flex-col gap-2"
        >
          <h2 id="form-sheet-heading" className="text-lg font-semibold">
            FormSheet
          </h2>
          <Button onClick={() => setFormOpen(true)}>Add student</Button>
          <FormSheet
            open={formOpen}
            onOpenChange={setFormOpen}
            title="Add student"
            description="They will appear on today's attendance sheet."
            footer={
              <Button type="submit" form="design-smoke-form">
                Save
              </Button>
            }
          >
            <form id="design-smoke-form" className="flex flex-col gap-3 py-2">
              <label className="flex flex-col gap-1 text-sm font-medium">
                Full name
                <input
                  type="text"
                  name="name"
                  autoComplete="name"
                  className="border-input h-11 rounded-md border px-3 text-base"
                />
              </label>
            </form>
          </FormSheet>
        </section>
      </div>
    </AppShell>
  )
}
