---
"@acadigma/web": minor
"@acadigma/ui": minor
"@acadigma/domain": minor
"@acadigma/db": minor
"@acadigma/contracts": minor
---

F-ID-10 Part 2 (D-405): the real basic-mode home. `/app/home` replaces Part
1's placeholder with a today strip (greeting, "N roll calls not taken"), one
`ClassBlock` per class the teacher is assigned to (F-AC-01 Part 5's
`listMySections` — class teacher, subject teacher, or both), an "All
classes" block for owner/admin, and an essentials row. `BasicShell`
(no sidebar/bottom nav, Home + brand + Help) now applies to the whole `/app`
shell whenever `ui_mode=basic`, not only `/app/home` — a deep link into a
full-app page still opens inside it. Tapping a class opens the existing roll
call; the class hub is Part 3. New primitives: `BasicShell`, `ClassBlock`,
`TodayStrip`, `HelpSheet` (`packages/ui`, catalogued in DESIGN-SYSTEM §4.13).
New `/app/classes/all`, a searchable list of every live section for
owner/admin.

Also: `signInWithPassword` now deletes both display-preference cookies
(instead of leaving a stale one) when the signing-in user's preferences row
cannot be read — closing the other half of #64's shared-device fix.

**Review batch (D-405 addendum):** the essentials row gains Sign out and a
language switch (basic mode has no `UserMenu`, which was the only other
place either lived) and drops Profile (no dedicated screen exists to link
to); `HelpSheet`'s close control is now a full-width "ফিরে যান / Go back"
button, not a 16px English-only "✕"; `packages/ui`'s `buttonVariants` moves
to a radix-free `components/button-variants.ts` so server files compute
real button classes instead of a drifted literal-string copy; the basic-mode
layout's `getSchoolProfile` request waterfall is fixed with a
`React.cache()`-wrapped loader; the home error state is localised with a
Retry link; the Help catalogue gets a marks-entry line.
