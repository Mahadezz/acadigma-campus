---
"@acadigma/web": minor
"@acadigma/ui": minor
---

App polish (D-409): a shared `PageSkeleton` (list, detail, form) behind a
`loading.tsx` on every data route; phone pull-to-refresh (`PullToRefresh`,
coarse pointer only, keyboard-reachable refresh button); the Settings > Display
text size is optimistic with rollback and a toast; `Button` and tappable list
rows get a real press state (scale + opacity, reduced-motion safe). No
migration.
