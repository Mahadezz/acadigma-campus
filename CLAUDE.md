# CLAUDE.md — Acadigma Campus

Read this file at the start of every session. It is the operational contract; `docs/engineering/HANDBOOK.md` is its long form.

## The project

**Acadigma Campus** is a phone-first school operations app for Bangladesh — attendance, timetable, exams, marks, lessons, resources, messaging, hiring, cover, printing, a marketplace and billing — built as one Next.js 15 (App Router) application on Vercel with Supabase (Postgres + RLS, Auth, Storage, Realtime, Edge Functions) in `ap-south-1`.

It is a **complete rebuild** of a Base44 prototype whose security review found six critical flaws, including cross-tenant access to children's medical records and to government ID scans (`docs/reference/base44-security-review.md`). The prototype is a product reference, never a code reference.

It holds children's personal and medical data, identity documents and money. That fact, not convenience, decides every trade-off in this repository.

---

## Where everything lives

| Need                                            | File                                                                                                |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **How the system is built — binding**           | `docs/architecture/ARCHITECTURE.md`                                                                 |
| **Every table, column, enum, policy — binding** | `docs/architecture/DATA-MODEL.md`                                                                   |
| Design tokens and component rules               | `docs/architecture/DESIGN-SYSTEM.md`                                                                |
| **What we're building and why — binding**       | `docs/product/PRODUCT-DECISIONS.md`                                                                 |
| **Every decision, numbered — binding**          | `docs/decisions/DECISION-LOG.md`                                                                    |
| Feature specs (5 areas, 31 specs)               | `docs/features/01-identity/` · `02-academics/` · `03-teaching/` · `04-commerce/` · `05-operations/` |
| End-to-end user journeys                        | `docs/workflows/WF-01…WF-09`                                                                        |
| How we work                                     | `docs/engineering/HANDBOOK.md`                                                                      |
| How we test                                     | `docs/engineering/TESTING.md`                                                                       |
| Threat model and controls                       | `docs/engineering/SECURITY.md`                                                                      |
| Pipeline and gates                              | `docs/engineering/CI.md`                                                                            |
| Versioning and rollback                         | `docs/engineering/RELEASES.md`                                                                      |
| Logging, alerts, on-call                        | `docs/engineering/OBSERVABILITY.md`                                                                 |
| Build order                                     | `docs/plan/ROADMAP.md`                                                                              |
| What the prototype was, and its security review | `docs/reference/`                                                                                   |
| Index of everything                             | `docs/README.md`                                                                                    |

---

## Before building any feature

**Read, in this order, every time:**

1. The feature spec — `docs/features/<area>.md`, the Part you are building (§8) and its acceptance criteria (§9).
2. `docs/architecture/DATA-MODEL.md` for the tables involved.
3. This file.

**If the spec does not answer a question, the answer goes into the spec before the code exists.** Do not decide it in code and document it later — that is how two sources of truth begin.

**One Part at a time.** The owner's standard: _"one feature at a time, 100 % sure it won't break."_ A session works on one Part, on one branch, to green CI, then stops.

---

## Non-negotiable rules

From ARCHITECTURE §3–§5. Breaking one is a blocking review comment, not a discussion. Each exists because the prototype got it wrong and exposed real data.

