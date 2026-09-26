/**
 * F-AC-06 Part 4 (D-307) against a real local PostgREST (D-73's
 * `db-integration` job): the new `exam_subjects` columns in `getExam`'s and
 * `getMarkSheet`'s embeds, and the new RPCs' parameter names —
 * `save_marks`'s `late_reason`, `submit_exam_subject`, `lock_exam_subject`,
 * `unlock_exam_subject` — as a signed-in owner. The rules themselves are
 * pinned in `supabase/tests/57_marks_submit_lock.sql`.
 *
 * Opt-in, like `academics.integration.test.ts`: DB_LOCAL_SUPABASE=1 with
 * DB_LOCAL_SUPABASE_ANON_KEY / _SERVICE_KEY from `supabase status`.
 */
import { randomUUID } from "node:crypto"

import { createClient } from "@supabase/supabase-js"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createExam, getExam, setExamStatus, updateExamSubject } from "./exams"
import {
  getMarkSheet,
  lockExamSubject,
  saveMarks,
  submitExamSubject,
  unlockExamSubject,
} from "./marks"
import { createSchoolWorkspace } from "./school"

import type { AcadigmaSupabaseClient } from "../client"
import type { Database } from "../types.generated"
import type { WorkspaceContext } from "../workspace-context"

const URL = process.env.DB_LOCAL_SUPABASE_URL ?? "http://127.0.0.1:54321"
const ANON_KEY = process.env.DB_LOCAL_SUPABASE_ANON_KEY
const SERVICE_KEY = process.env.DB_LOCAL_SUPABASE_SERVICE_KEY
const RUN = process.env.DB_LOCAL_SUPABASE === "1" && !!ANON_KEY && !!SERVICE_KEY

