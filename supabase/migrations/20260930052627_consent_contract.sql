-- =====================================================================
-- D-114 contract step (security review of PR #121, MEDIUM), after #121's
-- code went live on production (0ce4be9):
--
--  1. The one-argument create_school_workspace(jsonb) and
--     accept_guardian_invitation(text) are no longer client-callable. A
--     direct RPC to either created a school with no DPA row, or a guardian
--     link with no consent row. The two-/three-argument overloads (the only
--     ones the app calls) run as the function owner and still call them.
--  2. Every legal_acceptances row writes an audit event (`legal.accepted`),
--     in the same transaction, so a school's trail shows its DPA acceptance.
--     The generic app.tg_audit() cannot be used: this table's id is a
--     bigint, and tg_audit's row_id is a uuid.
-- =====================================================================

revoke execute on function public.create_school_workspace(jsonb) from authenticated;
revoke execute on function public.accept_guardian_invitation(text) from authenticated;

insert into public.audit_action_catalog (action, severity, sentence_en, sentence_bn, is_generic)
values
  ('legal.accepted', 'notable', '{actor} accepted a legal agreement ({name})',
    '{actor} একটি আইনি চুক্তি গ্রহণ করেছেন ({name})', false)
on conflict (action) do update
  set severity    = excluded.severity,
      sentence_en = excluded.sentence_en,
      sentence_bn = excluded.sentence_bn,
      is_generic  = excluded.is_generic;

create or replace function app.tg_legal_acceptance_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.log_audit_event('legal.accepted', new.workspace_id,
    'public.legal_acceptances', null, null,
    jsonb_build_object('document', new.document, 'version', new.version,
                       'locale', new.locale),
    p_actor_kind      => case when auth.uid() is null then 'system'
                              else 'user' end::public.audit_actor_kind,
    p_subject_user_id => new.user_id);
  return new;
end;
$$;

revoke all on function app.tg_legal_acceptance_audit() from public, anon, authenticated, service_role;

drop trigger if exists audit_legal_acceptances on public.legal_acceptances;
create trigger audit_legal_acceptances
  after insert on public.legal_acceptances
  for each row execute function app.tg_legal_acceptance_audit();
