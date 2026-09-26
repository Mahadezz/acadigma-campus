---
"@acadigma/web": minor
---

F-ID-11 Part 1 (D-308): pages you opened in the school, family and personal apps now open without internet, with "Last updated 09:12 today" and an offline banner; a page never opened says it needs internet the first time, with Retry. Report cards, the attendance register and mark sheet, PDFs, Publish, student import, Create school and guardian invitations show "Needs internet / ইন্টারনেট দরকার" while offline instead of failing. Saved pages are wiped on sign-out, on a workspace switch, and when the account's session, membership or role changes. The service worker no longer caches API responses or page data under the old generic cache names, and deletes those caches. Saved pages expire after 14 days and are cleared when a new version of the app is installed.
