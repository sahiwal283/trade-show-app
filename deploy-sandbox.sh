#!/bin/bash
# Sandbox Deployment Script - Trade Show App
# Usage: ./deploy-sandbox.sh

set -e  # Exit on error

echo "=== Trade Show App Sandbox Deployment ==="
echo ""

# Container paths
SANDBOX_BACKEND_PATH="/opt/trade-show-app/backend"
SANDBOX_FRONTEND_PATH="/var/www/trade-show-app"
PROXMOX_IP="192.168.1.190"
SANDBOX_CONTAINER="203"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}⚠️  DEPLOYMENT PATHS:${NC}"
echo -e "   Backend path: ${GREEN}$SANDBOX_BACKEND_PATH${NC}"
echo -e "   Frontend path: $SANDBOX_FRONTEND_PATH"
echo ""

# Allow any branch for development (remove strict branch check)
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
echo -e "Current branch: ${GREEN}$CURRENT_BRANCH${NC}"

# Check what to deploy
DEPLOY_BACKEND=false
DEPLOY_FRONTEND=false

if [ "$1" == "backend" ] || [ "$1" == "both" ] || [ -z "$1" ]; then
    DEPLOY_BACKEND=true
fi

if [ "$1" == "frontend" ] || [ "$1" == "both" ]; then
    DEPLOY_FRONTEND=true
fi

# Deploy Backend
if [ "$DEPLOY_BACKEND" = true ]; then
    echo "📦 Building backend..."
    cd backend
    npm run build
    
    # Get version from package.json
    VERSION=$(grep '"version"' package.json | head -1 | sed 's/.*: "\(.*\)".*/\1/')
    echo "Version: $VERSION"
    
    # Package (include Python scripts from src/ - needed for PaddleOCR)
    PACKAGE_NAME="backend-v${VERSION}-$(date +%Y%m%d_%H%M%S).tar.gz"
    echo "Packaging: dist/, package files, and Python OCR scripts..."
    tar -czf "$PACKAGE_NAME" \
        --exclude='*.ts' \
        --exclude='*.js.map' \
        dist/ \
        package.json \
        package-lock.json \
        requirements.txt \
        src/services/ocr/
    echo "✓ Packaged: $PACKAGE_NAME"
    
    # Upload
    echo "📤 Uploading to Proxmox..."
    scp "$PACKAGE_NAME" root@$PROXMOX_IP:/tmp/backend-deploy.tar.gz
    
    # Deploy
    echo "🚀 Deploying to Container $SANDBOX_CONTAINER..."
    echo -e "${YELLOW}   Deploying to: $SANDBOX_BACKEND_PATH${NC}"
    ssh root@$PROXMOX_IP "
        pct push $SANDBOX_CONTAINER /tmp/backend-deploy.tar.gz /tmp/backend-deploy.tar.gz
        pct exec $SANDBOX_CONTAINER -- bash -c '
            cd $SANDBOX_BACKEND_PATH || exit 1
            echo \"Current directory: \$(pwd)\"
            tar -xzf /tmp/backend-deploy.tar.gz
            systemctl restart trade-show-app-backend
            sleep 3
            systemctl is-active trade-show-app-backend
        '
    "
    
    # Verify deployment
    echo ""
    echo "🔍 Verifying deployment..."
    DEPLOYED_VERSION=$(ssh root@$PROXMOX_IP "pct exec $SANDBOX_CONTAINER -- curl -s http://localhost:3000/api/health | grep -o '\"version\":\"[^\"]*\"' | cut -d'\"' -f4")
    
    if [ "$DEPLOYED_VERSION" == "$VERSION" ]; then
        echo -e "${GREEN}✅ Backend deployed successfully!${NC}"
        echo "   Version: $DEPLOYED_VERSION"
    else
        echo -e "${RED}⚠️  Version mismatch!${NC}"
        echo "   Expected: $VERSION"
        echo "   Deployed: $DEPLOYED_VERSION"
    fi
    
    cd ..
fi

# Deploy Frontend
if [ "$DEPLOY_FRONTEND" = true ]; then
    echo ""
    echo "📦 Building frontend for SANDBOX..."
    
    # CRITICAL: Remove .env.production to prevent using production API URLs
    if [ -f ".env.production" ]; then
        echo -e "${YELLOW}⚠️  Temporarily renaming .env.production${NC}"
        mv .env.production .env.production.temp
        RESTORE_ENV=true
    else
        RESTORE_ENV=false
    fi
    
    # Build with development mode (uses relative /api URLs, not production URLs)
    npm run build:sandbox
    
    # Restore .env.production if it existed
    if [ "$RESTORE_ENV" = true ]; then
        mv .env.production.temp .env.production
        echo "✓ Restored .env.production"
    fi
    
    # Get version and add build ID
    VERSION=$(grep '"version"' package.json | head -1 | sed 's/.*: "\(.*\)".*/\1/')
    BUILD_ID=$(date +%Y%m%d_%H%M%S)
    echo "<!-- Build: ${BUILD_ID} -->" >> dist/index.html
    echo "Version: $VERSION (Build: $BUILD_ID)"
    
    # Package
    PACKAGE_NAME="frontend-v${VERSION}-${BUILD_ID}.tar.gz"
    tar -czf "$PACKAGE_NAME" -C dist .
    echo "✓ Packaged: $PACKAGE_NAME"
    
    # Upload
    echo "📤 Uploading to Proxmox..."
    scp "$PACKAGE_NAME" root@$PROXMOX_IP:/tmp/frontend-deploy.tar.gz
    
    # Deploy
    echo "🚀 Deploying to Container $SANDBOX_CONTAINER..."
    echo -e "${YELLOW}   Deploying to: $SANDBOX_FRONTEND_PATH${NC}"
    ssh root@$PROXMOX_IP "
        pct push $SANDBOX_CONTAINER /tmp/frontend-deploy.tar.gz /tmp/frontend-deploy.tar.gz
        pct exec $SANDBOX_CONTAINER -- bash -c '
            cd $SANDBOX_FRONTEND_PATH || exit 1
            rm -rf *
            tar -xzf /tmp/frontend-deploy.tar.gz
            systemctl restart nginx
            echo \"✓ Frontend deployed\"
        '
    "
    
    # CRITICAL: Restart NPMplus proxy to clear cache
    echo ""
    echo -e "${YELLOW}⚠️  CRITICAL: Restarting NPMplus proxy to clear cache...${NC}"
    ssh root@$PROXMOX_IP "pct stop 104 && sleep 3 && pct start 104 && sleep 2"
    echo -e "${GREEN}✓ NPMplus proxy restarted${NC}"
    
    # Verify deployment
    echo ""
    echo "🔍 Verifying frontend deployment..."
    ssh root@$PROXMOX_IP "pct exec $SANDBOX_CONTAINER -- bash -c '
        echo \"Service Worker Version:\"
        head -3 $SANDBOX_FRONTEND_PATH/service-worker.js | grep Version
        echo \"Build ID:\"
        grep \"Build:\" $SANDBOX_FRONTEND_PATH/index.html
    '"
    
    echo -e "${GREEN}✅ Frontend deployed successfully!${NC}"
fi

echo ""
echo -e "${GREEN}✅ Deployment complete!${NC}"
echo ""
echo "Test endpoints:"
echo "  curl http://192.168.1.144/api/health"
echo "  curl http://192.168.1.144/api/ocr/v2/process -X POST"

