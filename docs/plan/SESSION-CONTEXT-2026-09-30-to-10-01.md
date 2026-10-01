# Session context — "Acadigma Latest", 2026-09-30 17:15 → 2026-10-01 ~07:30 (Dhaka)

The long record of one lead session, written so a new session (or a person) can pick up without the chat. Read this **after** `TODO.md`, `DONE.md` and the latest `HANDOFF-<date>.md` on this branch; those are the live state, this is the story and the reasoning behind it.

Lead: Claude (Opus) running the lead playbook (`~/.claude/skills/lead-playbook/SKILL.md`). Owner: the founder (non-programmer, Dhaka). Repo: `Mahadezz/acadigma-campus` (**public**). Website repo: `Mahadezz/Acadigma-website` (private). Production app: **https://campus.acadigma.com** (Vercel project `acadigma-campus-web`, team slug `mahadezzs-projects`). Website: **https://acadigma.com** (Vercel project `acadigma-website`). Lead memory: `C:\Users\Mahadi Sir\.claude\projects\C--Users-Mahadi-Sir\memory\acadigma-campus.md` (the per-repo memory dir is empty — lead memory lives under the home-folder project).

---

## 1. How the session started — power cut recovery

- The owner's PC lost power (no UPS). The previous lead session ("848d9d46") had already hit a usage limit at 11:44 Dhaka; its agents died with it. Note: clock labels "~13:30/~15:00" in earlier memory lines were wrong — the limit hit at 11:44.
- The owner asked for "damage control". Audit result: **nothing lost.** Every worktree was pushed; only #109's worktree had 5 uncommitted files (backed up to `F:\tmp\recovery-0930\`, later committed by its designer). `main` CI showed a red `guard` job on #121's merge — a race (commit→PR link not indexed yet); re-run green.
- The "damage control discussion" the owner mentioned happened on the other machine's session ("Acadigma Latest 2", offline) — not retrievable; handoff/TODO matched GitHub exactly, so nothing was missing.
- Timers recreated (handover every 2 h at :23, save sweep at :13/:43). These die with the session.

## 2. What merged (in order) and what it means

| PR | What (plain English) | Notes |
| --- | --- | --- |
| #124 | Consent contract: signed-in users can no longer call the 1-arg school/guardian functions (consent couldn't be skipped) | **Blocker for real schools cleared.** Migration 20260930052627 live |
| #82 | Class hub (basic mode) for older teachers | e2e failures were test leakage (basic mode left on shared seeded teacher) |
| website #3 | Honest website copy (no unbuilt features in present tense, sample data labelled, no student role, no "2027", no language marketing), 360 fixes | Was not live until the 07:10 redeploy on 10-01 |
| #125 | Existing users re-accept current Terms/Privacy; owners the DPA (D-115) | Demo accounts see the screen once after each seed |
| #122 | Attendance policy settings + live effect preview (D-212) | |
| #126 | Real `pnpm verify` / `pnpm test:contracts` (they never existed; Windows ran cmd `VERIFY`); Friday-safe attendance journeys | |
| #109 | Design System v2: liquid glass, light/dark/system, back button, language into Settings (D-408) | Fixed: production CSS minifier kept only `-webkit-backdrop-filter` → no blur on Chrome/Android |
| #127 | Polish: skeletons, pull-to-refresh, optimistic text size, press state (D-409) | Exams/marks skeleton exempted (refresh hang) → #135 |
| #129 | `docs/product/BUILD-UPDATES.md` — plain-English investor update with Dhaka times + links | Fact-check found 28 overstatements in the first draft. **Keep current after every merge.** |
| #128 | New campus front door in the acadigma.com look + "Get the app" (D-410) | |
| website #4 | "Sign in" + "Open/Get the app" links to campus.acadigma.com | Live only after the 07:10 redeploy |
| #130, #139 | BUILD-UPDATES lines | #139 also corrected #43 (it did ship the holidays screen) |
| #131 | Calendar make-up days and closures (D-213) | Security found edit could change date and silently overwrite → fixed |
| #133 | Faster pages: Sentry loads only with a DSN (~128 kB off every page), toasts after hydration; front-door follow-ups | Lighthouse / 2900 ms, /login 3039 ms |
| #132 | Signed-in devices: list, sign one out, sign out everywhere (D-116) | See §5 risks |

