#!/usr/bin/env bash
# =====================================================================
# Demo school seed (D-80) — used by .github/workflows/demo-seed.yml and by
# packages/db/src/demo-seed.integration.test.ts (CI db-integration stack).
#
#   1. Ensures the three fictional demo accounts exist, through the Auth
#      admin API (GoTrue hashes the password; it never appears in SQL).
#   2. Runs supabase/seed/demo-school.sql, demo-class-6-ka.sql (D-103) and
#      demo-school-history.sql as ONE query, so every step goes through the
#      same database functions the app calls.
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

# The fixed, fictional demo accounts. example.com never delivers mail.
ensure_user() {
  local email="$1" name="$2" body status
  body=$(jq -n --arg e "$email" --arg p "$DEMO_PASSWORD" --arg n "$name" \
    '{email: $e, password: $p, email_confirm: true, user_metadata: {full_name: $n}}')
  status=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$SUPABASE_URL/auth/v1/admin/users" \
    -H "apikey: $SUPABASE_SERVICE_KEY" "${bearer[@]}" \
    -H 'Content-Type: application/json' --data-binary @- <<<"$body")
  case "$status" in
    200 | 201) echo "created $email" ;;
    422) echo "exists  $email" ;; # email_exists: idempotent re-run
    *) echo "::error::creating $email failed with HTTP $status" >&2; exit 1 ;;
  esac
}
ensure_user owner.demo@example.com "Mahbuba Sultana"
ensure_user teacher.demo@example.com "Abdur Rashid"
ensure_user parent.demo@example.com "Abdul Uddin"

sql="$(mktemp)"
trap 'rm -f "$sql"' EXIT
cat "$root/supabase/seed/demo-school.sql" \
  "$root/supabase/seed/demo-class-6-ka.sql" \
  "$root/supabase/seed/demo-school-history.sql" >"$sql"

(cd "$root" && supabase db query "$DB_TARGET" -f "$sql")
