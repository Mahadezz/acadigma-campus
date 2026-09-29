---
"@acadigma/web": patch
---

The offline attendance queue's "Compare and choose" button no longer disables itself while briefly offline. It only opens a local comparison view — `ConflictSheet` already shows a friendly error if it can't reach the server, and its Save/Keep/Use-mine actions don't render until the comparison data has actually loaded, so nothing could ever be submitted without connectivity. The unnecessary `disabled={!online}` bought no real safety and cost a real one: found via the e2e-live CI job (D-76 follow-up) as a brief window where `navigator.onLine` reads `false` right after a reconnect disabled the button, which sets `pointer-events: none` on it — a tap (or a Playwright click) then lands on whatever is behind it instead of the button.
