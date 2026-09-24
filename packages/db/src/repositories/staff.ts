/**
 * F-OP-06 Part 1 — read access to `staff_records`, `staff_compensation` and
 * `staff_documents` (`supabase/migrations/20260925000900_staff_schema.sql`).
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
  type Result,
  type StaffCompensation,
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
