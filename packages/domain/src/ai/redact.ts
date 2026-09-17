/**
 * `redactForAI()` — the one gate between anything holding personal data and an
 * Anthropic prompt (DECISION-LOG D-34, amended "redactForAI() moves to M0/M1 and
 * fails closed"; COMPLIANCE-PDPA §5.2).
 *
 * **Contract**
 * - Input is a **structured, typed object** — never free text lifted straight from
 *   a client request. A prompt builder normalises user input into named fields
 *   first; this function only ever sees field names it can reason about.
 * - Output is the **allow-listed projection**: `firstName` and `gradeLevel`, and
 *   nothing else. That is the entire allow-list — "first name only, and only
 *   where the output needs to address the child" / "grade / class level" per
 *   COMPLIANCE-PDPA §5.2.
 * - **Fails closed.** A field we don't recognise is dropped, silently — it never
 *   had permission to leave, so its absence is not an error. A field we *do*
 *   recognise as sensitive by name (health, religion, NID, phone, email, address,
 *   guardian contact, DOB, named-child marks, surname, an uploaded document that
 *   isn't a syllabus) throws `RedactionError` instead of silently dropping it,
 *   because a caller passing one of those keys has a bug, and a bug here must be
 *   loud, not laundered.
 * - Even an allowed field is scanned for a blocked **pattern** (a NID typed into
 *   a "first name" box is still a NID) and throws if one is found.
 * - Bengali digits are normalised to ASCII **before** every pattern check — a
 *   NID or phone number typed in Bengali numerals is exactly as sensitive as one
 *   typed in English, and a regex anchored on `\d` would otherwise miss it.
 *
 * Every call into `packages/adapters/ai` (or `@anthropic-ai/sdk` directly) must
 * be preceded by a `redactForAI(` call in the same function — enforced by
 * `.semgrep/redact-for-ai.yml`.
 */

export class RedactionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "RedactionError"
  }
}

/** The entire allow-list. Nothing else is ever sent to Anthropic. */
export type RedactedForAI = {
  firstName?: string
  gradeLevel?: string
}

export type RedactableInput = Record<string, unknown>

const ALLOWED_FIELDS: readonly (keyof RedactedForAI)[] = [
  "firstName",
  "gradeLevel",
]

/** ০–৯ → 0–9, run before every pattern check. */
const BENGALI_DIGITS = "০১২৩৪৫৬৭৮৯"

export function normalizeDigits(input: string): string {
  return input.replace(/[০-৯]/g, (digit) =>
    String(BENGALI_DIGITS.indexOf(digit))
  )
}

/**
 * Field names that are hard-blocked regardless of value — COMPLIANCE-PDPA §5.2's
 * "never sent" column. `syllabus` file references are the one document type that
 * is allowed through a *different* path (the syllabus-extraction prompt builder),
 * so a field merely mentioning "file"/"document" is not blocked when it also
 * names a syllabus.
 */
const BLOCKED_FIELD_NAME_PATTERNS: readonly RegExp[] = [
  /\bsurname\b|\blast\s?name\b|\bfamily\s?name\b|\bfull\s?name\b/i,
  /\bhealth\b|\ballerg|\bmedicat|\bcondition\b|\bdisabilit/i,
  /\breligio|\bcaste\b/i,
  /\bnid\b|\bnational\s?id\b|\bbirth\s?cert/i,
  /\bphone\b|\bmobile\b|\bwhatsapp\b|\bcontact\s?number\b/i,
  /\bemail\b/i,
  /\baddress\b|\bpostal\b|\bdistrict\b|\bupazila\b|\bthana\b|\bunion\b/i,
  /\bguardian\b|\bparent\b.*\b(name|phone|email|contact)\b/i,
  /\bdob\b|\bdate\s?of\s?birth\b|\bage\b/i,
  /\bmarks?\b|\bgrade\s?point\b|\bscore\b|\bpercentage\b/i,
  /\bstudent\s?id\b|\badmission\s?number\b/i,
]

/**
 * `examMarks`, `national_id`, `NID-number` — real field names mix camelCase,
 * snake_case and kebab-case. Splitting at case/word boundaries onto spaces
 * before matching means one set of patterns catches all three shapes.
 */
function normalizeFieldName(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .toLowerCase()
}

/** `field|document|attachment|scan|photo|image`, except a syllabus reference. */
function isBlockedDocumentField(key: string): boolean {
  const looksLikeADocument =
    /file|document|attachment|scan|photo|image|upload/i.test(key)
  const isSyllabus = /syllabus/i.test(key)
  return looksLikeADocument && !isSyllabus
}

function isBlockedFieldName(key: string): boolean {
  if (isBlockedDocumentField(key)) return true
  const normalized = normalizeFieldName(key)
  return BLOCKED_FIELD_NAME_PATTERNS.some((pattern) => pattern.test(normalized))
}

/** BD NID is 10, 13 or 17 digits; the birth-certificate number is also 17. */
const BLOCKED_VALUE_PATTERNS: readonly { name: string; pattern: RegExp }[] = [
  { name: "10-digit BD NID", pattern: /\b\d{10}\b/ },
  { name: "13-digit BD NID", pattern: /\b\d{13}\b/ },
  {
    name: "17-digit BD NID or birth certificate number",
    pattern: /\b\d{17}\b/,
  },
  { name: "BD phone number", pattern: /\b01[3-9]\d{8}\b/ },
  { name: "email address", pattern: /[^\s@]+@[^\s@]+\.[^\s@]+/ },
]

function findBlockedPattern(value: string): string | null {
  const normalized = normalizeDigits(value)
  for (const { name, pattern } of BLOCKED_VALUE_PATTERNS) {
    if (pattern.test(normalized)) return name
  }
  return null
}

function isAllowedField(key: string): key is keyof RedactedForAI {
  return (ALLOWED_FIELDS as readonly string[]).includes(key)
}

/**
 * Projects a structured input onto the allow-listed shape an AI prompt may use.
 *
 * ```ts
 * const safe = redactForAI({ firstName: "Ayaan", gradeLevel: "Class 6", nid: "…" })
 * // throws RedactionError — "nid" is on the hard-block list
 * ```
 */
export function redactForAI(input: RedactableInput): RedactedForAI {
  if (
    input === null ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    input instanceof Date
  ) {
    throw new RedactionError(
      "redactForAI() requires a structured object — never free text or an array. " +
        "Normalise the caller's input into named fields first."
    )
  }

  const output: RedactedForAI = {}

  for (const [key, rawValue] of Object.entries(input)) {
    if (rawValue === undefined || rawValue === null || rawValue === "") {
      continue
    }

    if (isBlockedFieldName(key)) {
      throw new RedactionError(
        `redactForAI(): "${key}" is on the hard-block list and must never reach an AI prompt.`
      )
    }

    if (!isAllowedField(key)) {
      // Fail closed: a field with no explicit permission is dropped, not sent.
      continue
    }

    if (typeof rawValue !== "string" && typeof rawValue !== "number") {
      throw new RedactionError(
        `redactForAI(): "${key}" must be a string or number, got ${typeof rawValue}.`
      )
    }

    const asString = String(rawValue)
    const blockedPattern = findBlockedPattern(asString)
    if (blockedPattern) {
      throw new RedactionError(
        `redactForAI(): "${key}" contains a blocked pattern (${blockedPattern}) and cannot be sent.`
      )
    }

    output[key] = asString
  }

  return output
}
