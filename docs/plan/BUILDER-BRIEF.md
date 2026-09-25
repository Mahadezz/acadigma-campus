# Builder brief — Acadigma Campus (read fully before starting)

Repo: public GitHub `Mahadezz/acadigma-campus`. `gh` must be authenticated.

## Before writing any code

1. Invoke the `karpathy-guidelines` skill and the `ponytail` skill (Skill tool). Apply them: think before coding, reuse what exists, simplest thing that works, surgical changes, every behaviour proven by a test.
2. Read: `CLAUDE.md` (non-negotiable rules, "Rules learned in practice", Definition of Done), `docs/plan/HANDOFF-2026-09-24.md`, `docs/plan/ROADMAP.md` (your row), your feature spec under `docs/features/` in full (Part scope, acceptance criteria, screens, §11 status), `docs/architecture/DATA-MODEL.md`, `docs/architecture/DESIGN-SYSTEM.md` (ink/paper visual language, D-57), `docs/decisions/DECISION-LOG.md`.

## Hard rules

- PORTS: one lane = one port, so parallel builders never test each other's server (Playwright reuses any server already on its port locally). Always set `PLAYWRIGHT_PORT` and pass the same `--port` to any `next start`/`next dev` you run: lead 3100, identity 3101, operations 3102, billing 3103, design 3104 (a second builder in the same lane adds 10: e.g. design 3114). Stop every server you started before you hand back.
- DISK: C: is full. In EVERY shell command that runs pnpm/node/vitest/next/playwright, first `export TMP='F:\tmp' TEMP='F:\tmp' TMPDIR='F:\tmp'` (mkdir -p /f/tmp). ENOSPC errors mean you forgot. Do not delete anything on C:.
- Work only in your own worktree: `git worktree add .worktrees/<name> -b <branch> origin/main`.
- NEVER `git stash`. NEVER force-push. Do NOT merge PRs. Never read `.claude/settings.local.json` (secrets).
- After every `git merge origin/main`: run `git status`, resolve every UU conflict BEFORE committing; `git grep -nE '^(<<<<<<<|>>>>>>>) '` must be empty before any commit. Never chain `git commit` blindly after a merge.
- Migration timestamps carry no lane digit — write the real UTC time you create the file (`date -u +%Y%m%d%H%M%S`). Use ONLY your lane's decision range and pgTAP range (see Lanes below). Migrations must sort after every migration on main (CI enforces this — `scripts/check-migrations-order.mjs`).
- New client-callable functions need explicit `grant execute` (defaults deny, D-54). New tables need RLS + pgTAP isolation/escalation (`supabase/tests/coverage.sql` and `scripts/check-coverage-test-files.mjs` enforce it).
- Count RLS-protected rows as `postgres` (`tests.logout()`) in pgTAP unless asserting caller visibility. Pin error messages in `throws_ok` (use the 4-arg form).
- Seeded/live-account Playwright journeys: `test.skip(!process.env.E2E_LIVE_SUPABASE, ...)`.
- If the `db` job's "Generated types match this PR's migrations" step fails: `rm packages/db/src/types.generated.ts && gh run download <run-id> -n types-generated -D packages/db/src`, then check `git diff --stat` shows the change, commit. (`gh` refuses to overwrite an existing file and prints nothing — without the `rm` the download silently does nothing.)
- If CI does not start after a push: `gh pr view <n> --json mergeable` — `CONFLICTING` means GitHub won't run `pull_request` workflows; merge `origin/main` and resolve, don't poll.
- The Vercel preview check is skipped on branches other than `main` (D-70) — it is not a required check, ignore it.
- Commit trailer: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.

## Lanes (D-69, `docs/plan/LANES.md`)

- You are assigned ONE lane (identity=1, operations=2, billing=3, design=4) and ONE Part from its queue. Use only your lane's ranges: decisions (identity D-100..199, operations D-200..299, billing D-300..399, design D-400..499; take the next unused in your range), pgTAP files (identity 30_-39_, operations 40_-49_, billing 50_-59_, design 60_-69_). Migration timestamps carry no lane digit — they're the real UTC time the file is written (`date -u +%Y%m%d%H%M%S`). Worktree `.worktrees/<lane>-<slug>`.
- Stay in your lane's folders. Feature lanes may ADD shadcn components to `packages/ui/src/components/ui`; only the design lane edits existing components or tokens. Once `requireWritable` merges, every new write action calls it.
- If `check-migrations-order` fails (another lane merged a later migration first): `git mv` your unapplied migration to the suggested name, update references, re-run the gate.
- Before the lead merges you'll be asked to merge `origin/main`: keep every other lane's entries in `DECISION-LOG.md`, the `docs/README.md` test-report table and `DATA-MODEL.md`.
- **Save work constantly** (owner rule, 2026-09-25: no UPS, load shedding can kill the PC at any moment): open your PR as a **draft** within the first 30 minutes and push a WIP commit at least every 30 minutes and after every green local gate (`wip: ...` commits are fine; they are squashed at merge). Drafts skip the heavy `e2e`/`lighthouse` jobs and a newer push cancels the older run, so this is cheap. Mark the PR ready (`gh pr ready <n>`) only when the full gate is green; review fixes still go as one batch.
- Vercel previews are off (only `main` builds, D-70); make screenshots locally with Playwright.

## Frontend components (owner rule, 2026-09-25)

1. Use the shadcn component already in `packages/ui/src/components/ui/` (36 exist: button, input, select, command, popover, sheet, dialog, drawer, calendar, radio-group, tabs, form, table, ...).
2. If one is missing, COPY it from the owner's local shadcn registry `F:/shadcn-ui/apps/v4/registry/new-york-v4/ui/<name>.tsx` (Git Bash `/f/shadcn-ui/...`), keep its structure, style it with our ink/paper tokens (D-57), add it to `packages/ui`. Do not hand-roll a replacement for a component shadcn has (combobox = Command+Popover, segmented/toggle = toggle-group, date = calendar+popover or input type=date).
3. Aceternity/creative components from the `component-library` skill only for expressive/marketing surfaces, never the calm working screens (DESIGN-SYSTEM).

## Definition of Done (same PR)

Migration + pgTAP first → contracts (Zod) → pure domain + unit tests → repository → server action (parse → context → policy → domain/repo → Result) → UI at 360x800 then 1280x800 with existing `packages/ui` primitives and tokens → Playwright journey + axe. Docs: spec §11 status/deviations, `DATA-MODEL.md` for any migration, `DECISION-LOG.md` entry if a real decision was made, test report `docs/test-reports/<date>-<part>.md` from `_TEMPLATE.md` (honest: pgTAP/e2e are CI-only locally; paste real CI numbers), `docs/README.md` listing, changeset for apps/packages.

## Gate before every push

`pnpm install --frozen-lockfile && pnpm format:check && pnpm typecheck && pnpm lint && pnpm test`, every `node scripts/check-*.mjs`, `pnpm --filter @acadigma/web build`. Commit often; push WIP to your draft PR (see Lanes).

## Finish

Open the PR (body ends with "🤖 Generated with [Claude Code](https://claude.com/claude-code)"), poll `gh pr checks <n>` until every required check passes. Report under 250 words: PR number, head sha, CI per job, what was built vs spec, decisions, open questions, anything that depends on another open PR.
