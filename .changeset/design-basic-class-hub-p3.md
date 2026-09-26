---
"@acadigma/web": minor
"@acadigma/ui": minor
"@acadigma/domain": minor
"@acadigma/db": minor
"@acadigma/contracts": minor
---

F-ID-10 Part 3 (D-406): the class hub. `/app/classes/[sectionId]` — a big
header, four tabs (Attendance, Marks, Students, Print), all scoped to the
one section through existing repositories/RLS. Attendance reuses the
existing roll call at basic sizes with a `ConfirmSheet` naming the counts
before every save ("Save attendance for 6-ক? 38 present, 2 absent") and a
30s post-save Undo that re-saves the previous values as one ordinary,
audited edit. Marks lists this section's papers the caller teaches with
n/N entered and a status chip, then taps through to the existing marks
entry screen — the first time marks are reachable in basic mode. Students
is this section's roster (roll, name, Bangla names via `BnEnText`). Print
shows the report cards of the latest published or computed exam plus bulk
print, reusing F-OP-03's existing single/bulk actions and permissions
unchanged. A caller not assigned to a section (and not owner/admin) sees
"This class is not on your list" — no student data is sent. Home's class
blocks and the "All classes" list now open the hub instead of the roll
call directly. New: `ConfirmSheet` (`packages/ui`), `AttendanceToggle`'s
`size="basic"` variant, `CLASS_HUB_TABS` (`packages/domain`).

No migration — every read goes through `listMySections`, `attendance_day`,
`listRoster`, `exam_subjects` and the exam/report-card repositories, all
already RLS-protected.
