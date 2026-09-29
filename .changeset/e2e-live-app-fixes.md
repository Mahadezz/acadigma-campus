---
"@acadigma/web": patch
"@acadigma/ui": patch
---

Three bugs the first full live-Supabase e2e runs found (D-76): the sign-in throttle now refuses the sixth attempt after five wrong passwords, with no credential check (F-ID-01 AC6; it used to allow a sixth guess); registering an email that already has an account shows the "already has an account" message instead of a generic failure; and on a 360 px phone the top bar no longer overflows when the offline chip appears beside a long school name (the switcher's name truncates), which had left the page scrolled sideways and the queue sheet's buttons untappable.
