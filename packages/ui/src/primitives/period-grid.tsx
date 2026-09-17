"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs"
import { useIsMobile } from "../hooks/use-mobile"
import { cn } from "../lib/utils"

/**
 * The week timetable grid (DESIGN-SYSTEM §4.6). Generated from
 * `school_profiles.working_days` — **never** a hardcoded 5-day week; a school
 * on the default Bangladesh Sat–Thu week and one on a Sun–Thu week render from
 * the same component and the same `days` prop.
 *
 * Phone: one day per `Tabs` panel, a vertical list of periods, the current
 * period marked with a `--primary` left rule and `aria-current="time"`.
 * Desktop: the full days × periods grid with a frozen period column.
 *
 * Subject colour is a stable hash into the six chart tokens (§4.6) — never a
 * fixed per-subject colour, which stops working the moment a school's subject
 * list does not match the one that was hardcoded.
 */

export type PeriodGridDay = { id: string; labelEn: string; labelBn: string }
export type PeriodGridPeriod = {
  id: string
  labelEn: string
  labelBn?: string
  timeRange?: string
}
export type PeriodGridCell = {
  subjectLabel: string
  /** Stable key hashed into a chart colour — usually the subject id. */
  subjectKey?: string
  room?: string
}

export type PeriodGridProps = {
  days: readonly PeriodGridDay[]
  periods: readonly PeriodGridPeriod[]
  getCell: (dayId: string, periodId: string) => PeriodGridCell | undefined
  currentDayId?: string
  currentPeriodId?: string
  locale?: "en" | "bn"
  className?: string
}

/**
 * §6.1 reserves the six chart tokens for chart marks, whose contrast rule is
 * "≥3:1 against the surface", not the 4.5:1 body-text rule. A tinted
 * background carrying that same hue as *text* fails 4.5:1 in the 15% tint
 * needed to look like a subject label, not a chart series — so the colour is
 * a small decorative dot (≥3:1, aria-hidden) and the label stays in
 * `--foreground`/`--muted-foreground`, which are the pairs actually measured
 * against `--muted` (§2.3).
 */
const SUBJECT_DOT_CLASSES = [
  "bg-chart-1",
  "bg-chart-2",
  "bg-chart-3",
  "bg-chart-4",
  "bg-chart-5",
  "bg-chart-6",
] as const

/** Stable (non-cryptographic) string hash, so the same subject always lands
 * on the same chart colour across renders and across the phone/desktop split. */
function subjectDotClass(key: string): string {
  let hash = 0
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) | 0
  }
  const bucket = Math.abs(hash) % SUBJECT_DOT_CLASSES.length
  return SUBJECT_DOT_CLASSES[bucket] ?? SUBJECT_DOT_CLASSES[0]
}

function CellBadge({ cell }: { cell: PeriodGridCell | undefined }) {
  if (!cell) return <span className="text-muted-foreground text-xs">—</span>
  const dotClass = subjectDotClass(cell.subjectKey ?? cell.subjectLabel)
  return (
    <span className="bg-muted inline-flex flex-col gap-0.5 rounded-md px-2 py-1">
      <span className="flex items-center gap-1.5 text-xs font-medium">
        <span
          aria-hidden="true"
          className={cn("size-2 shrink-0 rounded-full", dotClass)}
        />
        {cell.subjectLabel}
      </span>
      {cell.room ? (
        // `--muted-foreground` is measured against `--background`/`--card`,
        // not against `--muted` — nesting it here under-shoots 4.5:1 at 11px
        // (axe: 4.34:1). `--foreground` is the pair actually safe on `--muted`.
        <span className="text-foreground text-[0.6875rem]">{cell.room}</span>
      ) : null}
    </span>
  )
}

export function PeriodGrid({
  days,
  periods,
  getCell,
  currentDayId,
  currentPeriodId,
  locale = "en",
  className,
}: PeriodGridProps) {
  const isMobile = useIsMobile()
  const dayLabel = (day: PeriodGridDay) =>
    locale === "bn" ? day.labelBn : day.labelEn
  const periodLabel = (period: PeriodGridPeriod) =>
    (locale === "bn" ? period.labelBn : undefined) ?? period.labelEn

  if (isMobile) {
    return (
      <Tabs defaultValue={currentDayId ?? days[0]?.id} className={className}>
        <TabsList className="w-full">
          {days.map((day) => (
            <TabsTrigger key={day.id} value={day.id} className="flex-1">
              {dayLabel(day)}
            </TabsTrigger>
          ))}
        </TabsList>
        {days.map((day) => (
          <TabsContent key={day.id} value={day.id}>
            <ul className="divide-border divide-y">
              {periods.map((period) => {
                const cell = getCell(day.id, period.id)
                const isCurrent =
                  day.id === currentDayId && period.id === currentPeriodId
                return (
                  <li
                    key={period.id}
                    aria-current={isCurrent ? "time" : undefined}
                    className={cn(
                      "flex items-center justify-between gap-3 py-2 pl-3",
                      isCurrent && "border-primary border-l-2"
                    )}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {periodLabel(period)}
                      </p>
                      {period.timeRange ? (
                        <p className="text-muted-foreground text-xs">
                          {period.timeRange}
                        </p>
                      ) : null}
                    </div>
                    <CellBadge cell={cell} />
                  </li>
                )
              })}
            </ul>
          </TabsContent>
        ))}
      </Tabs>
    )
  }

  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full border-separate border-spacing-0">
        <caption className="sr-only">Weekly timetable</caption>
        <thead>
          <tr>
            <th
              scope="col"
              className="bg-card sticky left-0 z-[var(--z-raised)] w-28 border-b p-2 text-left text-xs font-medium"
            >
              {locale === "bn" ? "সময়" : "Period"}
            </th>
            {days.map((day) => (
              <th
                key={day.id}
                scope="col"
                className="border-b p-2 text-left text-xs font-medium"
              >
                {dayLabel(day)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {periods.map((period) => (
            <tr key={period.id}>
              <th
                scope="row"
                className="bg-card sticky left-0 z-[var(--z-raised)] border-b p-2 text-left text-xs font-medium"
              >
                <div>{periodLabel(period)}</div>
                {period.timeRange ? (
                  <div className="text-muted-foreground font-normal">
                    {period.timeRange}
                  </div>
                ) : null}
              </th>
              {days.map((day) => {
                const isCurrent =
                  day.id === currentDayId && period.id === currentPeriodId
                return (
                  <td
                    key={day.id}
                    aria-current={isCurrent ? "time" : undefined}
                    className={cn(
                      "h-14 border-b p-1.5 align-top",
                      isCurrent && "bg-primary/5"
                    )}
                  >
                    <CellBadge cell={getCell(day.id, period.id)} />
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
