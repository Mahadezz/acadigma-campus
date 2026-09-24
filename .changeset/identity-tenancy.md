---
"@acadigma/web": minor
"@acadigma/contracts": minor
"@acadigma/domain": minor
"@acadigma/db": minor
---

F-ID-03 Workspaces & Membership, Parts 1-3: tenancy hardening + `WorkspaceContext` resolution + permission matrix + nav engine.

- Migration `20260917020300_tenancy_hardening.sql` (D-50): `public.switch_workspace`/`public.list_my_workspaces`/`public.log_tenancy_context_rejected` RPCs, and `app.attach_freeze_workspace('public.school_profiles')` closing a real tenant-reparenting gap (the table's `workspace_id` PK was UPDATE-able).
- `supabase/tests/09_tenancy.sql`: the four Base44 security-review attack paths (self-role escalation, cross-tenant read/write, membership self-insert-as-owner, removed-member access) re-proven with zero-rows-affected assertions.
- `packages/db/src/workspace-context.ts`: full F-ID-03 §4.3 resolution order (header → `profiles.last_active_workspace_id` → first active membership, personal first), typed failure reasons, and the `tenancy.context_rejected` audit tripwire on a forged header.
- `packages/domain/src/permissions.ts`: extended to the full F-ID-03 §2 tenancy/membership action list, with an exhaustive transcribed-table test.
- `packages/domain/src/nav/`: typed nav config per workspace type × role (DESIGN-SYSTEM §3.2) and the pure `filterNav`/`isRouteVisible` functions.
- `packages/domain/src/workspace/resolveLanding.ts`: `resolveLandingRoute` (F-ID-03 §4.4), replacing F-ID-01's `/onboarding`-only stub.
- `apps/web/lib/workspace.ts` `requireWorkspace()` (unchanged contract, now backed by the hardened resolver) + `apps/web/app/(shared)/workspace/actions.ts` (`switchWorkspace`, `listMyWorkspaces`); `packages/contracts/src/identity/workspace.ts`.
- `apps/web/app/(school)/app/page.tsx`: redirects the school shell root to `/app/dashboard` (needed for `resolveLandingRoute`'s `/app` destination to actually resolve).
