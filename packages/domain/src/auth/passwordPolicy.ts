import { COMMON_PASSWORDS } from "./commonPasswords"

/**
 * F-ID-01 §5 "Business rules and calculations":
 *   - minimum length 12 (SECURITY.md §5.7.5 [MUST] — see the note below; §5's
 *     table still says 10 and is corrected in the same change)
 *   - strength score >= 3 (the spec names zxcvbn; see the deviation note below)
 *   - rejects the email local-part, the full name, and a common-password list
 *   - maximum length 72 BYTES (bcrypt truncates silently past that)
 *
 * Deviation (logged in F-ID-01 §11): this module does not depend on `zxcvbn`. That
 * library ships a multi-megabyte frequency dictionary, and pulling in a new
 * dependency is an owner-reviewed decision (HANDBOOK §8 dependency policy), not
 * something to default into mid-Part. `scorePassword` below produces the same
 * 0-4 scale from length, character-class variety, common-password membership and
 * identity similarity — the properties the acceptance criteria actually exercise
 * (AC3: "password123" is rejected with a named rule, AC1: a password "scoring >= 3"
 * is accepted). Swapping in real zxcvbn later only touches this file.
 */

/**
 * SECURITY.md §5.7.5 "Password policy with a breach check" is a [MUST] and sets
 * this at **12**, not the 10 in F-ID-01 §5's table. The security baseline wins
 * over the feature table; F-ID-01 §5 is corrected to match.
 *
 * The other half of that control — Supabase Auth's HaveIBeenPwned leaked-password
 * rejection, with the "this password has appeared in a known data breach" message
 * — is NOT implemented here and is not implementable here: it is a project-level
 * Auth setting, not application code. Deferred explicitly, tracked as OQ-19 in
 * F-ID-01 §11. Until it is on, the common-password list below is a ~300-entry
 * stand-in for a 900-million-entry corpus; do not mistake one for the other.
 */
export const PASSWORD_MIN_LENGTH = 12
export const PASSWORD_MAX_BYTES = 72
export const PASSWORD_MIN_SCORE = 3

export type PasswordScore = 0 | 1 | 2 | 3 | 4

export type PasswordRejectionReason =
  | "too_short"
  | "too_long"
  | "too_common"
  | "too_similar_to_identity"
  | "too_weak"

export type PasswordCheckInput = {
  password: string
  /** Used to reject "the email local-part" per §5. Pass the full email or just the local part. */
  email?: string | null
  fullName?: string | null
}

export type PasswordCheckResult =
  | { ok: true; score: PasswordScore }
  | {
      ok: false
      score: PasswordScore
      reason: PasswordRejectionReason
      /** Safe to show the user directly — "the specific failed rule" per §4.1. */
      message: string
    }

/** UTF-8 byte length, because bcrypt's 72-byte limit is bytes, not characters. */
function byteLength(value: string): number {
  return new TextEncoder().encode(value).length
}

function normalize(value: string): string {
  return value.trim().toLowerCase()
}

/** True when `password` contains `needle` (>= 4 chars) as a case-insensitive substring. */
function containsIdentityFragment(
  password: string,
  needle: string | null | undefined
): boolean {
  const cleaned = normalize(needle ?? "").replace(/[^a-z0-9]/g, "")
  if (cleaned.length < 4) return false
  return normalize(password)
    .replace(/[^a-z0-9]/g, "")
    .includes(cleaned)
}

function emailLocalPart(email: string | null | undefined): string | null {
  if (!email) return null
  const [local] = email.split("@")
  return local ?? null
}

/** Longest run of the same character, or of a simple ascending/descending sequence. */
function longestMonotonicOrRepeatedRun(value: string): number {
  let longest = 1
  let current = 1
  for (let i = 1; i < value.length; i++) {
    const prev = value.codePointAt(i - 1) ?? 0
    const curr = value.codePointAt(i) ?? 0
    const isRepeat = curr === prev
    const isSequential = curr === prev + 1 || curr === prev - 1
    if (isRepeat || isSequential) {
      current += 1
    } else {
      current = 1
    }
    longest = Math.max(longest, current)
  }
  return longest
}

/**
 * Heuristic 0-4 strength score. Documented in the module comment above as the
 * intentional stand-in for zxcvbn.
 */
export function scorePassword(
  password: string,
  identity: { email?: string | null; fullName?: string | null } = {}
): PasswordScore {
  if (COMMON_PASSWORDS.has(normalize(password))) return 0

  if (
    containsIdentityFragment(password, emailLocalPart(identity.email)) ||
    containsIdentityFragment(password, identity.fullName)
  ) {
    return 0
  }

  let points = 0

  // Length carries the most weight — a long passphrase beats a short "clever" one.
  if (password.length >= 10) points += 1
  if (password.length >= 14) points += 1
  if (password.length >= 20) points += 1

  // Character-class variety.
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((re) =>
    re.test(password)
  ).length
  if (classes >= 3) points += 1
  if (classes === 4) points += 1

  // Penalise keyboard walks and repeated characters ("aaaaaaaaaa", "123456789a").
  const run = longestMonotonicOrRepeatedRun(password)
  if (run >= 6) points -= 2
  else if (run >= 4) points -= 1

  const clamped = Math.max(0, Math.min(4, points))
  return clamped as PasswordScore
}

/**
 * The full registration/reset check: length, byte cap, common-password and
 * identity-similarity rejection, then the strength score. Returns the first rule
 * that fails, because §4.1 requires naming *the* rule, not a bag of them.
 */
export function checkPassword(input: PasswordCheckInput): PasswordCheckResult {
  const { password } = input

  // Order matters. A password on the common list is reported as *common* even
  // when it is also short: AC3's payload ("password123") is 11 characters, and
  // telling someone their leaked password is merely "too short" invites them to
  // pad it to 12 and re-submit the same guessable string. The most specific
  // true rule wins, which is also what §4.1's "name THE rule" asks for.
  if (COMMON_PASSWORDS.has(normalize(password))) {
    return {
      ok: false,
      score: 0,
      reason: "too_common",
      message: "This password is too common. Choose something less guessable.",
    }
  }

  if (password.length < PASSWORD_MIN_LENGTH) {
    return {
      ok: false,
      score: 0,
      reason: "too_short",
      message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
    }
  }

  if (byteLength(password) > PASSWORD_MAX_BYTES) {
    return {
      ok: false,
      score: 0,
      reason: "too_long",
      message: `Password must be ${PASSWORD_MAX_BYTES} bytes or shorter.`,
    }
  }

  if (
    containsIdentityFragment(password, emailLocalPart(input.email)) ||
    containsIdentityFragment(password, input.fullName)
  ) {
    return {
      ok: false,
      score: 0,
      reason: "too_similar_to_identity",
      message: "Password cannot contain your name or email address.",
    }
  }

  const score = scorePassword(password, input)
  if (score < PASSWORD_MIN_SCORE) {
    return {
      ok: false,
      score,
      reason: "too_weak",
      message: "Add more length or mix letters, numbers and symbols.",
    }
  }

  return { ok: true, score }
}
