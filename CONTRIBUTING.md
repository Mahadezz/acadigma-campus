# Contributing to Acadigma Campus

Acadigma Campus is a school operations app for Bangladesh — attendance, timetables, exams, teaching resources, hiring, a marketplace and billing — built phone-first as a Next.js 15 + Supabase application.

It holds children's records, government ID scans and money. That single fact sets the standard for everything below.

The full working agreement is **[`docs/engineering/HANDBOOK.md`](docs/engineering/HANDBOOK.md)**. This file is the short version and the entry point.

---

## Start here

| I want to…                             | Read                                                                               |
| -------------------------------------- | ---------------------------------------------------------------------------------- |
| Understand how the system is built     | [`docs/architecture/ARCHITECTURE.md`](docs/architecture/ARCHITECTURE.md) — binding |
| Understand what we're building and why | [`docs/product/PRODUCT-DECISIONS.md`](docs/product/PRODUCT-DECISIONS.md)           |
| Know how we work day to day            | [`docs/engineering/HANDBOOK.md`](docs/engineering/HANDBOOK.md)                     |
| Write tests                            | [`docs/engineering/TESTING.md`](docs/engineering/TESTING.md)                       |
| Understand the security rules          | [`docs/engineering/SECURITY.md`](docs/engineering/SECURITY.md)                     |
| Know what CI checks                    | [`docs/engineering/CI.md`](docs/engineering/CI.md)                                 |
| Ship a release                         | [`docs/engineering/RELEASES.md`](docs/engineering/RELEASES.md)                     |
| Find any document                      | [`docs/README.md`](docs/README.md)                                                 |

---

## Setup (Windows)

Node 24, pnpm 10, no Docker. Local development runs against the **Supabase dev branch in the cloud**.

```powershell
git clone https://github.com/Mahadezz/acadigma-campus.git
cd acadigma-campus
corepack enable; corepack prepare pnpm@10 --activate
pnpm install
Copy-Item .env.example apps\web\.env.local   # then fill it in — see HANDBOOK §7.5
pnpm supabase login
pnpm db:types
pnpm dev
```

PowerShell has no `&&`; use `cmd; if ($?) { cmd2 }`. Use Git Bash for anything under `supabase/` or `scripts/*.sh`. Full notes, including every command and environment variable: HANDBOOK §7.

---

## The workflow

1. **Branch** from `main`: `feat/<area>-<slug>`, or `fix/`, `chore/`, `docs/`, `refactor/`.
2. **Push on the first commit and open a draft PR.** Work in the open; a branch that lives only on your machine is a risk.
3. **Commit** with [Conventional Commits](https://www.conventionalcommits.org/): `feat(attendance): save daily register with idempotency key`. Examples in HANDBOOK §3.
4. **One Part per branch.** A Part is a ≤2-day chunk from the feature spec. A branch open longer than three days should have been two branches.
5. **Run `pnpm verify` before every push** (`typecheck && lint && test && test:contracts`).
6. **Add a changeset** (`pnpm changeset`) when you change behaviour, a package API or the schema.
7. **Mark ready for review** when the Definition of Done is complete. Fill the whole PR template.
8. **Squash merge** after green CI and an approval from `@Mahadezz`.

---

## Definition of Done

Every box, every time (D-14). "Mostly done" is not a state this project has.

- [ ] **Spec** — the Part exists in `docs/features/<area>.md` with acceptance criteria
- [ ] **Migration + pgTAP** — forward-only migration; RLS **isolation** _and_ **escalation** tests for every tenant table touched
- [ ] **Unit** — domain + server actions; `packages/domain` ≥ 80 %, repo ≥ 70 %
- [ ] **UI both viewports** — built and verified at **360×800** and **1280×800**
- [ ] **Playwright** — the acceptance criteria as a journey, running at both viewports
- [ ] **a11y** — axe clean of serious/critical; 44 px targets; keyboard path works
- [ ] **Test report** — `docs/test-reports/<feature>-part-<n>.md`, signed off, with real numbers
- [ ] **Docs** — spec, `DATA-MODEL.md`, `docs/README.md`, any ADR — updated **in this PR**
- [ ] **Merged** — squash-merged with all required checks green

---

## The rules that get PRs rejected

1. **The database and the server are the security boundary.** UI guards are experience. Every write needs a `can()` check _and_ an RLS policy, and tests for both.
2. **Tenant context never comes from the client.** `WorkspaceContext` is resolved from `workspace_members`. Nothing else constructs it.
3. **Zod at every boundary** — actions, handlers, webhooks, jobs, forms. No `any`.
4. **No client-side filtering of tables.** Server-filtered, cursor-paginated, always.
5. **Migrations are forward-only and applied by CI.** Never push to production from a laptop.
6. **Money is computed server-side**, in integer paisa, from `platform_settings`. Never from the request body.
7. **Audit rows are written by database triggers**, never by application or client code.
8. **No secrets in the repo, in logs, or in error messages.** gitleaks runs pre-commit and in CI.
9. **A behaviour change with no docs change in the same PR is incomplete.**

Every one of these exists because the predecessor app got it wrong and exposed real data. The evidence is in [`docs/reference/base44-security-review.md`](docs/reference/base44-security-review.md); read it before your first PR, and it will all make sense.

---

## Reporting things

- **Security vulnerability** → **do not open an issue.** Follow [`SECURITY.md`](SECURITY.md).
- **Bug** → `.github/ISSUE_TEMPLATE/bug.yml`. Include the reference code from the error screen if you have one; it maps to a `correlation_id` and finds everything.
- **Feature idea** → `.github/ISSUE_TEMPLATE/feature.yml`. Product scope is settled in `docs/product/PRODUCT-DECISIONS.md`; a proposal that contradicts it needs to argue with that document.

---

## Decisions

Non-obvious, expensive-to-reverse choices go in [`docs/decisions/DECISION-LOG.md`](docs/decisions/DECISION-LOG.md) as a numbered `D-nn` entry, in the same PR as the first code that depends on them. Format and rules: HANDBOOK §11.

If your PR contradicts an accepted decision, it is blocked until a superseding entry is merged. "The code already does it differently" is not an argument.

---

## Code of Conduct

Participation is governed by [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).
