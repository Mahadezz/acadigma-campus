---
"@acadigma/web": minor
---

বাংলা now covers the whole signed-in app, not only the sign-in screens: the school shell's sidebar and bottom nav, the top bar, a new language switch in the user menu, the read-only banner, the dashboard, and 404/error pages all follow the existing locale cookie. `<html lang>` follows the active locale. Numbers and dates stay Western-digit in বাংলা (DESIGN-SYSTEM §1.6), formatted with `Intl` bound to the locale. The language switch now also persists to `profiles.locale`, so it follows a signed-in user to their next device, and the audit viewer's separate `profiles.locale`-only lookup now goes through the same one resolver as everywhere else.
