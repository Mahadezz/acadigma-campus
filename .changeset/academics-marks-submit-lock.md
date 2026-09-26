---
"@acadigma/web": minor
"@acadigma/domain": minor
"@acadigma/db": minor
"@acadigma/contracts": minor
---

F-AC-06 Part 4 (D-307): submitting, locking and the marks entry window. A paper's teacher (or an owner/admin) presses "Submit marks"; if students are still missing, a sheet lists them and "Submit anyway" submits regardless. Owners and admins see "Marks progress" on the exam page — each paper's teacher, marked count and status — and lock a submitted paper or unlock it with a reason (audited; unlocking a marks-locked exam sends it back to marks entry and clears its results). Each paper has entry dates (default: the exam date to 7 days after); outside them teachers cannot change marks, and an owner/admin can only with a reason, which is recorded and marks the change as late. Adds the `marks.lock` permission.
