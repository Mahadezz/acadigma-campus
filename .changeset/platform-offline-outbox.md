---
"@acadigma/web": minor
"@acadigma/contracts": minor
---

F-ID-11 Part 2a (D-309): a roll call taken with no signal is saved on the phone ("Saved on this phone · waiting to send") and sends by itself when the phone is back online — once, never as another account or into another school. A correction made before it sends replaces it; a colleague's newer save comes back as a conflict instead of being overwritten. A "1 waiting" chip in the top bar opens the list of waiting changes (Waiting / Needs your choice / Needs attention, with Send now, Try again, Show what I entered and Delete). Signing out with changes still waiting asks first. Changes for a school you were removed from, and another person's unsent changes on a shared phone, are deleted. Also: a revoked guardian link or a page the server now refuses clears its saved copy; the cache purge reaches every service worker. Contracts: `saveAttendanceInputSchema` takes an optional `queuedFor { userId, workspaceId }`.
