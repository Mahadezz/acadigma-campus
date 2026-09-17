/**
 * The design system's motion tokens, as JavaScript.
 *
 * These mirror `packages/ui/tokens/tokens.css` §5 exactly. CSS transitions read the
 * custom properties; GSAP cannot, so the same numbers live here once. If a token
 * changes there, change it here in the same commit — a UI that eases two different
 * ways depending on which engine drew it reads as a bug even when nobody can say why.
 */

/** Milliseconds, as the tokens declare them. */
export const DURATION_MS = {
  /** Tap feedback, checkbox. */
  instant: 90,
  /** Hover, chip swap. */
  fast: 140,
  /** Popover, toast. */
  base: 200,
  /** Sheet and drawer slide. */
  slow: 280,
  /** Route transition. */
  page: 360,
} as const

export type DurationToken = keyof typeof DURATION_MS

/** Seconds, which is the unit GSAP takes. */
export const DURATION = {
  instant: DURATION_MS.instant / 1000,
  fast: DURATION_MS.fast / 1000,
  base: DURATION_MS.base / 1000,
  slow: DURATION_MS.slow / 1000,
  page: DURATION_MS.page / 1000,
} as const

/**
 * Cubic-bezier control points, in GSAP's `CustomEase` string form. Registering
 * CustomEase (see `registerGsap`) is what makes these usable as `ease` values.
 */
export const EASE = {
  /** The default. Everything that has no reason to be different. */
  standard: "0.2, 0, 0, 1",
  /** Things arriving: slow out of the gate, settles softly. */
  entrance: "0.05, 0.7, 0.1, 1",
  /** Things leaving. Faster, because nobody watches an exit. */
  exit: "0.3, 0, 0.8, 0.15",
  /** Slight overshoot. Delight only — never on a control someone uses all day. */
  spring: "0.34, 1.32, 0.64, 1",
} as const

export type EaseToken = keyof typeof EASE

/** `ease: cubicBezier("entrance")` once CustomEase is registered. */
export function cubicBezier(token: EaseToken): string {
  return `cubic-bezier(${EASE[token]})`
}
