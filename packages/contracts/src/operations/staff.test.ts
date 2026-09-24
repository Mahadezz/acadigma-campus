import { describe, expect, it } from "vitest"

import {
  emergencyContactSchema,
  staffDocumentKindSchema,
  staffDocumentSchema,
  staffEmploymentTypeSchema,
  staffRecordSchema,
  staffStatusSchema,
} from "./staff"

describe("staff enums — parity with the Postgres enums (20260925000900_staff_schema.sql)", () => {
  it("staffEmploymentTypeSchema accepts exactly the five staff_employment_type labels", () => {
    for (const value of [
      "full_time",
      "part_time",
      "contract",
      "substitute",
      "volunteer",
    ]) {
      expect(staffEmploymentTypeSchema.safeParse(value).success).toBe(true)
    }
    expect(staffEmploymentTypeSchema.safeParse("intern").success).toBe(false)
  })

  it("staffStatusSchema accepts exactly the four staff_status labels", () => {
    for (const value of ["pending_join", "active", "on_notice", "left"]) {
      expect(staffStatusSchema.safeParse(value).success).toBe(true)
    }
    expect(staffStatusSchema.safeParse("removed").success).toBe(false)
  })

  it("staffDocumentKindSchema accepts exactly the nine staff_document_kind labels", () => {
    for (const value of [
      "nid",
      "passport",
      "degree",
      "certificate",
      "contract",
      "appointment_letter",
      "police_clearance",
      "photo",
      "other",
    ]) {
      expect(staffDocumentKindSchema.safeParse(value).success).toBe(true)
    }
    expect(staffDocumentKindSchema.safeParse("visa").success).toBe(false)
  })
})

describe("emergencyContactSchema", () => {
  it("accepts an empty object — {} means nothing recorded yet", () => {
    expect(emergencyContactSchema.safeParse({}).success).toBe(true)
  })

  it("accepts the full shape", () => {
    const result = emergencyContactSchema.safeParse({
      name: "Ma",
      relation: "mother",
      phone: "+8801700000000",
    })
    expect(result.success).toBe(true)
  })
})

describe("staffRecordSchema", () => {
  const base = {
    id: "3f1a2e5c-9b7d-4c2e-8f1a-2b3c4d5e6f70",
    workspaceId: "3f1a2e5c-9b7d-4c2e-8f1a-2b3c4d5e6f71",
    userId: "3f1a2e5c-9b7d-4c2e-8f1a-2b3c4d5e6f72",
    membershipId: "3f1a2e5c-9b7d-4c2e-8f1a-2b3c4d5e6f73",
    staffCode: "TCH-2026-0001",
    fullName: "Teacher A",
    designationLabelId: null,
    department: null,
    employmentType: "full_time",
    employmentStatus: "active",
    joinedOn: "2025-01-01",
    leftOn: null,
    workEmail: null,
    workPhone: null,
    personalPhone: null,
    emergencyContact: {},
    bloodGroup: null,
    dateOfBirth: null,
    gender: null,
    nidNumber: null,
    address: null,
    qualifications: [],
    subjectIds: [],
    notes: null,
    applicationId: null,
  }

  it("parses a full row", () => {
    expect(staffRecordSchema.safeParse(base).success).toBe(true)
  })

  it("rejects a full_name over 200 characters", () => {
    const result = staffRecordSchema.safeParse({
      ...base,
      fullName: "x".repeat(201),
    })
    expect(result.success).toBe(false)
  })
})

describe("staffDocumentSchema", () => {
  it("parses an unverified document row (verifiedBy/verifiedAt both null — the pairing itself is a DB check constraint, not a Zod rule)", () => {
    const result = staffDocumentSchema.safeParse({
      id: "3f1a2e5c-9b7d-4c2e-8f1a-2b3c4d5e6f70",
      workspaceId: "3f1a2e5c-9b7d-4c2e-8f1a-2b3c4d5e6f71",
      staffRecordId: "3f1a2e5c-9b7d-4c2e-8f1a-2b3c4d5e6f72",
      kind: "nid",
      fileId: "3f1a2e5c-9b7d-4c2e-8f1a-2b3c4d5e6f73",
      label: null,
      issuedOn: null,
      expiresOn: "2026-12-31",
      verifiedBy: null,
      verifiedAt: null,
      uploadedBy: "3f1a2e5c-9b7d-4c2e-8f1a-2b3c4d5e6f74",
    })
    expect(result.success).toBe(true)
  })
})
