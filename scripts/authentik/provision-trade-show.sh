#!/bin/bash
# Provision the "trade-show" OAuth2 provider + application in Authentik (LXC 111)
# and write the resulting credentials into the sandbox (CT 2600) and prod
# (CT 2220) backend .env files. Idempotent: safe to re-run (finds existing
# objects by name/slug instead of duplicating them).
#
# Usage: ./scripts/authentik/provision-trade-show.sh
# Requires: ssh root@192.168.1.190 (BatchMode key auth)
#
# Notes on this environment (Authentik 2026.2.2, source install):
# - manage.py must be run with the venv interpreter (.venv/bin/python), not
#   the system python3.
# - redirect_uris on the oauth2 provider is a list of {matching_mode, url}
#   objects (confirmed against the "payroll" provider), not a newline string.
# - Prod (CT 2220) is NOT restarted here on purpose: the running v2.15.1
#   backend ignores the new AUTHENTIK_*/OIDC_* vars, so the restart is
#   deferred to the v2.16.0 deploy (Task 11). Only sandbox (CT 2600) restarts.
# - FRONTEND_URL is ensured on CT 2600 (missing there; needed for SSO
#   redirects). CT 2220 already has FRONTEND_URL set and is left untouched.

set -euo pipefail
PROXMOX="root@192.168.1.190"
AK_CT=111
AK_API="http://192.168.1.164:9000/api/v3"
PROD_REDIRECT="https://expapp.duckdns.org/api/auth/oidc/callback"
SANDBOX_REDIRECT="http://192.168.1.144/api/auth/oidc/callback"
ISSUER="https://auth.booute.duckdns.org/application/o/trade-show/"

