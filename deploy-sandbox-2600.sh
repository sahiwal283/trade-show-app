#!/bin/bash
# Deploy Trade Show App to combined sandbox container 2600 (192.168.1.144)
# Usage: ./deploy-sandbox-2600.sh [backend|frontend|both]
set -e

PROXMOX_IP="192.168.1.190"
SANDBOX_CONTAINER="2600"
SANDBOX_BACKEND_PATH="/opt/trade-show-app/backend"
SANDBOX_FRONTEND_PATH="/var/www/trade-show-app/current"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "=== Trade Show App Sandbox Deploy (CT 2600) ==="
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
echo -e "Branch: ${GREEN}$CURRENT_BRANCH${NC}"

DEPLOY_BACKEND=false
DEPLOY_FRONTEND=false
if [ "$1" == "backend" ] || [ "$1" == "both" ] || [ -z "$1" ]; then DEPLOY_BACKEND=true; fi
if [ "$1" == "frontend" ] || [ "$1" == "both" ]; then DEPLOY_FRONTEND=true; fi
# Default both when no arg
if [ -z "$1" ]; then DEPLOY_FRONTEND=true; fi

if [ "$DEPLOY_BACKEND" = true ]; then
  echo "📦 Building backend..."
  cd backend
  npm run build
  VERSION=$(node -p "require('./package.json').version")
  PACKAGE_NAME="backend-v${VERSION}-$(date +%Y%m%d_%H%M%S).tar.gz"
  tar -czf "$PACKAGE_NAME" \
    --exclude='*.ts' \
    --exclude='*.js.map' \
    dist/ \
    package.json \
    package-lock.json \
    requirements.txt \
    src/services/ocr/ \
    src/database/migrations/
  echo "✓ Packaged: $PACKAGE_NAME"

  echo "📤 Uploading backend to Proxmox..."
  scp "$PACKAGE_NAME" root@$PROXMOX_IP:/tmp/backend-deploy-2600.tar.gz
  ssh root@$PROXMOX_IP "
    pct push $SANDBOX_CONTAINER /tmp/backend-deploy-2600.tar.gz /tmp/backend-deploy-2600.tar.gz
    pct exec $SANDBOX_CONTAINER -- bash -c '
      cd $SANDBOX_BACKEND_PATH || exit 1
      tar -xzf /tmp/backend-deploy-2600.tar.gz
      # Install deps for packages added since last sandbox deploy (e.g. web-push, exceljs)
      npm install --omit=dev --no-audit --no-fund
      # Backend auto-runs pending migrations on startup (schema_migrations).
      # Ensure migration SQL is on disk for the runner (copied into package).
      systemctl restart trade-show-app-backend
      sleep 5
      systemctl is-active trade-show-app-backend
      curl -s http://localhost:3000/api/health
      echo
    '
  "
  cd ..
fi

if [ "$DEPLOY_FRONTEND" = true ]; then
  echo "📦 Building frontend for SANDBOX..."
  if [ -f ".env.production" ]; then
    mv .env.production .env.production.temp
    RESTORE_ENV=true
  else
    RESTORE_ENV=false
  fi
  npm run build:sandbox
  if [ "$RESTORE_ENV" = true ]; then
    mv .env.production.temp .env.production
  fi
  VERSION=$(node -p "require('./package.json').version")
  BUILD_ID=$(date +%Y%m%d_%H%M%S)
  echo "<!-- Build: ${BUILD_ID} -->" >> dist/index.html
  PACKAGE_NAME="frontend-v${VERSION}-${BUILD_ID}.tar.gz"
  tar -czf "$PACKAGE_NAME" -C dist .
  scp "$PACKAGE_NAME" root@$PROXMOX_IP:/tmp/frontend-deploy-2600.tar.gz
  ssh root@$PROXMOX_IP "
    pct push $SANDBOX_CONTAINER /tmp/frontend-deploy-2600.tar.gz /tmp/frontend-deploy-2600.tar.gz
    pct exec $SANDBOX_CONTAINER -- bash -c '
      cd $SANDBOX_FRONTEND_PATH || exit 1
      rm -rf *
      tar -xzf /tmp/frontend-deploy-2600.tar.gz
      systemctl restart nginx
      echo Frontend deployed
    '
  "
  echo -e "${YELLOW}Restarting NPMplus proxy (104) to clear cache...${NC}"
  ssh root@$PROXMOX_IP "pct stop 104 && sleep 3 && pct start 104 && sleep 2" || true
fi

echo -e "${GREEN}✅ Sandbox 2600 deployment complete${NC}"
echo "Test: http://192.168.1.144/"
echo "Health: curl http://192.168.1.144/api/health"
