# Database tests (pgTAP)

These are the tests CI runs as the **DB tests** quality gate (ARCHITECTURE §9).
They assert the security boundary directly against Postgres — not against the
application — because _the database and the server are the security boundary_
and UI guards exist for experience only.

| File                       | What it proves                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `01_app_helpers.sql`       | `app.member_role`, `app.has_role`, `app.is_platform_admin`, `app.shares_active_workspace`, `app.next_id` behave exactly as ARCHITECTURE §3 specifies — including that `pending` and `removed` members are not members.                                                                                                                                                                                      |
| `02_tenant_isolation.sql`  | A member of workspace A can neither read nor write anything belonging to workspace B, and a tenant row can never be moved between tenants.                                                                                                                                                                                                                                                                  |
| `03_role_escalation.sql`   | No one changes their own role or status; an admin cannot grant ownership; a parent cannot read the staff roster; the last owner cannot be downgraded; plans and subscriptions are not client-writable.                                                                                                                                                                                                      |
| `04_audit_append_only.sql` | `audit_events` is written by the trigger, redacts secrets, and refuses `UPDATE`/`DELETE` for every role — including privileged ones. Only owners and platform staff can read it.                                                                                                                                                                                                                            |
| `05_invitations.sql`       | The full invitation lifecycle: only owners/admins invite, the raw token is never stored, redeem verifies the email binding, tokens are single-use and expire, and join-by-code always lands as `teacher/pending`.                                                                                                                                                                                           |
| `09_tenancy.sql`           | F-ID-03 Part 1 demo: the four Base44 security-review attack paths (self-role escalation, cross-tenant read/write, membership self-insert-as-owner, removed-member access) dead in one file, plus the `20260917020300_tenancy_hardening.sql` additions — `public.switch_workspace`/`public.list_my_workspaces` (D-50), the `tenancy.context_rejected` tripwire, and the `school_profiles` tenant-freeze fix. |
| `10_tenancy_cascade.sql`   | F-ID-03 review follow-up (D-52): a direct client UPDATE can never re-parent or null out `data_requests.workspace_id`, but a hard `DELETE` of a workspace with a `data_requests` row succeeds and nulls the column via the `ON DELETE SET NULL` cascade — `20260924010000_tenancy_freeze_cascade_exception.sql`.                                                                                             |

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
