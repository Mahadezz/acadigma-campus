-- =====================================================================
-- Legal acceptance and guardian consent (D-114; LEGAL-AUDIT-2026-09-29
-- items 4, 5, 6; COMPLIANCE-PDPA P2, P3, P8, P9).
--
-- `legal_acceptances` and `consent_records` have existed since 0003 but
-- nothing wrote to them. This migration gives each of the three places a
-- person agrees to something a writer, in the same transaction as the thing
-- agreed to:
--
--   1. Sign-up (Terms + Privacy): a trigger on auth.users reads the versions
--      the registration form sent in the user metadata.
--   2. School creation (DPA): public.create_school_workspace(jsonb, text).
--   3. Accepting a parent link (guardian consent):
--      public.accept_guardian_invitation(text, text, text).
--
-- The database decides the hash. app.legal_documents holds the SHA-256 of
-- the exact text published under each (document, version, locale) — the
-- strings in apps/web/lib/legal/texts.ts, checked by texts.test.ts — so a
-- caller names a version and can never record agreement to words that were
-- never published (LEGAL_DOCUMENT_UNKNOWN).
--
-- Expand-first: the one-argument create_school_workspace(jsonb) and
-- accept_guardian_invitation(text) keep their grants so the code deployed
-- before this migration keeps working; the app now calls only the new
-- overloads. Revoking the old ones from `authenticated` is the contract
-- step, in a later migration once this code is live.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. The published texts, by hash
-- ---------------------------------------------------------------------
create table if not exists app.legal_documents (
  document     text not null
               check (document in ('terms', 'privacy', 'dpa', 'guardian_consent')),
  version      text not null check (version ~ '^\d{4}-\d{2}-\d{2}(-[a-z]+)?$'),
  locale       text not null check (locale in ('en', 'bn')),
  text_sha256  bytea not null check (octet_length(text_sha256) = 32),
  published_at timestamptz not null default now(),
  primary key (document, version, locale)
);

comment on table app.legal_documents is
  'D-114: one row per published text a person can agree to. text_sha256 is '
  'the SHA-256 of the exact string in apps/web/lib/legal/texts.ts. A text is '
  'never edited: a change is a new version (a new row, in a new migration). '
  'Server-internal; no client role has any privilege on it.';

select app.attach_append_only('app.legal_documents');
revoke all on app.legal_documents from public, anon, authenticated, service_role;

insert into app.legal_documents (document, version, locale, text_sha256) values
  ('terms',            '2026-09-30-interim', 'en', '\x5f649afc9531de49ed671e721a19992833c84b0100cd442b49796e75b4a62307'),
  ('privacy',          '2026-09-30-interim', 'en', '\xed30f43761acfa80eeabcab27d9e3ba35a3537b4c9dcf2d2a8303120da6f015a'),
  ('dpa',              '2026-09-30-interim', 'en', '\xfc248acaf3d4b4be9d74fb199bec61a59e1bb0fcd23a70ec1b1d6fe99c2c4253'),
  ('guardian_consent', '2026-09-30',         'en', '\xbe6d9be6f98c030653dbb30a9d83d0c5e7ff2779fd9892eba62bda9d5a7fbc22'),
  ('guardian_consent', '2026-09-30',         'bn', '\xf7e88641552858ce594cdfc291c45df3589efb3701edbd829f8567c439362c6e')
on conflict do nothing;

create or replace function app.legal_document_sha256(
  p_document text, p_version text, p_locale text)
returns bytea
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_sha bytea;
begin
  select d.text_sha256 into v_sha from app.legal_documents d
   where d.document = p_document and d.version = p_version and d.locale = p_locale;
  if v_sha is null then
    raise exception 'LEGAL_DOCUMENT_UNKNOWN' using errcode = '22023';
  end if;
  return v_sha;
end;
$$;

revoke all on function app.legal_document_sha256(text, text, text)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2. Sign-up: Terms + Privacy, in the transaction that creates the user.
--    raw_user_meta_data is whatever the sign-up request sent, so this only
--    ever records the new user's own acceptance of a published version; an
--    unknown version fails the sign-up rather than record a false row.
--    No `legal` key (an older client, an admin-created user): nothing.
-- ---------------------------------------------------------------------
create or replace function app.tg_record_signup_legal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_legal jsonb := new.raw_user_meta_data -> 'legal';
  v_doc   text;
