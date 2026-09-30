# Acadigma Campus — build updates

A plain-English record of what has been built, when it was finished, and where to see it. Written for investors and partners; the engineering detail behind every line is one click away in the linked pull request.

**Newest first. Times are Dhaka time (UTC+6), taken from the moment each piece was merged into the live codebase.**

## Where to look

| What                                       | Link                                                                                            |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| The app (live)                             | [campus.acadigma.com](https://campus.acadigma.com)                                              |
| The company website                        | [acadigma.com](https://acadigma.com)                                                            |
| The code (public)                          | [github.com/Mahadezz/acadigma-campus](https://github.com/Mahadezz/acadigma-campus)              |
| Every finished piece of work               | [Merged pull requests](https://github.com/Mahadezz/acadigma-campus/pulls?q=is%3Apr+is%3Amerged) |
| The build plan, milestone by milestone     | [docs/plan/ROADMAP.md](../plan/ROADMAP.md)                                                      |
| How we protect children's data             | [docs/engineering/SECURITY.md](../engineering/SECURITY.md)                                      |
| Every decision, with the reason            | [docs/decisions/DECISION-LOG.md](../decisions/DECISION-LOG.md)                                  |
| Test reports (real numbers from real runs) | [docs/test-reports/](../test-reports/)                                                          |

## Where we are (1 October 2026)

- **Milestone 0 — secure foundation:** done (24 Sep).
- **Milestone 1 — people in the school:** mostly done — roles, team roster, joining a school with a code, ownership transfer, account and school deletion. Still to build: email invitations, notifications, sessions and devices.
- **Milestone 2 — the school day:** partly done — students, attendance (including offline), attendance policy, staff directory, database groundwork for staff messaging (no screen yet). Still to build: timetable, school calendar screens, staff leave.
- **Milestone 3 — results and paper (the first-launch milestone):** started — exams, marks, results, published results for parents, printable report cards and registers. Still to build: Bengali report cards at full scope, homework, the print queue, a full month of school fees.
- **Not built yet, on purpose:** online payments, Android/iPhone/Windows/Mac store apps, AI lesson planning, the marketplace. The app already installs from the browser on all of those devices.
- **Indicative first-launch target:** around April 2027 (may move).

Every piece below was built, tested at phone and desktop size, security-reviewed where it touches data, and merged only when every automated check passed. Items marked _first version_ are the minimum working slice, not the finished feature; items marked _behind the scenes_ have no screen yet.

---

## 1 October 2026

- **01:06 — New front page for the app.** campus.acadigma.com now looks like acadigma.com, with an "Open Campus" button and a "Get the app" section showing how to install it from the browser on Android, iPhone, Windows and Mac (store apps are coming later). Sign-in and sign-up pages match. [#128](https://github.com/Mahadezz/acadigma-campus/pull/128)
- **00:05 — The app feels faster.** Most data pages show a grey outline while they load instead of a blank screen; pull down to refresh on a phone; buttons show a pressed state the instant they are tapped. [#127](https://github.com/Mahadezz/acadigma-campus/pull/127)

## 30 September 2026

- **19:41 — New look.** A calmer "glass" design, light and dark themes, a back button on every sub-page, language choice moved into Settings. [#109](https://github.com/Mahadezz/acadigma-campus/pull/109)
- **19:18 — Quality gate for the team.** One command now runs every check before work is saved; tests no longer fail on Fridays (the school's weekly day off). [#126](https://github.com/Mahadezz/acadigma-campus/pull/126)
- **18:56 — Attendance rules per school.** A school sets its minimum attendance and late rules and sees the effect on its students before saving. [#122](https://github.com/Mahadezz/acadigma-campus/pull/122)
- **18:52 — Updated terms.** Existing users accept the current Terms and Privacy Notice once; school owners accept the data processing agreement. Deleting an account or exporting data is never blocked. [#125](https://github.com/Mahadezz/acadigma-campus/pull/125)
- **17:53 — Class hub for older teachers.** A simple mode: one screen per class for attendance, marks and students, with large text. [#82](https://github.com/Mahadezz/acadigma-campus/pull/82)
- **17:26 — Consent can't be skipped.** A school or a parent link can no longer be created without the agreement being recorded, even by a direct technical request. [#124](https://github.com/Mahadezz/acadigma-campus/pull/124)
- **11:23 — Consent recorded where it's given.** Terms and Privacy at sign-up (interim pages, not yet reviewed by a lawyer), the data processing agreement when a school is created, and a guardian's consent when linked to a child. [#121](https://github.com/Mahadezz/acadigma-campus/pull/121)
- **10:52 — Automatic browser tests on every change.** Every signed-in journey test now runs automatically against a real database before anything can be merged. [#90](https://github.com/Mahadezz/acadigma-campus/pull/90)
- **10:08 — Delete my account.** With a 30-day grace period to change your mind. [#119](https://github.com/Mahadezz/acadigma-campus/pull/119)
- **09:26 — School danger zone.** An owner can export all school data, archive the school, or delete it with a 30-day grace period. [#117](https://github.com/Mahadezz/acadigma-campus/pull/117)
- **03:32 — Staff changes.** Remove a member, leave a school, hand ownership to someone else. [#112](https://github.com/Mahadezz/acadigma-campus/pull/112)
- **03:13 — Internal legal and compliance review** (not legal advice) of the app and website against Bangladesh's data-protection law, with questions for a lawyer. [#118](https://github.com/Mahadezz/acadigma-campus/pull/118)

## 29 September 2026

- **23:53 — Create or join a school from inside the app.** [#115](https://github.com/Mahadezz/acadigma-campus/pull/115)
- **23:18 — Academic years and terms,** exam weighting and school rules. [#110](https://github.com/Mahadezz/acadigma-campus/pull/110)
- **20:02 — Roles and custom labels.** Change someone's role; call roles what your school calls them. [#105](https://github.com/Mahadezz/acadigma-campus/pull/105)
- **19:41 — Tooling to create a fictional demo school** on the live app for investor demos; first run pending. [#107](https://github.com/Mahadezz/acadigma-campus/pull/107)
- **18:11 — Staff messaging groundwork** _(behind the scenes)_: the database rules that keep each channel visible only to its members. No screens yet. [#101](https://github.com/Mahadezz/acadigma-campus/pull/101)
- **13:05 — Staff directory.** [#100](https://github.com/Mahadezz/acadigma-campus/pull/100)
- **12:40 — Team and access:** see who's in the school, approve or reject people who ask to join. [#99](https://github.com/Mahadezz/acadigma-campus/pull/99)
- **12:22 — Provisional price list** and a founding-school letter of intent. [#96](https://github.com/Mahadezz/acadigma-campus/pull/96)
- **07:37 — Offline attendance:** clashes, late sync and expired sessions handled. [#93](https://github.com/Mahadezz/acadigma-campus/pull/93)

## 26–28 September 2026

- **28 Sep 23:03 — Second internal security review** of files, members and data requests. [#94](https://github.com/Mahadezz/acadigma-campus/pull/94)
- **27 Sep 03:42 — Take attendance with no internet;** it saves when the connection returns, never twice. [#89](https://github.com/Mahadezz/acadigma-campus/pull/89)
- **27 Sep 01:18 — First internal security review** of database access rules. [#87](https://github.com/Mahadezz/acadigma-campus/pull/87)
- **27 Sep 01:06 — The app keeps working offline** for reading recent data. [#83](https://github.com/Mahadezz/acadigma-campus/pull/83)
- **26 Sep 13:32 — Printable attendance register and exam mark sheet** _(first version)_. [#76](https://github.com/Mahadezz/acadigma-campus/pull/76)
- **26 Sep 13:11 — Link parents to their children** _(first version)_. [#78](https://github.com/Mahadezz/acadigma-campus/pull/78)
- **26 Sep 12:46 — Marks lock and unlock,** entry windows and progress per class. [#79](https://github.com/Mahadezz/acadigma-campus/pull/79)
- **26 Sep 12:22 — Basic mode home** for teachers who want the simplest screen. [#72](https://github.com/Mahadezz/acadigma-campus/pull/72)
- **26 Sep 09:05 — Publish results;** parents can read their child's published results _(first version)_. [#75](https://github.com/Mahadezz/acadigma-campus/pull/75)
- **26 Sep 08:31 — Print report cards for a whole class** _(first version)_. [#71](https://github.com/Mahadezz/acadigma-campus/pull/71)
- **26 Sep 07:47 — Results and class rank calculated automatically.** [#68](https://github.com/Mahadezz/acadigma-campus/pull/68)
- **26 Sep 07:23 — Import students from a spreadsheet** _(first version)_. [#66](https://github.com/Mahadezz/acadigma-campus/pull/66)
- **26 Sep 04:47 — Report card template** _(first version)_. [#63](https://github.com/Mahadezz/acadigma-campus/pull/63)
- **26 Sep 04:07 — Marks entry,** with a check that nothing is missing before results are published. [#60](https://github.com/Mahadezz/acadigma-campus/pull/60)

## 25 September 2026

- **19:14 — Daily roll call** and today's attendance at a glance _(first version)_. [#55](https://github.com/Mahadezz/acadigma-campus/pull/55)
- **18:45 — Bengali navigation and app shell.** [#51](https://github.com/Mahadezz/acadigma-campus/pull/51)
- **18:34 — Students and guardians** _(first version)_. [#54](https://github.com/Mahadezz/acadigma-campus/pull/54)
- **18:00 — Exams and papers** _(first version)_. [#48](https://github.com/Mahadezz/acadigma-campus/pull/48)
- **14:15 — Classes, sections and subjects** _(first version)_. [#47](https://github.com/Mahadezz/acadigma-campus/pull/47)
- **13:44 — An audit trail in plain sentences** instead of technical codes. [#49](https://github.com/Mahadezz/acadigma-campus/pull/49)
- **13:21 — School dashboard** built from real data. [#41](https://github.com/Mahadezz/acadigma-campus/pull/41)
- **13:11 — School-day rules** _(behind the scenes)_: holidays and working days (a Saturday–Thursday week); no calendar screen yet. [#43](https://github.com/Mahadezz/acadigma-campus/pull/43)
- **08:27 — Create a school** end to end, with classes. [#37](https://github.com/Mahadezz/acadigma-campus/pull/37)
- **08:15 — School settings,** profile and branding. [#39](https://github.com/Mahadezz/acadigma-campus/pull/39)
- **01:35 — Free trial;** a school's data turns read-only (never deleted) when it ends. [#31](https://github.com/Mahadezz/acadigma-campus/pull/31)

## 17–24 September 2026 — the secure foundation

- **24 Sep 19:31 — Milestone 0 complete.** [#17](https://github.com/Mahadezz/acadigma-campus/pull/17)
- **24 Sep 15:09 — Audit trail:** changes to school records are recorded by the database itself. [#6](https://github.com/Mahadezz/acadigma-campus/pull/6)
- **24 Sep 11:30 — Schools and membership:** each school's data is walled off from every other school, enforced by the database. [#7](https://github.com/Mahadezz/acadigma-campus/pull/7)
- **17 Sep 22:18 — Sign up and sign in.** [#3](https://github.com/Mahadezz/acadigma-campus/pull/3)
- **17 Sep 21:35 — Plans and limits engine** _(behind the scenes)_; no billing screens yet. [#2](https://github.com/Mahadezz/acadigma-campus/pull/2)
- **17 Sep 16:32 — Project foundation:** codebase, database, app shell, automated checks. [#1](https://github.com/Mahadezz/acadigma-campus/pull/1)

---

_How this file is kept: the lead adds a line here whenever a piece of work is merged, in plain English, with its link. Smaller engineering fixes are in the [build log](../plan/BUILD-LOG.md) and the [merged pull requests](https://github.com/Mahadezz/acadigma-campus/pulls?q=is%3Apr+is%3Amerged)._
