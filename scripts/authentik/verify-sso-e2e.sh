#!/bin/bash
# End-to-end SSO verification against a deployed environment.
# Creates an ephemeral Authentik user, drives the OIDC flow headlessly via
# Authentik's flow-executor JSON API, and asserts the app-side outcomes.
#
# Usage:
#   PW_USER=admin PW_PASS=sandbox123 ./scripts/authentik/verify-sso-e2e.sh <app_base_url> <db_ct>
#   e.g. PW_USER=admin PW_PASS=sandbox123 ./scripts/authentik/verify-sso-e2e.sh http://192.168.1.144 2600
#        (sandbox: app + db live on the same CT)
#
# PW_USER / PW_PASS: a known-good password-login account on the target app,
# used only for the password-login regression check (step 4). Never
# hardcoded here — pass sandbox admin/sandbox123 for sandbox, or the
# operator's own prod credential for prod. Not printed anywhere.
#
# Requires: SSH access to root@192.168.1.190 (BatchMode key auth) for the
# Authentik API token bootstrap and for DB assertions on $DB_CT. Direct HTTP
# access to $APP, the Authentik REST API (http://192.168.1.164:9000), and
# the Authentik public flow-executor (https://auth.booute.duckdns.org).
#
# Flow-executor notes (live Authentik 2026.2.2, discovered by iteration):
# - The default-authentication-flow used by our provider is 4 stages:
#   identification (order 10) -> password (order 20) -> mfa-validation
#   (order 30, not_configured_action=skip, so it auto-skips for an
#   ephemeral user with no configured device) -> user-login (order 100).
# - Each stage transition is signalled either as an HTTP 3xx with a
#   Location header, or (less often) an HTTP 200 body with a
#   {"component":"xak-flow-redirect","to":"..."} envelope. Both point back
#   into /api/v3/flows/executor/<slug>/?query=... to fetch the next stage,
#   until the target leaves that path (real completion).
# - Critically: the Authentik Go gateway's session/reputation handling
#   appears to distrust non-browser HTTP/2 clients — driving the flow over
#   HTTP/2 with a generic curl User-Agent silently issues a session cookie
#   that never actually authenticates server-side (confirmed via
#   /api/v3/core/users/me/ staying anonymous even after a stage-100 "login"
#   event was logged). Forcing HTTP/1.1 with a real browser User-Agent for
#   every request to the Authentik host fixes this reliably. Once the
#   session is genuinely authenticated, re-hitting /api/auth/oidc/login on
#   the SAME cookie jar completes silently (authorize -> code -> app
#   callback) without needing to replay identification/password again —
#   this is what step 2 (post-promotion login) relies on.

set -uo pipefail
APP=${1:?app base url}
DB_CT=${2:?db container id}
PW_USER=${PW_USER:?set PW_USER env var to a known password-login username on the target app}
PW_PASS=${PW_PASS:?set PW_PASS env var to that account password}
DB_NAME=${DB_NAME:-expense_app_sandbox}

PROXMOX="root@192.168.1.190"
AK_CT=111
AK_API="http://192.168.1.164:9000/api/v3"
AK_PUBLIC="https://auth.booute.duckdns.org"
UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36'
TEST_USER="sso-e2e-test-$$"
TEST_EMAIL="${TEST_USER}@example.invalid"
TEST_PASS="E2e-Test-$(date +%s)-$$!Aa1"
JAR=$(mktemp)
PK=""
FAILED=0

# All requests to the Authentik host: HTTP/1.1 + a browser UA (see notes
# above — HTTP/2 + a curl UA silently fails to persist the session).
AKCURL() { curl -sk --http1.1 -A "$UA" "$@"; }

cleanup() {
  echo "=== Cleanup ==="
  if [ -n "$PK" ]; then
    if AKCURL -sf -X DELETE "$AK_API/core/users/$PK/" -H "Authorization: Bearer $TOKEN" >/dev/null 2>&1; then
      echo "  ok authentik user pk=$PK deleted"
    else
      echo "  warn: could not delete authentik user pk=$PK (may already be gone)"
    fi
  fi
  DEL_OUT=$(ssh "$PROXMOX" "pct exec $DB_CT -- su - postgres -c \"psql -d $DB_NAME -c \\\"DELETE FROM users WHERE email='$TEST_EMAIL'\\\"\"" 2>&1) || true
  echo "  app-db cleanup: $DEL_OUT" | tr '\n' ' '
  echo
  rm -f "$JAR"
  if [ "$FAILED" -ne 0 ]; then
    echo "=== SOME CHECKS FAILED (see above) ==="
  fi
}
trap cleanup EXIT

fail() { echo "❌ $1" >&2; FAILED=1; exit 1; }

