# TODO — Acadigma Campus (living list)

The owner's open requests and the build's open work, in priority order. **Read this and `DONE.md` at the start of every session** (with the latest `HANDOFF-<date>.md` on this branch). Update both whenever something starts, moves, finishes or is blocked — never leave a finished item here. Plain English first, technical detail after.

Legend: 🔴 blocked · 🟡 in progress · ⚪ not started · 👤 needs the owner.

Last updated: 2026-10-01 ~07:30 Dhaka (end of session "Acadigma Latest" — read SESSION-CONTEXT-2026-09-30-to-10-01.md).

---

## 0. 👤 Owner's 3-day checklist (written 2026-10-01, do before Monday)

Everything only the owner can do, most important first, with exact steps. Tick each box when done. Screen labels in Vercel, Supabase and Google change sometimes; if a label is slightly different, look for the closest match. **Never paste a password, key or token into the Claude chat** — put it only where each step says.

### Day 1 — unblock the build (≈ 30 minutes)

- [ ] **1. Vercel Pro** (stops the daily deploy limit that blocked 4 releases)
  1. Go to vercel.com and sign in.
  2. Top-left, pick the team **mahadezzs-projects**.
  3. **Settings → Billing** → **Upgrade to Pro** (about $20 per member per month). Pay with your card.
  4. Still in Billing, open **Spend Management** and set a monthly limit you're comfortable with (for example $50), with an email alert.
  5. Done — nothing to tell Claude; deploys will simply stop failing.

