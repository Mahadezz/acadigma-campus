# Test Report — F-AC-02 / F-AC-10 guardian follow-ups (D-109)

|         |                                                                                                    |
| ------- | -------------------------------------------------------------------------------------------------- |
| Feature | F-AC-02 Students, admission, guardians · F-AC-10 Parent portal                                     |
| Part    | D-108 follow-ups: staff who are also parents; class-teacher invites (F-ID-04 OQ-6)                 |
| Spec    | `docs/features/02-academics/F-AC-02-students-and-admission.md` §2, §11; `F-AC-10-parent-portal.md` |
| PR      | #85                                                                                                |
| Status  | **PASS** locally; CI numbers in §3                                                                 |
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
| the 60/h school limit applies to the class teacher                                 | `39` B (`RATE_LIMITED`)                                    |
| a class teacher's revoke never removes a staff membership                          | `39` C                                                     |
| a class teacher's revoke never removes a parent who still has another link         | `39` C                                                     |
| a class teacher cannot revoke outside their own section                            | `39` C (`FORBIDDEN`)                                       |
| the members-guard removal cannot be forged by a direct update, even with the proof | `39` C (self-PATCH refused; teacher PATCH changes nothing) |

**Out of scope:** phone OTP binding, a past year's class teacher, notifications (D-108 deferred list).

---

## 2. Environment

|          |                                                                                                     |
| -------- | --------------------------------------------------------------------------------------------------- |
| Branch   | `feat/academics-guardian-followups`, merged with `origin/main` at `f438896`                         |
| Database | CI `db` job (Postgres, every migration applied); the local Docker stack was down after a PC restart |
| OS       | Windows 11, Node 24, pnpm 10                                                                        |

---

## 3. Results

### Unit (`pnpm test`, local)

152 files passed, 4 skipped · **1548 tests passed**, 12 skipped. Changed: `permissions.test.ts` (teacher gets `students.guardian.invite`), `students/actions.test.ts`, `workspace.test.ts`, `workspace-switcher.test.tsx` ("My children" / "School app"), `report-card/route.test.ts` (served from `family_results` only), `guardian-links.test.ts`.

### Database (pgTAP)

`39_guardian_followups.sql` **52 assertions** (was 39; section C added in the PR #85 fix round). The previous builder ran 39/39 and `38` locally before the PC restart. CI `db` job: _pending — filled in from the run below_.

### Integration and end to end

`packages/db/src/repositories/guardian-links.integration.test.ts` (5 cases) and the journey "a teacher who is also a parent sees only their own child and keeps the school app" passed locally for the previous builder (journeys 6/6 on port 3101). In CI the journey is skip-gated (OQ-27; `E2E_TEACHER_*`); `db-integration` runs the integration test.

### Gate (local)

`pnpm install --frozen-lockfile`, `format:check`, `typecheck`, `lint`, `test`, every `scripts/check-*.mjs`, `pnpm --filter @acadigma/web build`.

---

## 4. Security checks

- Class-teacher reach is `app.can_read_student_private` (the current year's class teacher of the student's live section), checked inside both SECURITY DEFINER functions after the role check.
- The members guard gets no self-service exception. Its one extra transition (parent `active → removed`, nothing else) needs the UPDATE to run inside a SECURITY DEFINER function **and** a link of that person revoked at `now()` with none left. `39` C forges the second proof as postgres and shows neither the parent (self-PATCH) nor a class teacher (direct PATCH) can use it.
- A teacher-parent's staff reads are unchanged (`39` A counts students before and after); being a parent gives no class-teacher reach.

## 5. Known issues

1. pgTAP was not run locally in this fix round (Docker down); CI `db` is the source of truth.
