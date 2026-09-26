/**
 * D-109 against a real local PostgREST (D-73's `db-integration` job): a
 * teacher who is also a parent, and class-teacher invites, through the
 * repository functions the screens call — `acceptGuardianInvitation` as an
 * active teacher, `listFamilyChildren` (which must not return the roster the
 * teacher reads as staff), `hasGuardianLink`, `listFamilyResults`,
 * `listGuardianLinks`' profile embed as the class teacher, and
 * `inviteGuardian` / `revokeGuardianLink` as the class teacher. The rules
 * themselves are pinned in `supabase/tests/39_guardian_followups.sql`.
 *
 * Opt-in, like `marks.integration.test.ts`: DB_LOCAL_SUPABASE=1 with
 * DB_LOCAL_SUPABASE_ANON_KEY / _SERVICE_KEY from `supabase status`.
 */
import { randomUUID } from "node:crypto"

import { createClient } from "@supabase/supabase-js"
import { beforeAll, describe, expect, it } from "vitest"

import {
  acceptGuardianInvitation,
  inviteGuardian,
  listFamilyChildren,
  listGuardianLinks,
  revokeGuardianLink,
} from "./guardian-links"
import { hasGuardianLink, listFamilyResults } from "./results"
import { createSchoolWorkspace } from "./school"

import type { AcadigmaSupabaseClient } from "../client"
import type { Database } from "../types.generated"
import type { WorkspaceContext } from "../workspace-context"

const URL = process.env.DB_LOCAL_SUPABASE_URL ?? "http://127.0.0.1:54321"
const ANON_KEY = process.env.DB_LOCAL_SUPABASE_ANON_KEY
const SERVICE_KEY = process.env.DB_LOCAL_SUPABASE_SERVICE_KEY
const RUN = process.env.DB_LOCAL_SUPABASE === "1" && !!ANON_KEY && !!SERVICE_KEY

