---
"@acadigma/web": minor
"@acadigma/domain": minor
---

F-ID-03 Workspaces, Part 4: workspace switcher and the `(school)` shell layout gate.

- `packages/domain/src/workspace/shellGate.ts`: `resolveShellGate(shell, {workspaceType, role})`, a pure function deciding `allow`/`redirect`/`forbidden` for the `school`/`personal`/`family` shells by reusing `resolveLandingRoute`. Closes the M0 wrap-up review's known issue (PR #17): `(school)/app/layout.tsx` had no check that a resolved membership actually belongs to `/app`, so a `parent` role or a `personal` workspace would render a curated nav tree pointing at routes that did not exist.
- `apps/web/app/(school)/app/layout.tsx`: calls the gate right after `requireWorkspace()`; redirects a `parent` to `/family`, a `personal` workspace to `/personal`.
- `apps/web/app/(personal)/personal/` and `apps/web/app/(family)/family/`: minimal shells — the same gate, a top bar, and one placeholder page each. No nav wired yet; F-ID-06/F-AC-10 build the real screens.
- `apps/web/app/(shared)/workspace/workspace-switcher.tsx`: the top-bar `WorkspaceSwitcher` chip + sheet, wired into all three shells, calling the existing `switchWorkspace`/`listMyWorkspaces` server actions.
