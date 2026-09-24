# Database tests (pgTAP)

These are the tests CI runs as the **DB tests** quality gate (ARCHITECTURE §9).
They assert the security boundary directly against Postgres — not against the
application — because _the database and the server are the security boundary_
and UI guards exist for experience only.

| File                               | What it proves                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `01_app_helpers.sql`               | `app.member_role`, `app.has_role`, `app.is_platform_admin`, `app.shares_active_workspace`, `app.next_id` behave exactly as ARCHITECTURE §3 specifies — including that `pending` and `removed` members are not members.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `02_tenant_isolation.sql`          | A member of workspace A can neither read nor write anything belonging to workspace B, and a tenant row can never be moved between tenants.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `03_role_escalation.sql`           | No one changes their own role or status; an admin cannot grant ownership; a parent cannot read the staff roster; the last owner cannot be downgraded; plans and subscriptions are not client-writable.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `04_audit_append_only.sql`         | `audit_events` is written by the trigger, redacts secrets, and refuses `UPDATE`/`DELETE` for every role — including privileged ones. Only owners and platform staff can read it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `05_invitations.sql`               | The full invitation lifecycle: only owners/admins invite, the raw token is never stored, redeem verifies the email binding, tokens are single-use and expire, and join-by-code always lands as `teacher/pending`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `09_tenancy.sql`                   | F-ID-03 Part 1 demo: the four Base44 security-review attack paths (self-role escalation, cross-tenant read/write, membership self-insert-as-owner, removed-member access) dead in one file, plus the `20260917020300_tenancy_hardening.sql` additions — `public.switch_workspace`/`public.list_my_workspaces` (D-50), the `tenancy.context_rejected` tripwire, and the `school_profiles` tenant-freeze fix.                                                                                                                                                                                                                                                                                                                                                                                                     |
| `10_tenancy_cascade.sql`           | F-ID-03 review follow-up (D-52): a direct client UPDATE can never re-parent or null out `data_requests.workspace_id`, but a hard `DELETE` of a workspace with a `data_requests` row succeeds and nulls the column via the `ON DELETE SET NULL` cascade — `20260924010000_tenancy_freeze_cascade_exception.sql`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `11_tenancy_tripwire_status.sql`   | F-ID-03 review follow-up (D-52, amended): pending, removed and never-joined callers each still write one `tenancy.context_rejected` row, classified server-side by `membership_status` and `severity` — `20260924020000_tenancy_tripwire_membership_status.sql`. A caller with no `auth.uid()` is refused and writes nothing (`20260924040000_tripwire_requires_auth.sql`).                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `12_function_grants_invariant.sql` | D-54: for every function (SECURITY DEFINER or INVOKER) in `public`/`app`, `anon` and `authenticated` EXECUTE is allowed only on an explicit allowlist — never by silently inheriting Supabase's platform default; `log_auth_event_service` is `service_role`-only; the default privilege itself (both role-wide and schema-scoped, for role `postgres`) grants EXECUTE to `service_role` but neither `anon` nor `authenticated` after migrations; and a live probe function, created with no grants inside the test's own transaction, proves the role-wide revoke actually governs a brand-new object rather than just being recorded in the catalog. Depends on `supabase/ci/bootstrap.sql` reproducing Supabase's default grant, so this file is false in CI exactly when it would be false on the platform. |
| `14_rls_known_gaps.sql`            | D-56, PR #17 `KNOWN_GAPS` shrink: isolation + escalation for the five tables that already had RLS, SELECT-only grants and no write policy, but no pgTAP case yet — `consent_records`, `legal_acceptances`, `email_log`, `file_access_log`, `subscription_events`. Per table: a workspace-A member never sees workspace B; `anon` holds no `SELECT` privilege at all; a non-owner/admin member sees only what the policy allows (nothing, for three of the five, even for a row about their own action); the row's own user sees it where the policy has an own-row branch (`consent_records`, `legal_acceptances`); platform admin sees every workspace; and `authenticated` INSERT/UPDATE/DELETE all fail `42501` because none of the five grants a write verb at all.                                         |

## Running them

```bash
# once, against a fresh local stack
supabase db reset          # applies supabase/migrations + supabase/seed/seed.sql
supabase test db
```

`supabase test db` runs every `*.sql` in this directory through `pg_prove`.
To run one file:

```bash
supabase test db --file supabase/tests/03_role_escalation.sql
```

Against the cloud **dev branch** instead of a local stack:

```bash
supabase link --project-ref <dev-branch-ref>
supabase test db --linked
```

## How the tests work

Each file is a single transaction that ends in `rollback`, so nothing it
creates survives. Inside, three helpers are defined locally (and rolled back
with everything else):

- `tests.mkuser(id, email, name)` — inserts into `auth.users`, which fires
  `app.handle_new_user()` and therefore also exercises profile creation and
  the one-personal-workspace rule.
- `tests.login(id)` — sets `request.jwt.claims` and switches the session to
  the `authenticated` role, so RLS applies exactly as it does for a real
  PostgREST request.
- `tests.logout()` — returns to `postgres`.

The helpers are duplicated per file on purpose: `pg_prove` runs each file
independently, and a shared fixture file placed here would itself be run as a
test and fail for having no plan.

## Writing new tests — two things that trip people up

1. **A failed `INSERT` raises `42501`; a filtered `UPDATE`/`DELETE` does not.**
   When a `USING` clause hides the row, Postgres reports _zero rows affected_,
   not an error. `throws_ok` on such a statement therefore passes even when
   the table has no policy at all — it is a test that cannot fail. Assert the
   row count instead, then re-select to prove the row is untouched:

   ```sql
   with attempted as (
     update public.custom_labels set name = 'Hijacked'
      where id = '<a row in the other tenant>'
     returning 1)
   select is((select count(*)::int from attempted), 0,
             'an update aimed at another tenant affects ZERO rows');
   ```

   The data-modifying CTE has to be at the top level of the statement, which
   is why it is written this way round rather than as a scalar subquery
   inside `is(...)`.

   `throws_ok` is right for three cases: an `INSERT` that fails `WITH CHECK`,
   an `UPDATE` that reaches a `BEFORE` trigger and is rejected there (the
   self-role-edit guard), and a verb the role holds no `GRANT` for at all
   (`DELETE` on `workspace_members`).

2. **`SECURITY DEFINER` helpers bypass RLS, which is why they exist.**
   `app.has_role()` reads `workspace_members` from inside a policy _on_
   `workspace_members`. That only terminates because the helper is definer.
   If you add a helper, make it `stable`, `security definer`, and
   `set search_path = ''`, and add a test here for it.

Every new tenant table needs, at minimum, an isolation case in
`02_tenant_isolation.sql` and an escalation case in `03_role_escalation.sql`
before it ships (ARCHITECTURE §9).
