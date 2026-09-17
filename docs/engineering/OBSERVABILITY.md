# Acadigma Campus — Observability

What we log, where errors go, how we know the app is up, when we get woken, and what to do about it. Implements ARCHITECTURE §10.

The constraint that shapes everything here: this system holds children's records. **Observability must never become a second, unaudited copy of the data.** We log ids and outcomes, never people.

---

## 1. Logging

### 1.1 Shape

Structured JSON via **pino**, one line per event, emitted from server code only. Vercel captures stdout; the browser does not log to a server sink (client errors go to error reporting, §3).

```json
{
  "level": "info",
  "time": "2026-09-21T09:14:22.108Z",
  "correlation_id": "01JB8Z7YQ2K3M4N5P6R7S8T9V0",
  "workspace_id": "3f2c…",
  "user_id": "a91e…",
  "role": "teacher",
  "route": "/app/attendance",
  "action": "attendance.save",
  "status": "ok",
  "duration_ms": 132,
  "rows": 34,
  "env": "production",
  "release": "v0.9.0"
}
```

### 1.2 Fields

**Always present:** `level`, `time`, `correlation_id`, `env`, `release`.
**Present when known:** `workspace_id`, `user_id`, `role`, `route`, `action`, `status` (`ok` | `error` | `denied`), `duration_ms`, `error_code`.
**Contextual, allowed:** `rows`, `flag`, `plan`, `job_type`, `attempt`, `provider`, `provider_event_id`, `file_id`, `idempotency_key`, `rate_limit_key` (hashed), `db_ms`, `ai_tokens_in`/`ai_tokens_out`, `credits`.

**Never logged, at any level, in any environment:**

names · emails · phone numbers · addresses · dates of birth · health conditions, allergies, medications · national ID numbers · file names or contents · marks and grades tied to an identifiable student · tokens, JWTs, session cookies · **signed URLs** · request or response bodies · payment gateway payloads · AI prompts or completions containing student data · full IP addresses (hash them if you need per-IP rate limiting).

Log the **id**. Anyone with a legitimate reason can resolve an id through the app, where the lookup is itself authorised and audited. That is the point.

Enforcement is layered: a pino `redact` list strips known-sensitive keys and any key matching `/email|phone|name|dob|address|token|secret|url/i` at serialisation; a Semgrep rule flags whole-entity logging (`log.info({ student })`, `log.info({ user })`); review flags the rest. The redactor is a safety net, not permission to be careless — if it catches something, the call site is still wrong.

### 1.3 Levels

| Level   | Use                                      | Examples                                                                                           |
| ------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `error` | Something failed that a human should see | Unhandled exception, webhook validation failure, migration/job failure, provider 5xx after retries |
| `warn`  | Degraded but handled                     | Retry succeeded, rate limit hit, `denied` authorisation, quota exhausted, slow query over budget   |
| `info`  | Business events worth counting           | Action completed, job processed, payment settled, file signed, AI call settled                     |
| `debug` | Local only                               | `LOG_LEVEL=debug` in `.env.local`; `info` in preview and production                                |

**Authorisation denials are logged at `warn` with `status: "denied"`** and the permission key. A 403 is either a bug in our UI or someone probing; both are worth seeing, and the pattern is what §6 alerts on.

### 1.4 Correlation

A ULID `correlation_id` is generated in middleware per request (or taken from an inbound `x-correlation-id` on internal calls), put on the async context, attached to every log line, set as a transaction-local Postgres setting so the **audit trigger records it on `audit_events`**, propagated to Sentry as a tag, echoed in the `x-correlation-id` response header, and shown to the user in error UI as a short reference code.

That last link is the important one: given a user saying "it failed and showed ABC123", you can join the application logs, the Sentry event and the exact database rows that changed, in one query. The prototype could not answer "who changed this child's medical record"; this is half of the answer (the audit trail is the other half).

Jobs and webhooks generate their own correlation id and carry it through retries, so all attempts of one logical event group together.

### 1.5 Retention

Vercel log drain per plan (short). Audit events are retained **indefinitely**; `email_log` and `file_access_log` one year (ARCHITECTURE §10). Anything needed for an investigation is in those tables, not in the log stream — application logs are for operating the system, the audit trail is for accounting for it.

