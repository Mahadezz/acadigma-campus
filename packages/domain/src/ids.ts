/**
 * Human-facing sequential identifiers: `STU-2026-00001`.
 *
 * The number itself comes from `app.next_id(workspace_id, kind)` in Postgres
 * (advisory lock + `id_counters`, ARCHITECTURE §4). This module only owns the
 * *shape*, so the UI, PDFs and CSV imports all agree on one format and one parser.
 */

/** Every kind of sequential id in the product, with its printed prefix. */
export const ID_KINDS = {
  student: "STU",
  guardian: "GRD",
  employee: "EMP",
  admission: "ADM",
  invoice: "INV",
  receipt: "RCP",
  order: "ORD",
  payout: "PYT",
  listing: "LST",
  ticket: "TKT",
} as const

export type IdKind = keyof typeof ID_KINDS
export type IdPrefix = (typeof ID_KINDS)[IdKind]

const SEQUENCE_DIGITS = 5
const MAX_SEQUENCE = 10 ** SEQUENCE_DIGITS - 1
const DISPLAY_ID_PATTERN = /^([A-Z]{2,4})-(\d{4})-(\d{5})$/

export class DisplayIdError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "DisplayIdError"
  }
}

/** `formatDisplayId("student", 2026, 1)` returns `"STU-2026-00001"`. */
export function formatDisplayId(
  kind: IdKind,
  year: number,
  sequence: number
): string {
  if (!Number.isInteger(year) || year < 1900 || year > 9999) {
    throw new DisplayIdError(`Year must be a four-digit integer, got ${year}`)
  }
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > MAX_SEQUENCE) {
    throw new DisplayIdError(
      `Sequence must be between 1 and ${MAX_SEQUENCE}, got ${sequence}`
    )
  }
  const padded = String(sequence).padStart(SEQUENCE_DIGITS, "0")
  return `${ID_KINDS[kind]}-${year}-${padded}`
}

export type ParsedDisplayId = {
  kind: IdKind | null
  prefix: string
  year: number
  sequence: number
}

/**
 * Parses a printed id back into its parts. `kind` is null for a well-formed code
 * whose prefix we do not recognise — a code from an older release stays readable
 * instead of throwing in the middle of a report.
 */
export function parseDisplayId(value: string): ParsedDisplayId {
  const match = DISPLAY_ID_PATTERN.exec(value.trim().toUpperCase())
  if (!match) {
    throw new DisplayIdError(
      `"${value}" is not a valid id, expected STU-2026-00001`
    )
  }
  // Capture groups 1-3 are guaranteed non-empty by the pattern above; the
  // defaults exist only to satisfy noUncheckedIndexedAccess.
  const [, prefix = "", year = "", sequence = ""] = match
  return {
    kind: kindForPrefix(prefix),
    prefix,
    year: Number(year),
    sequence: Number(sequence),
  }
}

export function isDisplayId(value: string): boolean {
  return DISPLAY_ID_PATTERN.test(value.trim().toUpperCase())
}

/** Reverse lookup, so an imported code can be routed to the right module. */
export function kindForPrefix(prefix: string): IdKind | null {
  const upper = prefix.toUpperCase()
  for (const kind of Object.keys(ID_KINDS) as IdKind[]) {
    if (ID_KINDS[kind] === upper) return kind
  }
  return null
}
