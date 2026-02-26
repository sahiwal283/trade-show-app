#!/bin/bash
# Append Trade Show app locations to Nginx Proxy Manager (proxy host 9, booute.duckdns.org).
# Run from Proxmox host:
#   BACKEND_IP=192.168.1.129 FRONTEND_IP=192.168.1.XXX ./update-npm-locations.sh
# Or: ./update-npm-locations.sh 192.168.1.129 192.168.1.XXX [3000]
#
# NPM runs in LXC 104; database at /opt/npmplus/npmplus/database.sqlite inside 104.

set -e
NPM_LXC_ID="${NPM_LXC_ID:-104}"
NPM_DB="${NPM_DB:-/data/npmplus/database.sqlite}"
PROXY_HOST_ID="${NPM_PROXY_HOST_ID:-9}"
APP_BASE_PATH="${APP_BASE_PATH:-/apps/trade-show}"

if [ -n "$1" ] && [ -n "$2" ]; then
  export BACKEND_IP="$1"
  export FRONTEND_IP="$2"
  export BACKEND_PORT="${3:-3000}"
fi

if [ -z "$BACKEND_IP" ] || [ -z "$FRONTEND_IP" ]; then
  echo "Usage: $0 <BACKEND_IP> <FRONTEND_IP> [BACKEND_PORT=3000]"
  echo "   Or: BACKEND_IP=... FRONTEND_IP=... [BACKEND_PORT=3000] $0"
  echo "Example: $0 192.168.1.129 192.168.1.130 3000"
  exit 1
fi

BACKEND_PORT="${BACKEND_PORT:-3000}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PY_SCRIPT="$SCRIPT_DIR/update-npm-locations.py"
# When run from Proxmox /tmp (by deploy-platform.sh), script may be in /tmp
if [ ! -f "$PY_SCRIPT" ]; then
  PY_SCRIPT="/tmp/update-npm-locations.py"
fi
if [ ! -f "$PY_SCRIPT" ]; then
  echo "Missing update-npm-locations.py (looked in $SCRIPT_DIR and /tmp)"
  exit 1
fi

# Push Python script into container and run with env
pct push "$NPM_LXC_ID" "$PY_SCRIPT" /tmp/update-npm-locations.py
pct exec "$NPM_LXC_ID" -- docker cp /tmp/update-npm-locations.py npmplus:/tmp/update-npm-locations.py
pct exec "$NPM_LXC_ID" -- docker exec npmplus env \
  NPM_DB="$NPM_DB" \
  NPM_PROXY_HOST_ID="$PROXY_HOST_ID" \
  APP_BASE_PATH="$APP_BASE_PATH" \
  BACKEND_IP="$BACKEND_IP" \
  FRONTEND_IP="$FRONTEND_IP" \
  BACKEND_PORT="$BACKEND_PORT" \
  python3 /tmp/update-npm-locations.py

# Reload nginx inside the npmplus Docker container (inside 104)
if pct exec "$NPM_LXC_ID" -- docker exec npmplus /usr/local/nginx/sbin/nginx -t 2>/dev/null; then
  pct exec "$NPM_LXC_ID" -- docker exec npmplus /usr/local/nginx/sbin/nginx -s reload
  echo "NPM nginx reloaded. Locations for ${APP_BASE_PATH} and ${APP_BASE_PATH}/api added."
else
  echo "NPM nginx config test failed; not reloading. Regenerate config from NPM UI if needed."
fi
