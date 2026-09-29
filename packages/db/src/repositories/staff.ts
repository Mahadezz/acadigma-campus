/**
 * F-OP-06 Part 1 — read access to `staff_records`, `staff_compensation` and
 * `staff_documents` (`supabase/migrations/20260925000900_staff_schema.sql`).
 * Part 2 adds `listStaff`, reading `staff_directory`
 * (`20260929020309_staff_directory_every_member.sql`, D-209).
 *
 * Deliberately read-only: no server action exists yet to call a write here
 * (createStaffRecord/setStaffCompensation/uploadStaffDocument are Parts 3-4),
 * so this Part does not invent one ahead of the policy/validation layer that
 * would sit in front of it. RLS does every access-control decision below —
 * this file only shapes rows and explicit column lists (CLAUDE.md rule 7:
 * never `select('*')` on a table with private columns).
 */

import {
  apiError,
  err,
  ok,
  type ApiError,
  type ListStaffInput,
  type Result,
  type StaffCompensation,
  type StaffDirectoryPage,
  type StaffDirectoryRow,
  type StaffDocument,
  type StaffRecord,
} from "@acadigma/contracts"

import type { AcadigmaSupabaseClient } from "../client"
import type { WorkspaceContext } from "../workspace-context"

const UNAVAILABLE: ApiError = apiError(
  "dependency_unavailable",
  "Could not reach the database. Please try again."
)

const NOT_FOUND: ApiError = apiError(
  "not_found",
  "This staff record does not exist, or is not visible to you."
)

const STAFF_RECORD_COLUMNS =
  "id, workspace_id, user_id, membership_id, staff_code, full_name, " +
  "designation_label_id, department, employment_type, employment_status, " +
  "joined_on, left_on, work_email, work_phone, personal_phone, " +
  "emergency_contact, blood_group, date_of_birth, gender, nid_number, " +
  "address, qualifications, subject_ids, notes, application_id"

const STAFF_COMPENSATION_COLUMNS =
  "id, workspace_id, staff_record_id, hourly_rate_paisa, monthly_salary_paisa, " +
  "currency, effective_from, effective_to, note"

const STAFF_DOCUMENT_COLUMNS =
  "id, workspace_id, staff_record_id, kind, file_id, label, issued_on, " +
  "expires_on, verified_by, verified_at, uploaded_by"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toStaffRecord(row: any): StaffRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    userId: row.user_id,
    membershipId: row.membership_id,
    staffCode: row.staff_code,
    fullName: row.full_name,
    designationLabelId: row.designation_label_id,
    department: row.department,
    employmentType: row.employment_type,
    employmentStatus: row.employment_status,
    joinedOn: row.joined_on,
    leftOn: row.left_on,
    workEmail: row.work_email,
    workPhone: row.work_phone,
    personalPhone: row.personal_phone,
    emergencyContact: row.emergency_contact ?? {},
    bloodGroup: row.blood_group,
    dateOfBirth: row.date_of_birth,
    gender: row.gender,
    nidNumber: row.nid_number,
    address: row.address,
    qualifications: row.qualifications ?? [],
    subjectIds: row.subject_ids ?? [],
    notes: row.notes,
    applicationId: row.application_id,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toStaffCompensation(row: any): StaffCompensation {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    staffRecordId: row.staff_record_id,
    hourlyRatePaisa: row.hourly_rate_paisa,
    monthlySalaryPaisa: row.monthly_salary_paisa,
    currency: row.currency,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    note: row.note,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toStaffDocument(row: any): StaffDocument {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    staffRecordId: row.staff_record_id,
    kind: row.kind,
    fileId: row.file_id,
    label: row.label,
    issuedOn: row.issued_on,
    expiresOn: row.expires_on,
    verifiedBy: row.verified_by,
    verifiedAt: row.verified_at,
    uploadedBy: row.uploaded_by,
  }
}

/**
 * A single staff record, scoped to the caller's workspace. RLS narrows the
 * result to "owner/admin see any record; anyone else sees only their own"
 * (`staff_records_select`) — this function trusts that entirely rather than
 * re-checking role here, matching every other repository in this package.
 */
export async function getStaffRecordById(
  supabase: AcadigmaSupabaseClient,
  ctx: WorkspaceContext,
  staffRecordId: string
): Promise<Result<StaffRecord, ApiError>> {
  const { data, error } = await supabase
    .from("staff_records")
    .select(STAFF_RECORD_COLUMNS)
    .eq("workspace_id", ctx.workspaceId)
    .eq("id", staffRecordId)
    .maybeSingle()

  if (error) return err(UNAVAILABLE)
  if (!data) return err(NOT_FOUND)
  return ok(toStaffRecord(data))
}

/** The caller's own staff record in this workspace, or null when they have none
 * (e.g. an owner who has never had a staff record created for them). */
export async function getMyStaffRecord(
  supabase: AcadigmaSupabaseClient,
  ctx: WorkspaceContext
): Promise<Result<StaffRecord | null, ApiError>> {
  const { data, error } = await supabase
    .from("staff_records")
    .select(STAFF_RECORD_COLUMNS)
    .eq("workspace_id", ctx.workspaceId)
    .eq("user_id", ctx.userId)
    .maybeSingle()

  if (error) return err(UNAVAILABLE)
  return ok(data ? toStaffRecord(data) : null)
}

/**
 * Full compensation history for a record, newest period first. RLS
 * (`staff_compensation_select`) already limits this to owner/admin or the
 * record's own person — an unauthorized caller simply gets an empty array,
 * not an error, exactly like querying the table directly would.
 */
