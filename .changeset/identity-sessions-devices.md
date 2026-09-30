---
"@acadigma/web": minor
"@acadigma/domain": minor
"@acadigma/db": minor
"@acadigma/contracts": minor
---

F-ID-01 Part 6 (D-116): signed-in devices. `/account/security` lists every
live session of the caller ("Chrome on Android", This device, signed in /
last active), signs out any other device with one tap (the card hides at
once and comes back if the server refuses), and signs out everywhere,
including this device. A password sign-in while another session is live
raises the `auth.new_device_signin` in-app notification once. The list is
Supabase's `auth.sessions`, read and revoked by `public.my_sessions()`,
`public.revoke_my_session()` and `public.note_sign_in()` (own sessions only,
`session.revoked` audited in the same transaction); the server client now
forwards the browser's `User-Agent` so sessions record the device. No IP is
read and no location is shown.
