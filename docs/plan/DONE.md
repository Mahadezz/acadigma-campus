# DONE — Acadigma Campus (living list)

Everything finished, newest first, with the proof. Pair with `TODO.md`. When an item in TODO finishes, move it here with its PR, merge commit and how it was verified.

---

## 2026-09-30

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
