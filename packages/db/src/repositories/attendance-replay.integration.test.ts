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

import { saveAttendance } from "./attendance"
import { createSchoolWorkspace } from "./school"

import type { AcadigmaSupabaseClient } from "../client"
import type { Database } from "../types.generated"
import type { WorkspaceContext } from "../workspace-context"
import type { SaveAttendanceInput } from "@acadigma/contracts"

const URL = process.env.DB_LOCAL_SUPABASE_URL ?? "http://127.0.0.1:54321"
const ANON_KEY = process.env.DB_LOCAL_SUPABASE_ANON_KEY
const SERVICE_KEY = process.env.DB_LOCAL_SUPABASE_SERVICE_KEY
const RUN = process.env.DB_LOCAL_SUPABASE === "1" && !!ANON_KEY && !!SERVICE_KEY

/** Today in the school's time zone: always inside the edit window. */
const TODAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Dhaka",
}).format(new Date())
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

      const school = await createSchoolWorkspace(userClient, {
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
      })
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
    }, 60_000)

    afterAll(async () => {
      if (ctx?.workspaceId) {
        await serviceClient.from("workspaces").delete().eq("id", ctx.workspaceId)
      }
      if (userId) await serviceClient.auth.admin.deleteUser(userId)
    })

    const input = (
      key: string,
      statuses: ("present" | "absent")[],
      expectedUpdatedAt: string | null
    ): SaveAttendanceInput => ({
      idempotencyKey: key,
      sectionId,
      date: TODAY,
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
        input(randomUUID(), ["present", "present", "present"], loaded!.updated_at)
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
  }
)