---

## 2. OpenTelemetry

**DECISION-LOG D-30:** observability is OpenTelemetry-first. The app emits OTLP
(traces, and eventually logs) regardless of which error-reporting backend is
running — OTel is the vendor-neutral contract; §3 is the backend choice sitting
on top of it.

### 2.1 Setup

`@vercel/otel` registers in `apps/web/instrumentation.ts`, unconditionally, in
both the `register()` Sentry also uses:

```ts
import { registerOTel } from "@vercel/otel"

registerOTel({
  serviceName: process.env.OTEL_SERVICE_NAME ?? "acadigma-campus",
  attributes: {
    "deployment.environment": process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  },
})
```

No further configuration is required to be "on": `@vercel/otel` auto-detects a
Vercel tracing integration when deployed on Vercel, falls back to a standard OTLP
exporter when `OTEL_EXPORTER_OTLP_ENDPOINT` (+ optional
`OTEL_EXPORTER_OTLP_HEADERS`, comma-separated `key=value` pairs) is set in the
environment, and is a **no-op** when neither is configured — local development
and CI never try to reach a collector that does not exist.

### 2.2 Span attributes

`apps/web/lib/telemetry.ts` exports the tracer and two helpers so span
attributes match what the logger already binds (§1.2), rather than drifting from
it:

- `setWorkspaceSpanAttributes(span, { workspaceId, correlationId, userId, role })`
  — the identifiers every span in this product should carry, when known.
- `withWorkspaceSpan(name, attrs, fn)` — wraps a server action or repository
  call in an active span with those attributes set, and records the outcome
  (`OK` / `ERROR` + the exception) automatically.
- `setAiSpanAttributes(span, { model, operation, ... })` — AI-call spans, using
  the OTel `gen_ai.*` semantic convention with `user.id` set to the **workspace**
  id, not a person's (D-30: "AI spans with `gen_ai.*` + `user.id = workspace_id`"
  — AI spend is billed and rate-limited per workspace).

Same rule as the logger (§1.2): **identifiers only.** Never a name, email, phone
number, health detail or anything else a parent would recognise as theirs on a
span attribute.

### 2.3 Environment variables

Added to `.env.example`, all optional:

| Variable                      | Purpose                                                          |
| ----------------------------- | ---------------------------------------------------------------- |
| `OTEL_SERVICE_NAME`           | Overrides the default service name (`acadigma-campus`).          |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP collector endpoint. Unset in local dev and CI.              |
| `OTEL_EXPORTER_OTLP_HEADERS`  | Comma-separated `key=value` auth headers for the OTLP collector. |

## 3. Error reporting — backend chosen at R1 launch: Sentry vs Traceway

**DECISION-LOG D-30:** the owner pointed at `tracewayapp/traceway` (MIT,
OTel-native, includes per-tenant AI-call tracing and on-call paging) as an
alternative to Sentry. Because §2's OTel emission is vendor-neutral, the
error-reporting **backend** is a deploy-time choice, not an architecture one:
**Sentry** (managed, usable immediately, configured below) vs **Traceway Cloud**
vs **self-hosted Traceway** on a small VPS once one exists. Decide at Release 1
launch with real pricing; Traceway's per-tenant AI cost view would match the
credit ledger exactly, but there is no host for it today. Until that decision,
Sentry is what is wired up, entirely opt-in behind `SENTRY_DSN`.

### 3.1 Setup

`@sentry/nextjs` with the three config files (`sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`) and the build plugin for source maps.

```ts
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? "development", // production | preview | development
  release: process.env.NEXT_PUBLIC_RELEASE, // v0.9.0 — set at build time
  tracesSampleRate: 0.1, // 1.0 in preview
  profilesSampleRate: 0,
  sendDefaultPii: false, // non-negotiable
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0, // off on any route rendering student data
  ignoreErrors: [
    /ResizeObserver loop/,
    /NetworkError when attempting to fetch/,
    /AbortError/,
  ],
  beforeSend(event) {
    return scrubEvent(event)
  },
  beforeBreadcrumb(crumb) {
    return scrubBreadcrumb(crumb)
  },
})
```

