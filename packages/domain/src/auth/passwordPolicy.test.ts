import { describe, expect, it } from "vitest"

import {
  PASSWORD_MAX_BYTES,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MIN_SCORE,
  checkPassword,
  scorePassword,
} from "./passwordPolicy"

describe("checkPassword — length", () => {
  it("rejects a password shorter than the minimum", () => {
    const result = checkPassword({ password: "Sh0rt!ab99" }) // 10 chars
    expect(result).toMatchObject({ ok: false, reason: "too_short" })
  })

  it(`accepts exactly the minimum length (${PASSWORD_MIN_LENGTH}) when otherwise strong`, () => {
    // 12 chars, 4 character classes, no common-password match.
    const result = checkPassword({ password: "Zq7!mK9#pLx2" })
    expect(result.ok).toBe(true)
  })

  it("rejects a password over the 72-byte bcrypt cap", () => {
    const long = "Aa1!".repeat(20) // 80 bytes, all ASCII
    const result = checkPassword({ password: long })
    expect(result).toMatchObject({ ok: false, reason: "too_long" })
  })

  it("counts UTF-8 bytes, not characters, for the max-length rule", () => {
    // Bengali letters are 3 bytes each in UTF-8; 24 of them is 72 bytes exactly.
    const password = "ক".repeat(24)
    expect(new TextEncoder().encode(password).length).toBe(PASSWORD_MAX_BYTES)
    const result = checkPassword({ password })
    expect(result.ok || (!result.ok && result.reason !== "too_long")).toBe(true)
  })
})

describe("checkPassword — the acceptance-criteria cases", () => {
  it('AC3: rejects "password123" as too common, with no other rule cited', () => {
    const result = checkPassword({ password: "password123" })
    expect(result).toMatchObject({ ok: false, reason: "too_common" })
  })

  it("AC3 ordering: a common password is 'too common' even when it is also too short", () => {
    // "password123" is 11 characters, one under the 12-char floor. Reporting it
    // as "too short" would invite the user to pad it and re-submit the same
    // guessable string, and AC3 names the rule it must cite.
    expect("password123".length).toBeLessThan(PASSWORD_MIN_LENGTH)
    expect(checkPassword({ password: "password123" })).toMatchObject({
      ok: false,
      reason: "too_common",
    })
  })

  it("SECURITY.md §5.7.5: an 11-character non-common password is still too short", () => {
    expect(checkPassword({ password: "Zq7!mK9#pL1" })).toMatchObject({
      ok: false,
      reason: "too_short",
    })
  })

  it("AC1: a password scoring >= 3 is accepted", () => {
    const result = checkPassword({ password: "Bright-Cloud-42!" })
    expect(result.ok).toBe(true)
    if (result.ok)
      expect(result.score).toBeGreaterThanOrEqual(PASSWORD_MIN_SCORE)
  })
})

describe("checkPassword — identity similarity", () => {
  it("rejects a password containing the email local-part", () => {
    const result = checkPassword({
      password: "RahimUddin2026!",
      email: "rahimuddin@school.edu.bd",
    })
    expect(result).toMatchObject({
      ok: false,
      reason: "too_similar_to_identity",
    })
  })

  it("rejects a password containing the full name", () => {
    const result = checkPassword({
      password: "FarzanaAkter99!",
      fullName: "Farzana Akter",
    })
    expect(result).toMatchObject({
      ok: false,
      reason: "too_similar_to_identity",
    })
  })

  it("does not false-positive on a short, coincidental substring", () => {
    // "ann" is too short (<4 chars after stripping) to trigger the similarity check.
    const result = checkPassword({
      password: "Xk9!qRbTann4",
      fullName: "Ann Lee",
    })
    expect(result.ok).toBe(true)
  })
})

describe("scorePassword — boundaries", () => {
  const cases: { password: string; expectMin: 0 | 1 | 2 | 3 | 4 }[] = [
    { password: "aaaaaaaaaa", expectMin: 0 }, // long repeat run
    { password: "1234567890", expectMin: 0 }, // long sequential run + common
    { password: "correcthorsebatterystaple", expectMin: 3 }, // long, lowercase only
    { password: "Tr0ub4dor&3!ExtraLength", expectMin: 4 },
  ]

  it.each(cases)(
    "$password -> score >= $expectMin",
    ({ password, expectMin }) => {
      expect(scorePassword(password)).toBeGreaterThanOrEqual(expectMin)
    }
  )

  it("never returns a score outside 0-4", () => {
    for (const password of ["", "a", "A".repeat(200), "!@#$%^&*()_+"]) {
      const score = scorePassword(password)
      expect(score).toBeGreaterThanOrEqual(0)
      expect(score).toBeLessThanOrEqual(4)
    }
  })
})
