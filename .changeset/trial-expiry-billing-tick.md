---
"@acadigma/web": minor
"@acadigma/contracts": minor
"@acadigma/db": minor
---

F-CM-06 Plans & Subscriptions, Part 4: the daily trial-expiry billing tick
(DECISION-LOG D-62). Migration `20260925000500_trial_expiry_billing_tick.sql` adds
`public.expire_pro_trials()`, a service-role-only Postgres function that moves an
expired Pro trial's subscription to `status='expired'`, its workspace to
`access_mode='read_only'` via the existing `app.set_access_mode()`, and appends a
`trial_expired` subscription event — idempotent by construction, and never touching a
paying (`active`/`past_due`) subscription. Adds `packages/db/src/repositories/billing-jobs`
(`runTrialExpiryJob`) and `packages/contracts/src/plans`' `runBillingTickOutput`. New
route `GET|POST /api/cron/billing/tick`, protected by `CRON_SECRET`, wired into
`apps/web/vercel.json` as a once-daily cron (Hobby-plan limit) at 09:00 Asia/Dhaka. The
school shell (`apps/web/app/(school)/app/layout.tsx`) now shows a read-only banner
whenever `access_mode='read_only'`.
