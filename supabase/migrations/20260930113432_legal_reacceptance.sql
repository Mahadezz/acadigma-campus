-- =====================================================================
-- Re-acceptance of the current legal documents (D-115; follows D-114).
--
-- D-114 records Terms/Privacy at sign-up and the DPA at school creation, in
-- the transaction of the thing agreed to. Two cases have no writer:
--
--   * accounts created before D-114 (no Terms/Privacy row) and schools
--     created before it (no DPA row);
--   * a newly published version, which nobody has accepted yet.
--
-- The app now stops a signed-in person at the shell until they accept the
-- current versions (apps/web/lib/workspace.ts, requireShell). No client
-- role may insert into legal_acceptances (39f E4), and no existing function
-- records an acceptance outside sign-up or school creation, so this is the
-- one writer for "accept now": the caller's own Terms/Privacy, or the DPA
-- for a school the caller actively owns. The database still decides the
-- hash (app.legal_document_sha256), so only a published version can be
-- recorded, and the audit trigger from 20260930052627 logs each row.
-- =====================================================================

create or replace function public.accept_legal_document(
  p_document text, p_version text, p_workspace_id uuid default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_sha bytea;
begin
  if v_uid is null then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if p_document in ('terms', 'privacy') then
    -- A person's own agreement: never on a school's behalf.
    if p_workspace_id is not null then
      raise exception 'INVALID_INPUT' using errcode = '22023';
    end if;
  elsif p_document = 'dpa' then
    -- On the school's behalf: only its active owner.
    if p_workspace_id is null
       or not app.has_role(p_workspace_id, array['owner'])
       or not exists (select 1 from public.workspaces w
                       where w.id = p_workspace_id and w.type = 'school') then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;
  else
    raise exception 'LEGAL_DOCUMENT_UNKNOWN' using errcode = '22023';
  end if;

  v_sha := app.legal_document_sha256(p_document, p_version, 'en');

  insert into public.legal_acceptances
    (workspace_id, user_id, document, version, text_sha256, locale)
  values
    (p_workspace_id, v_uid, p_document, p_version, v_sha, 'en')
  on conflict do nothing;
end;
$$;

comment on function public.accept_legal_document(text, text, uuid) is
  'D-115: records the caller''s acceptance of a published legal document '
  'version: terms/privacy for themselves (p_workspace_id null), or the DPA '
  'for a school they actively own. FORBIDDEN otherwise; '
  'LEGAL_DOCUMENT_UNKNOWN for a version never published. Accepting the same '
  'version twice records it once.';

revoke all on function public.accept_legal_document(text, text, uuid) from public, anon;
grant execute on function public.accept_legal_document(text, text, uuid) to authenticated;
