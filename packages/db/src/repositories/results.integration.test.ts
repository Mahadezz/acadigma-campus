/**
 * Security audit Part 1 (D-75): `listPublishCandidates` selected every
 * `results` row of an exam in one PostgREST request. PostgREST caps a
 * response at `max_rows` (supabase/config.toml, 1000) with no error, so in
 * a school with more than 1,000 students in one exam the publish sheet
 * silently lost students — and the owner could not withhold a result that
 * the sheet never showed. pgTAP runs without PostgREST, so only a real
 * stack sees this (same reasoning as attendance-register.integration.test.ts).
 *
 * Results are made through the real path: marks via `save_marks`, paper
 * submitted and locked, exam moved to marks_locked, `compute_results`.
 *
 * Opt-in locally (`supabase start`, then DB_LOCAL_SUPABASE=1 and the two
 * keys from `supabase status`); CI's `db-integration` job runs it.
 */
import { randomUUID } from "node:crypto"

import { createClient } from "@supabase/supabase-js"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createExam, getExam, setExamStatus } from "./exams"
import { lockExamSubject, saveMarks, submitExamSubject } from "./marks"
import { computeResults, listPublishCandidates } from "./results"
import { createSchoolWorkspace } from "./school"

import type { AcadigmaSupabaseClient } from "../client"
import type { Database } from "../types.generated"
import type { WorkspaceContext } from "../workspace-context"

const URL = process.env.DB_LOCAL_SUPABASE_URL ?? "http://127.0.0.1:54321"
const ANON_KEY = process.env.DB_LOCAL_SUPABASE_ANON_KEY
const SERVICE_KEY = process.env.DB_LOCAL_SUPABASE_SERVICE_KEY
const RUN = process.env.DB_LOCAL_SUPABASE === "1" && !!ANON_KEY && !!SERVICE_KEY

// Past PostgREST's 1,000-row max_rows.
const STUDENT_COUNT = 1005

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size))
  return out
}

describe.skipIf(!RUN)(
  "listPublishCandidates past max_rows (local Supabase + real PostgREST, D-75)",
  () => {
    let serviceClient: AcadigmaSupabaseClient
    let userClient: AcadigmaSupabaseClient
    let ctx: WorkspaceContext
    let userId: string
    let examId: string

    beforeAll(async () => {
      serviceClient = createClient<Database>(URL, SERVICE_KEY as string, {
        auth: { persistSession: false },
      })
      const email = `d75-publish-${randomUUID()}@test.local`
      const password = `Pw-${randomUUID()}-Aa1`
      const { data: created, error: createError } =
        await serviceClient.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: "Publish Owner" },
        })
      if (createError || !created.user) throw createError
      userId = created.user.id
      const anonClient = createClient<Database>(URL, ANON_KEY as string)
      const { data: session, error: signInError } =
        await anonClient.auth.signInWithPassword({ email, password })
      if (signInError || !session.session) throw signInError
      userClient = createClient<Database>(URL, ANON_KEY as string, {
        global: {
          headers: { Authorization: `Bearer ${session.session.access_token}` },
        },
      })

      const school = await createSchoolWorkspace(userClient, {
        name: "D-75 Publish Sheet School",
        board: "dhaka",
        medium: "bangla",
        timezone: "Asia/Dhaka",
        working_days: [1, 2, 3, 4, 5, 6, 7],
        academic_year: {
          name: "2026",
          starts_on: "2026-01-01",
          ends_on: "2026-12-31",
        },
        grade_levels: [
          {
            name: "Class 9",
            name_bn: "নবম শ্রেণি",
            level_number: 9,
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
      if (!grade || !year) throw new Error("fixture lookups")

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
        .insert({ workspace_id: workspaceId, name: "Bangla", created_by: userId })
        .select("id")
        .single()
      if (subjectError || !subject) throw subjectError

      const studentIds: string[] = []
      const numbers = Array.from({ length: STUDENT_COUNT }, (_, i) => i + 1)
      for (const part of chunks(numbers, 500)) {
        const { data: students, error } = await serviceClient
          .from("students")
          .insert(
            part.map((n) => ({
              workspace_id: workspaceId,
              student_code: `D75-${n}`,
              first_name: "Student",
              last_name: `No${n}`,
              gender: "female" as const,
            }))
          )
          .select("id, student_code")
        if (error || !students) throw error
        const { error: enrolError } = await serviceClient
          .from("enrollments")
          .insert(
            students.map((s) => ({
              workspace_id: workspaceId,
              student_id: s.id,
              academic_year_id: year.id,
              section_id: section.id,
              roll_number: Number(s.student_code.replace("D75-", "")),
            }))
          )
        if (enrolError) throw enrolError
        studentIds.push(...students.map((s) => s.id))
      }

      const { error: scaleError } = await userClient.rpc(
        "seed_bd_grade_scale",
        { p_workspace_id: workspaceId }
      )
      if (scaleError) throw scaleError
      const exam = await createExam(ctx, userClient, {
        academicYearId: year.id,
        name: "Annual 2026",
        examType: "term_final",
        startsOn: null,
        endsOn: null,
        sectionIds: [section.id],
        subjectIds: [subject.id],
        fullMarks: 100,
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

      const detail = await getExam(ctx, userClient, examId)
      if (!detail.ok) throw new Error(JSON.stringify(detail.error))
      const paperId = detail.data.papers[0]!.id
      for (const part of chunks(studentIds, 300)) {
        const saved = await saveMarks(ctx, userClient, {
          idempotencyKey: randomUUID(),
          examSubjectId: paperId,
          entries: part.map((studentId) => ({
            studentId,
            status: "entered" as const,
            obtained: 60,
            expectedUpdatedAt: null,
          })),
        })
        if (!saved.ok) throw new Error(JSON.stringify(saved.error))
      }
      const submitted = await submitExamSubject(ctx, userClient, paperId, false)
      if (!submitted.ok || !submitted.data.submitted)
        throw new Error("submit failed")
      const locked = await lockExamSubject(ctx, userClient, paperId)
      if (!locked.ok) throw new Error(JSON.stringify(locked.error))
      const moved = await setExamStatus(ctx, userClient, {
        examId,
        status: "marks_locked",
      })
      if (!moved.ok) throw new Error(JSON.stringify(moved.error))
      const computed = await computeResults(ctx, userClient, examId)
      if (!computed.ok) throw new Error(JSON.stringify(computed.error))
    }, 180_000)

    afterAll(async () => {
      if (ctx?.workspaceId) {
        await serviceClient
          .from("workspaces")
          .delete()
          .eq("id", ctx.workspaceId)
      }
      if (userId) await serviceClient.auth.admin.deleteUser(userId)
    })

    it("lists every student with a result, not the first 1,000", async () => {
      const { count } = await serviceClient
        .from("results")
        .select("id", { count: "exact", head: true })
        .eq("exam_id", examId)
      expect(count).toBe(STUDENT_COUNT)

      const candidates = await listPublishCandidates(ctx, userClient, examId)
      expect(candidates.ok).toBe(true)
      if (!candidates.ok) return
      expect(candidates.data).toHaveLength(STUDENT_COUNT)
      expect(new Set(candidates.data.map((c) => c.studentId)).size).toBe(
        STUDENT_COUNT
      )
      // Still in roll order after paging.
      expect(candidates.data.at(-1)?.rollNumber).toBe(STUDENT_COUNT)
    })
  }
)
