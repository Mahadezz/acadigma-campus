---
"@acadigma/web": minor
"@acadigma/contracts": minor
"@acadigma/domain": minor
"@acadigma/db": minor
"@acadigma/ui": minor
---

F-ID-10 Part 1 (D-403, D-404): basic-mode display preferences. `user_preferences.ui_mode`/`text_size` (added to the existing table, not a new one), `updateUiPreferences`/`getUiPreferences`, non-httpOnly cookie mirrors, `<html data-text-size data-ui-mode>` rendered server-side for a no-flash first paint, `/app/settings/display` (text-size radio cards + basic-mode switch, hidden for staff), "Switch to basic mode" in the full app's user menu, and a minimal `/app/home` placeholder so turning basic mode on and switching back both work end to end. The class-by-class home and class hub are F-ID-10 Parts 2-3.
