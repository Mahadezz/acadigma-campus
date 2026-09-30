# TODO — Acadigma Campus (living list)

The owner's open requests and the build's open work, in priority order. **Read this and `DONE.md` at the start of every session** (with the latest `HANDOFF-<date>.md` on this branch). Update both whenever something starts, moves, finishes or is blocked — never leave a finished item here. Plain English first, technical detail after.

Legend: 🔴 blocked · 🟡 in progress · ⚪ not started · 👤 needs the owner.

Last updated: 2026-09-30 late evening Dhaka.

---

## 1. Investor demo — "an older teacher's morning" on a live link · 🔴👤

**Goal (owner):** investors are waiting; a clickable demo on the live app, phone-first. Owner chose (no preference → lead decided): one clearly named fictional demo school on production.

**Done:**
- Seed job built and security-reviewed: `.github/workflows/demo-seed.yml` + `scripts/demo-seed.sh` + `supabase/seed/demo-school*.sql` (#107, #111, decision D-80). Creates the demo school, Class 6 – ক with 40 fictional students (010-range phones), a teacher (basic mode, class + subject teacher), an owner, a parent linked to one child, ~3 weeks of attendance, one exam with marks and published results. Re-runnable; touches nothing but the demo school; a pre-registered demo email is deleted and recreated.
- 5-minute investor script: `docs/product/DEMO-SCRIPT.md` (doesn't pitch languages or depend on colours).

**Left:**
1. 👤 Owner adds the GitHub environment secret `DEMO_ACCOUNT_PASSWORD` (Settings → Environments → production; ≥ 12 chars; the owner keeps it). The lead is blocked from writing secrets by the tool's safety layer.
2. Lead runs Actions → **Demo seed** on `main`; checks the job summary ("trial ends on …").
3. Lead does a browser QA pass (gstack / Playwright) at 360×800 on the live demo following DEMO-SCRIPT.md; fixes anything broken.
4. Send the owner the link, the three logins (teacher/owner/parent `.demo@example.com`) and the script.

**Watch:** the demo school goes read-only 30 days after the first seed run (normal trial) — run the seed within 30 days of each demo. Rotate the password after demo days and re-run the seed. Ideally #109 (new look) and #82 (class hub) land first so investors see the polished version.

## 2. Design System v2 — ✅ merged #109 (see DONE). Follow-ups (ponytail LATER list) are in the #109 test report.

**Owner's words:** "the UI … looked so cheap and generic use glass morphism liquid glass … a white theme as well so dark and white theme both"; "don't market that it's also in bangla … language selector tucked away in the settings panel"; "no going back options … I want a going back thing … pc and phone and tablets … optimize it for phone".

**Done (on the branch, not merged):** Settings → Appearance with Light / Dark / System; language picker moved into Settings (the "switch to বাংলা" button on home removed); glass tokens and utilities; tap feedback on toggles, tabs, choice cards and bottom-nav items; Skeleton styled for glass; DESIGN-SYSTEM.md v2 with a UX-laws checklist; decision D-408 (supersedes D-68's visual rules).

**Left:**
- The first visual pass looked flat and generic (lead reviewed screenshots) → a fresh Opus designer is redoing the visual layer: ambient gradient backdrop, visibly translucent glass, strong hierarchy, phone-first header + bottom nav, named generic defaults avoided; must self-review screenshots at 360×800, tablet (~820×1180) and 1280×800.
- Shell-level **back button** on every non-top-level page (phone/tablet chevron, desktop chevron + parent name; in-app history, else logical parent; tabs keep state in the URL).
- CI green (build currently red), react-reviewer + ponytail-review, lead checks screenshots, merge.
- Follow-ups noted by the builder: add Appearance to the Settings list; move new copy into messages json; replace the ad-hoc back links on exams/marks/roll call/settings pages after #82 merges.

## 3. Polish Part — skeletons, instant taps, pull-to-refresh · 🟡 starting 2026-09-30 (design lane)

**Owner:** the "5 tells of a vibe-coded app" video + "what about the phone's pull refresh?". Standing skill: `~/.claude/skills/app-polish/SKILL.md`.

**Already true:** offline queue (attendance) and show-last-state read cache (F-ID-11).

**Left (measured on main 2026-09-29):** loading skeletons on every data route (only 1 of 42 has `loading.tsx`); optimistic updates for small actions (0 today; never for payments/publishing); pull-to-refresh on phone data screens (not built); tap feedback on the rest of the pressables (button has no press state on main).

## 4. (moved to DONE — #115 merged 2026-09-29)

## 5. Account deletion — ✅ merged #119 (see DONE)

**Owner:** "dont forget to add the account and workspace deletation". Spec: 30-day grace with banner + cancel; blocked while sole owner of a school (points to ownership transfer); nightly purge job anonymises, keeps audit rows. Was scheduled for M4 (~Apr 2027) — pulled forward; log the pull-forward as a decision in the PR.

## 6. Workspace (school) deletion — ✅ merged #117 (see DONE). Follow-up BEFORE any real school uses deletion: the purge has no statement_timeout, so one very large school that always exceeds 60 s would fail first every night and block the queue — add an attempts counter / move it to the back, and measure a 2,000-student multi-year fixture. 👤 7-year audit retention → lawyer.

Built: owner-only export (CSV zip, 3/day, downloads directly — deviation from the spec's emailed 7-day link; files not included), archive/restore (read-only, restorable 12 months), delete with 30-day grace + banner + cancel, daily service-role purge; blocks on subscription/unpaid balance; purge refuses a school with files (FILES_PRESENT). Deferred: module visibility + ID patterns (next ops Part), stop billing at period end. 👤 Decision: a deleted school's audit trail is kept 7 years — confirm with a PDPA lawyer (added to the lawyer questions).

Owner-only; type the school name to confirm; 30-day cancellable grace with daily banner; refused while a subscription or unpaid balance exists; final platform audit record. Same Part: transfer ownership, export all data (CSV zip, 7-day link), archive/unarchive. Pulled forward; log it.

## 7. Browser tests in CI — ✅ merged #90 (see DONE). Follow-ups: bn-locale-shell flake (stalled refresh, not shared state); students page sits exactly at the 250 kB budget; optional `.max(256)` on the sign-in password schema.

Runs every logged-in Playwright journey in CI against a seeded database, so "green" means the UI really works. Shards 1 & 3 green; 2 & 4 were failing — fresh Opus builder fixing root causes. **Unblocks #82 and the live security round.**

## 8. Class hub (basic mode) — ✅ merged #82 (see DONE). Not live until the Vercel deploy limit resets → lead redeploys main.

All reviews passed (React, lead; Undo fix corrected so a late-joining student keeps their mark). Held so its browser journey runs for real in CI once #90 lands; then merge.

## 9. Lane Parts in progress

- **identity: consent contract** ✅ merged #124. Next in lane: **#125 re-acceptance** (D-115) — existing users re-accept current Terms/Privacy, owners the DPA; security + DB MERGE, React FIX FIRST (Back link loops) → builder fixing → re-verify → merge + verify migration 20260930113432 live. ⚠ After it merges every demo account sees the accept screen once: accept once per demo login before an investor demo (DEMO-SCRIPT prep).
- **ops: #122 attendance policy** — last fix: journey marks one absence via the real roll-call UI and asserts the effect line (isolation-safe) → React re-verify → merge.
- **design: #109 Design System v2** — screenshots approved by lead; React FIX FIRST + ponytail batch (journey for theme + back button, admit-sheet preload, contrast script, drop count-up, drop duplicate in-page Back links, bottom padding, no strikethrough) → re-verify → merge.

- identity: fresh Opus builder — next queue Part OR the legal-audit consent/ToS/DPA fixes (builder decides + logs).
- ops: fresh Sonnet builder — next F-OP-07 Part (3 attendance policy / 4 grade scale / 5 calendar / 6 remainder), chosen for pilot + demo value.

- **#112 (identity)** F-ID-03 Part 7 — remove a member, leave a school, transfer ownership. Draft.
- Each needs: green CI → lead reviews (security Opus for anything touching roles/RLS, DB review for migrations, React/TS) → one fix batch → re-verify → merge → verify live migration + smoke.

## 10. Small PRs waiting on CI

- **#113** docs-sync exempts the version-only release PR (stops the manual "docs: none" patch after every merge).
- **#116** new release PR → after #113 merges, close/reopen so CI runs, merge.

## 11. Security loop — build → attack → fix → repeat · 🟡 (live round 3 now unblocked by #90)

**Owner:** "start … attack the app get the report and fix … loops … until it is fixed". Scope (owner): code + local server + preview deploys, **never production**.
- Round 1 (#104) and Round 2 (#106): 0 critical/high/medium; 1 low (CSP ships Report-Only while SECURITY.md §5.2 reads as enforcing). Both are draft report PRs (docs-sync fails on them — fix after #113 or add a README row).
- Round 3 (live two-school attack) needs #90's seeded accounts; the sandbox can't read `.env.local`.
- From #110 review (LOW): advisory lock in set_current_academic_year should use the two-key form (hashtext('set_current_academic_year'), hashtext(ws)); add pgTAP 'School A owner + School B year id → P0002'; when results/GPA start reading exam_weights, re-validate them server-side at compute time (keys must be real exams in that workspace/year, sum = 100).
- Backlog: enforce CSP or correct §5.2; `isoDateSchema` real calendar check (2026-13-45 passes Zod today); `10_tenancy_cascade` throws_ok for the data_requests freeze trigger.

## 12. Docs owed

- ✅ Local gate + Friday-safe attendance journeys — merged #126 (0427a1f): `pnpm verify` / `pnpm test:contracts` now exist.
- **Self-host fonts** 🔴👤 (after #109 merges — touches apps/web/app/fonts.ts): `next/font/google` downloads fonts at build time; the download failed twice on 2026-09-30 (#122 build, #126 e2e shard 4: `TypeError: Cannot read properties of null (reading "1")` in next/font google loader). Switch to `next/font/local` with the font files committed → no network in the build.
  - Blocked 2026-09-30: downloading the font files was denied by permissions (curl to fonts.googleapis.com / fonts.gstatic.com). 👤 Owner: allow that once, or drop the woff2 files in F:	mponts (Inter variable latin; Hind Siliguri 400/500/600 bengali+latin; JetBrains Mono 400/500 latin), or approve @fontsource packages (new dependency → decision). Worktree .worktrees/lead-fonts (chore/self-host-fonts) is ready, nothing committed.

- BUILD-LOG entries for #93–#111 (one docs-only PR).
- Prompt-audit findings for CLAUDE.md / playbook / BUILDER-BRIEF (13 findings, delivered in chat 2026-09-29): apply the project hunks (#1–5, #10–13) in a docs PR; **#8 and #9 need the owner** (#8 lanes start independent work while a PR waits; #9 CLAUDE.md still says merges need the owner's approval, but the owner now lets the lead merge).
- BUILDER-BRIEF: tell builders to load `ux-laws` + `app-polish` for UI work (the playbook already says so).

## 14. Owner-shared guides → follow-ups (2026-09-30)

- **Legal/compliance audit** ✅ (see below) — running (read-only, Opus): owner's "app legal checklist" adapted to Bangladesh PDPA 2026, children's data, SMS consent, privacy policy vs real SDKs, subscription cancellation, account deletion. Deliverable: `docs/product/legal/LEGAL-AUDIT-2026-09-29.md` PR + questions for a Bangladeshi lawyer.
- **Legal audit done → PR #118** (docs; 24 issues, 12 lawyer questions). Acting on it: ✅ website false claims fixed (acadigma-website #1 merged); still open from the website: product films still animate unbuilt features (redesign-scale), and 👤 the US phone/WhatsApp number shows sitewide (branch `fix/honest-claims` in acadigma-website: biometrics, unbuilt/AI features, FERPA, prices vs D-78, US-site pricing hidden — 👤 owner decides whether to keep the US site). Still open from the audit: Terms of Service + Privacy Policy pages don't exist but sign-up asks users to agree (and the agreement is discarded, actions.ts:92); no DPA step at school creation; guardian linking stores no consent record; account/workspace deletion + data export (queued as §5/§6). Merge #118 after a read.
- **Runbooks** ⚪ — owner's "Runbooks prompt": docs-only, P0/P1 incident runbooks verified against the repo (DB down, migration failure, Vercel deploy/rollback, auth outage, leaked key, data export for a school), NOT VERIFIED where unknown, no secrets. Queue for the testing/security lane after #90.
- **"3Agents" Drive folder** (planner / builder / qa) — the same planner → builder → QA split this project already runs; contents not opened.
- Skills installed after SkillSpector scans: `apple-design` (APPROVE), `taste-skill` (CAUTION — never use its fake-logo "Trusted by" advice), 7 Agency agents (APPROVE). Rule saved: scan everything before install.
- **Performance audit** ⚪ — from the "App Performance Prompt Pack": (1) response compression — Vercel/Next already brotli/gzip; just verify; (2) **batch database writes** — audit repositories for per-row loops / N+1 queries; (3) circuit breakers + timeouts — only when SMS/email/payment providers land (not needed yet); (4) optimistic UI — already in §3 polish; (5) cache rendered content — marketing pages only. Run the `Performance Benchmarker` agent on a slow-phone profile after #109.
- **Domain + email setup** ⚪👤 (before any real email/SMS goes to schools): app on `app.`/`campus.` subdomain of acadigma.com (check what Vercel serves today); transactional email from `notifications.` and any marketing from `updates.` subdomains (Resend), each with SPF + DKIM + DMARC (don't overwrite an existing DMARC); Google Search Console + sitemap for acadigma.com (public pages only, never app pages). DNS changes need the owner's registrar login.
- **Design method** — reference-first + self-check added to #109 (DESIGN-SYSTEM.md "Reference" section, approved screenshot set, finish-gate + persona reviews). Skill `taste-skill` (design-taste-frontend) installed for marketing/landing pages.
- **Jev (TypeSafe)** — maybe later for flagging unsafe parent–teacher messages; US-hosted, English-first → PDPA review first. Not now.

## 13. Owner-only items (record; don't nag)

- 👤 **Vercel deploy limit hit (2026-09-30 ~19:00):** the Hobby plan allows 100 deployments/day per ACCOUNT. Campus already deploys only `main` (apps/web/vercel.json), so the quota is being spent by the other projects on the account (acadigma-website previews, other client sites). Effect: #82 (merged 581c2b2) is not live until the limit resets (~24 h); production keeps serving the last good deploy (#124). Options: upgrade to Vercel Pro (~$20/month, far higher limit) — recommended once schools pilot; or turn off preview deploys on the other projects. Lead redeploys main after the reset.

- 👤 Vercel: set a spend limit (Settings → Billing); Supabase: check the plan's spend cap — from the owner-shared hosting-bill post (invisible meters cause bill shock).
- 👤 Decide whether to keep the US-region version of acadigma.com (US phone number, placeholder US pricing).

- 👤 `DEMO_ACCOUNT_PASSWORD` secret (see §1) — the only thing blocking the demo.
- 👤 Supabase Campus: Authentication → Email → **Confirm email** ON; Project Settings → Data API → **Max rows 1000**. Or re-connect the Supabase connector while signed in to the Campus account so the lead can do it (today it only sees the other account).
- 👤 Sentry: revoke the auth token pasted in chat; send the project **DSN** (not urgent — before the first pilot school).
- 👤 Old Docker disk copy on C: (`C:\Users\Mahadi Sir\AppData\Local\Docker\wsl\disk\docker_data.vhdx`, 11.6 GB) — say "delete it" once Docker has run fine from F: for a day.
- 👤 Optional: GitHub ruleset → allowed merge methods → Squash only.
