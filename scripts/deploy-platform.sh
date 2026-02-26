#!/bin/bash
# Deploy Trade Show App for the internal platform (booute.duckdns.org at /apps/trade-show).
# Builds frontend with base path, deploys backend + frontend, pushes nginx configs, updates NPM.
#
# Prereqs: SSH to root@192.168.1.190; backend container 2220 and frontend 2120 running.
# You must set PLATFORM_JWT_SECRET in the backend .env on the container (from Core Platform .env).
#
# Usage: ./scripts/deploy-platform.sh [backend|frontend|nginx|npm|all]

set -e
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

PROXMOX_IP="${PROXMOX_IP:-192.168.1.190}"
BACKEND_CT="2220"
FRONTEND_CT="2120"
NPM_LXC_ID="${NPM_LXC_ID:-104}"
BACKEND_PATH="/opt/trade-show-app/backend"
FRONTEND_PATH="/var/www/trade-show-app/current"
APP_BASE_PATH="/apps/trade-show"
BACKEND_PORT="3000"

DEPLOY_BACKEND=false
DEPLOY_FRONTEND=false
DEPLOY_NGINX=false
DEPLOY_NPM=false

case "${1:-all}" in
  backend)   DEPLOY_BACKEND=true ;;
  frontend)   DEPLOY_FRONTEND=true ;;
  nginx)      DEPLOY_NGINX=true ;;
  npm)        DEPLOY_NPM=true ;;
  all)        DEPLOY_BACKEND=true; DEPLOY_FRONTEND=true; DEPLOY_NGINX=true; DEPLOY_NPM=true ;;
  *)          echo "Usage: $0 [backend|frontend|nginx|npm|all]"; exit 1 ;;
esac

echo "=== Trade Show App – Platform deploy ($1) ==="
echo "  Backend CT: $BACKEND_CT  Frontend CT: $FRONTEND_CT  NPM CT: $NPM_LXC_ID"
echo "  Base path: $APP_BASE_PATH  Backend port: $BACKEND_PORT"
echo ""

# Resolve frontend container IP on Proxmox host
get_frontend_ip() {
  ssh root@$PROXMOX_IP "pct exec $FRONTEND_CT -- hostname -I 2>/dev/null | awk '{print \$1}'" || true
}

get_backend_ip() {
  ssh root@$PROXMOX_IP "pct exec $BACKEND_CT -- hostname -I 2>/dev/null | awk '{print \$1}'" || true
}

if [ "$DEPLOY_BACKEND" = true ]; then
  echo "📦 Building and deploying backend..."
  cd backend
  npm run build
  VERSION=$(grep '"version"' package.json | head -1 | sed 's/.*: "\(.*\)".*/\1/')
  PACKAGE_NAME="backend-v${VERSION}-$(date +%Y%m%d_%H%M%S).tar.gz"
  tar -czf "$PACKAGE_NAME" --exclude='*.ts' --exclude='*.js.map' dist/ package.json package-lock.json requirements.txt src/services/ocr/
  scp "$PACKAGE_NAME" root@$PROXMOX_IP:/tmp/backend-deploy.tar.gz
  ssh root@$PROXMOX_IP "
    pct push $BACKEND_CT /tmp/backend-deploy.tar.gz /tmp/backend-deploy.tar.gz
    pct exec $BACKEND_CT -- bash -c 'cd $BACKEND_PATH && tar -xzf /tmp/backend-deploy.tar.gz && systemctl restart trade-show-app-backend && sleep 3 && systemctl is-active trade-show-app-backend'
  "
  echo "✅ Backend deployed (v$VERSION)"
  cd ..
fi