echo "=== 0. SSO status endpoint ==="
STATUS=$(curl -sf "$APP/api/auth/oidc/status") || fail "status endpoint unreachable"
echo "$STATUS" | grep -q '"enabled":true' && echo "✓ enabled ($STATUS)" || fail "SSO not enabled: $STATUS"

echo "=== 1. Bootstrap Authentik API token ==="
TOKEN=$(ssh "$PROXMOX" "pct exec $AK_CT -- bash -lc 'cd /opt/authentik && .venv/bin/python manage.py shell -c \"
from authentik.core.models import Token
print(Token.objects.get(identifier=\\\"trade-show-provisioning\\\").key)
\"'" 2>/dev/null | tail -1)
[ -n "$TOKEN" ] || fail "could not bootstrap Authentik API token"
echo "✓ token acquired"

AK() { # method path [json-body]
  local method=$1 path=$2 body=${3:-}
  AKCURL -f -X "$method" "$AK_API$path" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' ${body:+-d "$body"}
}

echo "=== 2. Create ephemeral Authentik user ==="
CREATED=$(AK POST "/core/users/" "{\"username\": \"$TEST_USER\", \"name\": \"SSO E2E Test\", \"email\": \"$TEST_EMAIL\", \"type\": \"internal\", \"is_active\": true}") \
  || fail "could not create ephemeral Authentik user"
PK=$(echo "$CREATED" | python3 -c "import json,sys; print(json.load(sys.stdin)['pk'])")
AK POST "/core/users/$PK/set_password/" "{\"password\": \"$TEST_PASS\"}" >/dev/null || fail "could not set ephemeral user password"
echo "✓ user pk=$PK"

# Resolves a response's next hop: a Location header (3xx) or a JSON body's
# "to" field (component xak-flow-redirect). Echoes the absolute URL, or
# nothing if neither is present (stage awaiting a POST answer).
next_hop() { # $1 = headers file, $2 = body file
  local loc
  loc=$(grep -i '^location:' "$1" 2>/dev/null | head -1 | sed -E 's/^[Ll]ocation: //' | tr -d '\r')
  if [ -z "$loc" ]; then
    loc=$(python3 -c "import json,sys
try:
    print(json.load(open('$2')).get('to','') or '')
except Exception:
    print('')" 2>/dev/null)
  fi
  case "$loc" in /*) echo "$AK_PUBLIC$loc";; *) echo "$loc";; esac
}

# Full first-time flow: identification -> password -> mfa-skip -> login
# stage. Establishes a real authenticated Authentik session in $JAR.
# Returns 0 and leaves $JAR authenticated, or 1 with a diagnostic on stderr.
authentik_login() {
  local auth_url flow_redirect flow_slug qs exec_url body loc

  auth_url=$(curl -sf -c "$JAR" -o /dev/null -w '%{redirect_url}' "$APP/api/auth/oidc/login") \
    || { echo "  app /login did not redirect" >&2; return 1; }
  flow_redirect=$(AKCURL -b "$JAR" -c "$JAR" -o /dev/null -w '%{redirect_url}' "$auth_url")
  case "$flow_redirect" in /*) flow_redirect="$AK_PUBLIC$flow_redirect";; esac
  flow_slug=$(echo "$flow_redirect" | sed -n 's#.*/if/flow/\([^/]*\)/.*#\1#p')
  [ -n "$flow_slug" ] || { echo "  no flow slug in: $flow_redirect" >&2; return 1; }
  # GET the flow page itself once (establishes the initial session cookie).
  AKCURL -b "$JAR" -c "$JAR" -o /dev/null "$flow_redirect"
  qs="${flow_redirect#*\?}"
  exec_url="$AK_PUBLIC/api/v3/flows/executor/$flow_slug/?query=$qs"

  # identification
  AKCURL -b "$JAR" -c "$JAR" -H 'Content-Type: application/json' \
    -d "{\"uid_field\": \"$TEST_USER\"}" "$exec_url" \
    -o "$JAR.b1" -D "$JAR.h1" -w '' || true
  loc=$(next_hop "$JAR.h1" "$JAR.b1")
  [ -n "$loc" ] || { echo "  identification did not advance: $(cat "$JAR.b1")" >&2; return 1; }

  # password
  AKCURL -b "$JAR" -c "$JAR" -H 'Content-Type: application/json' \
    -d "{\"password\": \"$TEST_PASS\"}" "$loc" \
    -o "$JAR.b2" -D "$JAR.h2" -w '' || true
  loc=$(next_hop "$JAR.h2" "$JAR.b2")
  [ -n "$loc" ] || { echo "  password did not advance: $(cat "$JAR.b2")" >&2; return 1; }

  # mfa-validation (not_configured_action=skip -> auto-continues on GET)
  AKCURL -b "$JAR" -c "$JAR" "$loc" -o "$JAR.b3" -D "$JAR.h3" -w '' || true
  loc=$(next_hop "$JAR.h3" "$JAR.b3")
  [ -n "$loc" ] || { echo "  mfa-skip did not advance: $(cat "$JAR.b3")" >&2; return 1; }

  # user-login stage (executes on GET; completes the flow)
  AKCURL -b "$JAR" -c "$JAR" "$loc" -o "$JAR.b4" -D "$JAR.h4" -w '' || true
  rm -f "$JAR.b1" "$JAR.h1" "$JAR.b2" "$JAR.h2" "$JAR.b3" "$JAR.h3" "$JAR.b4" "$JAR.h4"
  return 0
}

# Drives one SSO login using whatever's in $JAR: if already authenticated
# (a prior authentik_login call in this run), this alone completes silently;
# otherwise call authentik_login first. Echoes the app's final redirect
# target (with #fragment).
sso_finish() {
  local auth_url authorize_status loc callback
  auth_url=$(curl -sf -c "$JAR" -b "$JAR" -o /dev/null -w '%{redirect_url}' "$APP/api/auth/oidc/login") \
    || { echo "  app /login did not redirect" >&2; return 1; }
  authorize_status=$(AKCURL -b "$JAR" -c "$JAR" -o /dev/null -D "$JAR.hz" -w '%{http_code}' "$auth_url")
  loc=$(grep -i '^location:' "$JAR.hz" | head -1 | sed -E 's/^[Ll]ocation: //' | tr -d '\r')
  rm -f "$JAR.hz"
  case "$loc" in /*) loc="$AK_PUBLIC$loc";; esac
  case "$loc" in
    *"$APP"*|*/api/auth/oidc/callback*)
      callback="$loc" ;;
    *)
      echo "  authorize did not return an app callback (still needs auth?): $authorize_status $loc" >&2
      return 1 ;;
  esac
  curl -sf -b "$JAR" -c "$JAR" -o /dev/null -w '%{redirect_url}' "$callback"
}

echo "=== 3. First SSO login -> expect auto-provision as pending ==="
authentik_login || fail "first SSO login (identification/password/mfa/login stages) did not complete"
RESULT=$(sso_finish) || fail "post-login authorize/callback did not complete"
echo "  redirect: $RESULT"
echo "$RESULT" | grep -q 'sso_error=pending' || fail "expected sso_error=pending, got: $RESULT"
echo "✓ pending redirect"
ROW=$(ssh "$PROXMOX" "pct exec $DB_CT -- su - postgres -c \"psql -d $DB_NAME -tc \\\"SELECT role, (authentik_sub IS NOT NULL) FROM users WHERE email='$TEST_EMAIL'\\\"\"" 2>&1)
echo "  db row: $ROW"
echo "$ROW" | grep -q 'pending' || fail "provisioned row missing/not pending: $ROW"
echo "$ROW" | grep -qE '\bt\b' || fail "authentik_sub not set: $ROW"
echo "✓ pending user provisioned with authentik_sub"

echo "=== 4. Promote test user, second SSO login -> expect JWT + /me ==="
ssh "$PROXMOX" "pct exec $DB_CT -- su - postgres -c \"psql -d $DB_NAME -c \\\"UPDATE users SET role='salesperson' WHERE email='$TEST_EMAIL'\\\"\"" >/dev/null 2>&1 \
  || fail "could not promote test user role"
# Still logged in at Authentik (same $JAR) -> this should complete silently
# without replaying identification/password, matching a real returning-user
# SSO session.
RESULT=$(sso_finish) || fail "second SSO login did not complete"
echo "$RESULT" | grep -q 'sso_token=' || fail "expected sso_token, got: $RESULT"
JWT=$(echo "$RESULT" | sed -n 's/.*sso_token=\([^&]*\).*/\1/p' | python3 -c "import sys,urllib.parse; print(urllib.parse.unquote(sys.stdin.read().strip()))")
echo "  jwt: ${JWT:0:12}... (truncated)"
ME=$(curl -sf -H "Authorization: Bearer $JWT" "$APP/api/auth/me") || fail "/api/auth/me request failed"
echo "$ME" | grep -q "\"username\":\"$TEST_USER\"" && echo "✓ SSO JWT works against /api/auth/me" || fail "/me mismatch: $ME"

echo "=== 5. Password login regression ==="
PW_RESULT=$(curl -sf -X POST -H 'Content-Type: application/json' \
  -d "{\"username\":\"$PW_USER\",\"password\":\"$PW_PASS\"}" "$APP/api/auth/login") || fail "password login request failed"
PW_TOKEN=$(echo "$PW_RESULT" | python3 -c "import json,sys
try:
    print(json.load(sys.stdin).get('token',''))
except Exception:
    print('')")
case "$PW_TOKEN" in
  eyJ*.*.*) echo "✓ password login still works" ;;
  *) fail "password login regression: no valid JWT in response: $PW_RESULT" ;;
esac

echo "ALL CHECKS PASSED"