Production at session end: **e494ea2** (campus) — includes everything above; docs-only commits after it don't need deploying. Website production: **4c0d715**.

## 3. Open work at session end (agents die when the session closes)

| PR | State | Next step for a fresh session |
| --- | --- | --- |
| #135 exams/marks loading skeleton | design builder diagnosing why exam Lock/Unlock + marks views stop refreshing after an action when a `loading.tsx` boundary exists. Two fixes failed earlier (delete `router.refresh`; wrap in `startTransition`). Leads: `marks-entry.tsx:138` seeds state from props via `useState`; marks actions revalidate `/app/exams` only. Experiment PRs #143–#146 ("do not merge") were used to bisect on CI — **close them** | read the PR description's diagnosis notes; continue |
| #148 front-door motion | Opus designer adding acadigma.com's movement to the front door; D-411: no motion library — CSS + ~1 kB own JS (measured motion 49.6 kB / LazyMotion 32.6 / GSAP 28.4) | finish front-door.tsx, tabs, AuthCard, docs, videos → reviews (React, UI finish-gate, lead watches videos) |
| #134 staff self check-in (F-AC-04 P1, D-214) | built; **blocked 👤**: permission rule denies replacing `packages/db/src/types.generated.ts`, and `gh run download` won't overwrite | owner runs the one-time `!` command (below) or allows that one file in /permissions → CI → Opus security review |
| BUILD-LOG #89–#139 | docs agent writing entries (`docs/build-log-0930`) | review + merge if not done |
| #123 release | open | merge (close/reopen if CI didn't run) |
| #104/#106 | pentest report drafts | live DAST round 3 later |

One-time command for #134 (owner types it with `!` in a session started in the repo):
`! cd "/f/Acadigma Suite/acadigma-campus/.worktrees/ops-staff-checkin" && gh run download 36784518287 -n types-generated -D /f/tmp/types-134 && cp /f/tmp/types-134/types.generated.ts packages/db/src/types.generated.ts && git add packages/db/src/types.generated.ts && git commit -m "chore(db): regenerate types from CI (D-55)" && git push`
(If the CI run's artifact expired, re-run the PR's CI first and use the new run id.)

## 4. Decisions made in this session (all logged in DECISION-LOG via their PRs unless noted)

