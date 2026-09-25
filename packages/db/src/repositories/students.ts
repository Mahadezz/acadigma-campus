/**
 * F-AC-02 demo cut (D-103) — the roster, a student's profile, the private
 * block (date of birth and guardians) and quick admission. Every function
 * takes `WorkspaceContext` first and filters on `ctx.workspaceId`; RLS is
 * the second wall, and the only one for the private block: a caller who is
 * not owner/admin or the student's class teacher gets no row back.
 */

import {
  apiError,
  err,
  ok,
  type ApiError,
  type Guardian,
  type QuickAdmitInput,
  type QuickAdmitResult,
  type Result,
  type RosterStudent,
  type StudentPrivate,
  type StudentSearchQuery,
} from "@acadigma/contracts"

import type { AcadigmaSupabaseClient } from "../client"
import type { WorkspaceContext } from "../workspace-context"

const UNAVAILABLE: ApiError = apiError(
  "dependency_unavailable",
  "Could not reach the database. Please try again."
)

export const ROSTER_PAGE_SIZE = 50

const ROSTER_COLUMNS =
  "id, student_code, full_name, full_name_bn, gender, status, section_id, " +
  "roll_number, section_name, grade_name, grade_name_bn"

type RosterRow = {
  id: string
  student_code: string
  full_name: string
  full_name_bn: string | null
  gender: RosterStudent["gender"]
  status: RosterStudent["status"]
  section_id: string | null
  roll_number: number | null
  section_name: string | null
  grade_name: string | null
  grade_name_bn: string | null
}

function toRosterStudent(row: RosterRow): RosterStudent {
  return {
    id: row.id,
    studentCode: row.student_code,
    fullName: row.full_name,
    fullNameBn: row.full_name_bn,
    gender: row.gender,
    status: row.status,
    sectionId: row.section_id,
    rollNumber: row.roll_number,
    sectionName: row.section_name,
    gradeName: row.grade_name,
    gradeNameBn: row.grade_name_bn,
  }
}

/** PostgREST's `or=(...)` grammar treats these as syntax, and `%`/`_` are
 * LIKE wildcards; a name or a student code never needs any of them. */