/** The school's calendar day (Asia/Dhaka), shifted by `days`. */
function dhakaDay(days: number): string {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
  }).format(new Date())
  const d = new Date(`${today}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

describe.skipIf(!RUN)(
  "marks submit / lock / unlock / entry window (local Supabase, opt-in)",
  () => {
    let serviceClient: AcadigmaSupabaseClient
    let userClient: AcadigmaSupabaseClient
    let ctx: WorkspaceContext
    let userId: string
    let memberId: string
    let examId: string
    let paperId: string
    let studentId: string

    beforeAll(async () => {
      const anonKey = ANON_KEY as string
      serviceClient = createClient<Database>(URL, SERVICE_KEY as string, {
        auth: { persistSession: false },
      })
      const email = `d307-${randomUUID()}@test.local`
      const password = `Pw-${randomUUID()}-Aa1`
      const { data: created, error: createError } =
        await serviceClient.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: "Marks Owner" },
        })
      if (createError || !created.user) throw createError ?? new Error("user")
      userId = created.user.id

      const anonClient = createClient<Database>(URL, anonKey)
      const { data: session, error: signInError } =
        await anonClient.auth.signInWithPassword({ email, password })
      if (signInError || !session.session) {
        throw signInError ?? new Error("session")
      }
      userClient = createClient<Database>(URL, anonKey, {
        global: {
          headers: { Authorization: `Bearer ${session.session.access_token}` },
        },
      })

      const school = await createSchoolWorkspace(userClient, {
        name: "D-307 Marks School",
        board: "dhaka",
        medium: "bangla",
        timezone: "Asia/Dhaka",
        working_days: [6, 7, 1, 2, 3, 4],
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
      if (!school.ok) throw new Error(JSON.stringify(school.error))
      const workspaceId = school.data.workspaceId
      ctx = {
        workspaceId,
        userId,
        role: "owner",
        workspaceType: "school",
        plan: null,
      }

      const { data: member } = await serviceClient
        .from("workspace_members")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("user_id", userId)
        .single()
      const { data: grade } = await serviceClient
        .from("grade_levels")
        .select("id")
        .eq("workspace_id", workspaceId)
        .single()
      const { data: year } = await serviceClient
        .from("academic_years")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("is_current", true)
        .single()
      if (!member || !grade || !year) throw new Error("fixture lookups")
      memberId = member.id

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
      const { data: subject, error: subjectError } = await serviceClient
        .from("subjects")
        .insert({
          workspace_id: workspaceId,
          name: "Mathematics",
          created_by: userId,
        })
        .select("id")
        .single()
      if (subjectError || !subject) throw subjectError
      const { data: student, error: studentError } = await serviceClient
        .from("students")
        .insert({
          workspace_id: workspaceId,
          student_code: `D307-${randomUUID().slice(0, 8)}`,
          first_name: "Ayaan",
          last_name: "Rahman",
          gender: "male",
        })
        .select("id")
        .single()
      if (studentError || !student) throw studentError
      studentId = student.id
      const { error: enrolError } = await serviceClient
        .from("enrollments")
        .insert({
          workspace_id: workspaceId,
          student_id: studentId,
          academic_year_id: year.id,
          section_id: section.id,
          roll_number: 1,
        })
      if (enrolError) throw enrolError

      const { error: scaleError } = await userClient.rpc(
        "seed_bd_grade_scale",
        { p_workspace_id: workspaceId }
      )
      if (scaleError) throw scaleError
      const exam = await createExam(ctx, userClient, {
        academicYearId: year.id,
        name: "Half-Yearly 2026",
        examType: "term_final",
        startsOn: null,
        endsOn: null,
        sectionIds: [section.id],
        subjectIds: [subject.id],
        fullMarks: 50,
      })
      if (!exam.ok) throw new Error(JSON.stringify(exam.error))
      examId = exam.data.examId
      for (const status of [
        "scheduled",
        "in_progress",
        "marks_entry",
      ] as const) {
        const moved = await setExamStatus(ctx, userClient, { examId, status })
        if (!moved.ok) throw new Error(JSON.stringify(moved.error))
      }
    }, 60_000)

    afterAll(async () => {
      if (ctx?.workspaceId) {
        await serviceClient
          .from("workspaces")
          .delete()
          .eq("id", ctx.workspaceId)
      }
      if (userId) await serviceClient.auth.admin.deleteUser(userId)
    })

    it("getExam embeds the new paper columns", async () => {
      const exam = await getExam(ctx, userClient, examId)
      expect(exam.ok).toBe(true)
      if (!exam.ok) return
      const paper = exam.data.papers[0]
      expect(paper).toMatchObject({
        entryOpensOn: null,
        entryClosesOn: null,
        statusReason: null,
        status: "pending",
      })
      paperId = paper?.id ?? ""
    })

    it("a late save needs a reason; the window reaches the mark sheet", async () => {
      const examDate = dhakaDay(-10)
      const updated = await updateExamSubject(ctx, userClient, {
        id: paperId,
        examDate,
        fullMarks: 50,
        passMarks: 16.5,
        teacherId: memberId,
      })
      expect(updated.ok).toBe(true)

      const sheet = await getMarkSheet(ctx, userClient, paperId)
      expect(sheet.ok && sheet.data).toMatchObject({
        entryOpensOn: examDate,
        entryClosesOn: dhakaDay(-3),
        canSubmit: true,
      })

      const entries = [
        {
          studentId,
          status: "entered" as const,
          obtained: 40,
          expectedUpdatedAt: null,
        },
      ]
      const refused = await saveMarks(ctx, userClient, {
        idempotencyKey: randomUUID(),
        examSubjectId: paperId,
        entries,
      })
      expect(!refused.ok && refused.error.fieldErrors?._root).toEqual([
        "REASON_REQUIRED",
      ])
      const saved = await saveMarks(ctx, userClient, {
        idempotencyKey: randomUUID(),
        examSubjectId: paperId,
        entries,
        lateReason: "Script found late",
      })
      expect(saved.ok && saved.data.saved).toBe(1)
    })

    it("submit, lock and unlock round-trip through real PostgREST", async () => {
      expect(await submitExamSubject(ctx, userClient, paperId, false)).toEqual({
        ok: true,
        data: { submitted: true, missing: [] },
      })
      expect(await lockExamSubject(ctx, userClient, paperId)).toEqual({
        ok: true,
        data: undefined,
      })
      const again = await lockExamSubject(ctx, userClient, paperId)
      expect(!again.ok && again.error.fieldErrors?._root).toEqual([
        "ALREADY_LOCKED",
      ])
      expect(
        await unlockExamSubject(ctx, userClient, paperId, "Wrong mark")
      ).toEqual({ ok: true, data: undefined })

      const exam = await getExam(ctx, userClient, examId)
      expect(exam.ok && exam.data.papers[0]).toMatchObject({
        status: "submitted",
        statusReason: "Wrong mark",
        marksDone: 1,
        enrolled: 1,
      })
    })
  }
)
