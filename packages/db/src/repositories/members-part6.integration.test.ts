/**
 * F-ID-03 Part 6 (D-111) against a real local PostgREST (D-73's
 * `db-integration` job): role changes, staff-field writes with employee-code
 * generation, label assignment and custom-label CRUD, plus the named errors.
 * The database rules themselves are pinned in
 * `supabase/tests/39b_member_staff_fields.sql`.
 *
 * Opt-in, like `members.integration.test.ts`: DB_LOCAL_SUPABASE=1 with
 * DB_LOCAL_SUPABASE_ANON_KEY / _SERVICE_KEY from `supabase status`.
 */
import { randomUUID } from "node:crypto"

import { createClient } from "@supabase/supabase-js"
import { beforeAll, describe, expect, it } from "vitest"

import {
  createCustomLabel,
  deleteCustomLabel,
  listCustomLabels,
  updateCustomLabel,
} from "./labels"
import {
  assignMemberLabel,
  changeMemberRole,
  getMemberDetail,
  updateMemberStaffFields,
} from "./members"
import { createSchoolWorkspace } from "./school"

import type { AcadigmaSupabaseClient } from "../client"
import type { Database } from "../types.generated"
import type { WorkspaceContext } from "../workspace-context"

const URL = process.env.DB_LOCAL_SUPABASE_URL ?? "http://127.0.0.1:54321"
const ANON_KEY = process.env.DB_LOCAL_SUPABASE_ANON_KEY
const SERVICE_KEY = process.env.DB_LOCAL_SUPABASE_SERVICE_KEY
const RUN = process.env.DB_LOCAL_SUPABASE === "1" && !!ANON_KEY && !!SERVICE_KEY

describe.skipIf(!RUN)(
  "Roles, staff fields and labels (local Supabase, opt-in)",
  () => {
    let service: AcadigmaSupabaseClient
    let owner: AcadigmaSupabaseClient
    let ownerCtx: WorkspaceContext
    let workspaceId: string
    let ownerId: string
    let ownerMemberId: string
    let teacherMemberId: string
    let teacher2MemberId: string

    async function signUp(name: string) {
      const email = `d111-${randomUUID()}@test.local`
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

    async function addMember(name: string, role: "admin" | "teacher") {
      const u = await signUp(name)
      const { data, error } = await service
        .from("workspace_members")
        .insert({
          workspace_id: workspaceId,
          user_id: u.id,
          role,
          status: "active",
          created_by: u.id,
        })
        .select("id")
        .single()
      if (error || !data) throw error ?? new Error("member")
      return data.id
    }

    beforeAll(async () => {
      service = createClient<Database>(URL, SERVICE_KEY as string, {
        auth: { persistSession: false },
      })
      const o = await signUp("D-111 Owner")
      owner = o.client
      ownerId = o.id
      const school = await createSchoolWorkspace(owner, {
        name: "D-111 School",
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
      workspaceId = school.data.workspaceId
      ownerCtx = {
        workspaceId,
        userId: ownerId,
        role: "owner",
        workspaceType: "school",
        plan: null,
      }
      const { data: ownRow } = await service
        .from("workspace_members")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("user_id", ownerId)
        .single()
      ownerMemberId = ownRow?.id as string
      teacherMemberId = await addMember("D-111 Teacher", "teacher")
      teacher2MemberId = await addMember("D-111 Teacher Two", "teacher")
    })

    it("changes a teacher's role, and is idempotent", async () => {
      const first = await changeMemberRole(
        ownerCtx,
        owner,
        teacherMemberId,
        "staff"
      )
      expect(first).toEqual({
        ok: true,
        data: { id: teacherMemberId, role: "staff" },
      })
      const again = await changeMemberRole(
        ownerCtx,
        owner,
        teacherMemberId,
        "staff"
      )
      expect(again.ok).toBe(true)
    })

    it("refuses to change your own role", async () => {
      const r = await changeMemberRole(ownerCtx, owner, ownerMemberId, "admin")
      expect(!r.ok && r.error.fieldErrors?._root).toEqual([
        "SELF_EDIT_FORBIDDEN",
      ])
    })

    it("generates an employee code when the field is blank", async () => {
      const r = await updateMemberStaffFields(ownerCtx, owner, {
        memberId: teacherMemberId,
        department: "Science",
      })
      expect(r.ok && r.data.department).toBe("Science")
      expect(r.ok && r.data.employeeCode).toMatch(/^TCH-\d{4}-\d{4}$/)
    })

    it("rejects a duplicate employee code", async () => {
      const t2 = await updateMemberStaffFields(ownerCtx, owner, {
        memberId: teacher2MemberId,
        employeeCode: "DUP-100",
      })
      expect(t2.ok).toBe(true)
      const clash = await updateMemberStaffFields(ownerCtx, owner, {
        memberId: teacherMemberId,
        employeeCode: "DUP-100",
      })
      expect(!clash.ok && clash.error.fieldErrors?._root).toEqual([
        "EMPLOYEE_NO_TAKEN",
      ])
    })

    it("creates, lists, blocks a duplicate name, updates and deletes a label", async () => {
      const created = await createCustomLabel(ownerCtx, owner, {
        name: "Vice-Principal",
        baseRole: "admin",
        color: "#3B82F6",
      })
      expect(created.ok).toBe(true)
      const labelId = created.ok ? created.data.id : ""

      const dup = await createCustomLabel(ownerCtx, owner, {
        name: "vice-principal",
        baseRole: "admin",
        color: "#111111",
      })
      expect(!dup.ok && dup.error.fieldErrors?._root).toEqual([
        "LABEL_NAME_TAKEN",
      ])

      const listed = await listCustomLabels(ownerCtx, owner)
      expect(listed.ok && listed.data.some((l) => l.id === labelId)).toBe(true)

      const updated = await updateCustomLabel(ownerCtx, owner, {
        id: labelId,
        name: "Head Teacher",
        baseRole: "teacher",
        color: "#222222",
      })
      expect(updated.ok && updated.data.name).toBe("Head Teacher")

      // assign it, then delete the label and confirm it is nulled on the member
      const assigned = await assignMemberLabel(ownerCtx, owner, {
        memberId: teacherMemberId,
        labelId,
      })
      expect(assigned.ok).toBe(true)
      const detail = await getMemberDetail(ownerCtx, owner, teacherMemberId)
      expect(detail.ok && detail.data.label?.name).toBe("Head Teacher")

      const del = await deleteCustomLabel(ownerCtx, owner, labelId)
      expect(del.ok).toBe(true)
      const after = await getMemberDetail(ownerCtx, owner, teacherMemberId)
      expect(after.ok && after.data.labelId).toBeNull()
    })

    it("rejects a label id from outside the workspace", async () => {
      const r = await assignMemberLabel(ownerCtx, owner, {
        memberId: teacherMemberId,
        labelId: randomUUID(),
      })
      expect(!r.ok && r.error.fieldErrors?._root).toEqual(["LABEL_NOT_FOUND"])
    })
  }
)