1. **The database and the server are the security boundary.** UI guards are experience only. Every write passes `domain/permissions.can()` **and** an RLS policy, and both are tested.
2. **Tenant context never comes from the client.** The browser sends `x-workspace-id`; `packages/db` resolves it against `workspace_members` for `(workspace_id, auth.uid(), status='active')` and builds `WorkspaceContext`. Missing or inactive → 403. Nothing else constructs a context.
3. **RLS checks membership _and_ role**, never `workspace_id` alone. Every tenant table follows the policy template in ARCHITECTURE §3 and has pgTAP isolation _and_ escalation tests.
4. **Zod at every boundary** — server actions, route handlers, webhooks, job payloads, forms. Schemas live in `packages/contracts` and are shared by UI, server and tests. No `any`.
5. **Server action shape, always:** parse → resolve context → policy check → domain + repository → revalidate and return the canonical row. Return `Result<T, ApiError>`; never throw a raw error to the client.
6. **Every repository method takes `WorkspaceContext` first.** Feature code never imports a Supabase client. Service role only inside `withServiceRole(reason)` — webhooks, cron, reviewed admin ops.
7. **No client-side filtering of tables.** Server-filtered, cursor-paginated, explicit columns. Never `select('*')` on a table with private columns.
8. **Money is computed server-side**, integer paisa, from `platform_settings`. The request body never carries a price. Entitlements come only from a validated payment webhook.
9. **Audit rows are written by database triggers**, in the mutation's transaction. No application or client code writes audit rows. `audit_events` is append-only.
10. **Files:** private bucket, `/api/files/[id]` only, policy check → `file_access_log` row → 5-minute signed URL. Signed URLs are never stored, logged or put in a list payload.
11. **Migrations are forward-only and applied by CI.** Expand-first. Never push to production from a laptop. `types.generated.ts` is regenerated and committed with the migration.
12. **Phone-first.** Build at 360×800, verify at 1280×800. 44 px targets, contrast ≥ 4.5:1, axe clean of serious/critical.
13. **No secrets in the repo, in logs, or in error messages.** Log ids, never names, emails, phone numbers, health data or ID numbers.
14. **Docs are updated in the same PR as the code.** Always.

---

## Commands

Windows, Node 24, pnpm 10, **no Docker** — local development points at the Supabase **dev branch** in the cloud.

```powershell
pnpm dev                 # Next.js on :3000
pnpm verify              # typecheck + lint + test + test:contracts — run before every push
pnpm typecheck
pnpm lint  /  pnpm lint:fix
pnpm test  /  pnpm test:cov
pnpm test:contracts      # Postgres enum <-> Zod parity + generated-types freshness
pnpm e2e                 # Playwright at 360x800 and 1280x800
pnpm e2e:ui              # authoring mode

pnpm supabase <cmd>      # always via pnpm, never a global install
pnpm db:diff -- -f <name>  # author a migration against the dev branch
pnpm db:push             # apply to the DEV BRANCH only (production is CI-only)
pnpm db:types            # regenerate packages/db/src/types.generated.ts — commit it
pnpm db:test             # pgTAP: RLS isolation + escalation
pnpm db:seed

pnpm changeset           # add a changeset for this PR
pnpm audit --audit-level high
```

PowerShell has no `&&` — use `cmd; if ($?) { cmd2 }`, and `$env:FOO='bar'; pnpm test` for a one-shot variable. Use Git Bash for anything under `supabase/` or `scripts/*.sh`.

Full command list and the environment variable table: `docs/engineering/HANDBOOK.md` §7.

---

## Branch, PR, Definition of Done

**Branch:** `feat/<area>-<slug>` — also `fix/`, `chore/`, `docs/`, `refactor/`. One Part per branch, cut from `main`, rebased daily. **Push on the first commit and open a draft PR** — work in progress must be visible and recoverable (owner requirement, D-14).

**Commits:** Conventional Commits. `feat(attendance): save daily register with idempotency key`. The **PR title** is what survives into the changelog — write it with care.

**Merge:** squash only, after all required checks and an approval from `@Mahadezz`. Claude does not approve its own PRs.

**Required checks:** `CI / lint` · `typecheck` · `unit` · `contracts` · `db` · `build` · `security` · `e2e` · `lighthouse` · `changeset` · `docs-sync`.

**Definition of Done — every box, every Part** (D-14):

spec ✔ · migration + pgTAP (isolation **and** escalation) ✔ · unit (domain ≥ 80 %, repo ≥ 70 %) ✔ · UI at 360×800 **and** 1280×800 ✔ · Playwright journey at both viewports ✔ · a11y (axe zero serious/critical) ✔ · test report ✔ · docs updated in this PR ✔ · merged ✔

---

## Decisions and test reports

