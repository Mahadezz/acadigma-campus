---
"@acadigma/domain": minor
"@acadigma/contracts": minor
"@acadigma/db": minor
---

F-CM-06 Plans & Subscriptions, Parts 1-3: the reusable plans/limits engine. Adds
`packages/domain/src/plans` (pure `assertWithinLimit`, `hasModule`, trial and
proration math), `packages/db/src/repositories/{plans,subscriptions,usage}` (including
the `requireWritable` PLAN_READ_ONLY guard, D-29), and `packages/contracts/src/plans`
Zod schemas. Migration `20260917020100_plans_limits_engine.sql` adds a
`platform_settings` table (AI top-up placeholders, D-39), seeds the `fees` module on
Starter+ (D-31), adds `app.workspace_plan`/`app.within_limit`, and closes a permission
gap in `app.set_access_mode` (previously callable by any authenticated user).
