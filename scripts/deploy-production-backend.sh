#!/bin/bash
# Deploy backend to production (Proxmox CT 201)
# Usage: ./scripts/deploy-production-backend.sh
# Requires: SSH access to root@192.168.1.190 and production LXC 201 created and running.
# Containers on 192.168.1.190: backend 2220, frontend 2120, db-prod 2320.

set -e
PROXMOX_IP="192.168.1.190"
PRODUCTION_BACKEND_CT="2220"
BACKEND_PATH="/opt/trade-show-app/backend"

echo "=== Production Backend Deployment (CT $PRODUCTION_BACKEND_CT) ==="
cd "$(dirname "$0")/.."
cd backend

echo "📦 Building backend..."
npm run build
VERSION=$(grep '"version"' package.json | head -1 | sed 's/.*: "\(.*\)".*/\1/')
echo "Version: $VERSION"

PACKAGE_NAME="backend-v${VERSION}-$(date +%Y%m%d_%H%M%S).tar.gz"
tar -czf "$PACKAGE_NAME" \
  --exclude='*.ts' \
  --exclude='*.js.map' \
  dist/ \
  package.json \
  package-lock.json \
  requirements.txt \
  src/services/ocr/
echo "✓ Packaged: $PACKAGE_NAME"

echo "📤 Uploading to Proxmox..."
scp "$PACKAGE_NAME" root@$PROXMOX_IP:/tmp/backend-deploy.tar.gz

echo "🚀 Deploying to production container $PRODUCTION_BACKEND_CT..."
ssh root@$PROXMOX_IP "
  pct push $PRODUCTION_BACKEND_CT /tmp/backend-deploy.tar.gz /tmp/backend-deploy.tar.gz
  pct exec $PRODUCTION_BACKEND_CT -- bash -c '
    cd $BACKEND_PATH || exit 1
    tar -xzf /tmp/backend-deploy.tar.gz
    systemctl restart trade-show-app-backend
    sleep 3
    systemctl is-active trade-show-app-backend
  '
"

echo "🔍 Verifying..."
DEPLOYED_VERSION=$(ssh root@$PROXMOX_IP "pct exec $PRODUCTION_BACKEND_CT -- curl -s http://localhost:3000/api/health 2>/dev/null | grep -o '\"version\":\"[^\"]*\"' | cut -d'\"' -f4" || true)
if [ "$DEPLOYED_VERSION" = "$VERSION" ]; then
  echo "✅ Backend deployed. Version: $DEPLOYED_VERSION"
else
  echo "⚠️  Health check version: ${DEPLOYED_VERSION:-none} (expected $VERSION)"
fi
cd ..
echo "Done."
