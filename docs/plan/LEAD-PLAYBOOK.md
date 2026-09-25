---
name: lead-playbook
description: >
  The owner's standing rules for running a multi-part software build as the
  lead: parallel builder agents on separate branches and worktrees, one Part
  at a time done perfectly, reviews by named skills and ECC agents, docs kept
  current (changelog, decision log, build log, specs), work saved constantly,
  handovers every 2 hours, recovery after usage limits. Use at the START of
  every session on Acadigma Campus (or any multi-part build), whenever the
  owner says "keep going", "run agents", "push it to the max", "continue",
  or asks about process, and before starting, reviewing or merging any Part.
---

# Lead playbook (owner's standing instructions)

The owner does not want to re-explain any of this. Follow it by default,
every session. Where it says "Acadigma", the details live in the repo:
`F:\Acadigma Suite\acadigma-campus\docs\plan\` (LANES.md, BUILDER-BRIEF.md,
BUILD-LOG.md, HANDOFF-<date>.md) and memory note `acadigma-campus.md`.

## 0. Start of every session (do these first, in order)

1. Read memory (`MEMORY.md` + `acadigma-campus.md`), then the latest handoff:
   `git fetch origin handoff/live` and read `docs/plan/HANDOFF-<latest>.md`
   from that branch. Then `gh pr list` and `git log origin/main -5`.
2. Recover anything a power cut or usage limit interrupted: for every
   worktree, push committed-but-unpushed work (`git push -u origin HEAD`);
   leave uncommitted files for their builder; resume cut-off agents with
   SendMessage (their context survives) rather than starting new ones.
3. Create the session timers (they die with the session):
   - recurring every 2 hours (off-minute, e.g. `23 */2 * * *`): refresh the
     handover (section 6).
   - one-shot for any report the owner asked for (e.g. weekly report).
4. Load the discipline skills yourself: `karpathy-guidelines`, `ponytail`.
5. Tell the owner in plain English what is running and what (if anything)
   is waiting on them. Then keep going without asking.

## 1. How work is organised

- **Parts, one at a time per lane.** A Part is finished only when it is
  built, tested, reviewed, green in CI, merged, deployed and (if it has a
  migration) its live deploy + smoke test verified. Never start a lane's
  next Part before its current one is merged. Never build a new feature on
  top of an unfinished one.
- **Parallel lanes.** Up to 4 lanes run at once (Acadigma: identity,
  operations, billing, design), each builder in its **own git worktree and
  branch** (`.worktrees/<lane>-<slug>`, `feat/<area>-<slug>`), its **own
  port** (Acadigma: lead 3100, identity 3101, ops 3102, billing 3103, design
  3104, +10 for a second builder in a lane; set `PLAYWRIGHT_PORT`), its own
  decision-number range and pgTAP file range (see LANES.md).
- **No overstepping.** Before every merge run the lane-overlap check (files
  touched by more than one open PR must be zero outside shared append-only
  docs). When two lanes must touch one file, give each an explicit rule
  (one only inserts, the other only adds).
- **Only the lead merges**, one PR at a time, squash. After a merge that
  makes other PRs CONFLICTING, send those builders "merge origin/main, keep
  every lane's entries, gate, push once".
- **Migrations** sort after the newest on main. Use the real UTC time
  (`date -u +%Y%m%d%H%M%S`) for the filename; if two open PRs collide, the
  lead assigns names. `supabase db push` refuses out-of-order names.

## 2. Agents and skills to use (always)

- **Builders:** general-purpose agents. Model: Sonnet by default; Opus for
  database/security-heavy Parts (auth, RLS, children's data, money).
  Retire a builder whose context is very long (> ~500k tokens) and start a
  fresh one for its lane's next Part — cheaper per turn.
- **Every builder prompt says:** read the builder brief (Acadigma:
  `docs/plan/BUILDER-BRIEF.md`), invoke `karpathy-guidelines` and `ponytail`
  first, use its lane's port/ranges, draft PR within 30 minutes, WIP push at
  least every 30 minutes, full gate before marking ready, report in < 250
  words.
- **Reviews on every PR before merge**, chosen by what the diff touches:
  - lead reviewer (general-purpose, Opus or Fable): scope vs spec, tests,
    docs, over-engineering (ponytail), what the next Parts need;
  - `security-reviewer` (auth, RLS, input, anything tenant/children/money);
  - `engineering-database-optimizer` (any migration);
  - `react-reviewer` (any .tsx), `typescript-reviewer` (TS logic);
  - `e2e-runner` for Playwright work; `ponytail-review` for bloat;
  - `gstack` for QA/browser flows and live-site bug hunts.
    Send ALL findings back to the builder as ONE batch; re-verify security
    fixes with the same security reviewer before merging.
- **Frontend:** shadcn components only — the ones in `packages/ui`, else
  copy from the local registry `F:\shadcn-ui\apps\v4\registry\new-york-v4`.
  Never hand-roll a replacement. Creative/animated (Aceternity,
  `component-library` skill) only for marketing surfaces.
- **Design (Acadigma):** acadigma.com ink/paper + D-68 blend (6px radius,
  hairline rings, mono eyebrows). Bengali UI uses **Western digits**
  (`bn-BD-u-nu-latn`); Bengali numerals only on printed report cards.
- `context-budget` skill if context headroom is in doubt.

## 3. Definition of done for a Part (checked before merge)

Migration + pgTAP first → contracts (Zod) → domain + unit tests → repository
→ server action (parse → context → policy → requireWritable → repo → Result)
→ UI at 360x800 and 1280x800 → Playwright journey + axe. RLS + isolation and
escalation tests on every table; composite FKs with workspace_id; audit;
read-only guard. Docs in the same PR: spec §11 status, DATA-MODEL, DECISION-
LOG entry, honest test report with real CI numbers, docs/README row,
changeset. Full local gate (install, format, typecheck, lint, test, every
`scripts/check-*.mjs`, build) before every push. CI green on every required
check (Vercel check is not required).

## 4. Documents kept current along the way

- **DECISION-LOG:** every real decision, including ones made in chat and
  infrastructure/account choices. Record owner decisions with the date.
- **BUILD-LOG:** one entry per merged PR (what shipped, decisions,
  migrations applied, deploy/smoke result, review findings). Batch the
  entries into one docs-only PR.
- **CHANGELOG:** every package change carries a changeset; merge the
  changesets release PR once a day.
- **Specs / DATA-MODEL / README / test reports:** updated by the PR that
  changes them.
- **Memory:** after each merge, append a one-line note to the project
  memory; save any new owner rule as a feedback memory.

## 5. Saving work (the owner has no UPS; load shedding kills the PC)

- Builders: draft PR within 30 minutes, WIP commit + push at least every
  30 minutes and after every green gate. Nothing important stays local.
- Lead: after a usage-limit or power cut, push every worktree's committed
  work before anything else.

## 6. Handover every 2 hours (real clock time)

Write `docs/plan/HANDOFF-<date>.md` (one file per day, refreshed) on the
`handoff/live` branch (worktree `.worktrees/handoff`) and push it. Contents:
main's state (merged PRs, live migrations, deploy/smoke), every open PR
(head sha, CI, review state, what's left), every running builder and its
Part, migration names assigned today, chat decisions not yet logged, owner
to-dos, exact next steps. Refresh the memory "NEXT" line at the same time.

## 7. Safety rules (never break)

- Never read `.claude/settings.local.json`; never print tokens or passwords;
  tell the owner never to paste secrets in chat.
- Never `git stash` in shared worktrees; never force-push `main`; never
  rewrite history on a branch another PR stacks on.
- C: drive is full: set `TMP`/`TEMP`/`TMPDIR` to `F:\tmp` for every
  pnpm/node/next/playwright command; never delete on C: without asking.
- Remove Windows worktrees with `git worktree remove` then PowerShell
  `Remove-Item -LiteralPath '\\?\F:\...' -Recurse -Force`.
- Touching live data (seeding production, deleting accounts) needs the
  owner's explicit yes first.
- If a permission is denied, don't route around it; tell the owner the
  exact setting to change.

## 8. Usage limits

Hitting the limit stops every agent until it resets (~5 hours). To stretch
it: builders on Sonnet unless DB/security-heavy; routine reviews on Sonnet,
lead and security reviews on Opus/Fable; retire long-context agents; keep
3-5 agents running, not more. After a reset: section 0 step 2.

## 9. Talking to the owner

Plain English, short, lead with the outcome. Say what merged, what is
running, and what is waiting on them (settings only they can change,
product questions, approvals). Recommend rather than list options. Admit
mistakes plainly and fix them. Give the weekly report when due.
