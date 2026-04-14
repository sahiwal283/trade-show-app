#!/bin/bash
# Deploy frontend to PRODUCTION (Proxmox CT 202)
# Usage: ./scripts/deploy-production-frontend.sh
# Requires: SSH access to root@192.168.1.190

set -e
PROXMOX_IP="192.168.1.190"
PRODUCTION_FRONTEND_CT="2120"  # trade-show-frontend
NPMPLUS_CT="104"
FRONTEND_PATH="/var/www/trade-show-app/current"  # Must match Nginx root

echo "=== Production Frontend Deployment (CT $PRODUCTION_FRONTEND_CT) ==="
cd "$(dirname "$0")/.."

echo "📦 Building frontend for PRODUCTION..."
npm run build:production || { echo "❌ Build failed"; exit 1; }

VERSION=$(grep '"version"' package.json | head -1 | sed 's/.*: "\(.*\)".*/\1/')
BUILD_ID=$(date +%Y%m%d_%H%M%S)
echo "<!-- Build: ${BUILD_ID} -->" >> dist/index.html

PACKAGE_NAME="frontend-v${VERSION}-${BUILD_ID}.tar.gz"
tar -czf "$PACKAGE_NAME" -C dist .
echo "✓ Packaged: $PACKAGE_NAME"

echo "📤 Uploading to Proxmox..."
scp "$PACKAGE_NAME" root@$PROXMOX_IP:/tmp/production-frontend.tar.gz

echo "🚀 Deploying to production container $PRODUCTION_FRONTEND_CT..."
ssh root@$PROXMOX_IP "
  pct push $PRODUCTION_FRONTEND_CT /tmp/production-frontend.tar.gz /tmp/production-frontend.tar.gz &&
  pct exec $PRODUCTION_FRONTEND_CT -- bash -c 'mkdir -p $FRONTEND_PATH && cd $FRONTEND_PATH && rm -rf * .[!.]* 2>/dev/null; tar -xzf /tmp/production-frontend.tar.gz && systemctl restart nginx'
" || { echo "❌ Deploy failed"; exit 1; }

echo "🔄 Restarting NPMplus proxy..."
ssh root@$PROXMOX_IP "pct stop $NPMPLUS_CT && sleep 3 && pct start $NPMPLUS_CT && sleep 2"

echo "✅ Production frontend v${VERSION} deployed!"
echo "   URL: https://expapp.duckdns.org"