- [ ] **2. Unblock staff check-in (#134)** — a permission rule stops Claude replacing one auto-generated file.
  - **Easiest:** on Monday, start Claude in `F:\Acadigma Suite\acadigma-campus` and, before saying "continue", paste this line (it starts with `!`, which runs it as you):
    `! cd "/f/Acadigma Suite/acadigma-campus/.worktrees/ops-staff-checkin" && gh run download 36784518287 -n types-generated -D /f/tmp/types-134 && cp /f/tmp/types-134/types.generated.ts packages/db/src/types.generated.ts && git add packages/db/src/types.generated.ts && git commit -m "chore(db): regenerate types from CI (D-55)" && git push`
  - If it says the artifact is missing or expired, just tell Claude "re-run #134's CI and give me the new command".
  - **Permanent fix (recommended, so it never blocks again):** in Claude type `/permissions` → **Allow** → add `Bash(rm packages/db/src/types.generated.ts)` → save.

- [ ] **3. Supabase security settings** (Campus project — the one Claude calls `kekfmibwjejdhxjkmezo`)
  1. Go to supabase.com/dashboard and open the **Campus** project.
  2. **Access-token lifetime → 600 seconds:** **Project Settings → JWT Keys** (or **Authentication → Sessions** on some versions) → find **Access token expiry / JWT expiry** → change **3600** to **600** → Save. (Why: a signed-out lost phone loses access after 10 minutes, not 1 hour.)
  3. **Confirm email ON:** **Authentication → Sign In / Providers → Email** → turn **Confirm email** on → Save.
  4. **Max rows 1000:** **Project Settings → Data API** → **Max rows** → **1000** → Save.
  5. **Spend cap:** **Organization → Billing** → if you're on a paid plan, make sure **Spend cap** is ON.

- [ ] **4. Try "sign out a device" once** (proves #132 works in production)
  1. On your phone, sign in at **campus.acadigma.com**.
  2. On your laptop, sign in too.
  3. On the laptop: **Account → Security → Signed-in devices** → next to your phone, press **Sign out**.
  4. Refresh the phone — it should go to the sign-in page.
  5. Tell Claude on Monday: "sign-out worked" or the exact message you saw (e.g. "Could not sign out").

### Day 2 — the investor demo and email (≈ 1 hour)

- [ ] **5. Demo password secret** (the only thing blocking the investor demo)
  1. Make up a strong password (12+ characters) and save it in your password manager.
  2. Go to github.com/Mahadezz/acadigma-campus → **Settings** → **Environments** → **production** (create it if missing).
  3. **Environment secrets → Add environment secret** → Name: `DEMO_ACCOUNT_PASSWORD` → Value: your password → **Add secret**.
  4. Tell Claude on Monday: "demo secret added". Claude then runs the demo seed, tests it, and gives you the logins. Before showing investors, sign in once to each demo account (teacher, owner, parent) and accept the Terms screen.

- [ ] **6. Company email (Google Workspace, about $7–8/month)**
  1. Go to workspace.google.com → **Get started** → plan **Business Starter** → choose **"I have a domain"** → enter `acadigma.com`.
  2. Create your user (e.g. `mahadi@acadigma.com`) and pay.
  3. Google asks you to **verify the domain**: it shows a **TXT record**. In another tab: namecheap.com → **Domain List** → **acadigma.com → Manage** → **Advanced DNS** → **Add new record** → type **TXT**, Host `@`, Value = the text Google gave → save. Back in Google, press **Verify** (can take up to an hour).
  4. **Mail records:** in Namecheap **Advanced DNS**, under **Mail Settings** choose **Custom MX** → add **MX**, Host `@`, Value `smtp.google.com`, Priority `1` (use exactly what Google's setup screen shows). Don't touch the existing A/CNAME records — those keep the website online.
  5. **SPF:** add **TXT**, Host `@`, Value `v=spf1 include:_spf.google.com ~all` (if a TXT starting `v=spf1` already exists, edit it instead of adding a second).
  6. **DKIM:** in admin.google.com → **Apps → Google Workspace → Gmail → Authenticate email** → **Generate new record** → copy the TXT host + value into Namecheap → back in Google press **Start authentication**.
  7. **DMARC:** add **TXT**, Host `_dmarc`, Value `v=DMARC1; p=none; rua=mailto:mahadi@acadigma.com`.
  8. **Aliases (free):** admin.google.com → **Directory → Users** → your user → **Add alternate emails** → add `info`, `support`, `privacy`, `security`, `billing`, `legal`.
  9. Tell Claude on Monday which addresses exist — Claude puts them into the Privacy Notice, Terms, app Help and the website.

- [ ] **7. Fonts** (stops the random build failures)
  1. Go to fonts.google.com and download these families (**Get font → Download all**): **Inter**, **Hind Siliguri**, **JetBrains Mono**.
  2. Unzip all three into a new folder `F:\tmp\fonts`.
  3. Tell Claude on Monday: "fonts are in F:\tmp\fonts".

### Day 3 — security clean-up and decisions (≈ 30 minutes)

- [ ] **8. Revoke the keys that were pasted in chat earlier**
  1. **21st.dev:** sign in at 21st.dev → account/API keys → **revoke** the old key. If you still want the 21st.dev design tool, create a new key and add it yourself in the Claude MCP settings (never paste it in chat).
  2. **Sentry:** sentry.io → **Settings → Auth Tokens** → **revoke** the token you pasted before. Then **Projects → (your project) → Settings → Client Keys (DSN)** → copy the **DSN** — that one is safe to send to Claude; it switches on error reports.

- [ ] **9. Decide: a test database** (today, local testing hits the real production database)
  - **Option A (recommended): a second free Supabase project** called `acadigma-campus-dev` in region **Mumbai (ap-south-1)** — free, separate, safe. Create it at supabase.com → **New project** and tell Claude its name. (Free plans allow 2 active projects per organization; pause an unused one if needed.)
  - **Option B: Supabase Branching** — needs the Pro plan (about $25/month + small branch costs).
  - Tell Claude "A" or "B".

- [ ] **10. Quick answers** (reply in one message on Monday)
  - Website Parents page: OK to say *"Parents app coming soon; parents invited by their school can already see results in Campus"*? (yes/no)
  - Keep the US-region version of acadigma.com (US phone number, placeholder prices)? (keep/remove)
  - Keep the Campus code repo **public** on GitHub? (public/private)
  - Old Docker disk copy on C: (11.6 GB, `C:\Users\Mahadi Sir\AppData\Local\Docker\wsl\disk\docker_data.vhdx`) — "delete it"? (yes/no)
  - Staff check-in decisions in §1c (card on both homes, no check-in on holidays, 08:00 + 10-minute grace) — OK? (yes / what to change)

- [ ] **11. Optional, when you have time**
  - Pick an SMS provider for phone-number sign-in (Claude can compare Bangladeshi gateways for you on Monday).
  - Lawyer questions: `docs/product/legal/LEGAL-AUDIT-2026-09-29.md` (12 questions) and `docs/product/OWNER-QUESTIONS.md`.


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

## 1b. One front door for the Acadigma apps — ✅ campus #128 live; website #4 merged, deploy waiting on the Vercel limit

**Left:**
- Follow-ups from the reviews (fresh design builder): headline wraps to 4 lines at 360 (lower the clamp minimum); 360 header "Get the app" pill → ink; reserve the tab-row height so the lazy tabs don't jump; Lighthouse LCP on / sits at ~3.5 s — take the median of several runs in CI rather than one; self-host fonts (👤 permission) removes the build flake that hit 4 builds on 2026-09-30/10-01.
- Website copy (owner not yet answered): Parents page "not available yet" → "Parents app coming soon; invited parents can already see results in Campus".
- Later: parents./students./ledger. front doors are config (PRODUCTS) once those domains exist.

## 1c. Staff self check-in (F-AC-04 Part 1) · 🟡 ops lane (2026-10-01)

Lead decisions made so the builder doesn't guess (recorded in the spec + DECISION-LOG in its PR; 👤 owner may overturn any):
- The check-in card shows on the dashboard **and** the basic-mode home (older teachers land there).
- No check-in on weekends/holidays ("No school today"); those days aren't written as rows.
- Self check-in records present or late (with minutes late); checking out only records the time; only an admin can mark half-day (later Part).
- Check-in time comes from the server's Dhaka clock, never the phone's; writes only through a checked database function.
- Default start 08:00 with 10 minutes' grace, no settings screen yet.

**Timetable** is parked: its spec and DATA-MODEL disagree on the table shape (one `periods` table vs `bell_schedules` + `bell_periods`), and bell times also appear in school settings — needs an Opus spec pass before any builder starts.

## 2. Design System v2 — ✅ merged #109 (see DONE). Follow-ups (ponytail LATER list) are in the #109 test report.

**Owner's words:** "the UI … looked so cheap and generic use glass morphism liquid glass … a white theme as well so dark and white theme both"; "don't market that it's also in bangla … language selector tucked away in the settings panel"; "no going back options … I want a going back thing … pc and phone and tablets … optimize it for phone".

**Done (on the branch, not merged):** Settings → Appearance with Light / Dark / System; language picker moved into Settings (the "switch to বাংলা" button on home removed); glass tokens and utilities; tap feedback on toggles, tabs, choice cards and bottom-nav items; Skeleton styled for glass; DESIGN-SYSTEM.md v2 with a UX-laws checklist; decision D-408 (supersedes D-68's visual rules).

**Left:**
- The first visual pass looked flat and generic (lead reviewed screenshots) → a fresh Opus designer is redoing the visual layer: ambient gradient backdrop, visibly translucent glass, strong hierarchy, phone-first header + bottom nav, named generic defaults avoided; must self-review screenshots at 360×800, tablet (~820×1180) and 1280×800.
- Shell-level **back button** on every non-top-level page (phone/tablet chevron, desktop chevron + parent name; in-app history, else logical parent; tabs keep state in the URL).
- CI green (build currently red), react-reviewer + ponytail-review, lead checks screenshots, merge.
- Follow-ups noted by the builder: add Appearance to the Settings list; move new copy into messages json; replace the ad-hoc back links on exams/marks/roll call/settings pages after #82 merges.

## 3. Polish Part — ✅ merged #127 (see DONE). Follow-up: exams/marks loading.tsx (router.refresh after an action does not land with a loading boundary — leads: marks-entry.tsx:138 seeds state from props via useState; marks actions revalidate /app/exams only). 👤 owner: try pull-to-refresh on a real phone.

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

- 👤 **Try it once on campus.acadigma.com:** sign in on two devices, then Account → Security → sign one out. If it shows "Could not sign out", tell the lead (means production lacks DELETE on auth.sessions — there is no dev branch to test on).
- ⚠ **There is no Supabase dev branch** (CLAUDE.md says local dev uses one) — local runs and `pnpm db:push` point at production. Lead to raise a decision: create a dev branch (paid Supabase feature) or a second free project for development.

- 👤 **Blocking #134 (staff check-in): regenerated DB types file.** A permission rule blocks deleting packages/db/src/types.generated.ts, and the documented CI download (D-55) refuses to overwrite it. Owner either runs the one-time `!` command given in chat (gh run download 36784518287 → copy → commit → push in .worktrees/ops-staff-checkin) or allows deleting that one generated file via /permissions (recommended — it recurs on every schema PR).

- 👤 **Supabase JWT expiry → 10 minutes** (Authentication → Sessions / JWT settings, 3600 → 600 s). Why: after "sign out this device" (#132), a stolen or lost phone's current access pass keeps working for direct API calls until it expires — today up to an hour, with children's data. The app's own pages already block it; this closes the direct-API gap. Security review (Opus), 2026-10-01.

- 👤 **Vercel deploy limit hit (2026-09-30 ~19:00):** the Hobby plan allows 100 deployments/day per ACCOUNT. Campus already deploys only `main` (apps/web/vercel.json), so the quota is being spent by the other projects on the account (acadigma-website previews, other client sites). Effect: #82 (merged 581c2b2) is not live until the limit resets (~24 h); production keeps serving the last good deploy (#124). Options: upgrade to Vercel Pro (~$20/month, far higher limit) — recommended once schools pilot; or turn off preview deploys on the other projects. Lead redeploys main after the reset.

- 👤 Vercel: set a spend limit (Settings → Billing); Supabase: check the plan's spend cap — from the owner-shared hosting-bill post (invisible meters cause bill shock).
- 👤 Decide whether to keep the US-region version of acadigma.com (US phone number, placeholder US pricing).

- 👤 `DEMO_ACCOUNT_PASSWORD` secret (see §1) — the only thing blocking the demo.
- 👤 Supabase Campus: Authentication → Email → **Confirm email** ON; Project Settings → Data API → **Max rows 1000**. Or re-connect the Supabase connector while signed in to the Campus account so the lead can do it (today it only sees the other account).
- 👤 Sentry: revoke the auth token pasted in chat; send the project **DSN** (not urgent — before the first pilot school).
- 👤 Old Docker disk copy on C: (`C:\Users\Mahadi Sir\AppData\Local\Docker\wsl\disk\docker_data.vhdx`, 11.6 GB) — say "delete it" once Docker has run fine from F: for a day.
- 👤 Optional: GitHub ruleset → allowed merge methods → Squash only.
