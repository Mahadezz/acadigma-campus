# DONE — Acadigma Campus (living list)

Everything finished, newest first, with the proof. Pair with `TODO.md`. When an item in TODO finishes, move it here with its PR, merge commit and how it was verified.

---

## 2026-10-01

- **#132 merged + live** (e494ea2, D-116): Account → Security → Signed-in devices — list your devices, sign one out, sign out everywhere (with confirmation); new-device sign-in notification (no screen yet, F-ID-07). Migration 20260930204524 applied in production; Vercel deployed e494ea2 (so #133 is live too). Security (Opus) MERGE ×2, DB/React FIX FIRST → MERGE. Hosted DELETE on auth.sessions unproven (no dev branch) — fails safe with an error if missing.
- **#133 merged** (ce4f273): pages load faster — Sentry loads only when a DSN exists (~128 kB off every page), toast region after hydration; front-door follow-ups (2-line headline at 360, ink header pill, reserved tab height). Lighthouse best-of-3: / 2900 ms, /login 3039 ms. React MERGE ×2. **Production deploy rate-limited** — timer 2026-10-02 04:37 redeploys.
- **#131 merged + live** (82a9ffc, D-213, 03:52 Dhaka): school calendar — make-up days and closures (owner/admin add, edit, remove with a reason; teachers read-only); attendance % picks them up via app.is_school_day. Security (Opus) FIX FIRST (edit could change the date and silently overwrite) → MERGE. BUILD-UPDATES line owed.
- **#128 merged + live** (7644650, D-410): campus.acadigma.com front door and sign-in/register pages in the acadigma.com look — hero at the website's scale with a "Campus is live" mono eyebrow, "Open Campus" action, "Get the app" tabs (Web/Android/iPhone/Windows/Mac, honest browser-install steps, store apps "coming later"), compact app rows (Campus live; Parents/Students/Ledger coming soon), removed false claims (fees/bKash/messaging). Reviews: UI finish-gate FIX FIRST → PASS, React MERGE ×2. Production deployed.
- **acadigma-website #4 merged** (4c0d715): "Sign in" in nav/footer, "Open the app" / "Get the app" on the Campus page. **Production deploy rate-limited by Vercel** — redeploy after the reset.
- **#129 merged** (e8b013a): `docs/product/BUILD-UPDATES.md` — plain-English investor build update, Dhaka times, links; fact-checked against every PR (28 overstatements corrected). Owner request.
- **#127 merged** (1eea748, D-409): polish — shared PageSkeleton + loading.tsx on every data section except exams/marks (refresh hang, follow-up), pull-to-refresh on phone shells, optimistic text size with rollback, button press state. Security (Opus) MERGE ×2 (streamed 200-before-forbidden accepted; negative assertions made non-vacuous), React FIX FIRST → MERGE. Production deployed.

## 2026-09-30

- **#109 merged** (e860b50, D-408): Design System v2 — liquid glass on an ambient backdrop, Light/Dark/System in Settings → Appearance, language picker moved into Settings, shell back button on every sub-page (history, else logical parent), glass blur fixed on Chrome/Android (minifier kept only the -webkit- line), toasts meet contrast, admit sheet lazy-loaded (students page 206 kB). Lead screenshot check + React (FIX FIRST → MERGE) + ponytail batch; new design-system-v2 journey at 360/1280 with axe.
- **#125 merged** (0ab12c2, D-115): existing users re-accept current Terms/Privacy, owners the DPA; deletion + export stay reachable. Security + DB MERGE, React FIX FIRST → MERGE. Migration 20260930113432 live. Demo accounts see the screen once after each seed (DEMO-SCRIPT prep).
- **#122 merged** (56a702b, D-212): attendance policy settings with a live effect preview. React FIX FIRST ×2 → MERGE; journey marks a real register.
- **#126 merged** (0427a1f): real `pnpm verify` / `pnpm test:contracts`; attendance journeys skip on the seeded school's Friday off-day.
- **Production deployed e860b50** after the Vercel limit reset — #82, #122, #125, #126, #109 all live.

