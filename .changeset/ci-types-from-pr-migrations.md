---
"@acadigma/db": patch
---

`types.generated.ts` is now generated from the PR's own migrations in CI (`supabase gen types --db-url` against the CI Postgres, DECISION-LOG D-55) instead of from the live project, so schema-changing PRs can pass the freshness check. CI's Postgres now keeps pgTAP and pgcrypto in the `extensions` schema, as Supabase does.
