---
"@acadigma/web": minor
"@acadigma/contracts": minor
"@acadigma/domain": minor
"@acadigma/db": minor
---

F-AC-11 School calendar, Part 1 demo cut (D-202): holidays, working-day overrides and `app.is_school_day`.

- Migration `20260925300301_school_calendar.sql`: `holidays`, `working_day_overrides` (RLS, freeze, audit, read-only guard) and `app.is_school_day` / `app.school_days` / `app.school_day_count` (override > weekly pattern > holiday); pgTAP `41_school_calendar.sql`.
- `packages/contracts/src/calendar.ts`: `createHolidayInputSchema`, `deleteHolidayInputSchema`, `Holiday`.
- `packages/db/src/repositories/calendar.ts`: `listHolidays`, `createHoliday`, `deleteHoliday`.
- `packages/domain`: `calendar.holiday.write` (owner/admin); `holidays` and `working_day_overrides` in the generic audit catalogue.
- `/app/settings/calendar`: the holiday list; owners and admins can add and remove holidays.
