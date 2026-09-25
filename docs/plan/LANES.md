# Parallel lanes (D-69)

From 2026-09-25 the build runs as four lanes at once, plus the lead. Each lane still finishes one Part completely (built, tested, reviewed, merged, deployed and checked) before it starts the next. Only the lead merges, one PR at a time.

## The lanes

| Lane                    | Code | Owns                                                                                                                       | Queue, in order                                                                                                                                               |
| ----------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lead                    | 0    | CI, releases, migration order, docs index, reviews, merges, `BUILD-LOG.md`, the changesets release PR, `HANDOFF-<date>.md` | Process and infrastructure changes only                                                                                                                       |
| Identity and onboarding | 1    | `(auth)`, `(onboarding)`, identity packages, F-ID-\* specs                                                                 | F-ID-05 P4 (wizard steps 3-5, `app.create_school_workspace`) → F-ID-03 P5-8 → F-ID-04 P1-6 → F-ID-05 P5 → M1 1.11 PDPA consent                                |
| Operations              | 2    | `(school)/app/{staff,settings,...}`, F-OP-06/F-OP-07, F-ID-07 notifications                                                | F-OP-06 P2 → F-OP-07 P1 remainder + P2 → F-ID-07 P2-4                                                                                                         |
| Billing                 | 3    | billing, plans/limits, access mode, F-CM-\* specs                                                                          | **requireWritable on every write path (due before mid-October)** → then M1 stream C (F-OP-05 P1-3 messaging, F-ID-01 P6 sessions) until M4 billing work opens |
| Design                  | 4    | tokens and theme in `packages/ui`, brand components, `DESIGN-SYSTEM.md`, icons/OG assets                                   | D-68 visual refinement + product logos → design passes on shipped screens (dashboard placeholder first)                                                       |

The roadmap's own streams (ROADMAP §4) still describe long-term ownership. This table is what runs now.

## Numbers each lane may use

| Lane       | Decision numbers | pgTAP files    |
| ---------- | ---------------- | -------------- |
| Lead       | D-69 to D-99     | `23_` to `29_` |
| Identity   | D-100 to D-199   | `30_` to `39_` |
| Operations | D-200 to D-299   | `40_` to `49_` |
| Billing    | D-300 to D-399   | `50_` to `59_` |
| Design     | D-400 to D-499   | `60_` to `69_` |

- Take the next unused number in your own range. Never use another lane's range. D-68 (design refinement) was reserved before lanes began and stays with the design lane.
- Decision entries go at the end of DECISION-LOG in merge order, so numbers will not be sorted. That is expected.
- **Migration timestamps carry no lane digit.** Write the real UTC time the file is created — `date -u +%Y%m%d%H%M%S` — as the 14-digit prefix. A fixed per-lane digit (e.g. lane 1 always sorting before lane 3 on the same day) would force a re-date on almost every merge regardless of which PR actually finished first; real wall-clock time sorts correctly on its own in the overwhelmingly common case, and `scripts/check-migrations-order.mjs` (below) catches the rare case where it doesn't.

## Migration order at merge time

`supabase db push` refuses a migration dated before the newest one already applied. Lanes merge in whatever order they finish, so a PR's real-time timestamp can still fall behind if another lane's migration lands later on main after this one was written. `scripts/check-migrations-order.mjs` fails CI when a PR's new migration sorts before the newest on main, and prints a name that would sort after it (the current UTC time, or one second past main's newest if that isn't later). The builder renames the file with `git mv` (it has never been applied, so this is allowed) and updates references. The lead never merges a PR with a red order check.

## Shared files

- Append-only files (DECISION-LOG, the docs/README test-report table, DATA-MODEL.md sections) conflict often. Before a PR is merged, the builder merges `origin/main` and resolves conflicts, keeping every other lane's entries.
- `packages/ui/src/components/ui/`: feature lanes may add new shadcn components (copied from the local registry). Only the design lane edits existing components or tokens.
- Cross-cutting work (billing's requireWritable touches write actions in every lane): the billing lane owns it. Once it merges, every new write action in any lane must call `requireWritable`.

## How a Part moves

1. The lead starts a builder with the brief (`docs/plan/BUILDER-BRIEF.md`), the lane and its next queue item.
2. The builder works in `.worktrees/<lane>-<slug>`: opens a **draft** PR within the first 30 minutes (owner rule, 2026-09-25: no UPS, load shedding can kill the PC at any moment) and pushes a WIP commit at least every 30 minutes and after every green local gate. The PR is marked ready (`gh pr ready <n>`) only once the full local gate is green, then waits for CI.
3. The lead runs reviews (Opus lead reviewer plus the ECC specialists for what the diff touches). Fixes go back in one batch and one push.
4. When CI is green and reviews are clean, the lead merges. If the PR has a migration, the lead confirms the live deploy and the smoke test before merging anything else.
5. The lane's next Part starts only after that.
6. After each merge the lead appends the `BUILD-LOG.md` entry. Once a day the lead merges the changesets release PR so every package `CHANGELOG` is current. The lead writes `docs/plan/HANDOFF-<date>.md` every 2 hours and pushes it, and also refreshes it at the end of each session (same no-UPS rule as step 2 — the lead's own work is saved just as constantly as a lane's).
