/**
 * F-OP-03 Part 6 review (D-208 BLOCKER fix): `getAttendanceRegister` used to
 * select `attendance_records` directly through PostgREST, which caps any
 * single response at `max_rows` (supabase/config.toml, 1000) — a 40-student
 * x 31-day month is already 1,240 records, so real PostgREST silently
 * dropped ~240 of them with no error anywhere. pgTAP's `db` job runs bare
 * `postgres:17` with no PostgREST in front of it at all
 * (`academics.integration.test.ts`'s own header comment), so it cannot see
 * this class of bug — `45_attendance_register.sql` proves the SQL function
 * itself has no cap, and this test proves the same thing end to end through
 * a REAL PostgREST, exercising the actual `getAttendanceRegister` repository
 * function a teacher's request runs.
 *
 * Opt-in, same philosophy as `academics.integration.test.ts` — needs a local
 * Supabase stack (`supabase start`), then:
 *
 *   DB_LOCAL_SUPABASE=1 \
 *   DB_LOCAL_SUPABASE_ANON_KEY=<ANON_KEY> \
 *   DB_LOCAL_SUPABASE_SERVICE_KEY=<SERVICE_ROLE_KEY> \
 *   pnpm --filter @acadigma/db test
 *
 * Wired into CI's `db-integration` job (real `supabase start` + PostgREST),
 * which discovers every `*.integration.test.ts` automatically.
 */
import { randomUUID } from "node:crypto"

import { createClient } from "@supabase/supabase-js"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { getAttendanceRegister } from "./attendance-register"
import { createSchoolWorkspace } from "./school"

import type { AcadigmaSupabaseClient } from "../client"
import type { Database } from "../types.generated"
import type { WorkspaceContext } from "../workspace-context"

const URL = process.env.DB_LOCAL_SUPABASE_URL ?? "http://127.0.0.1:54321"
const ANON_KEY = process.env.DB_LOCAL_SUPABASE_ANON_KEY
const SERVICE_KEY = process.env.DB_LOCAL_SUPABASE_SERVICE_KEY
const RUN = process.env.DB_LOCAL_SUPABASE === "1" && !!ANON_KEY && !!SERVICE_KEY

const STUDENT_COUNT = 40
// January: 31 calendar days, all working (working_days below is every day
// of the week), so 40 x 31 = 1,240 attendance_records — comfortably past
// PostgREST's 1,000-row max_rows.
const MONTH = "2026-01"