describe.skipIf(!RUN)(
  "guardian follow-ups: teacher-parent and class-teacher invites (local Supabase, opt-in)",
  () => {
    let service: AcadigmaSupabaseClient
    let owner: AcadigmaSupabaseClient
    let teacher: AcadigmaSupabaseClient
    let ownerCtx: WorkspaceContext
    let teacherCtx: WorkspaceContext
    let teacherId: string
    const studentIds: string[] = []
    const guardianIds: string[] = []

    async function signUp(
      name: string
    ): Promise<{ id: string; client: AcadigmaSupabaseClient }> {
      const email = `d109-${randomUUID()}@test.local`
      const password = `Pw-${randomUUID()}-Aa1`
      const { data, error } = await service.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: name },
      })
      if (error || !data.user) throw error ?? new Error("user")
      const anon = createClient<Database>(URL, ANON_KEY as string)
      const { data: session, error: signInError } =
        await anon.auth.signInWithPassword({ email, password })
      if (signInError || !session.session) {
        throw signInError ?? new Error("session")
      }
      const client = createClient<Database>(URL, ANON_KEY as string, {
        global: {
          headers: { Authorization: `Bearer ${session.session.access_token}` },
        },
      })
      return { id: data.user.id, client }
    }

    beforeAll(async () => {
      service = createClient<Database>(URL, SERVICE_KEY as string, {
        auth: { persistSession: false },
      })
      const o = await signUp("D-109 Owner")
      owner = o.client
      const t = await signUp("D-109 Teacher Parent")
      teacher = t.client
      teacherId = t.id

      const school = await createSchoolWorkspace(owner, {
        name: "D-109 Guardian School",
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
      ownerCtx = {
        workspaceId,
        userId: o.id,
        role: "owner",
        workspaceType: "school",
        plan: null,
      }
      teacherCtx = { ...ownerCtx, userId: teacherId, role: "teacher" }

      // Fixture rows (the admission and staff-invite flows are tested
      // elsewhere): the teacher's membership, a section they are class
      // teacher of, two students with a guardian each.
      const { data: member, error: memberError } = await service
        .from("workspace_members")
        .insert({
          workspace_id: workspaceId,
          user_id: teacherId,
          role: "teacher",
          status: "active",
          joined_at: new Date().toISOString(),
        })
        .select("id")
        .single()
      if (memberError || !member) throw memberError
      const { data: grade } = await service
        .from("grade_levels")
        .select("id")
        .eq("workspace_id", workspaceId)
        .single()
      const { data: year } = await service
        .from("academic_years")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("is_current", true)
        .single()
      if (!grade || !year) throw new Error("fixture lookups")
      const { data: section, error: sectionError } = await service
        .from("sections")
        .insert({
          workspace_id: workspaceId,
          academic_year_id: year.id,
          grade_level_id: grade.id,
          name: "A",
          class_teacher_id: member.id,
        })
        .select("id")
        .single()
      if (sectionError || !section) throw sectionError

      for (const [i, first] of ["Ayaan", "Bushra"].entries()) {
        const { data: student, error } = await service
          .from("students")
          .insert({
            workspace_id: workspaceId,
            student_code: `D109-${randomUUID().slice(0, 8)}`,
            first_name: first,
            last_name: "Rahman",
            gender: i === 0 ? "male" : "female",
          })
          .select("id")
          .single()
        if (error || !student) throw error
        studentIds.push(student.id)
        const { error: enrolError } = await service.from("enrollments").insert({
          workspace_id: workspaceId,
          student_id: student.id,
          academic_year_id: year.id,
          section_id: section.id,
          roll_number: i + 1,
        })
        if (enrolError) throw enrolError
        const { data: guardian, error: guardianError } = await service
          .from("guardians")
          .insert({
            workspace_id: workspaceId,
            student_id: student.id,
            relation: "mother",
            full_name: `Guardian ${first}`,
            phone: `+8801711${String(100000 + i).slice(1)}0`,
            is_primary: true,
          })
          .select("id")
          .single()
        if (guardianError || !guardian) throw guardianError
        guardianIds.push(guardian.id)
      }
    })

    it("an active teacher accepts a link and stays a teacher", async () => {
      const invite = await inviteGuardian(ownerCtx, owner, guardianIds[0]!)
      if (!invite.ok) throw new Error(JSON.stringify(invite.error))
      const accepted = await acceptGuardianInvitation(
        teacher,
        invite.data.token
      )
      expect(accepted).toEqual({
        ok: true,
        data: { workspaceId: ownerCtx.workspaceId },
      })
      const { data: rows } = await service
        .from("workspace_members")
        .select("role, status")
        .eq("workspace_id", ownerCtx.workspaceId)
        .eq("user_id", teacherId)
      expect(rows).toEqual([{ role: "teacher", status: "active" }])
    })

    it("the family path shows the teacher only their own child", async () => {
      const { count } = await teacher
        .from("students")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", ownerCtx.workspaceId)
      expect(count).toBe(2) // the roster, as staff

      const children = await listFamilyChildren(teacherCtx, teacher)
      expect(children.ok && children.data.map((c) => c.id)).toEqual([
        studentIds[0],
      ])
      expect(await hasGuardianLink(teacherCtx, teacher)).toEqual({
        ok: true,
        data: true,
      })
      expect(await listFamilyResults(teacherCtx, teacher)).toEqual({
        ok: true,
        data: [],
      })
    })

    it("the class teacher sees the student's links with the account name", async () => {
      const links = await listGuardianLinks(teacherCtx, teacher, studentIds[0]!)
      expect(links.ok && links.data.map((l) => l.accountName)).toEqual([
        "D-109 Teacher Parent",
      ])
    })

    it("the class teacher invites for their section's student", async () => {
      const invite = await inviteGuardian(teacherCtx, teacher, guardianIds[1]!)
      expect(invite.ok && invite.data.token.length).toBe(64)
    })

    it("revoking the teacher's link ends family access, not the membership", async () => {
      const links = await listGuardianLinks(ownerCtx, owner, studentIds[0]!)
      if (!links.ok) throw new Error("links")
      expect(
        await revokeGuardianLink(ownerCtx, owner, links.data[0]!.id)
      ).toEqual({ ok: true, data: null })
      expect(await listFamilyChildren(teacherCtx, teacher)).toEqual({
        ok: true,
        data: [],
      })
      const { data: rows } = await service
        .from("workspace_members")
        .select("role, status")
        .eq("workspace_id", ownerCtx.workspaceId)
        .eq("user_id", teacherId)
      expect(rows).toEqual([{ role: "teacher", status: "active" }])
    })
  }
)
