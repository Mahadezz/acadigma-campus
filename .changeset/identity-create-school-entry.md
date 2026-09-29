---
"@acadigma/web": patch
---

fix(identity): a personal-only account had no way to reach "Create a school" or "Join a school with a code" from inside the app — the workspace switcher's chip was non-tappable whenever it had only one workspace, and the placeholder personal home had no action at all. Both now link into the existing `/onboarding` flows; `create_school_workspace`'s server-side limits (3 schools/user/day, 20-membership cap) are unchanged and were already enforced.
