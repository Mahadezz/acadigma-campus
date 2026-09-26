import type { MySection } from "../academics/structure"

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

/**
 * One class block (§4.4.2) — one per `MySection` (F-AC-01 Part 5's
 * `listMySections`, D-107), which already groups "I am the class teacher"
 * and "every subject I teach here" into a single entry per section, so a
 * teacher who is both gets one block, not two. The caller (`apps/web`)
 * builds the "Class 6 – ক · Bangla" / "Class 6 – ক · Class teacher" /
 * "Class 6 – ক · Class teacher, Bangla" title from `isClassTeacher` and
 * `subjects`.
 */
export type BasicHomeClass = {
  sectionId: string
  gradeName: string
  gradeNameBn: string
  sectionName: string
  isClassTeacher: boolean
  subjects: MySection["subjects"]
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