if [ "$DEPLOY_FRONTEND" = true ]; then
  echo "📦 Building frontend for platform (base path $APP_BASE_PATH)..."
  export VITE_APP_BASE_PATH="$APP_BASE_PATH"
  export VITE_API_URL="$APP_BASE_PATH/api"
  npm run build
  VERSION=$(grep '"version"' package.json | head -1 | sed 's/.*: "\(.*\)".*/\1/')
  BUILD_ID=$(date +%Y%m%d_%H%M%S)
  # Archive must expand to .../current/apps/trade-show/ (nginx root is current, location is /apps/trade-show/)
  mkdir -p "dist.deploy${APP_BASE_PATH}"
  cp -r dist/* "dist.deploy${APP_BASE_PATH}/"
  tar -czf /tmp/frontend-platform.tar.gz -C dist.deploy .
  rm -rf dist.deploy
  scp /tmp/frontend-platform.tar.gz root@$PROXMOX_IP:/tmp/frontend-platform.tar.gz
  ssh root@$PROXMOX_IP "
    pct push $FRONTEND_CT /tmp/frontend-platform.tar.gz /tmp/frontend-platform.tar.gz
    pct exec $FRONTEND_CT -- bash -c '
      cd $FRONTEND_PATH && tar -xzf /tmp/frontend-platform.tar.gz
      echo \"Frontend deployed under ${FRONTEND_PATH}${APP_BASE_PATH}\"
    '
  "
  rm -f /tmp/frontend-platform.tar.gz
  echo "✅ Frontend deployed under $FRONTEND_PATH$APP_BASE_PATH"
fi

if [ "$DEPLOY_NGINX" = true ]; then
  echo "📤 Pushing nginx location config to frontend container..."
  NGINX_SNIPPET="$REPO_ROOT/deployment/platform/nginx-frontend-trade-show.conf"
  if [ ! -f "$NGINX_SNIPPET" ]; then
    echo "Missing $NGINX_SNIPPET"
    exit 1
  fi
  scp "$NGINX_SNIPPET" root@$PROXMOX_IP:/tmp/trade-show-app-locations.conf
  ssh root@$PROXMOX_IP "
    pct push $FRONTEND_CT /tmp/trade-show-app-locations.conf /tmp/trade-show-app-locations.conf
    pct exec $FRONTEND_CT -- bash -c '
      cp /tmp/trade-show-app-locations.conf /etc/nginx/snippets/trade-show-app-locations.conf
      TARGET_SITE=/etc/nginx/sites-enabled/default
      if [ ! -f \"\$TARGET_SITE\" ] && [ -f /etc/nginx/sites-enabled/trade-show-app ]; then
        TARGET_SITE=/etc/nginx/sites-enabled/trade-show-app
      fi
      if [ ! -f \"\$TARGET_SITE\" ]; then
        echo \"No nginx site file found (checked default and trade-show-app)\" >&2
        exit 1
      fi
      # Ensure include exists in active server block.
      if ! grep -q trade-show-app-locations.conf \"\$TARGET_SITE\" 2>/dev/null; then
        sed -i \"/^[[:space:]]*server[[:space:]]*{/a\\\\    include /etc/nginx/snippets/trade-show-app-locations.conf;\" \"\$TARGET_SITE\"
      fi
      nginx -t && nginx -s reload
    '
  "
  echo "✅ Nginx config updated and reloaded on frontend container"
fi

if [ "$DEPLOY_NPM" = true ]; then
  echo "📤 Updating NPM proxy host 9 (booute.duckdns.org) with $APP_BASE_PATH locations..."
  BACKEND_IP=$(get_backend_ip)
  FRONTEND_IP=$(get_frontend_ip)
  if [ -z "$BACKEND_IP" ] || [ -z "$FRONTEND_IP" ]; then
    echo "Could not get backend/frontend container IP. Set BACKEND_IP and FRONTEND_IP and run: ssh root@$PROXMOX_IP 'deployment/platform/update-npm-locations.sh <BACKEND_IP> <FRONTEND_IP> $BACKEND_PORT'"
    exit 1
  fi
  # Copy platform scripts to Proxmox and run NPM update from there
  scp "$REPO_ROOT/deployment/platform/update-npm-locations.sh" root@$PROXMOX_IP:/tmp/
  scp "$REPO_ROOT/deployment/platform/update-npm-locations.py" root@$PROXMOX_IP:/tmp/
  ssh root@$PROXMOX_IP "chmod +x /tmp/update-npm-locations.sh && cd /tmp && BACKEND_IP=$BACKEND_IP FRONTEND_IP=$FRONTEND_IP BACKEND_PORT=$BACKEND_PORT ./update-npm-locations.sh"
  echo "✅ NPM locations updated and nginx reloaded"
fi

echo ""
echo "Done. Platform URL: https://booute.duckdns.org$APP_BASE_PATH/"
echo "Backend .env on container $BACKEND_CT should include: PLATFORM_JWT_SECRET=<from platform>, APP_SLUG=trade-show, APP_BASE_PATH=$APP_BASE_PATH"