describe.skipIf(!RUN)(
  "getAttendanceRegister (local Supabase + real PostgREST, opt-in, D-208)",
  () => {
    let serviceClient: AcadigmaSupabaseClient
    let userClient: AcadigmaSupabaseClient
    let ctx: WorkspaceContext
    let userId: string
    let sectionId: string

    beforeAll(async () => {
      const anonKey = ANON_KEY as string
      serviceClient = createClient<Database>(URL, SERVICE_KEY as string, {
        auth: { persistSession: false },
      })

      const email = `d208-register-${randomUUID()}@test.local`
      const password = `Pw-${randomUUID()}-Aa1`
      const { data: created, error: createError } =
        await serviceClient.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: "Register Owner" },
        })
      if (createError || !created.user) {
        throw createError ?? new Error("createUser returned no user")
      }
      userId = created.user.id

      const anonClient = createClient<Database>(URL, anonKey)
      const { data: session, error: signInError } =
        await anonClient.auth.signInWithPassword({ email, password })
      if (signInError || !session.session) {
        throw signInError ?? new Error("sign-in returned no session")
      }
      userClient = createClient<Database>(URL, anonKey, {
        global: {
          headers: { Authorization: `Bearer ${session.session.access_token}` },
        },
      })

      const school = await createSchoolWorkspace(userClient, {
        name: "D-208 Register Regression School",
        board: "dhaka",
        medium: "bangla",
        timezone: "Asia/Dhaka",
        // Every day a working day: no calendar edge case can make a January
        // 2026 date a non-school day.
        working_days: [1, 2, 3, 4, 5, 6, 7],
        academic_year: {
          name: "2026",
          starts_on: "2026-01-01",
          ends_on: "2026-12-31",
        },
        grade_levels: [
          {
            name: "Class 6",
            name_bn: "ষষ্ঠ শ্রেণি",
            level_number: 6,
            stage: "secondary",
          },
        ],
        idempotency_key: randomUUID(),
      })
      if (!school.ok) {
        throw new Error(
          `createSchoolWorkspace failed: ${JSON.stringify(school.error)}`
        )
      }
      const workspaceId = school.data.workspaceId

      const { data: grade, error: gradeError } = await serviceClient
        .from("grade_levels")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("name", "Class 6")
        .single()
      if (gradeError || !grade) throw gradeError ?? new Error("no grade level")

      const { data: year, error: yearError } = await serviceClient
        .from("academic_years")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("is_current", true)
        .single()
      if (yearError || !year) throw yearError ?? new Error("no academic year")

      const { data: section, error: sectionError } = await serviceClient
        .from("sections")
        .insert({
          workspace_id: workspaceId,
          academic_year_id: year.id,
          grade_level_id: grade.id,
          name: "A",
          created_by: userId,
        })
        .select("id")
        .single()
      if (sectionError || !section) throw sectionError
      sectionId = section.id

      const studentRows = Array.from({ length: STUDENT_COUNT }, (_, i) => ({
        workspace_id: workspaceId,
        student_code: `D208-R${i + 1}`,
        first_name: "Student",
        last_name: `No${i + 1}`,
        gender: "male" as const,
      }))
      const { data: students, error: studentsError } = await serviceClient
        .from("students")
        .insert(studentRows)
        .select("id, student_code")
      if (studentsError || !students) throw studentsError

      const enrollmentRows = students.map((s) => ({
        workspace_id: workspaceId,
        student_id: s.id,
        academic_year_id: year.id,
        section_id: sectionId,
        roll_number: Number(s.student_code.replace("D208-R", "")),
        enrolled_on: "2025-12-01",
      }))
      const { data: enrollments, error: enrollmentsError } = await serviceClient
        .from("enrollments")
        .insert(enrollmentRows)
        .select("id, student_id")
      if (enrollmentsError || !enrollments) throw enrollmentsError

      const days = Array.from(
        { length: 31 },
        (_, i) => `2026-01-${String(i + 1).padStart(2, "0")}`
      )
      const { data: sessions, error: sessionsError } = await serviceClient
        .from("attendance_sessions")
        .insert(
          days.map((date) => ({
            workspace_id: workspaceId,
            section_id: sectionId,
            academic_year_id: year.id,
            date,
            expected_count: STUDENT_COUNT,
            present_count: STUDENT_COUNT,
          }))
        )
        .select("id, date")
      if (sessionsError || !sessions) throw sessionsError

      const recordRows = sessions.flatMap((session) =>
        enrollments.map((e) => ({
          workspace_id: workspaceId,
          session_id: session.id,
          student_id: e.student_id,
          enrollment_id: e.id,
          status: "present" as const,
        }))
      )
      // 31 sessions x 40 students = 1,240 rows: past PostgREST's max_rows.
      const { error: recordsError } = await serviceClient
        .from("attendance_records")
        .insert(recordRows)
      if (recordsError) throw recordsError

      ctx = {
        workspaceId,
        userId,
        role: "owner",
        workspaceType: "school",
        plan: null,
      }
    }, 60_000)

    afterAll(async () => {
      if (ctx?.workspaceId) {
        await serviceClient
          .from("workspaces")
          .delete()
          .eq("id", ctx.workspaceId)
      }
      if (userId) {
        await serviceClient.auth.admin.deleteUser(userId)
      }
    })

    it("returns every attendance record for the month through real PostgREST, not capped at 1,000", async () => {
      const result = await getAttendanceRegister(
        userClient,
        ctx,
        sectionId,
        MONTH
      )
      expect(result.ok).toBe(true)
      if (!result.ok) return

      expect(result.data.students).toHaveLength(STUDENT_COUNT)
      expect(result.data.days).toHaveLength(31)
      expect(result.data.totalSchoolDays).toBe(31)
      expect(result.data.incompleteDaysCount).toBe(0)

      const totalRecordedDays = result.data.students.reduce(
        (sum, s) => sum + s.recordedDays,
        0
      )
      // The bug this regresses: PostgREST's max_rows silently dropped rows
      // past 1,000, so this would have been <= 1,000 - some remainder
      // instead of the true 1,240.
      expect(totalRecordedDays).toBe(STUDENT_COUNT * 31)
      expect(totalRecordedDays).toBeGreaterThan(1000)

      for (const student of result.data.students) {
        expect(student.recordedDays).toBe(31)
        expect(student.presentEquivalent).toBe(31)
        expect(student.percent).toBe(100)
        expect(student.cells.every((c) => c === "present")).toBe(true)
      }
    })
  }
)