function searchTerm(q: string): string {
  return q.replace(/[,()*%_\\:"'.]/g, " ").trim()
}

/**
 * §4.9 / §5.13: one server-filtered page of the roster — never the whole
 * table. Search is ILIKE on the English and Bangla names and the student
 * code (trigram-indexed). Ordered by class, section, roll. Only students
 * enrolled in `academicYearId` (the current year), so a student promoted
 * into next year is listed once; no year means an empty roster.
 */
export async function listRoster(
  supabase: AcadigmaSupabaseClient,
  ctx: WorkspaceContext,
  query: StudentSearchQuery,
  academicYearId: string | null
): Promise<Result<{ students: RosterStudent[]; hasMore: boolean }, ApiError>> {
  if (!academicYearId) return ok({ students: [], hasMore: false })
  // ponytail: offset paging; switch to a keyset cursor if a school's roster
  // outgrows a few hundred pages.
  const from = (query.page - 1) * ROSTER_PAGE_SIZE
  let request = supabase
    .from("student_roster")
    .select(ROSTER_COLUMNS)
    .eq("workspace_id", ctx.workspaceId)
    .eq("academic_year_id", academicYearId)
    .is("deleted_at", null)
  if (query.sectionId) request = request.eq("section_id", query.sectionId)
  const term = query.q ? searchTerm(query.q) : ""
  if (term) {
    request = request.or(
      `full_name.ilike.*${term}*,full_name_bn.ilike.*${term}*,student_code.ilike.*${term}*`
    )
  }
  const { data, error } = await request
    .order("grade_level_number", { ascending: true, nullsFirst: false })
    .order("section_name", { ascending: true, nullsFirst: false })
    .order("roll_number", { ascending: true, nullsFirst: false })
    .order("student_code")
    .range(from, from + ROSTER_PAGE_SIZE) // one extra row says "there is more"
  if (error) return err(UNAVAILABLE)
  const rows = (data ?? []) as unknown as RosterRow[]
  return ok({
    students: rows.slice(0, ROSTER_PAGE_SIZE).map(toRosterStudent),
    hasMore: rows.length > ROSTER_PAGE_SIZE,
  })
}

export async function getRosterStudent(
  supabase: AcadigmaSupabaseClient,
  ctx: WorkspaceContext,
  studentId: string
): Promise<Result<RosterStudent, ApiError>> {
  const { data, error } = await supabase
    .from("student_roster")
    .select(ROSTER_COLUMNS)
    .eq("workspace_id", ctx.workspaceId)
    .eq("id", studentId)
    .is("deleted_at", null)
    // Mid-promotion a student has an enrolment in two years: show the higher class.
    .order("grade_level_number", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()
  if (error) return err(UNAVAILABLE)
  if (!data) return err(apiError("not_found", "That student was not found."))
  return ok(toRosterStudent(data as unknown as RosterRow))
}

/**
 * §5.14: date of birth and guardians. `null` when RLS hides them — the
 * caller is neither owner/admin nor the student's class teacher — so the
 * page renders a locked block (acceptance criterion 7).
 */
export async function getStudentPrivate(
  supabase: AcadigmaSupabaseClient,
  ctx: WorkspaceContext,
  studentId: string
): Promise<Result<StudentPrivate | null, ApiError>> {
  const [details, guardians] = await Promise.all([
    supabase
      .from("student_private_details")
      .select("date_of_birth")
      .eq("workspace_id", ctx.workspaceId)
      .eq("student_id", studentId)
      .maybeSingle(),
    supabase
      .from("guardians")
      .select("id, relation, full_name, full_name_bn, phone, is_primary")
      .eq("workspace_id", ctx.workspaceId)
      .eq("student_id", studentId)
      .order("is_primary", { ascending: false })
      .order("created_at"),
  ])
  if (details.error || guardians.error) return err(UNAVAILABLE)
  if (!details.data) return ok(null)
  return ok({
    dateOfBirth: details.data.date_of_birth,
    guardians: (guardians.data ?? []).map((g): Guardian => ({
      id: g.id,
      relation: g.relation,
      fullName: g.full_name,
      fullNameBn: g.full_name_bn,
      phone: g.phone,
      isPrimary: g.is_primary,
    })),
  })
}

const ADMIT_ERRORS: Record<string, ApiError> = {
  FORBIDDEN: apiError(
    "forbidden",
    "Only an owner or admin can admit students."
  ),
  SECTION_NOT_FOUND: apiError("not_found", "That section was not found.", {
    fieldErrors: { sectionId: ["SECTION_NOT_FOUND"] },
  }),
  SECTION_ARCHIVED: apiError("validation_failed", "That section is archived.", {
    fieldErrors: { sectionId: ["SECTION_ARCHIVED"] },
  }),
  YEAR_CLOSED: apiError(
    "validation_failed",
    "That section is not in the current academic year.",
    { fieldErrors: { sectionId: ["YEAR_CLOSED"] } }
  ),
  ROLL_TAKEN: apiError(
    "conflict",
    "That roll number is taken in this section.",
    {
      fieldErrors: { rollNumber: ["ROLL_TAKEN"] },
    }
  ),
  IDEMPOTENCY_KEY_REUSED: apiError(
    "conflict",
    "This form was already submitted with different details. Please reload."
  ),
  VALIDATION: apiError(
    "validation_failed",
    "Some of the details you entered are not valid."
  ),
}

/** §4.1 quick admit: `public.admit_student` does it all in one transaction. */
export async function admitStudent(
  supabase: AcadigmaSupabaseClient,
  ctx: WorkspaceContext,
  input: QuickAdmitInput
): Promise<Result<QuickAdmitResult, ApiError>> {
  const { data, error } = await supabase.rpc("admit_student", {
    p_workspace_id: ctx.workspaceId,
    p_input: {
      idempotency_key: input.idempotencyKey,
      first_name: input.firstName,
      last_name: input.lastName,
      full_name_bn: input.fullNameBn ?? null,
      gender: input.gender,
      date_of_birth: input.dateOfBirth,
      section_id: input.sectionId,
      roll_number: input.rollNumber ?? null,
      guardian: {
        relation: input.guardian.relation,
        full_name: input.guardian.fullName,
        full_name_bn: input.guardian.fullNameBn ?? null,
        phone: input.guardian.phone,
      },
    },
  })
  if (error) {
    const known = Object.hasOwn(ADMIT_ERRORS, error.message)
      ? ADMIT_ERRORS[error.message]
      : undefined
    return err(known ?? UNAVAILABLE)
  }
  const row = data as {
    student_id: string
    student_code: string
    roll_number: number
  }
  return ok({
    studentId: row.student_id,
    studentCode: row.student_code,
    rollNumber: row.roll_number,
  })
}
