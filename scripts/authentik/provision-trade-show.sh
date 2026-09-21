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
ARGO_REDIRECT="https://argo.booute.duckdns.org/api/auth/oidc/callback"
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

echo "=== 3/6 Create or update provider 'Argo' (display name; slug/client id untouched) ==="
# Look up the existing provider via the application's stable slug/FK, not by
# display name: the name is changing (Trade Show App -> Argo) in this run, so
# a name= filter would stop matching on the very next run and create a
# duplicate provider (new client_id/secret) instead of updating in place.
EXISTING_APP=$(AK GET "/core/applications/trade-show/" 2>/dev/null || echo '{}')
EXISTING_PROVIDER_PK=$(echo "$EXISTING_APP" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('provider') or '')" 2>/dev/null || echo '')
PROVIDER_BODY=$(python3 - "$AUTH_FLOW" "$INVAL_FLOW" "$SIGNING_KEY" "$PROP_MAPPINGS" "$PROD_REDIRECT" "$SANDBOX_REDIRECT" "$ARGO_REDIRECT" <<'PY'
import json, sys
auth_flow, inval_flow, signing_key, prop_mappings, prod_uri, sandbox_uri, argo_uri = sys.argv[1:8]
body = {
    "name": "Argo",
    "authorization_flow": auth_flow,
    "client_type": "confidential",
    "sub_mode": "user_uuid",
    "redirect_uris": [
        {"matching_mode": "strict", "url": prod_uri},
        {"matching_mode": "strict", "url": sandbox_uri},
        {"matching_mode": "strict", "url": argo_uri},
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
if [ -n "$EXISTING_PROVIDER_PK" ]; then
  # Try the full update (name + redirect_uris) first. Authentik enforces a
  # unique name on OAuth2Provider, and this instance already has an
  # unrelated provider named "Argo" (pk 10, no application attached, seen
  # 2026-08-26 — same argo.booute.duckdns.org callback, but not ours; do NOT
  # touch it here, that decision belongs to a human, not this script). If the
  # rename collides with it, fall back to updating redirect_uris only so the
  # Task-6-blocking part still lands, and warn loudly instead of dying silent.
  set +e
  RAW=$(ssh "$PROXMOX" "pct exec $AK_CT -- curl -s -w '\\nHTTP_STATUS:%{http_code}' -X PATCH '$AK_API/providers/oauth2/$EXISTING_PROVIDER_PK/' -H 'Authorization: Bearer $TOKEN' -H 'Content-Type: application/json' -d '$PROVIDER_BODY'")
  set -e
  HTTP_STATUS=$(echo "$RAW" | tail -1 | sed 's/^HTTP_STATUS://')
  RESP_BODY=$(echo "$RAW" | sed '$d')
  if [ "$HTTP_STATUS" = "200" ]; then
    PROVIDER="$RESP_BODY"
  elif echo "$RESP_BODY" | grep -q "provider with this name already exists"; then
    echo "WARNING: could not rename provider to 'Argo' - name is already taken by a" >&2
    echo "WARNING: different, unrelated OAuth2 provider in this Authentik instance." >&2
    echo "WARNING: NOT touching that provider automatically; needs a human decision" >&2
    echo "WARNING: (rename/delete the other one, or pick a different name here)." >&2
    echo "WARNING: Falling back to redirect_uris-only update; provider display" >&2
    echo "WARNING: name stays 'Trade Show App' for now (the application's display" >&2
    echo "WARNING: name below still becomes 'Argo' - that's what users see)." >&2
    NO_NAME_BODY=$(echo "$PROVIDER_BODY" | python3 -c "import json,sys; b=json.load(sys.stdin); b.pop('name', None); print(json.dumps(b))")
    PROVIDER=$(AK PATCH "/providers/oauth2/$EXISTING_PROVIDER_PK/" "$NO_NAME_BODY")
  else
    echo "ERROR: provider update failed (HTTP $HTTP_STATUS): $RESP_BODY" >&2
    exit 1
  fi
else
  # Fresh install fallback only (no application yet to read a provider FK from).
  EXISTING=$(AK GET "/providers/oauth2/?name=Argo")
  COUNT=$(echo "$EXISTING" | python3 -c "import json,sys; print(json.load(sys.stdin)['pagination']['count'])")
  if [ "$COUNT" = "0" ]; then
    PROVIDER=$(AK POST "/providers/oauth2/" "$PROVIDER_BODY")
  else
    PK=$(echo "$EXISTING" | python3 -c "import json,sys; print(json.load(sys.stdin)['results'][0]['pk'])")
    PROVIDER=$(AK PATCH "/providers/oauth2/$PK/" "$PROVIDER_BODY")
  fi
fi
PROVIDER_PK=$(echo "$PROVIDER" | python3 -c "import json,sys; print(json.load(sys.stdin)['pk'])")
CLIENT_ID=$(echo "$PROVIDER" | python3 -c "import json,sys; print(json.load(sys.stdin)['client_id'])")
CLIENT_SECRET=$(echo "$PROVIDER" | python3 -c "import json,sys; print(json.load(sys.stdin)['client_secret'])")
echo "OK provider pk=$PROVIDER_PK client_id=$CLIENT_ID"

echo "=== 4/6 Create or update application 'trade-show' (display name Argo; slug untouched) ==="
# The application icon (favicon.svg) is set separately by set-app-icon.py; APP_BODY
# deliberately omits meta_icon so this PATCH never clears it.
APP_BODY="{\"name\": \"Argo\", \"slug\": \"trade-show\", \"provider\": $PROVIDER_PK, \"meta_launch_url\": \"https://argo.booute.duckdns.org\"}"
if AK GET "/core/applications/trade-show/" >/dev/null 2>&1; then
  AK PATCH "/core/applications/trade-show/" "$APP_BODY" >/dev/null
else
  AK POST "/core/applications/" "$APP_BODY" >/dev/null
fi
echo "OK application slug=trade-show, name=Argo (issuer $ISSUER)"

echo "=== 5/6 Write env to containers (sandbox 2600 + prod 2220) ==="
# The service is started by systemd with EnvironmentFile=/etc/expenseapp/backend.env
# (confirmed on both 2600 and 2220 via `systemctl cat trade-show-app-backend`).
# /opt/trade-show-app/backend/.env sits in the backend's WorkingDirectory and
# looks plausible but is NOT loaded by the running service — writing SSO vars
# there only is a silent no-op. Prefer the authoritative file; fall back to
# the WorkingDirectory .env only if the authoritative one doesn't exist (e.g.
# a container that isn't set up with the /etc/expenseapp layout at all).
write_env() { # ct redirect_uri
  local ct=$1 redirect=$2
  ssh "$PROXMOX" "pct exec $ct -- bash -lc '
    AUTHORITATIVE=/etc/expenseapp/backend.env
    FALLBACK=/opt/trade-show-app/backend/.env
    if [ -f \"\$AUTHORITATIVE\" ]; then ENV=\"\$AUTHORITATIVE\"; else ENV=\"\$FALLBACK\"; fi
    touch \$ENV
    sed -i \"/^AUTHENTIK_ISSUER=/d;/^AUTHENTIK_CLIENT_ID=/d;/^AUTHENTIK_CLIENT_SECRET=/d;/^OIDC_REDIRECT_URI=/d\" \$ENV
    cat >> \$ENV <<EOF
AUTHENTIK_ISSUER=$ISSUER
AUTHENTIK_CLIENT_ID=$CLIENT_ID
AUTHENTIK_CLIENT_SECRET=$CLIENT_SECRET
OIDC_REDIRECT_URI=$redirect
EOF
    echo \"wrote to \$ENV\"
  '"
}
write_env 2600 "$SANDBOX_REDIRECT"
write_env 2220 "$PROD_REDIRECT"

echo "--- Ensuring FRONTEND_URL on sandbox (CT 2600) authoritative file only ---"
ssh "$PROXMOX" "pct exec 2600 -- bash -lc '
  AUTHORITATIVE=/etc/expenseapp/backend.env
  FALLBACK=/opt/trade-show-app/backend/.env
  if [ -f \"\$AUTHORITATIVE\" ]; then ENV=\"\$AUTHORITATIVE\"; else ENV=\"\$FALLBACK\"; fi
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
