#!/usr/bin/env bash
# =====================================================================
# Demo school seed (D-80) — used by .github/workflows/demo-seed.yml and by
# packages/db/src/demo-seed.integration.test.ts (CI db-integration stack).
#
#   1. Ensures the three fictional demo accounts exist, through the Auth
#      admin API (GoTrue hashes the password; it never appears in SQL).
#   2. Runs supabase/seed/demo-school.sql, demo-class-6-ka.sql (D-103) and
#      demo-school-history.sql as ONE statement in one transaction; every
#      step goes through the same database functions the app calls.
#
# Env:
#   SUPABASE_URL          API URL (https://<ref>.supabase.co or the local one)
#   SUPABASE_SERVICE_KEY  service-role / secret key — for the Auth admin API only
#   DEMO_PASSWORD         the demo accounts' password (a GitHub secret in prod)
#   DB_TARGET             "--linked" (production, via the Management API) or "--local"
# =====================================================================
set -euo pipefail

: "${SUPABASE_URL:?}" "${SUPABASE_SERVICE_KEY:?}" "${DEMO_PASSWORD:?}" "${DB_TARGET:?}"
case "$DB_TARGET" in --linked | --local) ;; *) echo "DB_TARGET must be --linked or --local" >&2; exit 2 ;; esac
if [ "${#DEMO_PASSWORD}" -lt 12 ]; then
  echo "DEMO_PASSWORD must be at least 12 characters" >&2
  exit 2
fi

root="$(cd "$(dirname "$0")/.." && pwd)"

# A legacy service_role JWT also goes in Authorization; a new sb_secret_ key
# goes in apikey only (the gateway refuses it as a bearer token).
bearer=()
case "$SUPABASE_SERVICE_KEY" in eyJ*) bearer=(-H "Authorization: Bearer $SUPABASE_SERVICE_KEY") ;; esac

# Auth admin API call: the JSON body goes in on stdin (never on a command
# line, where it would show in the process list). Prints the response body,
# fails on anything but 2xx.
admin() {
  local method="$1" path="$2" out status
  out="$(mktemp)"
  status=$(printf '%s' "${3:-}" | curl -sS -o "$out" -w '%{http_code}' -X "$method" \
    "$SUPABASE_URL/auth/v1$path" -H "apikey: $SUPABASE_SERVICE_KEY" "${bearer[@]}" \
    -H 'Content-Type: application/json' ${3:+--data-binary @-})
  if [ "${status:0:1}" != 2 ]; then
    echo "HTTP $status $(jq -c '{code: (.error_code // .code), msg: (.msg // .message // .error)}' "$out" 2>/dev/null)"
    rm -f "$out"
    return 1
  fi
  cat "$out"
  rm -f "$out"
}

db() { (cd "$root" && supabase db query "$DB_TARGET" "$1"); }

# The fixed, fictional demo accounts. example.com never delivers mail.
# app_metadata.acadigma_demo marks an account the seed created (users cannot
# edit app_metadata). Signup is open, so a demo email may already belong to
# someone else's account: that account is deleted and created afresh, which
# voids every token it was issued and drops whatever its registrant planted
# (name, metadata, MFA factors, personal workspace). The SQL refuses to
# delete an account that is a member of any workspace but its own personal
# one, so no other school is ever touched.
ensure_user() {
  local email="$1" name="$2" body found id marked
  body=$(jq -n --arg e "$email" --arg p "$DEMO_PASSWORD" --arg n "$name" \
    '{email: $e, password: $p, email_confirm: true,
      user_metadata: {full_name: $n}, app_metadata: {acadigma_demo: true}}')
  if admin POST /admin/users "$body" >/dev/null; then
    echo "created $email"
    return
  fi

  # Already there (email_exists): find it in the database. (The admin API has
  # no email filter, and its user listing fails outright on rows inserted by
  # SQL, as seed.sql's are.) The marker is printed with the id in one token,
  # so any output format of `supabase db query` can be read.
  found=$(db "select 'DEMO_USER=' || id || ':' || coalesce(raw_app_meta_data ->> 'acadigma_demo', 'false')
                from auth.users where email = '$email'" \
    | grep -oE 'DEMO_USER=[0-9a-f-]{36}:[a-z]+' | head -1) || true
  [ -n "$found" ] || { echo "::error::$email exists but was not found" >&2; exit 1; }
  id=${found#DEMO_USER=}
  marked=${id#*:}
  id=${id%%:*}

  if [ "$marked" = true ]; then
    # Ours: the password follows the secret, so rotation reaches it.
    admin PUT "/admin/users/$id" "$(jq -n --arg p "$DEMO_PASSWORD" '{password: $p}')" >/dev/null \
      || { echo "::error::resetting $email failed" >&2; exit 1; }
    echo "exists  $email"
    return
  fi

  # Not ours: delete it in one transaction and create it afresh. The Auth
  # admin API's delete cannot do this alone: the personal workspace's
  # owner_id is ON DELETE RESTRICT, so it must go first. auth.users cascades
  # to identities, sessions, refresh tokens and MFA factors; the profile
  # (with its preferences and memberships) is deleted after it (D-113); audit and consent rows are
  # FK-free and stay.
  db "do \$\$
      declare v uuid := '$id';
      begin
        if exists (select 1 from auth.users u
                    where u.id = v and u.raw_app_meta_data ->> 'acadigma_demo' = 'true') then
          raise exception 'refusing: % is a seed account', v;
        end if;
        if exists (select 1 from public.workspace_members m
                     join public.workspaces w on w.id = m.workspace_id
                    where m.user_id = v and not (w.type = 'personal' and w.owner_id = v)) then
          raise exception 'refusing: the account registered under a demo email belongs to another workspace';
        end if;
        delete from public.workspaces w where w.type = 'personal' and w.owner_id = v;
        delete from auth.users u where u.id = v;
        -- D-113: profiles no longer cascades from auth.users.
        delete from public.profiles p where p.id = v;
      end \$\$" >/dev/null || { echo "::error::replacing $email failed" >&2; exit 1; }
  admin POST /admin/users "$body" >/dev/null || { echo "::error::recreating $email failed" >&2; exit 1; }
  echo "replaced $email"
}
ensure_user owner.demo@example.com "Mahbuba Sultana"
ensure_user teacher.demo@example.com "Abdur Rashid"
ensure_user parent.demo@example.com "Abdul Uddin"

sql="$(mktemp)"
trap 'rm -f "$sql"' EXIT
# `supabase db query` sends one prepared statement, so the three files (one
# DO block each) run as one outer DO block: one statement, one transaction —
# a failure anywhere leaves nothing behind.
{
  echo 'do $demo_seed$ begin'
  for f in demo-school.sql demo-class-6-ka.sql demo-school-history.sql; do
    if grep -q '\$demo_file\$' "$root/supabase/seed/$f"; then
      echo "$f contains the wrapper's quote tag" >&2
      exit 2
    fi
    printf 'execute $demo_file$\n%s\n$demo_file$;\n' "$(cat "$root/supabase/seed/$f")"
  done
  echo 'end $demo_seed$;'
} >"$sql"

(cd "$root" && supabase db query "$DB_TARGET" -f "$sql")
