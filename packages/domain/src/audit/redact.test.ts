import { describe, expect, it } from "vitest"

import {
  isContactColumnName,
  isFreeTextColumnName,
  isSecretColumnName,
  isSensitiveColumnName,
  maskContactValue,
  maskEmail,
  maskPhone,
  redactionCopy,
} from "./redact"

/**
 * The PDPA-sensitive column classes F-ID-09 §5.3 and COMPLIANCE-PDPA §4 name.
 * Each must be caught by exactly one of the three universal patterns, and the
 * SQL side (app.audit_secret_pattern / _sensitive_ / _contact_) carries the
 * identical list.
 */
describe("the universal patterns cover every PDPA-sensitive column class", () => {
  it.each([
    "nid",
    "nid_number",
    "national_id",
    "birth_certificate_no",
    "passport_number",
    "password_hash",
    "token_hash",
    "push_token",
    "client_secret",
    "payout_account_number",
  ])("%s is dropped outright", (name) => {
    expect(isSecretColumnName(name)).toBe(true)
  })

  it.each([
    "religion",
    "blood_group",
    "allergies",
    "medical_conditions",
    "medications",
    "health_notes",
    "diagnosis",
  ])("%s is nulled, name kept", (name) => {
    expect(isSensitiveColumnName(name)).toBe(true)
    expect(isSecretColumnName(name)).toBe(false)
  })

  it.each([
    "email",
    "contact_email",
    "to_email",
    "phone",
    "contact_phone",
    "guardian_phone",
  ])("%s is masked, not dropped", (name) => {
    expect(isContactColumnName(name)).toBe(true)
    expect(isSecretColumnName(name)).toBe(false)
  })

  it.each(["role", "status", "amount_paisa", "email_digest", "full_name"])(
    "%s is left alone — these are the values an audit exists to prove",
    (name) => {
      expect(isSecretColumnName(name)).toBe(false)
      expect(isSensitiveColumnName(name)).toBe(false)
      expect(isContactColumnName(name)).toBe(false)
    }
  )
})

describe("maskContactValue", () => {
  it("picks the email mask for an email column and the phone mask otherwise", () => {
    expect(maskContactValue("contact_email", "rahim@gmail.com")).toBe(
      "r***@gmail.com"
    )
    expect(maskContactValue("guardian_phone", "+8801712345678")).toBe(
      "+8801*****678"
    )
  })

  it("is idempotent, so a value masked at write time survives a read-time pass", () => {
    const once = maskContactValue("email", "rahim@gmail.com")
    expect(maskContactValue("email", once)).toBe(once)
    const phone = maskContactValue("phone", "+8801712345678")
    expect(maskContactValue("phone", phone)).toBe(phone)
  })
})

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

  it("gives back nothing for a value with no @ at all", () => {
    expect(maskEmail("notanaddress")).toBe("***")
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
