-- pgTAP · D-65: the PostgREST pre-request hook must run for anon without anon
-- gaining USAGE on schema app.
begin;
select plan(5);

select has_function('public', 'pre_request', array[]::text[], 'public.pre_request() exists');
select is((select prosecdef from pg_proc where oid = 'public.pre_request()'::regprocedure),
          true, 'public.pre_request() is SECURITY DEFINER (anon never touches schema app itself)');
select ok(has_function_privilege('anon', 'public.pre_request()', 'EXECUTE'),
          'anon can execute the hook wrapper');
select ok(not has_schema_privilege('anon', 'app', 'USAGE'),
          'anon still has no USAGE on schema app (D-50)');

-- Run it the way PostgREST does: as anon, with request headers set.
set local role anon;
select set_config('request.headers', '{"x-correlation-id":"11111111-2222-4333-8444-555555555555"}', true);
select lives_ok($$select public.pre_request()$$, 'the hook runs as anon without permission errors');
reset role;

select * from finish();
rollback;
