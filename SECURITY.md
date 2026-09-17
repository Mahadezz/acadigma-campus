# Security Policy

Acadigma Campus handles children's personal and medical records, government identity documents and payments. We take reports seriously and we would much rather hear from you than not.

Our internal threat model, controls and testing plan are in [`docs/engineering/SECURITY.md`](docs/engineering/SECURITY.md).

---

## Reporting a vulnerability

**Do not open a public issue, pull request or discussion for a security problem.**

Report privately, either way:

1. **GitHub Security Advisories** — <https://github.com/Mahadezz/acadigma-campus/security/advisories/new> (preferred; it gives us a private place to work with you).
2. **Email** — `security@acadigma.app`, subject line starting `[SECURITY]`.

### What helps

- What you found, and what an attacker could do with it.
- Where: URL, endpoint, file and line, or table and policy.
- Reproduction steps, precise enough for us to follow. A short proof of concept beats a long description.
- What access you had when you found it (signed out, a role in one workspace, platform admin).
- Whether any real data was involved — say so immediately, even if you are unsure.

Reports in English or Bengali are equally welcome.

---

## What we do

| When                                                             | What                                                                                                        |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Within **3 working days**                                        | We acknowledge your report and tell you who is handling it                                                  |
| Within **5 working days**                                        | Initial triage: reproduced or not, severity, and our planned approach                                       |
| Then                                                             | Regular updates — at least every 7 days while it is open                                                    |
| Target **30 days** for critical/high, **90 days** for medium/low | Fix released                                                                                                |
| On release                                                       | We tell you before the fix ships, and credit you in the release notes and advisory unless you ask us not to |

If a fix will take longer, we will tell you why and when. We will not go quiet on you.

Severity follows CVSS v3.1 as a guide, adjusted for what the data is: anything exposing student personal or medical data, identity documents, or cross-tenant access is treated as **critical** regardless of how the score comes out.

---

## Scope

**In scope**

- The production application and its API.
- Preview deployments of this repository (`*.vercel.app`).
- This repository's source code, including CI workflows and database policies.
- The Supabase project's exposed surfaces: Auth, Storage, Edge Functions, PostgREST, Realtime.

**Out of scope**

- Third-party services we depend on — report those to Supabase, Vercel, SSLCommerz, Anthropic or Resend directly.
- Findings that require physical access, a compromised device, or social engineering of a user or employee.
- Missing security headers, weak TLS ciphers, or SPF/DMARC observations with no demonstrated impact.
- Rate limiting on endpoints where abuse causes no harm.
- Automated scanner output without a demonstrated exploit path — we read those, but they are not reports.
- Denial of service through volume, and any load or stress testing.
- Self-XSS, clickjacking on pages with no sensitive action, and missing cookie flags on non-session cookies.

---

## Safe harbour and rules of engagement

If you follow this policy in good faith, we will treat your research as authorised, will not pursue legal action, and will work with you. We will say so publicly if anyone else raises the question.

In return, while testing:

- **Use only accounts and data you created.** Do not access, modify, download or retain anyone else's data. If you access someone's data accidentally, stop, tell us immediately, and delete it.
- **Do not degrade the service.** No load testing, no automated scanning at volume, no destructive actions.
- **Do not pivot.** One finding is not permission to explore further into the system or into connected services.
- **Do not persist.** No backdoors, no maintained access. Stop once you have demonstrated the issue.
- **Give us time.** Keep the report private until a fix has shipped, or 90 days have passed, whichever comes first. If you believe the issue is being actively exploited, tell us and we will move immediately.

Testing against **preview deployments** rather than production is preferred and is entirely sufficient for almost every class of finding.

---

## Supported versions

This is a continuously deployed application, not a distributed library. **Only the currently deployed production version is supported.** Fixes ship forward; we do not backport to tags.

---

## Recognition

We do not currently run a paid bounty programme. We do credit every reporter who wants it, in the GitHub Security Advisory and in the release notes, and we will happily provide a written reference for your work.

---

**Acknowledgement:** the current architecture exists because a security review of the predecessor application found six critical issues, including cross-tenant access to children's medical records and to identity documents. That review is public in this repository ([`docs/reference/base44-security-review.md`](docs/reference/base44-security-review.md)). We publish it because a finding that is written down and fixed is worth more than one that is quietly buried — and that is exactly how we intend to treat yours.
