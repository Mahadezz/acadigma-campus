---
"@acadigma/web": patch
---

Security review follow-up on the sign-in throttle fix above: `email_not_confirmed` and `user_banned` now count against the brute-force throttle the same as a genuine wrong password (a caller could otherwise probe account state — confirmed vs. unconfirmed, banned vs. active — for free by watching which errors do and don't cost throttle budget), `over_request_rate_limit` weighs only the IP bucket (it is GoTrue's own volumetric signal, not tied to one email), and every rejection branch now returns the same byte-identical generic message. No more "could not sign you in, try again shortly" for an infra hiccup — anti-enumeration means the caller cannot tell a 5xx apart from a wrong password either.
