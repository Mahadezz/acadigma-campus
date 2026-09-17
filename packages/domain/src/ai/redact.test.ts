import { describe, expect, it } from "vitest"

import { RedactionError, normalizeDigits, redactForAI } from "./redact"

describe("normalizeDigits", () => {
  it("maps every Bengali digit to its ASCII equivalent", () => {
    expect(normalizeDigits("০১২৩৪৫৬৭৮৯")).toBe("0123456789")
  })

  it("leaves ASCII digits and other text untouched", () => {
    expect(normalizeDigits("Class 6, roll ১২")).toBe("Class 6, roll 12")
  })
})

describe("redactForAI — the allow-list", () => {
  it("passes firstName and gradeLevel through unchanged", () => {
    expect(redactForAI({ firstName: "Ayaan", gradeLevel: "Class 6" })).toEqual({
      firstName: "Ayaan",
      gradeLevel: "Class 6",
    })
  })

  it("accepts a numeric gradeLevel and stringifies it", () => {
    expect(redactForAI({ gradeLevel: 6 })).toEqual({ gradeLevel: "6" })
  })

  it("drops null, undefined and empty-string values without throwing", () => {
    expect(redactForAI({ firstName: "Ayaan", gradeLevel: undefined })).toEqual({
      firstName: "Ayaan",
    })
    expect(redactForAI({ firstName: null })).toEqual({})
    expect(redactForAI({ firstName: "" })).toEqual({})
  })
})

describe("redactForAI — fails closed on unknown fields", () => {
  it("silently drops a field with no explicit permission", () => {
    expect(
      redactForAI({
        firstName: "Ayaan",
        favouriteColour: "blue",
        className: "6A",
      })
    ).toEqual({ firstName: "Ayaan" })
  })

  it("returns an empty object for an input with only unknown fields", () => {
    expect(redactForAI({ notes: "some text", teacherId: "abc-123" })).toEqual(
      {}
    )
  })
})

describe("redactForAI — hard-blocked field names throw, loudly", () => {
  const blockedFields: Record<string, unknown> = {
    surname: "Rahman",
    lastName: "Rahman",
    fullName: "Ayaan Rahman",
    healthConditions: "asthma",
    allergyNotes: "peanuts",
    religion: "Islam",
    caste: "N/A",
    nid: "1234567890",
    nationalIdNumber: "1234567890",
    birthCertificateNumber: "12345678901234567",
    phoneNumber: "01712345678",
    whatsappNumber: "01712345678",
    email: "parent@example.com",
    homeAddress: "123 Road 4, Dhanmondi",
    district: "Dhaka",
    guardianName: "Karim Rahman",
    parentPhone: "01712345678",
    dob: "2015-01-01",
    age: 10,
    examMarks: "78/100",
    studentId: "STU-0001",
    admissionNumber: "ADM-2026-001",
    medicalScanUrl: "https://files.example.com/scan.pdf",
    nidScanFileId: "file_123",
  }

  for (const [field, value] of Object.entries(blockedFields)) {
    it(`throws RedactionError for "${field}"`, () => {
      expect(() => redactForAI({ [field]: value })).toThrow(RedactionError)
    })
  }

  it("does not block a syllabus file reference by name", () => {
    expect(() =>
      redactForAI({ syllabusFileId: "file_syllabus_1" })
    ).not.toThrow()
    // Not on the allow-list either, so it is dropped, not sent.
    expect(redactForAI({ syllabusFileId: "file_syllabus_1" })).toEqual({})
  })
})

describe("redactForAI — pattern checks apply even to allowed fields", () => {
  it("throws when a 10-digit BD NID is embedded in firstName", () => {
    expect(() => redactForAI({ firstName: "1234567890" })).toThrow(
      RedactionError
    )
  })

  it("throws when a 13-digit BD NID is embedded in gradeLevel", () => {
    expect(() => redactForAI({ gradeLevel: "1234567890123" })).toThrow(
      RedactionError
    )
  })

  it("throws when a 17-digit NID/birth-certificate number is present", () => {
    expect(() => redactForAI({ firstName: "12345678901234567" })).toThrow(
      RedactionError
    )
  })

  it("throws when a BD phone number is present", () => {
    expect(() => redactForAI({ firstName: "call me on 01712345678" })).toThrow(
      RedactionError
    )
  })

  it("does not false-positive on a non-BD mobile prefix", () => {
    // 01 2xxxxxxxx is not a valid BD operator prefix ([3-9] required).
    expect(() => redactForAI({ firstName: "ref 01212345678" })).not.toThrow()
  })

  it("throws when an email address is present", () => {
    expect(() =>
      redactForAI({ gradeLevel: "reach parent@example.com" })
    ).toThrow(RedactionError)
  })

  it("throws on a Bengali-numeral NID after digit normalisation", () => {
    // ১২৩৪৫৬৭৮৯০ == 1234567890, a 10-digit NID.
    expect(() => redactForAI({ firstName: "১২৩৪৫৬৭৮৯০" })).toThrow(
      RedactionError
    )
  })

  it("throws on a Bengali-numeral BD phone number", () => {
    // ০১৭১২৩৪৫৬৭৮ == 01712345678.
    expect(() => redactForAI({ gradeLevel: "০১৭১২৩৪৫৬৭৮" })).toThrow(
      RedactionError
    )
  })
})

describe("redactForAI — fails closed on malformed input", () => {
  it("rejects a string (free text is never a valid input shape)", () => {
    // @ts-expect-error — deliberately calling with the wrong shape
    expect(() => redactForAI("Ayaan is a great student")).toThrow(
      RedactionError
    )
  })

  it("rejects an array", () => {
    // @ts-expect-error — deliberately calling with the wrong shape
    expect(() => redactForAI(["Ayaan"])).toThrow(RedactionError)
  })

  it("rejects null", () => {
    // @ts-expect-error — deliberately calling with the wrong shape
    expect(() => redactForAI(null)).toThrow(RedactionError)
  })

  it("rejects a non-string, non-number allowed-field value", () => {
    expect(() => redactForAI({ firstName: { first: "Ayaan" } })).toThrow(
      RedactionError
    )
  })
})
