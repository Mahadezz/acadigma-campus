---
"@acadigma/web": patch
"@acadigma/db": patch
"@acadigma/domain": patch
---

F-OP-07 Part 3 (D-212): Settings → Attendance policy (`/app/settings/attendance`, owner/admin) — every attendance rule (late/half-day counting, the late cutoff, session mode, the minimum-attendance warning line, block-on-shortfall) with a live plain-English preview of a real student's attendance under the change, before saving. No migration: reuses the existing `updateSchoolSettings` write path. New: `getAttendancePolicySample` (`@acadigma/db`), `previewAttendanceEffect` (`@acadigma/domain`).
