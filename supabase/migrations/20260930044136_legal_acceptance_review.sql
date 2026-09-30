-- =====================================================================
-- D-114 review fixes (PR #121: security-reviewer, engineering-database-
-- optimizer). A new file: 20260930041659 was already pushed.
--
--  1. Texts corrected before anyone accepted them: the Privacy Notice said
--     "Teachers see the classes they teach" (any teacher reads the school's
--     students) and left out staff ID numbers and the acceptance records;
--     the guardian consent named "school notices", which parents cannot see
--     yet. Each is a new version (a published row is never changed); the
--     first rows were never deployed. The version pattern now allows a
--     numbered revision ("2026-09-30-interim-2").
--  2. A DPA replay records nothing: the acceptance belongs to the call that
--     created the school (a replay may carry another version).
--  3. Consent is recorded only while the caller's link to the child is
--     active: "already accepted by me" is not an error even after the link
--     was revoked.
--  4. One consent row per invitation and person is a unique index, not only
--     a check before the insert (which leaned on the inner function's lock).
--     It also indexes that check.
-- =====================================================================

alter table app.legal_documents
  drop constraint if exists legal_documents_version_check;
alter table app.legal_documents
  add constraint legal_documents_version_check
  check (version ~ '^\d{4}-\d{2}-\d{2}(-[a-z0-9]+)*$');

insert into app.legal_documents (document, version, locale, text_sha256) values
  ('privacy',          '2026-09-30-interim-2', 'en', '\x4ea1b855fcc66687e54f370a97cd6fb59d382bef1e4f0bdb931af405550d2100'),
  ('guardian_consent', '2026-09-30-2',         'en', '\xaf0428ead75ca90d0c1e10863bc7225a4fd8e727c2f3331d6f09ad312ae5b22a'),
  ('guardian_consent', '2026-09-30-2',         'bn', '\xeffd54a0419e565daecd4b42f457d02e2082017494a66359c960341b63c5d0c4')
on conflict do nothing;

create unique index if not exists consent_records_once_per_invitation
  on public.consent_records (invitation_id, consenting_user_id)
  where invitation_id is not null;
-- justification: a consent row per invitation and person is one fact; also
-- serves accept_guardian_invitation's "already recorded?" lookup.

-- ---------------------------------------------------------------------
-- 2. create_school_workspace(jsonb, text): no row on a replay.
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

  if v_result ? 'workspace_id' and not v_result ? 'error'
     and (v_result ->> 'replayed') = 'false' then
    insert into public.legal_acceptances
      (workspace_id, user_id, document, version, text_sha256, locale)
    values
      ((v_result ->> 'workspace_id')::uuid, v_uid, 'dpa', p_dpa_version, v_sha, 'en')
    on conflict do nothing;
  end if;
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. accept_guardian_invitation(text, text, text): only for an active link.
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

  if exists (select 1 from public.guardian_users gu
              where gu.guardian_id = v_inv.guardian_id and gu.user_id = v_uid
                and gu.status = 'active')
     and not exists (select 1 from public.consent_records c
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
