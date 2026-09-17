# Acadigma Campus — Releases

Versioning, changelog, tagging, promotion and rollback. Implements D-14 ("packages, releases, everything tracked properly") and ARCHITECTURE §8.

The shape of it: **Conventional Commits → Changesets → version PR → tag → GitHub Release → Vercel production promotion → Supabase migration promotion.** Every step is mechanical and leaves a record.

---

## 1. What we version

| Thing                                                | Versioned                                                                 | Published                                                           |
| ---------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `apps/web` (the product)                             | yes — this is "the version" of Acadigma Campus                            | not to npm; version lives in the tag, the release and `/api/health` |
| `packages/domain`, `db`, `contracts`, `ui`, `config` | yes, independently by Changesets                                          | **no** — `"private": true`, internal workspace deps only            |
| `supabase/migrations`                                | not versioned separately; each release records the last applied migration | applied by CI                                                       |

We run Changesets in **non-publishing** mode: it computes version bumps and generates changelogs, and we never `pnpm changeset publish`. Packages are private and consumed through the workspace protocol. If a package is ever extracted for the Students/Parents/Admin apps (D-10), publishing is turned on for that package alone and the decision is logged.

---

## 2. Semver for the app

**During build: `v0.x.y`.** In `0.x`, the minor is our feature counter and the patch is fixes — `0.x` explicitly carries no stability promise, which is honest while the schema is still moving.

- `0.x.0` — a feature area or a substantial part of one lands.
- `0.x.y` — fixes, chores, performance, docs.
- A breaking internal change (repository signature, contract shape) still bumps the minor in `0.x` and is called out in the release notes.

**`v1.0.0` at Release 1**, defined as: the five feature areas shipped to their Release-1 scope per `docs/plan/ROADMAP.md`, every tenant table covered by pgTAP isolation + escalation tests, all e2e journeys green at both viewports, one authorized DAST pass with no open high findings, and the owner's sign-off. From `1.0.0` onward normal semver applies to the product surface: **major** = a migration that requires user action or removes a capability; **minor** = new capability; **patch** = fix.

Native wrappers (D-13) version independently once they exist — `android-v1.0.0`, `windows-v1.0.0` — because store release cadence will not match the web's.

---

## 3. Changesets

### Adding one

Every PR that changes user-visible behaviour, a public package API, or the schema adds a changeset. Run it before pushing:

```powershell
pnpm changeset
```

Pick the affected packages, pick the bump, and write the summary **for a reader who did not see the code** — this line becomes the changelog and the release notes.

```markdown
---
"@acadigma/web": minor
"@acadigma/domain": patch
---

Attendance: teachers can take the daily register offline. Saves queue in the browser
and replay with an idempotency key, so a flaky connection cannot create duplicate rows.
```

Good summaries say what changed for a user and why it matters. "Update attendance" is not a summary. Refer to the feature id (`F-academics-03`) where it helps.

**When a changeset is not needed:** docs-only PRs, test-only PRs, CI config, and internal refactors with no behaviour change. The `CI / changeset` check enforces this: it requires a changeset when the diff touches `apps/` or `packages/`, and accepts the `no-changeset` label with a reason in the PR description otherwise. `pnpm changeset --empty` records a deliberate no-op.

### The version PR

A GitHub Action (`release.yml`, owned by the scaffold agent) watches `main`. When changesets are present it opens or updates a PR titled **`chore(release): version packages`** which:

- consumes `.changeset/*.md`,
- bumps every affected `package.json`,
- writes `CHANGELOG.md` per package and aggregates the app-level entries into the root `CHANGELOG.md`.

Merging that PR is the act of releasing. Review it for: correct bump level (a breaking change dressed as a patch is the thing to catch), readable entries, and no leftover changesets. Do not hand-edit versions — edit changesets and let the action regenerate.

---

## 4. Changelog

`CHANGELOG.md` at the repo root is the product changelog; each package keeps its own. Format is Changesets' default (Keep-a-Changelog shaped), grouped Major / Minor / Patch, each line linking its PR.

We add one thing by hand when it applies, at the top of the release's section:

```markdown
## 0.9.0

### Database

Migrations applied: `20260921T1102_add_cover_assignments.sql` … `20260921T1613_index_attendance_date.sql`
Requires no user action. Forward-only; see RELEASES.md §7 for rollback.
```

Because the schema is the part that cannot be rolled back by pressing a button, it gets stated explicitly in every release that touches it.

---

## 5. GitHub Releases

Merging the version PR triggers the release job, which tags, creates the GitHub Release, and promotes (§6).

**Tagging:** annotated, `v<version>` (`v0.9.0`), on the squash commit of the version PR. Tags are never moved or deleted — a bad release gets a new one. Package-level tags (`@acadigma/domain@0.4.1`) are created by Changesets for internal traceability.