begin
  if v_legal is null or jsonb_typeof(v_legal) <> 'object' then
    return new;
  end if;
  foreach v_doc in array array['terms', 'privacy'] loop
    if v_legal ? v_doc then
      insert into public.legal_acceptances
        (workspace_id, user_id, document, version, text_sha256, locale)
      values
        (null, new.id, v_doc, v_legal ->> v_doc,
         app.legal_document_sha256(v_doc, v_legal ->> v_doc, 'en'), 'en')
      on conflict do nothing;
    end if;
  end loop;
  return new;
end;
$$;

revoke all on function app.tg_record_signup_legal() from public, anon, authenticated, service_role;

drop trigger if exists on_auth_user_created_legal on auth.users;
create trigger on_auth_user_created_legal
  after insert on auth.users
  for each row execute function app.tg_record_signup_legal();

-- ---------------------------------------------------------------------
-- 3. School creation: the DPA, accepted by the creating owner on the
--    school's behalf, in the same transaction as the school. A result
--    without a workspace (EIIN_TAKEN, RATE_LIMITED, ...) records nothing;
--    a replay of the same idempotency key finds the row already there.
-- ---------------------------------------------------------------------
create or replace function public.create_school_workspace(p_input jsonb, p_dpa_version text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_sha    bytea;
  v_result jsonb;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  v_sha := app.legal_document_sha256('dpa', p_dpa_version, 'en');

  v_result := public.create_school_workspace(p_input);

  if v_result ? 'workspace_id' and not v_result ? 'error' then
    insert into public.legal_acceptances
      (workspace_id, user_id, document, version, text_sha256, locale)
    values
      ((v_result ->> 'workspace_id')::uuid, v_uid, 'dpa', p_dpa_version, v_sha, 'en')
    on conflict do nothing;
  end if;
  return v_result;
end;
$$;

comment on function public.create_school_workspace(jsonb, text) is
  'D-114: create_school_workspace(jsonb) plus the owner''s acceptance of the '
  'named DPA version, in one transaction. Raises LEGAL_DOCUMENT_UNKNOWN for a '
  'version that was never published (before anything is created); otherwise '
  'returns and raises exactly what create_school_workspace(jsonb) does.';

revoke all on function public.create_school_workspace(jsonb, text) from public, anon;
grant execute on function public.create_school_workspace(jsonb, text) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Parent link: the guardian's consent of record (D-34, COMPLIANCE §3.2)
--    for the student the link names, in the same transaction as the link.
--    A double tap records it once.
-- ---------------------------------------------------------------------
create or replace function public.accept_guardian_invitation(
  p_token text, p_consent_version text, p_locale text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_sha    bytea;
  v_result jsonb;
  v_inv    public.workspace_invitations;
begin
  if v_uid is null then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  v_sha := app.legal_document_sha256('guardian_consent', p_consent_version, p_locale);

  -- Every check (expiry, inviter, read-only school, ...) and the link itself.
  v_result := public.accept_guardian_invitation(p_token);

  select i.* into v_inv from public.workspace_invitations i
   where i.token_hash = app.hash_token(p_token) and i.guardian_id is not null;

  if not exists (select 1 from public.consent_records c
                  where c.invitation_id = v_inv.id and c.consenting_user_id = v_uid) then
    perform app.record_consent(
      p_subject_type       => 'student',
      p_purpose            => 'guardian.portal_access',
      p_text_version       => p_consent_version,
      p_text_sha256        => v_sha,
      p_channel            => 'web',
      p_subject_id         => v_inv.student_id,
      p_workspace_id       => v_inv.workspace_id,
      p_consenting_user_id => v_uid,
      p_guardian_id        => v_inv.guardian_id,
      p_locale             => p_locale,
      p_invitation_id      => v_inv.id);
  end if;
  return v_result;
end;
$$;

comment on function public.accept_guardian_invitation(text, text, text) is
  'D-114: accept_guardian_invitation(text) plus a consent_records row '
  '(subject student, purpose guardian.portal_access, the named version and '
  'locale of the consent text), in one transaction, once per invitation and '
  'person. Raises LEGAL_DOCUMENT_UNKNOWN before anything is written, then '
  'whatever accept_guardian_invitation(text) raises.';

revoke all on function public.accept_guardian_invitation(text, text, text) from public, anon;
grant execute on function public.accept_guardian_invitation(text, text, text) to authenticated;
