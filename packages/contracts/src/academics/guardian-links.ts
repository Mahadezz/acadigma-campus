import { z } from "zod"

import { uuidSchema } from "../common"

import type { GuardianRelation } from "./students"

/**
 * F-AC-02 Part 4 (demo cut, D-108) — guardian links
 * (`supabase/migrations/20260926025038_guardian_linking.sql`).
 */

export const inviteGuardianInputSchema = z
  .object({ guardianId: uuidSchema })
  .strict()
export type InviteGuardianInput = z.infer<typeof inviteGuardianInputSchema>

/** The raw token exists once: in this response and in the link. */
export type GuardianInvite = { token: string; expiresAt: string }

export const revokeGuardianLinkInputSchema = z
  .object({ linkId: uuidSchema })
  .strict()
export type RevokeGuardianLinkInput = z.infer<
  typeof revokeGuardianLinkInputSchema
>

/** 64 lowercase hex characters, as `invite_guardian` mints them. */
export const guardianInviteTokenSchema = z
  .string()
  .regex(/^[0-9a-f]{64}$/, "INVALID_TOKEN")
export const guardianInviteTokenInputSchema = z
  .object({ token: guardianInviteTokenSchema })
  .strict()

export type GuardianInvitationPreview =
  | {
      status: "pending"
      schoolName: string
      studentName: string
      studentNameBn: string | null
      relation: GuardianRelation
      expiresAt: string
    }
  | {
      status: "accepted" | "revoked" | "expired" | "declined"
      acceptedByMe: boolean
    }

/** An account linked to one of a student's guardians (owner/admin view). */
export type GuardianLink = {
  id: string
  guardianId: string
  status: "invited" | "active" | "revoked"
  accountName: string | null
  accountEmail: string | null
  acceptedAt: string | null
}

/** A parent's linked child, as `/family` lists them. */
export type FamilyChild = {
  id: string
  fullName: string
  fullNameBn: string | null
  studentCode: string
}