**Notes template** (generated from the changelog, then edited for the top section):

```markdown
## Acadigma Campus v0.9.0 — 2026-09-21

**Highlights**
One or two sentences a school administrator would understand. What can they now do?

### Added

- Attendance offline queue — take the register without a connection (#142) · F-academics-03

### Changed

- Marketplace commission is snapshotted onto each order line (#139) · D-15

### Fixed

- Invoice totals rounded to paisa instead of taka (#144)

### Security

- Signed file URLs shortened to 5 minutes and logged on issue (#141)

### Database

Migrations `20260921T1102` … `20260921T1613`. No user action required.

### Verification

- CI run: <link>
- Test reports: docs/test-reports/F-academics-03-part-2.md, …
- Playwright report: <artifact link>
- Production deployment: <Vercel URL> · Health: <app-url>/api/health

### Rollback

Web: Vercel instant rollback to v0.8.3. Database: forward-fix only (§7).

**Full changelog:** https://github.com/Mahadezz/acadigma-campus/compare/v0.8.3...v0.9.0
```

A **Security** section appears whenever a release contains a security fix, describing the class of issue without a working exploit, and crediting the reporter if applicable. Pre-releases (`v0.9.0-rc.1`) are marked as pre-release on GitHub and used when a change needs soak time on a preview before production.

---

## 6. Promotion

### 6.1 Web (Vercel)

- Every PR gets a **preview deployment** pointed at the Supabase dev branch.
- `main` deploys to production automatically once required checks pass. Auto-promotion is on because `main` is always deployable; that is what the branch protection is for.
- Immutable deployment URLs mean every past release stays addressable — which is what makes rollback instant.
- Production env vars live in the Vercel project (§7.5 of `HANDBOOK.md`), not in the repo. Changing one requires a redeploy to take effect; note that in the release if it matters.

### 6.2 Database (Supabase) — CI only

**Nobody applies a migration to production by hand. There is no exception to this.**

| Event               | What happens                                                                                                                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PR opened / updated | `CI / db` applies pending migrations to the **dev branch**, runs pgTAP, and the preview uses that schema                                                                                                            |
| Merge to `main`     | The release job runs `supabase db push` against the **production** project using `SUPABASE_ACCESS_TOKEN` + `SUPABASE_DB_PASSWORD`, then regenerates types and verifies none are stale                               |
| Before the push     | CI takes a fresh logical backup (`pg_dump`) and records the current migration head in the job summary                                                                                                               |
| After the push      | `supabase migration list` output and Supabase security advisors are appended to the job summary; a new **security** advisory fails the job loudly (the migration is already applied — this is an alert, not a gate) |

**Ordering.** Migrations run **before** the Vercel production deployment finishes promoting, so the schema is never behind the code. That makes every migration necessarily **expand-first**:

1. Add the new column/table as nullable with a default; deploy code that writes both old and new.
2. Backfill in a job.
3. Deploy code that reads the new shape.
4. A later release drops the old column.

Never rename a column in one step, never `NOT NULL` without a default on a populated table, never take a long lock in a migration. A migration that would lock a hot table gets split and noted in the PR.

---

## 7. Rollback playbook

### 7.1 Web — instant

```powershell
# fastest: Vercel dashboard -> Deployments -> the last good one -> Promote to Production
# or:
pnpm dlx vercel@latest rollback <deployment-url> --token $env:VERCEL_TOKEN --scope <org>
```

Takes seconds and requires no build. Then, in order: post in the incident channel with the deployment you rolled back _to_; open a `fix/` branch; write the failing test first; ship forward. Do not leave production on a rolled-back deployment overnight without an issue tracking the fix — the next merge to `main` will deploy over it.

If the bad release included a migration, roll back the web **first** (it is instant and usually sufficient, because expand-first migrations are backward compatible) and then decide about the schema.

### 7.2 Database — forward-fix policy

**Migrations are forward-only. We do not write `down` migrations and we do not run them.** A down migration is written when you are calm and run when you are not, against data that did not exist when you wrote it; it is the most reliable way to turn an incident into data loss.

To undo a schema change, write a **new** migration that reverses it, with the same review and pgTAP gates:

```powershell
git switch -c fix/db-revert-cover-index
pnpm db:diff -- -f revert_cover_assignments_index   # author the reversing SQL
pnpm db:test                                        # pgTAP must be green
# PR -> review -> merge -> CI applies it to production
```

Because expand-first is mandatory, the reversing migration is almost always cheap: drop the column that nothing reads yet, drop the index, relax the constraint.

**Emergency mitigations, in preference order** — try each before considering a restore:

