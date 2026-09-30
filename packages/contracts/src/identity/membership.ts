import { z } from "zod"

import { uuidSchema } from "../common"

import { type memberRoleSchema, memberStatusSchema } from "./workspace"

/**
 * F-ID-03 §7, Part 5 (D-110): the Team & Access roster read and the two
 * join-request decisions. Role changes, staff fields and labels are Part 6;
 * removal, leaving and ownership transfer Part 7.
 */

/** `/app/staff/team?tab=&q=&after=` — one server-filtered page. */
export const listMembersInputSchema = z.object({
  status: memberStatusSchema.default("active"),
  // NFC: a Bangla name typed with decomposed vowel signs still matches.
  q: z
    .string()
    .trim()
    .max(60)
    .transform((value) => value.normalize("NFC"))
    .optional(),
  /** The last row's id on the previous page (keyset, newest first). */
  after: uuidSchema.optional(),
})
export type ListMembersInput = z.infer<typeof listMembersInputSchema>

export type MemberRow = {
  id: string
  fullName: string
  email: string | null
  role: z.infer<typeof memberRoleSchema>
  status: z.infer<typeof memberStatusSchema>
  /** Asked through an invitation; otherwise with the school's join code. */
  viaInvitation: boolean
  requestedAt: string
  joinedAt: string | null
  removedAt: string | null
}

export type MemberPage = { items: MemberRow[]; nextCursor: string | null }

/** `approveMember` / `rejectMember` input. */
export const memberDecisionInputSchema = z.object({ memberId: uuidSchema })

/** What an approve/reject returns: the row's new lifecycle state. */
export type MemberDecision = {
  id: string
  status: z.infer<typeof memberStatusSchema>
}

// ---------------------------------------------------------------------------
// Part 6 (D-111) — role changes, staff fields, labels
// ---------------------------------------------------------------------------

/**
 * The roles a member may be moved to from the roster dropdown. `owner` is
 * granted only through ownership transfer (§4.7) and `parent` only through the
 * guardian-invite flow (§2) — neither is ever a value the role select offers.
 * It is also the set of base roles a custom label may sit over (§3).
 */
export const assignableRoleSchema = z.enum(["admin", "teacher", "staff"])
export type AssignableRole = z.infer<typeof assignableRoleSchema>

/** `changeMemberRole` input (§7). */
export const changeMemberRoleInputSchema = z.object({
  memberId: uuidSchema,
  role: assignableRoleSchema,
})
export type ChangeMemberRoleInput = z.infer<typeof changeMemberRoleInputSchema>

/**
 * Work phone is the school-published number, distinct from the personal one on
 * `profiles`. It is not validated as a BD mobile: a school office line is often
 * a landline. Empty strings are allowed and mean "clear this field".
 */
const staffTextSchema = z.string().trim().max(60).optional()

/**
 * `updateMemberStaffFields` input (§7). Only the columns that exist on
 * `workspace_members` today: employee code, department and one work phone
 * (D-111 — the spec's `work_email` and per-subject `subject_ids` have no
 * columns yet). A blank employee code is generated server-side on first save.
 */
export const updateMemberStaffFieldsInputSchema = z.object({
  memberId: uuidSchema,
  employeeCode: z.string().trim().max(32).optional(),
  department: staffTextSchema,
  phone: z.string().trim().max(32).optional(),
})
export type UpdateMemberStaffFieldsInput = z.infer<
  typeof updateMemberStaffFieldsInputSchema
>

/** `assignMemberLabel` input (§7). `null` clears the label. */
export const assignMemberLabelInputSchema = z.object({
  memberId: uuidSchema,
  labelId: uuidSchema.nullable(),
})
export type AssignMemberLabelInput = z.infer<
  typeof assignMemberLabelInputSchema
>

/** A member's editable staff fields, as returned after a change. */
export type MemberStaffFields = {
  id: string
  employeeCode: string | null
  department: string | null
  phone: string | null
}

/** The label shown next to a member's name; permissions never read it (§4.8). */
export type MemberLabel = {
  id: string
  name: string
  color: string
}

/** The member-detail sheet payload: staff fields plus the assigned label. */
export type MemberDetail = MemberStaffFields & {
  role: z.infer<typeof memberRoleSchema>
  status: z.infer<typeof memberStatusSchema>
  labelId: string | null
  label: MemberLabel | null
  /** The caller is looking at their own row (Part 7: leave, do not remove). */
  isSelf: boolean
}

// ---------------------------------------------------------------------------
// Custom labels (§4.8)
// ---------------------------------------------------------------------------

/** A `#RRGGBB` colour, matching the `custom_labels.color` check constraint. */
export const labelColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9A-Fa-f]{6}$/, "Choose a colour.")

export const createCustomLabelInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
  baseRole: assignableRoleSchema,
  color: labelColorSchema,
})
export type CreateCustomLabelInput = z.infer<
  typeof createCustomLabelInputSchema
>

export const updateCustomLabelInputSchema = createCustomLabelInputSchema.extend(
  {
    id: uuidSchema,
  }
)
export type UpdateCustomLabelInput = z.infer<
  typeof updateCustomLabelInputSchema
>

export const deleteCustomLabelInputSchema = z.object({ id: uuidSchema })
export type DeleteCustomLabelInput = z.infer<
  typeof deleteCustomLabelInputSchema
>

export type CustomLabel = {
  id: string
  name: string
  baseRole: AssignableRole
  color: string
}

/**
 * Named repository/action errors carried in `fieldErrors._root`, so the UI
 * branches on a stable marker rather than a message string (the Part 5
 * pattern). `LAST_OWNER_BLOCKED` links to ownership transfer; the others are
 * plain explanations.
 */
export const MEMBER_ERROR = {
  SELF_EDIT_FORBIDDEN: "SELF_EDIT_FORBIDDEN",
  FORBIDDEN_OWNER_TARGET: "FORBIDDEN_OWNER_TARGET",
  LAST_OWNER_BLOCKED: "LAST_OWNER_BLOCKED",
  EMPLOYEE_NO_TAKEN: "EMPLOYEE_NO_TAKEN",
  LABEL_NOT_FOUND: "LABEL_NOT_FOUND",
  LABEL_NAME_TAKEN: "LABEL_NAME_TAKEN",
  TARGET_NOT_ELIGIBLE: "TARGET_NOT_ELIGIBLE",
  REAUTH_FAILED: "REAUTH_FAILED",
  CONFIRM_NAME_MISMATCH: "CONFIRM_NAME_MISMATCH",
} as const
export type MemberErrorMarker = (typeof MEMBER_ERROR)[keyof typeof MEMBER_ERROR]

// ---------------------------------------------------------------------------
// Part 7 (D-112) — remove, leave, transfer ownership
// ---------------------------------------------------------------------------

/**
 * `transferOwnership` input (§4.7). The current password re-authenticates the
 * owner and the typed school name confirms intent; both are checked on the
 * server before the transfer runs. `keepOwner` keeps the caller an owner too.
 * `removeMember` reuses `memberDecisionInputSchema`; `leaveWorkspace` takes no
 * input (the member is the caller, the school is the resolved context).
 */
export const transferOwnershipInputSchema = z.object({
  memberId: uuidSchema,
  keepOwner: z.boolean(),
  currentPassword: z.string().min(1, "Enter your password.").max(256),
  confirmName: z.string().trim().min(1).max(200),
})
export type TransferOwnershipInput = z.infer<
  typeof transferOwnershipInputSchema
>

/** An active admin or teacher an owner may hand the school to (§4.7 step 1). */
export type OwnershipCandidate = {
  id: string
  fullName: string
  role: "admin" | "teacher"
}