- D-115 re-acceptance is a UX/legal gate, not a security boundary; fail-open on read errors (logged `legal_gate_read_failed`).
- D-116 a device = a live Supabase session; revoke deletes the auth session; anti-enumeration returns `false`.
- D-213 calendar override permission `calendar.override.write` (owner, admin).
- D-214 (in #134) staff check-in — **lead decisions, owner may overturn** (also in TODO §1c): card on dashboard + basic-mode home; no check-in on non-school days; self writes present/late (+ minutes late), checkout only time; server Dhaka clock; RPC-only writes; defaults 08:00 + 10 min grace, no settings UI yet.
- D-410 front door uses the acadigma.com theme (signed-in app keeps D-408 glass). D-411 (in #148) motion without a library.
- Lead calls not needing a D-number: "Open the app" stays primary on the website Campus page; PRODUCTS config kept for future parents./students./ledger. front doors; Parents worded "coming soon as its own app; invited parents can already see results in Campus".
- **Timetable parked**: spec (`bell_schedules` + `bell_periods`) vs DATA-MODEL (`periods`) conflict + bell times also in settings → needs an Opus spec pass before any builder.

## 5. Risks and findings to remember

- **No Supabase dev branch exists.** CLAUDE.md says local dev uses one; `supabase branches list` is empty. Local runs and `pnpm db:push` hit **production**. Needs an owner decision (paid branch or a second free project) and a CLAUDE.md fix.
- **#132 hosted privilege unproven:** whether the definer owner can DELETE from the real hosted `auth.sessions` was never tested (no dev branch). Fails safe ("Could not sign out"). Owner to try sign-out-a-device once.
- **Revoked device window:** JWT expiry 3600 s → owner to set 600 s in the Supabase dashboard. `config.toml` already 600.
- **Vercel Hobby limit** (100 deploys/day, account-wide) blocked releases 4 times in two days; Vercel does **not** retry — redeploy by hand (Vercel tool `create_deployment` with `deploymentId` of the last prod deploy + `withLatestCommit: true`, `target: production`). Owner was advised to get Vercel Pro.
- **next/font Google download flake** breaks builds ~4 times/day (`Cannot read properties of null (reading '1')`). Fix = self-host fonts, blocked on owner permission to download the files.
- `curl` (even localhost) and fetching the live site are denied by permissions — don't retry; use the browser tool or Vercel/GitHub status instead.
- The auto-mode classifier refuses merges without a recorded review → always run a reviewer agent first, merge with `--match-head-commit <full sha>`.
- A builder once ran a machine-wide `taskkill /FI "WINDOWTITLE eq *"` — every builder prompt now says: only kill PIDs you started.
- Never do a step a builder was denied (permission laundering) — surface it to the owner.
- The Campus repo is **public** — no costs, secrets, owner to-dos or personal data in it (BUILD-UPDATES included).

## 6. Owner to-dos (in order of impact)

1. Vercel Pro. 2. types.generated.ts permission (blocks #134). 3. Supabase JWT expiry → 600 s. 4. Test database: Supabase dev branch (paid) or a second free project. 5. Try "sign out a device" on the live app. 6. `DEMO_ACCOUNT_PASSWORD` secret (blocks the investor demo; after #125 each demo account must accept the Terms screen once per seed). 7. Google Workspace (one user ~$7–8/month + free aliases info/support/privacy/security/billing/legal; lead gives Namecheap DNS records). 8. Font-download permission (self-host fonts). 9. SMS provider (phone sign-in). 10. Website Parents wording (proposed above). 11. Rotate the 21st.dev key + Sentry token pasted in chat earlier; spend caps; Supabase Confirm email + Max rows; US-site decision; lawyer questions; keep the repo public or not.

## 7. Things the owner asked for and how they were handled

- "Damage control" after the power cut → §1.
- Auto-mode config → owner ran `/auto-mode-setup`; lead explained what can't be allowed (secrets, rulesets, production, deletion).
- Status, timeline estimates → first launch build ~4–8 weeks at current pace, ~3–5 weeks with a bigger Claude plan + Vercel Pro; roadmap target ~April 2027 (may move).
- Tailscale preview → set up on :8443 (tailnet only; Data Pilot's public Funnel on 443 → :8000 untouched), then removed at the owner's request ("forget the tail scale for Acadigma"). Don't offer again unless asked.
- Local preview → `next start -p 3100 -H 127.0.0.1` from the main checkout (stopped at session end). The lead may not create accounts on it (cloud-backed); the owner registers themselves.
- Screenshots/video → 50 s slideshow from CI screenshots (scratchpad, not in repo); real tap-through recording waits on the demo password.
- Front door redesign + "Get the app" → #128/#133; motion → #148.
- Website linking to Campus → website #4, live after the 07:10 redeploy.
- Investor update → `docs/product/BUILD-UPDATES.md` (#129, #130, #139).
- Learning path (non-programmer) → web basics (CS50x/MDN) → GitHub (PRs, checks) → the project's own docs (BUILD-UPDATES, PRD, ROADMAP, SECURITY) → optional coding; offered a "project tour for the owner" doc (not yet written).
- Domain emails → recommended one Google Workspace user + aliases; same addresses for US and BD; app emails from a sending subdomain later.

## 8. How to resume (fresh session)

1. Start the session **in the repo folder** (`F:\Acadigma Suite\acadigma-campus`), invoke `lead-playbook`.
2. Read TODO.md, DONE.md, HANDOFF-2026-10-01.md on `handoff/live`, then this file.
3. Save sweep; recreate timers; check `gh pr list` (#135, #148, #134, BUILD-LOG PR, #123).
4. Fresh builders for #135 and #148 (read the PR descriptions' notes); unblock #134 when the owner has acted.
5. Keep BUILD-UPDATES.md and the Brain vault current; Brain regen: `py -3 "F:\Acadigma Suite\_lead-tools\brain-src\build_brain.py"`.