- **#124 merged** (b362638, D-114 contract): signed-in users can no longer call the 1-arg create_school_workspace / accept_guardian_invitation (a direct API call skipped recording consent); audit row on every legal acceptance. Security (Opus) + DB reviews MERGE; migration 20260930052627 live, DB smoke + Vercel ok. **Blocker for real schools cleared.**
- **#82 merged** (581c2b2): class hub (basic mode) for older teachers. Live-e2e failures were test leakage (a journey left the shared teacher in basic mode), fixed with cleanup in finally — 173 passed / 0 failed; e2e-runner review MERGE. **Not live yet:** the Vercel account hit its 100 deploys/day limit — redeploy main after the reset.
- **acadigma-website #3 merged** (5c03a6e): design-audit fixes + honest copy (no unbuilt features in present tense, sample figures labelled, no student role, no "2027" date, no language marketing), 360px overflow fixes. React review FIX FIRST → re-verify MERGE.
- Recovery after the owner's PC lost power (~17:15): nothing lost; #109's 5 uncommitted files backed up (F:\tmp\recovery-0930) and committed by its designer; main guard false-red (commit→PR link race) re-run green.

- **#121 merged** (0ce4be9, D-114): interim Terms / Privacy / DPA pages at /legal/* (marked "not yet reviewed by a lawyer"); sign-up records Terms+Privacy acceptance (+ 18 or older); school creation requires and records DPA acceptance; parent-link screen shows consent text and records consent. Closes legal-audit HIGH items 4–6. Builder's 4 reviews + lead Opus security MERGE; migrations live, production deployed.
- #120 release merged.

- **#90 merged** (7709a58): every logged-in Playwright journey now runs in CI against a seeded local Supabase (4 shards, no retries) — green CI now proves the UI works. Also fixed: sign-in throttle off-by-one + counts every non-infrastructure failure (brute-force protection can't silently switch off), register-existing-email message (allowed by F-ID-01 §4.1), 360px top-bar overflow with the offline chip, service worker no longer relays RSC requests; test seed refuses to run where real accounts exist. 2 Opus security rounds + React review; migration live.

- **#119 merged** (9927a0f): delete your own account — type DELETE + password (password sign-in within 5 min enforced in the database), all sessions end, "Keep my account" banner for 30 days, blocked while sole owner of a school (links to transfer), nightly purge anonymises to "Deleted user" and keeps school records. 2 Opus security rounds; migrations live. Owner request 2026-09-29 done (with #117).