**A decision** goes in `docs/decisions/DECISION-LOG.md` as `## D-<nn> — <title> · <STATUS> · <date>` with **Context / Decision / Why / Consequences**, and the owner's exact words when they decided it. Write one for anything non-obvious and expensive to reverse: a dependency, a schema shape others will copy, a security trade-off, any deviation from `ARCHITECTURE.md`, a scope cut. Numbers are never reused; a changed decision gets a **new** entry and the old one is marked `SUPERSEDED by D-nn`. The entry lands in the same PR as the first code depending on it. If a PR contradicts an accepted decision, it is blocked until a superseding entry is merged.

**A test report** goes in `docs/test-reports/<feature>-part-<n>.md`, copied from `docs/test-reports/_TEMPLATE.md`, committed in the PR that ships the Part. Sections: scope · environment · unit/DB/e2e result tables · coverage · performance · security checks · known issues · sign-off.

**Every number is copied from a real run.** This is the document the owner reads instead of running the app; a fabricated figure there becomes a bad release decision. If something was not run, write "not run" and why. An empty "known issues" section on a non-trivial feature means the report was not written honestly.

---

## Which model to use

| Work                                                                                                                                               | Model      |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Architecture, data model, RLS policy design, threat modelling, security review, writing specs and decisions, debugging something genuinely unclear | **Opus**   |
| Implementing a written, unambiguous spec: server actions, repositories, UI screens, tests for known behaviour, migrations from a specified schema  | **Sonnet** |
| Bulk mechanical work: generating the 40th RLS policy from the template, rewriting imports, transcribing a spec table into test cases, formatting   | **Haiku**  |

**Never use a cheaper model for anything touching authentication, authorisation, money or RLS design.** Implementing an already-designed policy is Sonnet work; _deciding_ what the policy should be is not.

If a spec is ambiguous enough that a Sonnet session would have to guess, that is the signal to stop and fix the spec with Opus first — not to guess more carefully.

---

## How a session should go

1. Read the Part's spec, `DATA-MODEL.md`, and this file.
2. Branch, first commit, push, draft PR.
3. Migration + pgTAP first when there is schema work — the security boundary is built before the feature that sits on it.
4. Contracts (Zod) → domain (pure, tested) → repository → server action → UI.
5. Playwright journey from the acceptance criteria, at both viewports, with axe.
6. Run `pnpm verify`, then `pnpm db:test`, then `pnpm e2e`. Paste real numbers into the test report.
7. Update the spec, `DATA-MODEL.md`, `docs/README.md` and any decision entry — in this PR.
8. Add a changeset. Fill the PR template completely, including screenshots at both viewports.
9. Mark ready. Stop. Do not start the next Part in the same session.

**Rules learned in practice** (details in `docs/plan/HANDOFF-2026-09-24.md`):

- A new migration's timestamp must sort after the newest migration on `main`; `supabase db push` refuses an older-dated one and the production deploy fails on merge.
- Every new client-callable function needs an explicit `grant execute` to the roles that call it; the defaults deny (D-54). Never a blanket `GRANT EXECUTE ... IN SCHEMA`.
- `types.generated.ts` comes from CI (D-55): on a type-step failure, `gh run download <run-id> -n types-generated -D packages/db/src` and commit.
- A PostgREST RPC is its own transaction; a transaction-local setting made over RPC never reaches a later request.
- In pgTAP, count RLS-protected rows as `postgres` (`tests.logout()`) unless the assertion is about what the caller can see.
- Seeded-account Playwright journeys carry the `E2E_LIVE_SUPABASE` skip guard until OQ-27 is done.
- Never `git stash` in shared worktrees. After another session force-pushes, `git switch -C <branch> origin/<branch>` and `pnpm install --frozen-lockfile` before trusting a local typecheck. Verify rebases with `git merge-base --is-ancestor`.
- `Object.hasOwn` on untrusted keys.

**Do not:** edit an already-applied migration · apply a migration to production · write audit rows from code · accept a price from the client · put a secret anywhere but `.env.local` and Vercel · filter a table in React · ship a green PR whose test report you did not actually run · claim a DoD box you cannot evidence.
