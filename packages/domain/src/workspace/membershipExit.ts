/**
 * F-ID-03 Part 7 (D-112) — who may remove whom, and who may receive
 * ownership. These mirror the database rules (`app.tg_workspace_members_guard`,
 * `public.transfer_ownership`) so the UI only offers actions the server will
 * accept; the database stays the wall.
 */

import type { Role } from "../permissions"

/**
 * Why the remove action is not offered for `target`, or `null` when it is.
 * `self`: leaving is its own flow (§4.6). `ownerTarget`: only an owner may
 * remove an owner (§2). `parent`: parents are managed per child (D-108).
 * `notAllowed`: the actor cannot remove anyone.
 */
export type RemovalBlock = "self" | "ownerTarget" | "parent" | "notAllowed"

export function removalBlock(
  actor: Role,
  target: Role,
  isSelf: boolean
): RemovalBlock | null {
  if (actor !== "owner" && actor !== "admin") return "notAllowed"
  if (isSelf) return "self"
  if (target === "parent") return "parent"
  if (target === "owner" && actor !== "owner") return "ownerTarget"
  return null
}

/** §4.7 step 1: only an active admin or teacher can be handed ownership. */
export function isOwnershipCandidate(role: Role, status: string): boolean {
  return status === "active" && (role === "admin" || role === "teacher")
}
