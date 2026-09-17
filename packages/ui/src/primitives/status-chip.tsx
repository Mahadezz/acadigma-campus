import * as React from "react"

import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../lib/utils"

/**
 * One chip for every state in the product (DESIGN-SYSTEM §4.13). `StatusChip`
 * is the *one* place a status colour is read: feature code passes `status`
 * (attendance) or `tone` (everything else — order, payout, listing review,
 * print job), never a colour, so a status that changes meaning changes in one
 * place.
 *
 * Colour is never the only signal: a glyph and the full status name are always
 * rendered, which is what keeps this usable at 4.5:1 contrast and for
 * colour-blind users (§2.4, §7.1).
 */

export type AttendanceStatus =
  "present" | "absent" | "late" | "excused" | "half_day"

export type StatusChipVariant = "soft" | "solid"

type AttendanceMeta = {
  letterEn: string
  letterBn: string
  nameEn: string
  nameBn: string
  /** Tailwind classes generated from `tokens.css`. Written as full literal
   * strings — never built by interpolating a token name — because Tailwind's
   * scanner only picks up class names it can see verbatim in source. */
  soft: string
  solid: string
  /** §2.4: `late` and `half_day` fall below 3:1 against the card and must carry
   * a 1px ink ring to supply the boundary. Undefined where no ring is needed. */
  ring?: string
}

const ATTENDANCE_META: Record<AttendanceStatus, AttendanceMeta> = {
  present: {
    letterEn: "P",
    letterBn: "উ",
    nameEn: "Present",
    nameBn: "উপস্থিত",
    soft: "bg-att-present-soft text-att-present-ink",
    solid: "bg-att-present text-att-present-fg",
  },
  absent: {
    letterEn: "A",
    letterBn: "অ",
    nameEn: "Absent",
    nameBn: "অনুপস্থিত",
    soft: "bg-att-absent-soft text-att-absent-ink",
    solid: "bg-att-absent text-att-absent-fg",
  },
  late: {
    letterEn: "L",
    letterBn: "বি",
    nameEn: "Late",
    nameBn: "বিলম্বিত",
    soft: "bg-att-late-soft text-att-late-ink",
    solid: "bg-att-late text-att-late-fg",
    ring: "ring-1 ring-att-late-ink",
  },
  excused: {
    letterEn: "E",
    letterBn: "ছু",
    nameEn: "Excused",
    nameBn: "ছুটি",
    soft: "bg-att-excused-soft text-att-excused-ink",
    solid: "bg-att-excused text-att-excused-fg",
  },
  half_day: {
    letterEn: "½",
    letterBn: "অর্ধ",
    nameEn: "Half day",
    nameBn: "অর্ধদিবস",
    soft: "bg-att-halfday-soft text-att-halfday-ink",
    solid: "bg-att-halfday text-att-halfday-fg",
    ring: "ring-1 ring-att-halfday-ink",
  },
}

const CHIP_BASE =
  "inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap"

/** Generic (non-attendance) tones, resolved from the measured §2.3 semantic tokens. */
const toneChipVariants = cva(CHIP_BASE, {
  variants: {
    tone: {
      /** Settled, correct, paid. */
      positive: "border border-success/25 bg-success-soft text-success-ink",
      /** Waiting on someone: pending review, held earnings, queued job. */
      pending: "border border-warning/25 bg-warning-soft text-warning-ink",
      /** Failed, rejected, refunded. */
      negative: "border border-danger/25 bg-danger-soft text-danger-ink",
      /** In progress, informational. */
      info: "border border-info/25 bg-info-soft text-info-ink",
      /** Draft, archived, cancelled — present but inactive. */
      neutral: "border border-border bg-muted text-muted-foreground",
    },
  },
  defaultVariants: { tone: "neutral" },
})

export type ToneStatusChipProps = React.ComponentPropsWithoutRef<"span"> &
  VariantProps<typeof toneChipVariants> & {
    status?: undefined
    /** Optional leading icon. Decorative — the label carries the meaning. */
    icon?: React.ReactNode
    children: React.ReactNode
  }

export type AttendanceStatusChipProps = Omit<
  React.ComponentPropsWithoutRef<"span">,
  "children"
> & {
  status: AttendanceStatus
  /** Tinted background (default, for lists/cells) or the solid fill (for a legend swatch). */
  variant?: StatusChipVariant
  /** `"en"` letters/name by default; `"bn"` for the Bengali UI. */
  locale?: "en" | "bn"
}

export type StatusChipProps = ToneStatusChipProps | AttendanceStatusChipProps

export function StatusChip(props: StatusChipProps) {
  if (props.status) {
    const {
      status,
      variant = "soft",
      locale = "en",
      className,
      ...rest
    } = props as AttendanceStatusChipProps
    const meta = ATTENDANCE_META[status]
    const letter = locale === "bn" ? meta.letterBn : meta.letterEn
    const name = locale === "bn" ? meta.nameBn : meta.nameEn
    const fillClass = variant === "solid" ? meta.solid : meta.soft

    return (
      <span
        className={cn(CHIP_BASE, fillClass, meta.ring, className)}
        {...rest}
      >
        <span aria-hidden="true" className="font-semibold tabular-nums">
          {letter}
        </span>
        <span>{name}</span>
      </span>
    )
  }

  const { tone, icon, className, children, ...rest } =
    props as ToneStatusChipProps

  return (
    <span className={cn(toneChipVariants({ tone }), className)} {...rest}>
      {icon ? (
        <span aria-hidden="true" className="[&_svg]:size-3">
          {icon}
        </span>
      ) : null}
      {children}
    </span>
  )
}

export { toneChipVariants }
