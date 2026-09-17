<!--
  Title must be a Conventional Commit — it becomes the squash commit and the changelog line.
  e.g.  feat(attendance): save daily register with idempotency key
  Keep this PR to ONE Part from the feature spec. Open it as a draft on your first commit.
-->

## What and why

<!-- What changed, and why it matters to a user. Two or three sentences. Not a list of files. -->

**Feature:** <!-- F-<area>-<nn> — name, Part <n> -->
**Spec:** <!-- docs/features/<area>.md#<anchor> -->
**Decisions:** <!-- D-nn, or "none" -->
**Closes:** <!-- #issue, or "none" -->

## How it works

<!-- The approach, and anything a reviewer would otherwise have to reverse-engineer.
     Call out: new dependencies (and why), use of withServiceRole (and why),
     anything that deviates from ARCHITECTURE.md. -->

---

## Definition of Done

Tick only what is true. An unticked box with a reason is fine; a ticked box without evidence is not.

- [ ] **Spec** — this Part is specified in `docs/features/<area>.md` with acceptance criteria, and the code matches it
- [ ] **Migration + pgTAP** — forward-only migration; every tenant table touched has an RLS **isolation** test _and_ an **escalation** test; `coverage.sql` green
- [ ] **Unit** — domain rules and server actions tested; `packages/domain` ≥ 80 %, repo ≥ 70 %
- [ ] **UI both viewports** — built and verified at **360×800** and **1280×800** (screenshots below)
- [ ] **Playwright** — acceptance criteria exist as a journey, running at both viewports
- [ ] **a11y** — axe clean of serious/critical; 44 px targets; keyboard path completes; `aria-live` on save/error; no horizontal scroll at 360
- [ ] **Test report** — committed in this PR, with real numbers, signed off
- [ ] **Docs** — spec / `DATA-MODEL.md` / `docs/README.md` / ADR updated **in this PR**
- [ ] **Changeset** — added (`pnpm changeset`), or `no-changeset` label with the reason below

**Test report:** <!-- docs/test-reports/<feature>-part-<n>.md -->
**Preview:** <!-- Vercel preview URL -->
**Playwright report:** <!-- CI artifact link -->

---

## Screenshots

Both viewports, one row per screen changed. A UI PR without these will be sent back.

| Screen                   | 360 × 800 (phone) | 1280 × 800 (desktop) |
| ------------------------ | ----------------- | -------------------- |
| <!-- /app/attendance --> | <!-- image -->    | <!-- image -->       |
|                          |                   |                      |

<!-- Synthetic seed data only. Never a screenshot containing a real name, phone number,
     ID number or medical detail — see CODE_OF_CONDUCT.md. -->

---

## Security review

Tick what applies and say how it is handled. "N/A" is an acceptable answer; a blank is not.

- [ ] Adds or changes a **server action / route handler** — input parsed with Zod, `WorkspaceContext` resolved, `can()` checked before the write
- [ ] Adds or changes a **table or policy** — RLS enabled, role _and_ tenant predicated, tenant reassignment blocked, audit trigger attached
- [ ] Touches **money** — amounts computed server-side from `platform_settings`, integer paisa, nothing read from the request body
- [ ] Touches **files** — private bucket, `/api/files/[id]` only, 5-minute signed URL, `file_access_log` written, MIME + magic-byte validated
- [ ] Touches **membership or roles** — no client path to create/update; self-edit of `role`/`status` blocked in RLS and tested
- [ ] Touches **AI** — credits reserved before the provider call, output Zod-parsed, no tool with write access
- [ ] Uses **`withServiceRole`** — reason stated here: <!-- … -->
- [ ] Adds a **dependency** — reason, maintenance status and install-script check: <!-- … -->
- [ ] None of the above

**Notes:** <!-- anything a reviewer should look at closely -->

---

## Database

- [ ] No schema change
- [ ] Schema change — migration(s): <!-- 20260921T1102_*.sql -->
  - [ ] Forward-only (no edits to applied migrations, no `down`)
  - [ ] **Expand-first** — backward compatible with the currently deployed code
  - [ ] No long lock on a populated table
  - [ ] `pnpm db:types` regenerated and committed
  - [ ] `docs/architecture/DATA-MODEL.md` updated

---

## Feature flag

- [ ] Behind a flag — key: <!-- area.flag_name --> · default: off · removal tracked in the spec
- [ ] Not behind a flag — reason: <!-- … -->

---

## Rollback

<!-- If this turns out to be wrong in production, what is the move?
     Usually: flag off, or Vercel rollback. If a migration makes it more complicated, say so. -->

---

## Reviewer checklist

<!-- For @Mahadezz — leave unticked; the reviewer fills these in. -->

- [ ] No rule from HANDBOOK §1 is broken
- [ ] The DoD boxes above are backed by evidence I can see
- [ ] The test report is real — numbers match the CI run
- [ ] I read the RLS policy / money path / file path myself, not just the tests
- [ ] The code will be understandable in six months
