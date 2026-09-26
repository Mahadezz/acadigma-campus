import { CalendarIcon, CheckIcon, XIcon } from "lucide-react"

import { cn } from "../lib/utils"

import type { SimpleLinkRenderer } from "./link-renderer"

/**
 * F-ID-10 §4.4.2/§5.1 (D-403/D-405) — "one big block per class". Full width,
 * >= 96px tall (well past the 56px basic-mode tap-target minimum, §5.1),
 * always icon AND label for the attendance mark — never colour alone
 * (§5.6). Every size below is a `rem`-based Tailwind utility, so it scales
 * with the text-size preference the same way the rest of the page does
 * (`data-text-size` on `<html>`, §5.2) — no fixed pixel value here.
 */
export type ClassBlockAttendanceState = "taken" | "not_taken" | "not_school_day"

export type ClassBlockProps = {
  href: string
  /** "Class 6 – ক · Bangla" / "Class 6 – ক · Class teacher", already
   * localised by the caller (packages/ui does not own translation). */
  title: string
  studentCountLabel: string
  attendanceLabel: string
  attendanceState: ClassBlockAttendanceState
  /** This package never depends on `next` — see `link-renderer.ts`. */
  renderLink: SimpleLinkRenderer
  className?: string
}

const ATTENDANCE_ICON: Record<ClassBlockAttendanceState, typeof CheckIcon> = {
  taken: CheckIcon,
  not_taken: XIcon,
  not_school_day: CalendarIcon,
}

export function ClassBlock({
  href,
  title,
  studentCountLabel,
  attendanceLabel,
  attendanceState,
  renderLink,
  className,
}: ClassBlockProps) {
  const Icon = ATTENDANCE_ICON[attendanceState]
  return renderLink({
    href,
    className: cn(
      "border-border bg-card text-card-foreground focus-visible:ring-ring flex min-h-24 w-full flex-col justify-center gap-2 rounded-lg border p-4 text-left transition-colors focus-visible:ring-2 focus-visible:outline-hidden active:opacity-90",
      className
    ),
    children: (
      <>
        <span className="text-lg leading-tight font-semibold tracking-tight">
          {title}
        </span>
        <span className="text-muted-foreground text-base">
          {studentCountLabel}
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-2 text-base font-medium",
            attendanceState === "taken" && "text-att-present-ink",
            attendanceState === "not_taken" && "text-att-absent-ink"
          )}
        >
          <Icon className="size-7 shrink-0" aria-hidden="true" />
          {attendanceLabel}
        </span>
      </>
    ),
  })
}
