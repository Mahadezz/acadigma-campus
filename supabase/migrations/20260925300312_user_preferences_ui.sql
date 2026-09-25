-- =====================================================================
-- F-ID-10 Part 1 — basic mode display preferences (D-403)
--
-- `public.user_preferences` already exists (`20260917010100_identity.sql`,
-- F-ID-02's demo-cut columns: theme_mode, palette, density, language,
-- timezone, email_digest, push_enabled, channels) with `class U1` RLS
-- (select/insert/update/delete, own row only, no platform read — DATA-MODEL
-- §1.7) and a row created eagerly for every new user by
-- `app.handle_new_user()`. F-ID-10 §3 describes Part 1 as creating the table
-- "if it does not exist" with only `ui_mode`/`text_size` — it already exists,
-- so this migration only ADDS the two columns this feature needs. DATA-MODEL
-- wins (F-ID-10 §3's own rule): the real table's RLS (full CRUD, own row
-- only) applies unchanged to the two new columns, not the narrower "no
-- delete grant" line F-ID-10 §3 wrote before this Part discovered the table
-- already shipped — see D-404 and F-ID-10 §11.
--
-- No new RLS policy, grant or trigger: `user_preferences_select/insert/
-- update/delete` and `app.attach_updated_at('public.user_preferences')`
-- already cover every column on the row, and the eager `handle_new_user()`
-- insert already gives every user a row with both new columns at their
-- defaults, so "no row needed to read" / "first write upserts" (F-ID-10 §3)
-- holds without any trigger change.
-- =====================================================================

do $$ begin
  create type public.ui_mode as enum ('full', 'basic');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.text_size as enum ('normal', 'large', 'xlarge');
exception when duplicate_object then null; end $$;

alter table public.user_preferences
  add column if not exists ui_mode   public.ui_mode   not null default 'full',
  add column if not exists text_size public.text_size not null default 'normal';

comment on column public.user_preferences.ui_mode is
  'F-ID-10 (D-403): full = feature-by-feature app, basic = class-by-class '
  'layout over the same actions and permissions. Global to the user, not '
  'per workspace; a member whose role is staff in the active workspace '
  'never sees the basic shell there regardless of this value (F-ID-10 §2 '
  'note 4) — enforced in application routing, not RLS, because basic mode '
  'is a layout choice, never a permission.';
comment on column public.user_preferences.text_size is
  'F-ID-10 §5.2: 100% / 112.5% / 125% root font size via '
  '<html data-text-size>, rendered server-side for a no-flash first paint. '
  'Applies in both full and basic mode.';