echo "=== 1/6 Bootstrap API token (via manage.py shell as akadmin) ==="
TOKEN=$(ssh "$PROXMOX" "pct exec $AK_CT -- bash -lc 'cd /opt/authentik && .venv/bin/python manage.py shell -c \"
from authentik.core.models import User, Token, TokenIntents
u = User.objects.get(username=\\\"akadmin\\\")
t, created = Token.objects.get_or_create(identifier=\\\"trade-show-provisioning\\\", user=u, defaults={\\\"intent\\\": TokenIntents.INTENT_API, \\\"expiring\\\": False, \\\"description\\\": \\\"trade-show SSO provisioning\\\"})
print(t.key)
\"'" | tail -1)
[ -n "$TOKEN" ] || { echo "ERROR: could not bootstrap API token"; exit 1; }
echo "OK token acquired (trade-show-provisioning, reused by link script + E2E)"

AK() { # method path [json-body]
  local method=$1 path=$2 body=${3:-}
  ssh "$PROXMOX" "pct exec $AK_CT -- curl -sf -X $method '$AK_API$path' \
    -H 'Authorization: Bearer $TOKEN' -H 'Content-Type: application/json' \
    ${body:+-d '$body'}"
}

echo "=== 2/6 Read template provider (payroll) for flows/signing key/scope mappings ==="
TEMPLATE=$(AK GET "/providers/oauth2/?search=payroll")
AUTH_FLOW=$(echo "$TEMPLATE" | python3 -c "import json,sys; r=json.load(sys.stdin)['results'][0]; print(r['authorization_flow'])")
INVAL_FLOW=$(echo "$TEMPLATE" | python3 -c "import json,sys; r=json.load(sys.stdin)['results'][0]; print(r.get('invalidation_flow') or '')")
SIGNING_KEY=$(echo "$TEMPLATE" | python3 -c "import json,sys; r=json.load(sys.stdin)['results'][0]; print(r.get('signing_key') or '')")
PROP_MAPPINGS=$(echo "$TEMPLATE" | python3 -c "import json,sys; r=json.load(sys.stdin)['results'][0]; print(json.dumps(r.get('property_mappings', [])))")
echo "OK template read (authorization_flow=$AUTH_FLOW)"

echo "=== 3/6 Create or update provider 'Trade Show App' ==="
EXISTING=$(AK GET "/providers/oauth2/?name=Trade%20Show%20App")
PROVIDER_BODY=$(python3 - "$AUTH_FLOW" "$INVAL_FLOW" "$SIGNING_KEY" "$PROP_MAPPINGS" "$PROD_REDIRECT" "$SANDBOX_REDIRECT" <<'PY'
import json, sys
auth_flow, inval_flow, signing_key, prop_mappings, prod_uri, sandbox_uri = sys.argv[1:7]
body = {
    "name": "Trade Show App",
    "authorization_flow": auth_flow,
    "client_type": "confidential",
    "sub_mode": "user_uuid",
    "redirect_uris": [
        {"matching_mode": "strict", "url": prod_uri},
        {"matching_mode": "strict", "url": sandbox_uri},
    ],
    "property_mappings": json.loads(prop_mappings),
}
if inval_flow:
    body["invalidation_flow"] = inval_flow
if signing_key:
    body["signing_key"] = signing_key
print(json.dumps(body))
PY
)
COUNT=$(echo "$EXISTING" | python3 -c "import json,sys; print(json.load(sys.stdin)['pagination']['count'])")
if [ "$COUNT" = "0" ]; then
  PROVIDER=$(AK POST "/providers/oauth2/" "$PROVIDER_BODY")
else
  PK=$(echo "$EXISTING" | python3 -c "import json,sys; print(json.load(sys.stdin)['results'][0]['pk'])")
  PROVIDER=$(AK PATCH "/providers/oauth2/$PK/" "$PROVIDER_BODY")
fi
PROVIDER_PK=$(echo "$PROVIDER" | python3 -c "import json,sys; print(json.load(sys.stdin)['pk'])")
CLIENT_ID=$(echo "$PROVIDER" | python3 -c "import json,sys; print(json.load(sys.stdin)['client_id'])")
CLIENT_SECRET=$(echo "$PROVIDER" | python3 -c "import json,sys; print(json.load(sys.stdin)['client_secret'])")
echo "OK provider pk=$PROVIDER_PK client_id=$CLIENT_ID"

echo "=== 4/6 Create or update application 'trade-show' ==="
APP_BODY="{\"name\": \"Trade Show App\", \"slug\": \"trade-show\", \"provider\": $PROVIDER_PK, \"meta_launch_url\": \"https://expapp.duckdns.org\"}"
if AK GET "/core/applications/trade-show/" >/dev/null 2>&1; then
  AK PATCH "/core/applications/trade-show/" "$APP_BODY" >/dev/null
else
  AK POST "/core/applications/" "$APP_BODY" >/dev/null
fi
echo "OK application slug=trade-show (issuer $ISSUER)"

echo "=== 5/6 Write env to containers (sandbox 2600 + prod 2220) ==="
write_env() { # ct redirect_uri
  local ct=$1 redirect=$2
  ssh "$PROXMOX" "pct exec $ct -- bash -lc '
    ENV=/opt/trade-show-app/backend/.env
    touch \$ENV
    sed -i \"/^AUTHENTIK_ISSUER=/d;/^AUTHENTIK_CLIENT_ID=/d;/^AUTHENTIK_CLIENT_SECRET=/d;/^OIDC_REDIRECT_URI=/d\" \$ENV
    cat >> \$ENV <<EOF
AUTHENTIK_ISSUER=$ISSUER
AUTHENTIK_CLIENT_ID=$CLIENT_ID
AUTHENTIK_CLIENT_SECRET=$CLIENT_SECRET
OIDC_REDIRECT_URI=$redirect
EOF
  '"
}
write_env 2600 "$SANDBOX_REDIRECT"
write_env 2220 "$PROD_REDIRECT"

echo "--- Ensuring FRONTEND_URL on sandbox (CT 2600) only ---"
ssh "$PROXMOX" "pct exec 2600 -- bash -lc '
  ENV=/opt/trade-show-app/backend/.env
  grep -q \"^FRONTEND_URL=\" \$ENV || echo \"FRONTEND_URL=http://192.168.1.144\" >> \$ENV
'"

echo "=== 6/6 Restart sandbox backend only (CT 2600) ==="
echo "NOTE: prod (CT 2220) backend is intentionally NOT restarted here — the running"
echo "      v2.15.1 code ignores these vars; restart happens at the v2.16.0 deploy (Task 11)."
if ssh "$PROXMOX" "pct exec 2600 -- systemctl restart trade-show-app-backend" 2>/dev/null; then
  ssh "$PROXMOX" "pct exec 2600 -- systemctl is-active trade-show-app-backend"
else
  echo "NOTE: restart trade-show backend on CT 2600 manually (service name differs)"
fi

echo "=== Done. client_id=$CLIENT_ID (secret written only to containers) ==="
