---
"@acadigma/web": minor
"@acadigma/contracts": minor
"@acadigma/db": minor
"@acadigma/domain": patch
---

F-ID-11 Part 2b (D-310): when a colleague saved a class after a teacher took the roll offline, "Compare and choose" shows who saved when and only the students that differ, theirs or mine for each — Keep theirs, Use mine or Save my choices; nothing is overwritten until she chooses, and the audit keeps both. A roll call taken offline inside its correction window that reaches the server up to 7 days later is saved and marked "Sent late from offline" (only when no register exists yet for that day). An expired session pauses the waiting list with "Sign in again to send…" instead of retrying; the sign-in screen counts what waits on the phone. Another teacher's unsent changes on a shared phone are never sent, shown (beyond a count) or deleted by whoever signs in; that person is told once and can sign out to hand the phone back; they are kept up to 14 days. A deleted or banned account's waiting changes are removed. Sign-out now always deletes the signed-in user's own queue, never a stale one. Waiting changes also send after any successful request. Contracts: `saveAttendanceInputSchema` takes an optional `capturedAt`; `AttendanceDaySection.session.syncedLate`. DB: `attendance_sessions.captured_at`, `queued_offline`, `synced_late`.
