---
"@acadigma/web": patch
---

The offline attendance queue's "Compare and choose" button no longer disables itself while the phone reads as offline. It only opens a local comparison view — `ConflictSheet` already shows a friendly error if it cannot reach the server, and its Save/Keep/Use-mine actions do not render until the comparison data has loaded, so the guard bought no safety. (The taps that missed this button on a phone were caused by the top bar overflowing at 360 px, fixed separately — see the e2e-live app-fixes changeset, D-76.)
