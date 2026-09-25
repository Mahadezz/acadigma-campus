import { describe, expect, it } from "vitest"

import {
  getMyStaffRecord,
  getStaffRecordById,
  listStaffCompensationHistory,
  listStaffDocuments,
} from "./staff"

import type { AcadigmaSupabaseClient } from "../client"
import type { WorkspaceContext } from "../workspace-context"

const WORKSPACE_ID = "3f1a2e5c-9b7d-4c2e-8f1a-2b3c4d5e6f70"
const USER_ID = "8c2b1d4e-5f60-4a7b-9c8d-0e1f2a3b4c5d"

const CTX: WorkspaceContext = {
  workspaceId: WORKSPACE_ID,
  userId: USER_ID,
  role: "teacher",
  workspaceType: "school",
  plan: "pro",
}

const STAFF_RECORD_ROW = {
  id: "ee000003-0000-0000-0000-000000000003",
  workspace_id: WORKSPACE_ID,
  user_id: USER_ID,
  membership_id: "dddd0003-0000-0000-0000-000000000003",
  staff_code: "TCH-2026-0001",
  full_name: "Teacher A",
  designation_label_id: null,
  department: null,
  employment_type: "full_time",
  employment_status: "active",
  joined_on: "2025-01-01",
  left_on: null,
  work_email: null,
  work_phone: null,
  personal_phone: "+8801700000000",
  emergency_contact: {
    name: "Ma",
    relation: "mother",
    phone: "+8801700000000",
  },
  blood_group: null,
  date_of_birth: null,
  gender: null,
  nid_number: null,
  address: null,
  qualifications: [],
  subject_ids: [],
  notes: null,
  application_id: null,
}

/** Minimal stand-in for the supabase-js query builder chain each function
 * below needs, mirroring the style in settings.test.ts. Every repository
 * call here does `.select().eq().eq()` and then either `.maybeSingle()`
 * (single row) or `.order()` (a list — supabase-js query builders are
 * themselves awaitable, so `.order()` resolves directly to `{ data, error }`). */
function fakeClient(options: {
  table: string
  row?: unknown
  rows?: unknown[]
  error?: boolean
}): AcadigmaSupabaseClient {
  const { table, row = null, rows = [], error = false } = options
  return {
    from: (calledTable: string) => {
      if (calledTable !== table)
        throw new Error(`unexpected table ${calledTable}`)
      const afterFilters = {
        maybeSingle: async () => ({
          data: error ? null : row,
          error: error ? { message: "connection reset" } : null,
        }),
        order: async () => ({
          data: error ? null : rows,
          error: error ? { message: "connection reset" } : null,
        }),
      }
      return {
        select: () => ({
          eq: () => ({
            eq: () => afterFilters,
          }),
        }),
      }
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as AcadigmaSupabaseClient
}

describe("getStaffRecordById", () => {
  it("maps a row to the camelCase StaffRecord shape", async () => {
    const client = fakeClient({ table: "staff_records", row: STAFF_RECORD_ROW })
    const result = await getStaffRecordById(client, CTX, STAFF_RECORD_ROW.id)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.staffCode).toBe("TCH-2026-0001")
      expect(result.data.employmentStatus).toBe("active")
      expect(result.data.emergencyContact).toEqual({
        name: "Ma",
        relation: "mother",
        phone: "+8801700000000",
      })
    }
  })

  it("returns not_found when RLS (or a bad id) yields no row", async () => {
    const client = fakeClient({ table: "staff_records", row: null })
    const result = await getStaffRecordById(client, CTX, "does-not-exist")
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe("not_found")
  })

  it("returns dependency_unavailable on a query error", async () => {
    const client = fakeClient({ table: "staff_records", error: true })
    const result = await getStaffRecordById(client, CTX, STAFF_RECORD_ROW.id)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe("dependency_unavailable")
  })
})

describe("getMyStaffRecord", () => {
  it("returns null, not an error, when the caller has no staff record", async () => {
    const client = fakeClient({ table: "staff_records", row: null })
    const result = await getMyStaffRecord(client, CTX)
    expect(result).toEqual({ ok: true, data: null })
  })

  it("returns the caller's own record when one exists", async () => {
    const client = fakeClient({ table: "staff_records", row: STAFF_RECORD_ROW })
    const result = await getMyStaffRecord(client, CTX)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data?.userId).toBe(USER_ID)
  })
})

describe("listStaffCompensationHistory", () => {
  it("maps rows, defaulting to an empty array when RLS returns none", async () => {
    const client = fakeClient({ table: "staff_compensation", rows: [] })
    const result = await listStaffCompensationHistory(
      client,
      CTX,
      "ee000003-0000-0000-0000-000000000003"
    )
    expect(result).toEqual({ ok: true, data: [] })
  })

  it("maps a compensation row to camelCase", async () => {
    const client = fakeClient({
      table: "staff_compensation",
      rows: [
        {
          id: "cc000001-0000-0000-0000-000000000001",
          workspace_id: WORKSPACE_ID,
          staff_record_id: "ee000003-0000-0000-0000-000000000003",
          hourly_rate_paisa: 35000,
          monthly_salary_paisa: null,
          currency: "BDT",
          effective_from: "2025-01-01",
          effective_to: null,
          note: null,
        },
      ],
    })
    const result = await listStaffCompensationHistory(
      client,
      CTX,
      "ee000003-0000-0000-0000-000000000003"
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data[0]?.hourlyRatePaisa).toBe(35000)
      expect(result.data[0]?.effectiveTo).toBeNull()
    }
  })
})

describe("listStaffDocuments", () => {
  it("maps rows to camelCase", async () => {
    const client = fakeClient({
      table: "staff_documents",
      rows: [
        {
          id: "dd000001-0000-0000-0000-000000000001",
          workspace_id: WORKSPACE_ID,
          staff_record_id: "ee000003-0000-0000-0000-000000000003",
          kind: "nid",
          file_id: "ff000001-0000-0000-0000-000000000001",
          label: null,
          issued_on: null,
          expires_on: "2027-01-01",
          verified_by: null,
          verified_at: null,
          uploaded_by: USER_ID,
        },
      ],
    })
    const result = await listStaffDocuments(
      client,
      CTX,
      "ee000003-0000-0000-0000-000000000003"
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data[0]?.kind).toBe("nid")
      expect(result.data[0]?.expiresOn).toBe("2027-01-01")
    }
  })
})