- **#117 merged** (43ddf15): Settings → Danger zone, owner only — export (CSV zip), archive/restore (12 months), delete with 30-day grace + banner + cancel, nightly purge (≤5 schools/run, oldest first, refuses suspended schools, unpaid balances, files). 2 Opus security reviews + DB review; migrations live.
- **acadigma-website #2 merged**: design audit (Apple principles) — top issue: coming-soon pages and films still present unbuilt features as working → fixes in progress.
- threeui (MengTo) scanned: 100/100 by the skill scanner but false alarms (it's a web app, not a skill: 119 'code outside scanner coverage', CLI refuses to overwrite without --force). Verdict CAUTION — never install as a skill; copy single components by hand if wanted for the website.

- **#112 merged** (a328806): remove a member, leave a school, transfer ownership (password sign-in within 5 min; the only way to become owner; a removed owner comes back only as admin). 2 Opus security reviews; migrations live (Database run success).
- **acadigma-website #1 merged** (50c0784): public site no longer claims biometrics, unbuilt/AI features (now "coming soon"), FERPA, or "setup fee waived / rate for life / cancel anytime"; prices match D-78 (৳15,000 onboarding never waived, 24-month price lock); "multiple languages"; US pricing hidden behind Contact us.

- #118 merged: legal/compliance audit (docs/product/legal/LEGAL-AUDIT-2026-09-29.md) — 24 issues, 12 lawyer questions; website false claims being fixed.
- NVIDIA SkillSpector installed; skills scanned before install (apple-design, taste-skill, 7 Agency agents).
- Recovered cleanly from the 02:30 usage limit; all six builders resumed.

## 2026-09-29

### Merged to main (each: reviews passed, CI green; migrations verified live with the Database run + smoke)

| PR | What it does, in plain English | Proof |
| --- | --- | --- |
| #115 | A personal-only account can now **Create a school** or **Join a school with a code** from the workspace switcher (it was untappable) and from a big button on the personal home (owner report) | TS/React/ponytail reviews (44px fix); server caps (3/day, 20 memberships) already enforced; new pgTAP; lead fixed docs + merge conflict; 13a15eb |
| #113 | Release PRs no longer fail the docs check (version-only changes are exempt) | CI; merged |
| #110 | Settings → Academic: school years (one current), terms, exam weighting, pass mark / GPA / rank / promotion rules (D-210) | builder's full review set + lead's independent Opus security review MERGE; migration live (Database run success); 272a0ec |
| #114 | Owner's permission change: routine commit/push/PR/test commands no longer ask for approval; every safety block kept | owner edited, lead validated JSON + deny list; 989fd02 |
| #108 | Release PR (changelogs) | 85f2d0c |
| #111 | Demo seed: a demo email someone else registered is deleted and recreated clean (no stranger's name, login or MFA) | security re-review MERGE; merged 47e6d97 |
| #105 | Owners/admins change a staff member's role (with a preview of what they'll gain or lose), assign custom labels, edit staff fields (employee code, department, phone) | 3 security reviews (label cross-school gap closed with composite FKs + a cleanup before the constraint switches on); migrations 20260929065654, 20260929121412 live; f47e151 |
| #107 | One-click demo school seed (40 students, attendance, exam, results, teacher/owner/parent logins) + 5-minute investor script (D-80) | 2 security reviews (demo-account takeover closed); 7d5528b |
| #101 | Staff messaging foundation: general, staff and per-class channels, messages, strict access rules (D-311) | independent Opus security review (no cross-school/role leak); migration 20260929041934 live; 225cdb9 |
| #100 | Staff directory at /app/staff and a person page (D-209) | security + DB reviews; migration 20260929020309 live; cd1c1a4 |
| #102 | Dashboard design pass: error screen now in the user's language; visual noise cut (D-407) | TS/React/ponytail reviews; bdba515 |
| #99 | Team & Access: owners/admins approve or turn down people waiting to join (D-110) | security + DB reviews; migration 20260929015813 live; 68244d6 |
| #96 | Price list: onboarding fee ৳15,000 (owner), rest provisional; LOI template (D-78) | docs; 749e23c |
| #93 | Offline attendance part 2: conflict sheet, late sync within 7 days, session-expiry handling (D-310) | security + DB reviews; merged by the owner; migration 20260928165204 live; 9cb0085 |
| #98, #103 | Release PRs (package changelogs) | f218509, 2af2cf0 |

### Owner requests completed (not code)

- Waitlist Supabase project `acadigma-suite` restored (was paused).
- Stray `20260917020000_marketing_waitlist.sql` moved from the Campus repo to the acadigma-website repo (ec4f8ba) — it belonged to the website.
- Branch protection: ruleset `protect-main` active on main (no delete, no force-push, PR required, 11 required checks) — owner created it, lead verified.
- Docker disk image moved to `F:\Docker` — owner did it, lead verified (old copy still on C:).
- Permission prompts: cause found (the settings "ask" list); owner edited `.claude/settings.json`; lead verified it's valid JSON with all deny rules kept; committed in #114.
- Standing skills written: `~/.claude/skills/ux-laws` (7 UX laws), `~/.claude/skills/app-polish` (5 tells + pull-to-refresh). Playbook tells every UI builder to load them.
- Owner's guides saved to memory: liquid-glass/light-dark/don't-market-Bengali, UX laws, app polish, MCPs (Supabase connector is on the wrong account), "start simple" system design.
- Prompt audit (Opus 5.5) of CLAUDE.md, the playbook and the builder brief: report + proposed diff delivered; not applied (see TODO §12).
- Security loop rounds 1 and 2: no critical/high/medium findings (reports in #104, #106).
- 4-lane autonomy set up; builders may spawn their own reviewers; save sweep every 30 min and handover every 2 h running.

## Before 2026-09-29 (summary — details in BUILD-LOG.md and git log)

Foundation (M0) complete: sign-up/sign-in with throttling, create-a-school wizard, personal workspace, workspace switcher, audit log, plans/limits and trial → read-only. Academics: classes, sections, subjects and teachers; students, guardians, bulk import; daily roll call and today view; exams, marks entry with lock/unlock; GPA/rank in SQL; Bengali report-card PDFs (single + bulk); publish results and parent view; guardian linking; attendance register + mark sheet PDFs. Basic mode parts 1–2 (text size, simple home, help). Offline parts 1 and 2a (app shell, read cache, outbox with attendance). Settings foundation + school profile + branding. Staff schema and compensation split. Security audits 1 and 2 (definer functions, RLS, grants, row caps).
