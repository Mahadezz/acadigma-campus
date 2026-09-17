import { describe, expect, it } from "vitest"

import {
  isFreeTextColumnName,
  isSecretColumnName,
  maskEmail,
  maskPhone,
  redactionCopy,
} from "./redact"

describe("isSecretColumnName", () => {
  it.each([
    "token_hash",
    "token_prefix",
    "api_token",
    "client_secret",
    "password_hash",
    "payout_account_number",
    "provider_secret_key",
  ])("matches %s", (name) => {
    expect(isSecretColumnName(name)).toBe(true)
  })

  it.each([
    "name",
    "email",
    "role",
    "status",
    "provider_customer_ref",
    "amount_paisa",
  ])("does not match %s", (name) => {
    expect(isSecretColumnName(name)).toBe(false)
  })

  it("is case-insensitive", () => {
    expect(isSecretColumnName("API_TOKEN")).toBe(true)
  })
})

describe("isFreeTextColumnName", () => {
  it("matches the configured free-text columns", () => {
    expect(isFreeTextColumnName("body")).toBe(true)
    expect(isFreeTextColumnName("notes")).toBe(true)
  })

  it("does not match an ordinary column", () => {
    expect(isFreeTextColumnName("role")).toBe(false)
  })
})

describe("maskEmail", () => {
  it("keeps the first character and the domain", () => {
    expect(maskEmail("rahim@gmail.com")).toBe("r***@gmail.com")
  })

  it("handles a very short local part", () => {
    expect(maskEmail("a@gmail.com")).toBe("***@gmail.com")
  })
})

describe("maskPhone", () => {
  it("keeps a Bangladeshi mobile number's prefix and last three digits", () => {
    expect(maskPhone("+8801712345678")).toBe("+8801*****678")
  })

  it("masks a short value entirely", () => {
    expect(maskPhone("123")).toBe("***")
  })
})

describe("redactionCopy", () => {
  it("returns non-empty English and Bangla copy for every reason", () => {
    for (const reason of [
      "secret",
      "free_text",
      "health",
      "contact_masked",
    ] as const) {
      expect(redactionCopy(reason, "en").length).toBeGreaterThan(0)
      expect(redactionCopy(reason, "bn").length).toBeGreaterThan(0)
    }
  })
})
