---
"@acadigma/ui": minor
"@acadigma/web": minor
---

Design System v2 (D-408): liquid glass materials for the app shell's chrome (TopBar, BottomNav, Sheet/Dialog content, Toast, and the dashboard's "Today" cards via a new opt-in `Card` `variant="glass"`), a visible Light/Dark/System theme control at `/app/settings/appearance`, and the language switch moved out of the header/home screen into that same Settings page. Tap feedback added to `Toggle`, `TabsTrigger`, `ChoiceCard` and `BottomNavItem`; `Skeleton` retinted to read correctly on both themes and on glass. Both `@supports not (backdrop-filter)` and `prefers-reduced-transparency` fall back to the existing opaque D-57 surfaces.