`scrubEvent` removes request bodies and cookies, strips query strings from URLs, drops `user.email`/`user.username`/`user.ip_address`, and truncates any string longer than 500 characters in `extra`. `scrubBreadcrumb` drops `fetch`/`xhr` crumbs' bodies and any URL containing a signing token. Both have unit tests with realistic payloads — a scrubber nobody tested is a scrubber that does not work.

### 2.2 Context

Attached to every event: `correlation_id`, `workspace_id`, `role`, `route`, `action`, `release`, `flag` state for flags touching the route. `Sentry.setUser({ id })` — **the id only**, never email or name. Source maps upload on release (`SENTRY_AUTH_TOKEN`) and are not served publicly.

### 2.3 Issue hygiene

Each release creates a Sentry release with the commit range, so regressions attribute to a deploy. Issues are grouped by fingerprint on `error_code` where we control it. Alerts on **new** issue types and on regression of a resolved issue (§6). An issue with no owner and no action after 14 days is either fixed or explicitly ignored with a reason — an alert channel full of known noise trains people to ignore it.

---

## 4. Health endpoint

`GET /api/health` — unauthenticated, uncached (`Cache-Control: no-store`), aims for under 500 ms.

```json
{
  "status": "ok",
  "release": "v0.9.0",
  "commit": "9bc425f",
  "time": "2026-09-21T09:14:22.108Z",
  "checks": {
    "db": { "status": "ok", "ms": 21, "migration_head": "20260921T1613" },
    "auth": { "status": "ok", "ms": 38 },
    "storage": { "status": "ok", "ms": 44 },
    "jobs": { "status": "ok", "pending": 3, "oldest_pending_s": 12 }
  }
}
```

- `db`: `select 1` plus the applied migration head — which catches "code deployed, migration did not" immediately.
- `auth`: a lightweight Supabase Auth settings fetch.
- `storage`: list one object in the private bucket.
- `jobs`: count of pending `jobs` rows and the age of the oldest — a queue that stops draining is invisible otherwise.

Status codes: `200` for `ok`, `200` with `"status": "degraded"` when a non-critical check fails (jobs backing up), `503` for `error` when `db` or `auth` fails. The body leaks nothing: no connection strings, no table names beyond the migration id, no counts of user data.

`GET /api/health/ready` is the minimal variant (db only) for the uptime monitor's tight interval.

---

## 5. Uptime