export async function listStaffCompensationHistory(
  supabase: AcadigmaSupabaseClient,
  ctx: WorkspaceContext,
  staffRecordId: string
): Promise<Result<StaffCompensation[], ApiError>> {
  const { data, error } = await supabase
    .from("staff_compensation")
    .select(STAFF_COMPENSATION_COLUMNS)
    .eq("workspace_id", ctx.workspaceId)
    .eq("staff_record_id", staffRecordId)
    .order("effective_from", { ascending: false })

  if (error) return err(UNAVAILABLE)
  return ok((data ?? []).map(toStaffCompensation))
}

/** Documents on a record, newest first. RLS (`staff_documents_select`)
 * limits this to owner/admin or the record's own person. */
export async function listStaffDocuments(
  supabase: AcadigmaSupabaseClient,
  ctx: WorkspaceContext,
  staffRecordId: string
): Promise<Result<StaffDocument[], ApiError>> {
  const { data, error } = await supabase
    .from("staff_documents")
    .select(STAFF_DOCUMENT_COLUMNS)
    .eq("workspace_id", ctx.workspaceId)
    .eq("staff_record_id", staffRecordId)
    .order("created_at", { ascending: false })

  if (error) return err(UNAVAILABLE)
  return ok((data ?? []).map(toStaffDocument))
}

// ---------------------------------------------------------------------------
// listStaff (F-OP-06 Part 2) — the directory: /app/staff.
// ---------------------------------------------------------------------------

const STAFF_DIRECTORY_COLUMNS =
  "id, membership_id, workspace_id, user_id, staff_code, full_name, " +
  "avatar_url, designation_label_id, designation_label, base_role, " +
  "department, subject_ids, work_email, work_phone, employment_status, " +
  "joined_on"

/** PostgREST's `or=(...)` grammar treats these as syntax, and `%`/`_` are
 * LIKE wildcards; a name, staff code or contact detail never needs any of
 * them (same rule `students.ts`' `searchTerm` applies to the roster). */
function searchTerm(q: string): string {
  return q.replace(/[,()*%_\\:"'.]/g, " ").trim()
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toStaffDirectoryRow(row: any): StaffDirectoryRow {
  return {
    id: row.id,
    membershipId: row.membership_id,
    workspaceId: row.workspace_id,
    userId: row.user_id,
    staffCode: row.staff_code,
    fullName: row.full_name,
    avatarUrl: row.avatar_url,
    designationLabelId: row.designation_label_id,
    designationLabel: row.designation_label,
    baseRole: row.base_role,
    department: row.department,
    subjectIds: row.subject_ids ?? [],
    workEmail: row.work_email,
    workPhone: row.work_phone,
    employmentStatus: row.employment_status,
    joinedOn: row.joined_on,
  }
}

/** Splits a `limit + 1`-row fetch into `(page, nextCursor)` keyset-pagination
 * style — same shape as `audit.ts`'s `paginate`, not shared across packages
 * for one four-line helper. */
function paginate(
  rows: readonly StaffDirectoryRow[],
  limit: number
): { items: StaffDirectoryRow[]; nextCursor: string | null } {
  if (rows.length <= limit) return { items: [...rows], nextCursor: null }
  const items = rows.slice(0, limit)
  return { items, nextCursor: items[items.length - 1]?.membershipId ?? null }
}

/**
 * The directory: every active non-parent member (`staff_directory`, D-209),
 * server-filtered and cursor-paginated (CLAUDE.md rule 7 — never a client
 * filters a table). RLS narrows this to zero rows for a parent or anyone
 * outside the workspace; a non-parent member sees every row regardless of
 * whether the person they're looking at has a `staff_records` row yet.
 */
export async function listStaff(
  supabase: AcadigmaSupabaseClient,
  ctx: WorkspaceContext,
  input: ListStaffInput
): Promise<Result<StaffDirectoryPage, ApiError>> {
  let query = supabase
    .from("staff_directory")
    .select(STAFF_DIRECTORY_COLUMNS)
    .eq("workspace_id", ctx.workspaceId)

  if (input.role) query = query.eq("base_role", input.role)
  if (input.status) query = query.eq("employment_status", input.status)

  const term = input.q ? searchTerm(input.q) : ""
  if (term) {
    query = query.or(
      `full_name.ilike.*${term}*,staff_code.ilike.*${term}*,` +
        `work_email.ilike.*${term}*,work_phone.ilike.*${term}*`
    )
  }
  if (input.cursor) query = query.gt("membership_id", input.cursor)

  const { data, error } = await query
    .order("membership_id", { ascending: true })
    .limit(input.limit + 1)

  if (error) return err(UNAVAILABLE)

  const rows = (data ?? []).map(toStaffDirectoryRow)
  return ok(paginate(rows, input.limit))
}

/** One directory row by membership id — the person sheet (`/app/staff/[id]`).
 * RLS narrows `staff_directory` the same way as `listStaff`; a parent or an
 * outsider gets zero rows back, surfaced here as `not_found` rather than a
 * distinct "forbidden", exactly like every other by-id lookup in this
 * package (see `getStaffRecordById`). */
export async function getStaffDirectoryRow(
  supabase: AcadigmaSupabaseClient,
  ctx: WorkspaceContext,
  membershipId: string
): Promise<Result<StaffDirectoryRow, ApiError>> {
  const { data, error } = await supabase
    .from("staff_directory")
    .select(STAFF_DIRECTORY_COLUMNS)
    .eq("workspace_id", ctx.workspaceId)
    .eq("membership_id", membershipId)
    .maybeSingle()

  if (error) return err(UNAVAILABLE)
  if (!data) return err(NOT_FOUND)
  return ok(toStaffDirectoryRow(data))
}
