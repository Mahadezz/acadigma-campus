# Test Report — F-AC-02 / F-AC-10 guardian follow-ups (D-109)

|         |                                                                                                    |
| ------- | -------------------------------------------------------------------------------------------------- |
| Feature | F-AC-02 Students, admission, guardians · F-AC-10 Parent portal                                     |
| Part    | D-108 follow-ups: staff who are also parents; class-teacher invites (F-ID-04 OQ-6)                 |
| Spec    | `docs/features/02-academics/F-AC-02-students-and-admission.md` §2, §11; `F-AC-10-parent-portal.md` |
| PR      | #85                                                                                                |
| Status  | **PASS** (local pgTAP, integration and journeys on this head; CI in §3)                            |
| Date    | 2026-09-26                                                                                         |
| Run by  | Identity lane builder (Claude)                                                                     |

---

## 1. Scope

A teacher or staff member whose child studies at their school accepts a guardian link and keeps their one staff membership; `/family` and the report-card download show only their own linked child. The class teacher of a student's current section invites that student's guardians and removes linked accounts. Revoking a pure parent's last link, by anyone allowed to, still removes their parent membership.

| Criterion                                                                          | Covered by                                                 |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| a teacher accepts a link and stays an active teacher, one membership               | `39` A; integration test; journey 3                        |
| the teacher-parent sees only their own child through the family path               | `39` A; integration test; journey 3                        |
| revoking the teacher's link ends family access, not the membership                 | `39` A; integration test                                   |
| a removed teacher is refused, not reactivated, by a guardian link                  | `39` A (`MEMBERSHIP_CONFLICT`)                             |
| the class teacher invites and revokes for their section's student, audited         | `39` B; integration test                                   |
| another section's student, another teacher and staff are refused                   | `39` B (`FORBIDDEN`)                                       |
| the 60/h limit is per inviter: a class teacher who used theirs up blocks no one    | `39` D (`RATE_LIMITED`, then the owner still invites)      |
| the inviter cannot accept their own link; it stays pending for the guardian        | `39` D (`FORBIDDEN`)                                       |
| a soft-deleted student's links are hidden from the class teacher                   | `39` D                                                     |
| a class teacher's revoke never removes a staff membership                          | `39` C                                                     |
| a class teacher's revoke never removes a parent who still has another link         | `39` C                                                     |
| a class teacher cannot revoke outside their own section                            | `39` C (`FORBIDDEN`)                                       |
| the members-guard removal cannot be forged by a direct update, even with the proof | `39` C (self-PATCH refused; teacher PATCH changes nothing) |

**Out of scope:** phone OTP binding, a past year's class teacher, notifications (D-108 deferred list).

---

## 2. Environment

|          |                                                                                           |
| -------- | ----------------------------------------------------------------------------------------- |
| Branch   | `feat/academics-guardian-followups`, merged with `origin/main` at `f438896`               |
| Database | local Supabase stack (`supabase db reset`, CLI 2.117) and the CI `db` job                 |
| App      | `next build` + `next start` on port 3101 against the local stack (`PLAYWRIGHT_PORT=3101`) |
| OS       | Windows 11, Node 24, pnpm 10                                                              |

---

## 3. Results

### Unit (`pnpm test`, local)

152 files passed, 4 skipped · **1548 tests passed**, 12 skipped. Changed: `permissions.test.ts` (teacher gets `students.guardian.invite`), `students/actions.test.ts`, `workspace.test.ts`, `workspace-switcher.test.tsx` ("My children" / "School app"), `report-card/route.test.ts` (served from `family_results` only), `guardian-links.test.ts`.

### Database (pgTAP)

`39_guardian_followups.sql` **58 assertions**: A teacher-parent, B class-teacher invites, C escalation (first fix round), D the review fixes (self-invite, soft delete, per-inviter limit). **Local, second fix round** (`supabase db reset`, whole suite): the new D cases were written first and failed against the unfixed migration (6 of 58: self-accept succeeded, the teacher then held a link, the invitation became `accepted`, 2 links of the deleted student were visible, the limit cascade), then **58/58** after the fix; `38` 66/66, `56`, `12` pass; every file passes except the two local-harness ones (§5). CI `db` (first fix round, run 36262166718): 46 files, 1350 assertions, PASS with `39` at 52/52. CI numbers for this head: see the PR's CI report.

### Integration and end to end (local, this head)

- `guardian-links.integration.test.ts` against the local PostgREST: **5/5 passed**. CI `db-integration` (run 36262166718): 4 files, 12 tests passed.
- `apps/web/e2e/journeys/guardian-invite.spec.ts`, `--workers=1`, port 3101, after the revoke-guard and switcher changes: **6/6 passed in 1.9 min** — admin invite → parent accepts: phone 20.9 s, desktop 21.2 s; new parent signs up from the link: phone 8.1 s, desktop 8.1 s; **teacher who is also a parent: phone 27.7 s, desktop 20.4 s** (accepts the owner's link, `/family` lists only their child, axe clean on `/family` and on the open switcher, "School app" → `/app`, "My children" → `/family`, owner removes access → `/family` sends them back to `/app`). In CI the journeys stay skip-gated (OQ-27).

### Gate (local)

`pnpm install --frozen-lockfile`, `format:check`, `typecheck`, `lint`, `test`, every `scripts/check-*.mjs`, `pnpm --filter @acadigma/web build`.

---

## 4. Security checks

- Class-teacher reach is `app.can_read_student_private` (the current year's class teacher of the student's live section), checked inside both SECURITY DEFINER functions after the role check.
- The members guard gets no self-service exception. Its one extra transition (parent `active → removed`, nothing else) needs the UPDATE to run inside a SECURITY DEFINER function **and** a link of that person revoked at `now()` with none left. `39` C forges the second proof as postgres and shows neither the parent (self-PATCH) nor a class teacher (direct PATCH) can use it.
- The inviter can never accept their own link (PR #85 security review, MEDIUM): a class teacher cannot turn their temporary class-teacher reach into a permanent guardian link or lock the parent out.
- A teacher-parent's staff reads are unchanged (`39` A counts students before and after); being a parent gives no class-teacher reach.

## 5. Known issues

1. Locally `22_school_eiin_availability.sql` and `51_readonly_join_and_seed.sql` fail only in the local harness (seed collision, psql `i`), as in D-108's report; both pass in CI.
2. The journeys need seeded accounts (OQ-27); for this run: owner (school via `create_school_workspace`, BD grade scale, one subject on Class 6 – ক from `demo-class-6-ka.sql`), a verified teacher member, a verified parent.
