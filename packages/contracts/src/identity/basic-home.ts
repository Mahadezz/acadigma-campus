/**
 * F-ID-10 Part 2 (§4.4, §7 `getBasicHome`) — the basic-mode home screen.
 *
 * Deviation from the spec's own §7 table (DATA-MODEL/ARCHITECTURE win over a
 * feature spec's proposed shape, same rule Part 1's D-404 already used): the
 * spec's loader output has a single pre-rendered `greeting` string, but every
 * other loader in this codebase returns raw facts and lets `apps/web`'s
 * `getMessages()` build the localised sentence (the repository layer never
 * imports i18n — `packages/db` has no `messages/*.json`). `greetingPeriod`
 * (`packages/domain/src/basic-home`) + `fullName` + `todayIso` replace that
 * one field; the page composes "Good morning, Rahima · Sunday 27 September"
 * from them, the same way `/app/dashboard` builds its own strings today.
 */

export type GreetingPeriod = "morning" | "afternoon" | "evening"

/** One to-do row (§4.1). Only the roll-call kind ships in Part 2; the other
 * three (marks due, outbox counts) wait for F-AC-06/F-ID-11. */
export type BasicHomeTodo = {
  kind: "roll_calls_not_taken"
  count: number
}

export type BasicHomeAttendanceStatus = "taken" | "not_taken" | "not_school_day"

/** One class block (§4.4.2). `subject` is absent for a class-teacher
 * assignment with no subject of its own ("Class 6 – ক · Class teacher");
 * present for a subject-teacher assignment ("Class 6 – ক · Bangla"). A
 * teacher who is both class teacher AND a subject teacher of the same
 * section gets one block of each kind (F-ID-10 §2 footnote ²: "sections
 * where they are the active class_teacher_id, PLUS every (section, subject)
 * they teach" — two distinct assignments, two blocks), not one block that
 * merges the two. */
export type BasicHomeClass = {
  sectionId: string
  gradeName: string
  gradeNameBn: string | null
  sectionName: string
  subject: string | null
  subjectBn: string | null
  studentCount: number
  attendanceToday: BasicHomeAttendanceStatus
  /** Present only when `attendanceToday === "taken"`. `taken` is how many
   * students were actually marked when the session was saved
   * (`public.attendance_day`'s own, confusingly-named `session.expected` —
   * the count the save covered); `expected` here is `studentCount` at
   * render time. They can differ (§9 AC4's "Taken 38/40"): a student
   * enrolled after the session was saved raises `studentCount`/`expected`
   * without changing what was actually marked that day. */
  taken?: number
  expected?: number
}

export type BasicHome = {
  fullName: string
  greetingPeriod: GreetingPeriod
  todayIso: string
  todos: BasicHomeTodo[]
  classes: BasicHomeClass[]
  /** §4.4 footnote ¹: owners/admins always get an "All classes" block after
   * their own, even when they have some assigned classes; every other role
   * never sees it. */
  showAllClasses: boolean
}
