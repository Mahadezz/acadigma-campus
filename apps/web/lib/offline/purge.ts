/**
 * F-ID-11 §4.8 / §5.7 / §5.8 (Part 1, D-308): when the service worker's
 * page cache must be wiped.
 *
 * Pure, so the rule is unit-tested apart from the browser APIs in `check.ts`.
 * The cache is keyed by URL — it carries neither the user nor the workspace —
 * so any change in who is looking, where, or with which role wipes all of it.
 */

/** Every cache that holds user data starts with this (see `app/sw.ts`). */
export const DATA_CACHE_PREFIX = "acadigma-data-"

/** What the device remembers from its last successful check. */
export type OfflineSnapshot = {
  userId: string
  /** The active workspace, or `null` when the user has no active membership. */
  workspaceId: string | null
  role: string | null
  /**
   * The students this user may see as a guardian in that workspace (sorted
   * ids, comma-joined), or `null` when none: a revoked link changes neither
   * the membership nor the role, only this (#85 review).
   */
  scope: string | null
}

/** What `/api/offline/session` answered just now. */
export type SessionCheck =
  | { kind: "signed_out" }
  /** Network error, timeout or 5xx: nothing is known, nothing changes. */
  | { kind: "unknown" }
  | ({ kind: "signed_in" } & OfflineSnapshot & {
        /** Every workspace the user is an active member of (the outbox purge). */
        activeWorkspaceIds: string[]
      })

export type PurgeDecision = {
  purge: boolean
  /** The snapshot to store next; `undefined` keeps the stored one. */
  next: OfflineSnapshot | null | undefined
}

export function decidePurge(
  stored: OfflineSnapshot | null,
  // Any SessionCheck; the outbox's workspace list plays no part here.
  check:
    | { kind: "signed_out" }
    | { kind: "unknown" }
    | ({ kind: "signed_in" } & OfflineSnapshot)
): PurgeDecision {
  if (check.kind === "unknown") return { purge: false, next: undefined }
  // Signed out or session revoked: nothing cached may outlive the session.
  if (check.kind === "signed_out") return { purge: true, next: null }

  const current: OfflineSnapshot = {
    userId: check.userId,
    workspaceId: check.workspaceId,
    role: check.role,
    scope: check.scope,
  }
  // No snapshot means the device cannot tell whose pages it holds (a check
  // that never got through, a session that ended without /login, cleared
  // localStorage): wipe. Costs the first page after a sign-in its offline copy.
  const changed =
    stored === null ||
    stored.userId !== current.userId ||
    stored.workspaceId !== current.workspaceId ||
    stored.role !== current.role ||
    stored.scope !== current.scope
  // No active membership (removed / suspended) never keeps a cache.
  return { purge: changed || current.workspaceId === null, next: current }
}
