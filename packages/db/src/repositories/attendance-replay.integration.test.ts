/**
 * F-ID-11 Part 2a (D-309): what the offline outbox relies on, proven end to
 * end through a REAL PostgREST and the unchanged `save_attendance` — the same
 * `saveAttendance` repository call the replayed server action makes.
 *
 * - A replay of a save that already landed (the reply was lost) returns the
 *   stored result: one session, one set of records, no duplicate.
 * - A replay whose base version is stale (a colleague saved meanwhile) comes
 *   back as CONFLICT and overwrites nothing.
 * - The same key with a different payload is IDEMPOTENCY_KEY_REUSED, never a
 *   silent second write.
 * - D-310: `capturedAt` reaches `save_attendance` through PostgREST — the
 *   row is stamped `queued_offline`; a TEACHER's roll taken offline four
 *   days ago in its window lands late (`synced_late`), the same roll without
 *   `capturedAt` is refused, and the late path never edits a register.
 *
 * Opt-in, like the other `*.integration.test.ts` (CI's `db-integration` job
 * runs it against `supabase start`); locally:
 *
 *   DB_LOCAL_SUPABASE=1 \
 *   DB_LOCAL_SUPABASE_ANON_KEY=<ANON_KEY> \
 *   DB_LOCAL_SUPABASE_SERVICE_KEY=<SERVICE_ROLE_KEY> \
 *   pnpm exec vitest run packages/db/src/repositories/attendance-replay.integration.test.ts
 */
import { randomUUID } from "node:crypto"

import { createClient } from "@supabase/supabase-js"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import type { SaveAttendanceInput } from "@acadigma/contracts"

import { saveAttendance } from "./attendance"
import { createSchoolWorkspace } from "./school"

import type { AcadigmaSupabaseClient } from "../client"
import type { Database } from "../types.generated"
import type { WorkspaceContext } from "../workspace-context"

const URL = process.env.DB_LOCAL_SUPABASE_URL ?? "http://127.0.0.1:54321"
const ANON_KEY = process.env.DB_LOCAL_SUPABASE_ANON_KEY
const SERVICE_KEY = process.env.DB_LOCAL_SUPABASE_SERVICE_KEY
const RUN = process.env.DB_LOCAL_SUPABASE === "1" && !!ANON_KEY && !!SERVICE_KEY

/** Today in the school's time zone: always inside the edit window. */
const dhaka = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(d)
const TODAY = dhaka(new Date())
/** A school day `n` days back, and 10:00 on it in Dhaka (UTC+6). */
const daysAgo = (n: number) => dhaka(new Date(Date.now() - n * 86_400_000))
const tenAm = (date: string) => new Date(`${date}T04:00:00Z`).toISOString()
const YEAR = TODAY.slice(0, 4)