- External monitor (Better Stack / UptimeRobot, owner's choice) on `https://<production>/api/health/ready` every **60 s** from at least two regions, one of them close to Bangladesh. Two consecutive failures → alert. Timeout 10 s.
- A second monitor on `/` every 5 minutes, asserting a 200 and an expected string, to catch "healthy backend, broken render".
- A third on `/api/health` every 5 minutes, alerting on `degraded` — the early warning that usually fires before anything user-visible breaks.
- **SSL certificate expiry** alert at 14 days (Vercel manages it, but an expired certificate is a total outage and a 30-second check).
- Public status is the monitor's status page; it is linked from the GitHub Release notes and shared with schools once there are schools.
- Synthetic journey (post-Release 1): a scheduled Playwright run against production every 15 minutes doing sign-in → dashboard → sign-out with a dedicated synthetic account in a synthetic workspace. It runs as a real user, so it catches auth and RLS regressions that `/api/health` cannot.

---

## 6. Alert rules

Three tiers. **Page** means it wakes someone; everything else waits. Keep the page list short — an alert that fires weekly without action is training people to ignore the one that matters.

### Page (S1/S2)

| Alert                         | Condition                                                                    | Why                                                                    |
| ----------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Site down                     | 2 consecutive uptime failures on `/api/health/ready`                         | Total outage                                                           |
| Database unreachable          | `/api/health` `db` = error for 2 minutes                                     | Nothing works                                                          |
| Error rate spike              | 5xx > 2 % of requests over 5 minutes, or > 50 events/5 min in Sentry         | Something shipped broken                                               |
| Auth failure spike            | Login errors > 20 % over 10 minutes                                          | Auth misconfigured, or an attack                                       |
| **Cross-tenant denial spike** | `status: "denied"` with a workspace mismatch > 20 in 5 minutes from one user | Somebody is probing tenant isolation. **Always investigate this one.** |
| Payment webhook failures      | ≥ 3 IPN validation failures in 10 minutes                                    | Money is not being recorded, or forged callbacks                       |
| Migration job failed          | `Release` workflow db step fails                                             | Schema and code are out of step in production                          |
| Secret detected               | gitleaks finding on `main`                                                   | Rotate now                                                             |

### Notify (S3 — channel, working hours)

Job queue depth > 100 or oldest pending > 10 minutes · job dead-lettering · AI credit reservation failures > 10/hour · rate limit hits > 100/hour on one route · new Sentry issue type · regression of a resolved issue · p95 server action latency > 1 s for 15 minutes · storage or email provider errors · new Supabase **security** advisory · Lighthouse budget breach on production.

### Digest (weekly)

Flaky test count and top offenders · dependency audit summary · slowest routes and queries · advisor list · error volume trend · AI spend per workspace · storage growth.

### Routing

Page → phone (owner, `@Mahadezz`, single on-call for now). Notify → the project channel. Digest → the weekly issue from `Weekly Checks`. Every alert carries: what fired, the threshold, a link to the dashboard/Sentry query, the current release, and a link to the relevant section of this document.

---

## 7. What to do when paged

**First two minutes — establish, do not fix.**

1. **Acknowledge** so nobody else duplicates the work.
2. **Check `/api/health`** in a browser. It tells you in one request whether this is web, database, auth, storage or jobs.
3. **Check the last deployment.** Vercel → Deployments. Did something ship in the last hour? That is the answer roughly two times out of three.
4. **Check the Supabase project status** and the Vercel status page. If the platform is down, your job is communication, not debugging.

**Then — contain before diagnosing.** Users are affected right now; root cause can wait fifteen minutes.

| Symptom                            | First move                                                                                                                                                                                                                             |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Broke right after a deploy         | **Vercel instant rollback** (`RELEASES.md` §7.1). Do this first, diagnose after.                                                                                                                                                       |
| Broke right after a migration      | Roll the web back first — expand-first migrations are backward compatible, so this usually restores service. Then decide about the schema.                                                                                             |
| One feature broken                 | **Turn its flag off** in the platform console. No deploy needed.                                                                                                                                                                       |
| Error rate spike, no recent deploy | Sentry → newest issue → group by `correlation_id` → find the route. Check whether a provider (SSLCommerz, Resend, Anthropic) is failing.                                                                                               |
| Cross-tenant denial spike          | Treat as a **security incident**: `SECURITY.md` §7. Identify the user, check `audit_events` and `file_access_log` for anything that succeeded, and preserve evidence before changing anything.                                         |
| Queue not draining                 | Check the cron route is being invoked and `CRON_SECRET` is set; inspect the oldest `jobs` row for a poison payload; dead-letter it rather than letting it block the queue.                                                             |
| Payment webhooks failing           | Check `inbound_events` for stored-but-unprocessed rows — nothing is lost, it can be reprocessed. Verify gateway credentials. Do **not** grant entitlements manually to unblock someone; that is the exact control finding 4 was about. |
| Database slow                      | Supabase → Query Performance. Look for a missing index on a new RLS predicate — that is the most likely cause after a schema change.                                                                                                   |

**Then — communicate.** One line in the channel within 10 minutes: what is affected, what you have done, what you are doing next, when you will update. Repeat every 30 minutes until resolved, even when the update is "still investigating".

**After — close the loop.**

- If personal data may have been exposed, it is an S1: follow `SECURITY.md` §7 fully, including the notification decision.
- Fix forward through the normal gates. A hotfix does not skip tests (`RELEASES.md` §8).
- **Write the failing test first.** Every incident produces a test that would have caught it, or the incident will happen again.
- If no alert fired, or the alert fired late, add or tune the alert in the same PR. A missing alert is an outstanding defect.
- Blameless write-up within 5 working days. If it changes how we build, it becomes a `D-nn` entry (`HANDBOOK.md` §11).

**Things not to do while paged:** refactor; apply a migration by hand to "just fix the data" (write one and let CI apply it); delete suspicious rows before exporting them; disable an alert because it is noisy during the incident it is correctly reporting.
