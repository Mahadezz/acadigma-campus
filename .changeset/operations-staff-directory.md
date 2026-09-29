---
"@acadigma/web": minor
"@acadigma/contracts": minor
"@acadigma/db": minor
"@acadigma/domain": patch
---

F-OP-06 Part 2 (D-209): the staff directory, `/app/staff` — server-side search, a six-way filter chip row (All/Teachers/Admin/Staff/On notice/Pending), cursor pagination, an own-record "You" badge — and the read-only person sheet `/app/staff/[id]`. `staff_directory` now shows every active non-parent member, not only those with a `staff_records` row (a brand-new school's owner now appears from day one); a member with no record falls back to `workspace_members`' pre-existing label/department/phone. New: `staff.view` permission, `listStaff`/`getStaffDirectoryRow` (`@acadigma/db`), `listStaffInputSchema`/`staffDirectoryPageSchema` (`@acadigma/contracts`, `staffDirectoryRowSchema.id` is now nullable, `membershipId` added and always present).
