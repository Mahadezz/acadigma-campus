import { cn } from "../lib/utils"

/**
 * Acadigma product marks (D-68). A static port of acadigma-website's
 * `src/components/brand/{marks.ts,grid-mark.tsx,logo.tsx}` — same 3×3 grid
 * geometry, measured from the original logo; do not redraw. The website
 * animates between marks with `motion`; Campus has no motion dependency and
 * no need to morph, so this renders each mark's shapes directly.
 *
 * Colour follows the text: filled cells are `currentColor`, the grey cell is
 * `currentColor` at 35% — ink on paper gives #a3a3a3 and paper on ink #5e5e5e,
 * the website's two literal greys — so the mark inverts with dark mode and
 * needs no token of its own.
 */

const CELL = 152
const GAP = 32
const STEP = CELL + GAP
const RADIUS = 24
const STROKE = 26
const BLEED = 12 // the open square's stroke extends 12u past its cell
const GRID = CELL * 3 + GAP * 2
const VIEWBOX = `${-BLEED} ${-BLEED} ${GRID + BLEED * 2} ${GRID + BLEED * 2}`

export type MarkName = "acadigma" | "campus" | "ledger" | "students" | "parents"
type Kind = "f" | "g" | "o" // fill, grey, open
type Shape = [col: number, row: number, w: number, h: number, kind: Kind]

const MARKS: Record<MarkName, Shape[]> = {
  acadigma: [
    [0, 0, 1, 1, "f"],
    [1, 0, 1, 1, "f"],
    [2, 0, 1, 1, "f"],
    [0, 1, 1, 1, "f"],
    [1, 1, 1, 1, "g"],
    [2, 1, 1, 1, "f"],
    [0, 2, 1, 1, "f"],
    [1, 2, 1, 1, "f"],
    [2, 2, 1, 1, "o"],
  ],
  campus: [
    [0, 0, 3, 1, "f"],
    [0, 1, 1, 2, "f"],
    [2, 1, 1, 2, "f"],
    [1, 1, 1, 1, "g"],
    [1, 2, 1, 1, "o"],
  ],
  ledger: [
    [0, 2, 1, 1, "g"],
    [1, 1, 1, 2, "f"],
    [2, 0, 1, 3, "f"],
    [1, 0, 1, 1, "o"],
  ],
  students: [
    [1, 0, 1, 1, "o"],
    [0, 1, 1, 1, "g"],
    [2, 1, 1, 1, "g"],
    [1, 1, 1, 2, "f"],
  ],
  parents: [
    [0, 0, 2, 2, "f"],
    [2, 2, 1, 1, "o"],
  ],
}

/** Display names, as the website's product switcher writes them. */
export const PRODUCT_NAMES: Record<Exclude<MarkName, "acadigma">, string> = {
  campus: "Campus",
  ledger: "Ledger",
  students: "Students",
  parents: "Parents",
}

function shapeRect([c, r, w, h, kind]: Shape) {
  const W = w * CELL + (w - 1) * GAP
  const H = h * CELL + (h - 1) * GAP
  const x = c * STEP
  const y = r * STEP
  if (kind === "o") {
    const inset = STROKE / 2 - BLEED
    return {
      x: x + inset,
      y: y + inset,
      width: W - inset * 2,
      height: H - inset * 2,
      rx: RADIUS + BLEED - STROKE / 2,
    }
  }
  return { x, y, width: W, height: H, rx: RADIUS }
}

export type GridMarkProps = {
  mark?: MarkName
  /** Accessible name. Omit when visible text next to the mark already names it. */
  title?: string
  className?: string
}

export function GridMark({
  mark = "acadigma",
  title,
  className,
}: GridMarkProps) {
  return (
    <svg
      viewBox={VIEWBOX}
      className={cn("block shrink-0 overflow-visible", className)}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      data-mark={mark}
    >
      {title ? <title>{title}</title> : null}
      {MARKS[mark].map((shape, i) => {
        const kind = shape[4]
        return (
          <rect
            key={i}
            {...shapeRect(shape)}
            fill={kind === "o" ? "none" : "currentColor"}
            fillOpacity={kind === "g" ? 0.35 : undefined}
            stroke={kind === "o" ? "currentColor" : undefined}
            strokeWidth={kind === "o" ? STROKE : undefined}
          />
        )
      })}
    </svg>
  )
}

export type LogoProps = {
  /** Omit for the parent Acadigma lockup. */
  product?: Exclude<MarkName, "acadigma">
  className?: string
}

/**
 * Mark + wordmark: "Acadigma" in ink, the product name in the muted ink —
 * the website's lockup (17px, weight 500, -0.02em, 22px mark). Not a link:
 * `packages/ui` has no `next` dependency, so the caller wraps it in its own
 * `<Link>` when it should navigate (same boundary as `choice-card.tsx`).
 */
export function Logo({ product, className }: LogoProps) {
  return (
    <span
      // 17px / -0.02em deliberately match acadigma-website's wordmark, not our type scale.
      className={cn(
        "inline-flex min-w-0 items-center gap-2.5 text-[17px] font-medium tracking-[-0.02em]",
        className
      )}
    >
      <GridMark mark={product ?? "acadigma"} className="size-[22px]" />
      <span className="truncate">
        Acadigma
        {product ? (
          <span className="text-muted-foreground">
            {" "}
            {PRODUCT_NAMES[product]}
          </span>
        ) : null}
      </span>
    </span>
  )
}
