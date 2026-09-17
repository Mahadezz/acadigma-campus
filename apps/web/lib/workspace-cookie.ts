/**
 * Name of the active-workspace preference cookie, in one place.
 *
 * It is a *preference*, never a grant: `resolveWorkspaceContext` re-derives
 * membership from `workspace_members` on every request (ARCHITECTURE §3,
 * SECURITY.md §3 Finding 1). It still has to be cleared on sign-out — leaving
 * it behind is the prototype's Finding 6 bug (F-ID-01 §4.10).
 *
 * Deliberately free of `next/server` and `server-only` imports so both the edge
 * middleware and the `(auth)` server actions can read it.
 */
export const WORKSPACE_COOKIE = "acadigma_workspace"