describe.skipIf(!RUN)(
  "offline replay of save_attendance (local Supabase + real PostgREST, D-309)",
  () => {
    let serviceClient: AcadigmaSupabaseClient
    let userClient: AcadigmaSupabaseClient
    let ctx: WorkspaceContext
    let userId: string
    let sectionId: string
    let studentIds: string[]
    let teacherClient: AcadigmaSupabaseClient
    let teacherId: string
    let teacherCtx: WorkspaceContext

    beforeAll(async () => {
      serviceClient = createClient<Database>(URL, SERVICE_KEY as string, {
        auth: { persistSession: false },
      })
      const email = `d309-replay-${randomUUID()}@test.local`
      const password = `Pw-${randomUUID()}-Aa1`
      const { data: created, error: createError } =
        await serviceClient.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: "Replay Owner" },
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

      const school = await createSchoolWorkspace(
        userClient,
        {
          name: "D-309 Replay School",
          board: "dhaka",
          medium: "bangla",
          timezone: "Asia/Dhaka",
          working_days: [1, 2, 3, 4, 5, 6, 7],
          academic_year: {
            name: YEAR,
            starts_on: `${YEAR}-01-01`,
            ends_on: `${YEAR}-12-31`,
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
        },
        "2026-09-30-interim"
      )
      if (!school.ok) throw new Error(JSON.stringify(school.error))
      const workspaceId = school.data.workspaceId

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
      if (!grade || !year) throw new Error("no grade level or year")

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

      const { data: students, error: studentsError } = await serviceClient
        .from("students")
        .insert(
          [1, 2, 3].map((n) => ({
            workspace_id: workspaceId,
            student_code: `D309-${n}`,
            first_name: "Student",
            last_name: `No${n}`,
            gender: "female" as const,
          }))
        )
        .select("id")
      if (studentsError || !students) throw studentsError
      studentIds = students.map((s) => s.id)

      const { error: enrollError } = await serviceClient
        .from("enrollments")
        .insert(
          students.map((s, i) => ({
            workspace_id: workspaceId,
            student_id: s.id,
            academic_year_id: year.id,
            section_id: sectionId,
            roll_number: i + 1,
            enrolled_on: `${YEAR}-01-01`,
          }))
        )
      if (enrollError) throw enrollError

      ctx = {
        workspaceId,
        userId,
        role: "owner",
        workspaceType: "school",
        plan: null,
      }

      // A teacher of the school: the edit window binds them, not the owner.
      const teacherEmail = `d310-teacher-${randomUUID()}@test.local`
      const { data: teacher, error: teacherError } =
        await serviceClient.auth.admin.createUser({
          email: teacherEmail,
          password,
          email_confirm: true,
          user_metadata: { full_name: "Late Teacher" },
        })
      if (teacherError || !teacher.user) throw teacherError
      teacherId = teacher.user.id
      const { error: memberError } = await serviceClient
        .from("workspace_members")
        .insert({
          workspace_id: workspaceId,
          user_id: teacherId,
          role: "teacher",
          status: "active",
        })
      if (memberError) throw memberError
      const { data: teacherSession, error: teacherSignIn } =
        await createClient<Database>(
          URL,
          ANON_KEY as string
        ).auth.signInWithPassword({ email: teacherEmail, password })
      if (teacherSignIn || !teacherSession.session) throw teacherSignIn
      teacherClient = createClient<Database>(URL, ANON_KEY as string, {
        global: {
          headers: {
            Authorization: `Bearer ${teacherSession.session.access_token}`,
          },
        },
      })
      teacherCtx = { ...ctx, userId: teacherId, role: "teacher" }
    }, 60_000)

    afterAll(async () => {
      if (ctx?.workspaceId) {
        await serviceClient
          .from("workspaces")
          .delete()
          .eq("id", ctx.workspaceId)
      }
      if (userId) await serviceClient.auth.admin.deleteUser(userId)
      if (teacherId) await serviceClient.auth.admin.deleteUser(teacherId)
    })

    const input = (
      key: string,
      statuses: ("present" | "absent")[],
      expectedUpdatedAt: string | null,
      date = TODAY
    ): SaveAttendanceInput => ({
      idempotencyKey: key,
      sectionId,
      date,
      records: studentIds.map((studentId, i) => ({
        studentId,
        status: statuses[i]!,
      })),
      bulkMarked: false,
      allowNonSchoolDay: false,
      expectedUpdatedAt,
    })

    async function sessions() {
      const { data } = await serviceClient
        .from("attendance_sessions")
        .select("id, updated_at, absent_count")
        .eq("section_id", sectionId)
        .eq("date", TODAY)
      return data ?? []
    }

    it("a replayed save returns the stored result and writes nothing twice", async () => {
      const save = input(randomUUID(), ["present", "absent", "present"], null)
      const first = await saveAttendance(userClient, ctx, save)
      expect(first.ok).toBe(true)
      // The reply was lost; the outbox sends the very same item again.
      const replayed = await saveAttendance(userClient, ctx, save)
      expect(replayed).toEqual(first)
      const rows = await sessions()
      expect(rows).toHaveLength(1)
      const { count } = await serviceClient
        .from("attendance_records")
        .select("id", { count: "exact", head: true })
        .eq("session_id", rows[0]!.id)
      expect(count).toBe(3)
    })

    it("a replay on a stale base is CONFLICT and overwrites nothing", async () => {
      const [loaded] = await sessions()
      // A colleague saves online, after the teacher loaded the class.
      const colleague = await saveAttendance(
        userClient,
        ctx,
        input(randomUUID(), ["absent", "absent", "absent"], loaded!.updated_at)
      )
      expect(colleague.ok).toBe(true)
      // The teacher's offline roll call replays against the version she loaded.
      const replay = await saveAttendance(
        userClient,
        ctx,
        input(
          randomUUID(),
          ["present", "present", "present"],
          loaded!.updated_at
        )
      )
      expect(!replay.ok && replay.error.fieldErrors?._root).toEqual([
        "CONFLICT",
      ])
      const [after] = await sessions()
      expect(after!.absent_count).toBe(3)
    })

    it("the same key with a different payload is refused, not a second write", async () => {
      const [current] = await sessions()
      const key = randomUUID()
      const first = await saveAttendance(
        userClient,
        ctx,
        input(key, ["present", "present", "absent"], current!.updated_at)
      )
      expect(first.ok).toBe(true)
      if (!first.ok) return
      const reused = await saveAttendance(
        userClient,
        ctx,
        input(key, ["absent", "present", "absent"], first.data.updatedAt)
      )
      expect(reused.ok).toBe(false)
      expect(!reused.ok && reused.error.message).toMatch(/already submitted/)
      const [after] = await sessions()
      expect(after!.absent_count).toBe(1)
    })

    async function sessionOn(date: string) {
      const { data } = await serviceClient
        .from("attendance_sessions")
        .select("id, captured_at, queued_offline, synced_late")
        .eq("section_id", sectionId)
        .eq("date", date)
      return data ?? []
    }

    it("a queued save's capturedAt reaches the row: queued_offline, no late stamp (D-310)", async () => {
      const date = daysAgo(1)
      const capturedAt = new Date(Date.now() - 60_000).toISOString()
      const saved = await saveAttendance(teacherClient, teacherCtx, {
        ...input(randomUUID(), ["present", "present", "present"], null, date),
        capturedAt,
      })
      expect(saved.ok).toBe(true)
      const [row] = await sessionOn(date)
      expect(row).toMatchObject({ queued_offline: true, synced_late: false })
      expect(Date.parse(row!.captured_at!)).toBe(Date.parse(capturedAt))
    })

    it("a teacher's roll taken offline 4 days ago lands late; without capturedAt it is refused (§5.3)", async () => {
      const date = daysAgo(4)
      const refused = await saveAttendance(
        teacherClient,
        teacherCtx,
        input(randomUUID(), ["absent", "present", "present"], null, date)
      )
      expect(!refused.ok && refused.error.fieldErrors?._root).toEqual([
        "OUTSIDE_EDIT_WINDOW",
      ])
      const late = await saveAttendance(teacherClient, teacherCtx, {
        ...input(randomUUID(), ["absent", "present", "present"], null, date),
        capturedAt: tenAm(date),
      })
      expect(late.ok).toBe(true)
      const [row] = await sessionOn(date)
      expect(row).toMatchObject({ synced_late: true, queued_offline: true })

      // A second late replay for that day would edit the register: refused.
      if (!late.ok) return
      const again = await saveAttendance(teacherClient, teacherCtx, {
        ...input(
          randomUUID(),
          ["present", "present", "present"],
          late.data.updatedAt,
          date
        ),
        capturedAt: tenAm(date),
      })
      expect(!again.ok && again.error.fieldErrors?._root).toEqual([
        "OUTSIDE_EDIT_WINDOW",
      ])
    })
  }
)
