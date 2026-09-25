---
"@acadigma/web": minor
"@acadigma/contracts": minor
"@acadigma/db": minor
"@acadigma/domain": minor
---

F-AC-06 Part 1: grade scales (D-302). Migration `20260925300202_grade_scales.sql` adds
`grade_scales` / `grade_bands` with a no-gap/no-overlap coverage trigger,
`app.band_for` / `app.round_half_up`, and the `seed_bd_grade_scale` / `save_grade_scale`
RPCs. `@acadigma/domain/grading` (`bandFor`, `roundHalfUp`, `checkCoverage`,
`BD_GRADE_BANDS`) matches SQL on one parity table. New permission
`settings.grade_scale.write` (owner/admin). New screen `/app/settings/grade-scale`: the
one-tap Bangladesh default and a live "72 % → A (4.00)" preview.
