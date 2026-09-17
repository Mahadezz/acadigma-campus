import { describe, expect, it } from "vitest"

import {
  authCallbackQuerySchema,
  changePasswordInputSchema,
  passwordResetInputSchema,
  passwordResetRequestInputSchema,
  registerWithPasswordInputSchema,
  resendVerificationInputSchema,
  signInWithPasswordInputSchema,
} from "./auth"

describe("registerWithPasswordInputSchema", () => {
  const valid = {
    fullName: "Rahim Uddin",
    email: "Rahim.Uddin@School.EDU.BD",
    password: "Correct-Horse-99!",
    termsAccepted: true as const,
  }

  it("accepts a well-formed submission and lower-cases the email", () => {
    const result = registerWithPasswordInputSchema.parse(valid)
    expect(result.email).toBe("rahim.uddin@school.edu.bd")
  })

  it("rejects termsAccepted: false — literal(true) only", () => {
    const result = registerWithPasswordInputSchema.safeParse({
      ...valid,
      termsAccepted: false,
    })
    expect(result.success).toBe(false)
  })

  it("rejects a one-character name", () => {
    const result = registerWithPasswordInputSchema.safeParse({
      ...valid,
      fullName: "R",
    })
    expect(result.success).toBe(false)
  })

  it("rejects a malformed email", () => {
    const result = registerWithPasswordInputSchema.safeParse({
      ...valid,
      email: "not-an-email",
    })
    expect(result.success).toBe(false)
  })

  it("rejects a password under the 10-character floor", () => {
    const result = registerWithPasswordInputSchema.safeParse({
      ...valid,
      password: "Short1!",
    })
    expect(result.success).toBe(false)
  })
})

describe("signInWithPasswordInputSchema", () => {
  it("requires remember explicitly (no schema default — see the field comment)", () => {
    const missing = signInWithPasswordInputSchema.safeParse({
      email: "a@b.com",
      password: "whatever-they-typed",
    })
    expect(missing.success).toBe(false)

    const result = signInWithPasswordInputSchema.parse({
      email: "a@b.com",
      password: "whatever-they-typed",
      remember: true,
    })
    expect(result.remember).toBe(true)
  })

  it("does not enforce the strength policy on sign-in — any non-empty password parses", () => {
    // A weak password must still be attemptable at sign-in; strength is a
    // registration/reset-time rule, not a sign-in-time rule (§7).
    const result = signInWithPasswordInputSchema.safeParse({
      email: "a@b.com",
      password: "x",
      remember: true,
    })
    expect(result.success).toBe(true)
  })

  it("rejects an empty password", () => {
    const result = signInWithPasswordInputSchema.safeParse({
      email: "a@b.com",
      password: "",
      remember: true,
    })
    expect(result.success).toBe(false)
  })
})

describe("resendVerificationInputSchema / passwordResetRequestInputSchema", () => {
  it("both accept a bare email", () => {
    expect(
      resendVerificationInputSchema.safeParse({ email: "a@b.com" }).success
    ).toBe(true)
    expect(
      passwordResetRequestInputSchema.safeParse({ email: "a@b.com" }).success
    ).toBe(true)
  })
})

describe("passwordResetInputSchema", () => {
  it("requires both a token hash and a policy-length password", () => {
    expect(
      passwordResetInputSchema.safeParse({
        tokenHash: "abc123",
        password: "Correct-Horse-99!",
      }).success
    ).toBe(true)
    expect(
      passwordResetInputSchema.safeParse({
        tokenHash: "",
        password: "Correct-Horse-99!",
      }).success
    ).toBe(false)
  })
})

describe("changePasswordInputSchema", () => {
  it("requires signOutOthers explicitly; the UI default (F-ID-01 §4.6) is `true`", () => {
    const missing = changePasswordInputSchema.safeParse({
      currentPassword: "old-password",
      password: "New-Correct-Horse-99!",
    })
    expect(missing.success).toBe(false)

    const result = changePasswordInputSchema.parse({
      currentPassword: "old-password",
      password: "New-Correct-Horse-99!",
      signOutOthers: true,
    })
    expect(result.signOutOthers).toBe(true)
  })
})

describe("authCallbackQuerySchema", () => {
  it("accepts email and recovery types only", () => {
    expect(
      authCallbackQuerySchema.safeParse({ tokenHash: "abc", type: "email" })
        .success
    ).toBe(true)
    expect(
      authCallbackQuerySchema.safeParse({ tokenHash: "abc", type: "recovery" })
        .success
    ).toBe(true)
    expect(
      authCallbackQuerySchema.safeParse({ tokenHash: "abc", type: "magiclink" })
        .success
    ).toBe(false)
  })
})