1. **Feature flag off** — the fastest way to stop a bad write path. Toggle in the platform console; no deploy.
2. **Vercel rollback** — removes the code that writes the bad data.
3. **Tighten a policy or add a constraint** by forward migration — stops the bleeding while the real fix is written.
4. **Targeted data repair** — a reviewed SQL script run through CI (a migration), never an ad-hoc `UPDATE` in the SQL editor. `audit_events` gives you the before-images to repair from; that is what it is for.

### 7.3 Backup and restore

- **PITR** on the Supabase project (paid tier), retention per the current plan. This is the primary recovery mechanism.
- **Nightly logical backup** (`pg_dump`, custom format) plus a **pre-migration backup** taken by CI on every production migration, retained 30 days off-project.
- **A backup nobody has restored is a hypothesis.** The restore drill runs quarterly into a throwaway Supabase branch, and the result is recorded in `docs/test-reports/restore-drill-<date>.md`: time to restore, data loss window, what broke.

**Restore procedure** (S1 only, owner decision required — it loses everything written after the restore point):

1. Declare the incident, name a lead, start the log (`SECURITY.md` §7).
2. **Stop writes:** put the app in maintenance (flag or Vercel rollback to a maintenance build). Pause cron routes.
3. Pick the restore point from the audit trail — the last timestamp before the damaging change.
4. Restore **into a new Supabase branch first**, never over production. Verify row counts, the audit tail and a spot-check of affected records.
5. Owner approves the cutover. Promote the restored branch or restore into the project.
6. Re-apply any migrations created after the restore point, in order.
7. Re-point Vercel if the project ref changed; verify `/api/health`; re-enable writes.
8. Reconcile: identify data written after the restore point and lost, from logs and audit exports; notify affected schools with specifics.
9. Write-up within 5 working days.

---

## 8. Hotfix

For an S1/S2 defect in production that cannot wait for the normal queue. It skips the queue, not the gates.

1. Branch `fix/<area>-<slug>` from `main` (not from the release tag — `main` is what is deployed).
2. Write the failing test first. A hotfix without a regression test is a hotfix you will ship twice.
3. Minimal change. Resist the cleanup instinct; that is a separate PR.
4. Full required checks. They take minutes; an untested hotfix has taken down more systems than slow CI.
5. Squash-merge, patch changeset, release immediately as `v0.x.(y+1)`.
6. Release notes state the impact, the window, and whether data was affected.

---

## 9. Release checklist

Run through this on the version PR. Copy it into the PR description.

**Before merging the version PR**

- [ ] Every PR in this release is squash-merged with all required checks green
- [ ] Bump levels correct; no breaking change hiding in a patch
- [ ] `CHANGELOG.md` entries are readable by a non-engineer; feature ids and PR links present
- [ ] `### Database` section lists the migrations in this release, or says "none"
- [ ] Every feature part in this release has a signed-off `docs/test-reports/<feature>-part-<n>.md`
- [ ] Playwright green at **both** 360×800 and 1280×800; axe has zero serious/critical
- [ ] `docs/` is in sync: feature specs, `DATA-MODEL.md`, `docs/README.md`, any new ADR
- [ ] No feature flag shipped on by accident; flags intended to be on are listed in the notes
- [ ] `pnpm audit` clean at high+; no expired entries in `.audit-exceptions.json`
- [ ] Supabase advisors reviewed on the dev branch — no new **security** advisory
- [ ] If auth, payments or file handling changed: an authorized DAST pass against the preview, recorded (`SECURITY.md` §8)
- [ ] Migrations are expand-first and reviewed for locking
- [ ] Last good deployment URL noted, for rollback

**After the release job**

- [ ] Tag `v<version>` exists and points at the version-PR commit
- [ ] GitHub Release published with the notes template filled
- [ ] Production migration job green; `supabase migration list` head matches the changelog
- [ ] Vercel production promoted; production URL serves the new version
- [ ] `/api/health` returns ok with the new version string
- [ ] Sentry release created and source maps uploaded; no new issue class in the first 15 minutes
- [ ] Smoke test on production, on a real phone: sign in → open a school → take attendance → sign out
- [ ] Post the release link and the one-line highlight to the owner

**`v1.0.0` additionally**

- [ ] All five feature areas at Release-1 scope per `docs/plan/ROADMAP.md`
- [ ] pgTAP isolation + escalation coverage at 100 % of tenant tables (`coverage.sql` green with no allowlist exceptions)
- [ ] Full authorized DAST sweep across all eight checklists, no open high findings
- [ ] Restore drill completed within the last quarter
- [ ] Performance budgets met on production, not just preview
- [ ] Owner sign-off recorded in `docs/decisions/DECISION-LOG.md`
