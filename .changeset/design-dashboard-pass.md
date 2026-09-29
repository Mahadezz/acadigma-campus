---
"@acadigma/web": patch
---

Design pass on the `/app/dashboard` screen (D-407): the dashboard's own error boundary had hardcoded English strings that never became Bengali — it now reuses the app-wide `errors.appError` messages. The screen also carried 5 eyebrow labels (against DESIGN-SYSTEM §8.1's "one per screen at most, and usually none"); the 3 that duplicated their card's own title (Setup, People, Activity) are removed and "Today" becomes a plain section heading, keeping only the page-level date eyebrow.
