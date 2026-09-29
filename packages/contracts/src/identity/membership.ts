import { z } from "zod"

import { uuidSchema } from "../common"

import { type memberRoleSchema, memberStatusSchema } from "./workspace"

/**
 * F-ID-03 §7, Part 5 (D-110): the Team & Access roster read and the two
 * join-request decisions. Role changes, staff fields, labels and removal are
 * Parts 6-7.
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
