#!/bin/bash
# DEPLOYMENT SCRIPT FOR EXPENSEAPP v1.0.1
# This script deploys the critical fixes to production
# Date: October 14, 2025
#
# DO NOT RUN THIS SCRIPT WITHOUT APPROVAL
#

set -e  # Exit on any error

echo "=========================================="
echo "ExpenseApp Production Deployment"
echo "Version: 1.0.1 (Critical Fixes)"
echo "Date: $(date)"
echo "=========================================="
echo ""

# Step 1: Confirm we're on the right commit
CURRENT_COMMIT=$(git rev-parse --short HEAD)
EXPECTED_COMMIT="c2b65e0"

if [ "$CURRENT_COMMIT" != "$EXPECTED_COMMIT" ]; then
    echo "⚠️  WARNING: Current commit ($CURRENT_COMMIT) doesn't match expected ($EXPECTED_COMMIT)"
    read -p "Continue anyway? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        echo "Deployment cancelled."
        exit 1
    fi
fi

echo "✓ Current commit: $CURRENT_COMMIT"
echo ""

# Step 2: Show what will be deployed
echo "Changes to be deployed:"
echo "----------------------"
git diff c45b160..HEAD --stat
echo ""
read -p "Push these changes to GitHub? (yes/no): " push_confirm
if [ "$push_confirm" != "yes" ]; then
    echo "Deployment cancelled."
    exit 1
fi

# Step 3: Push to GitHub
echo ""
echo "Pushing to GitHub..."
git push origin main
echo "✓ Pushed to GitHub"
echo ""

# Step 4: Backup current production state
echo "Creating backup tag..."
git tag -f "backup-before-v1.0.1-$(date +%Y%m%d-%H%M%S)" c45b160
git push origin --tags
echo "✓ Backup tag created"
echo ""

# Step 5: Confirm production deployment
echo "=========================================="
echo "READY TO DEPLOY TO PRODUCTION"
echo "=========================================="
echo ""
echo "The following commands will be executed on production:"
echo ""
echo "  1. Pull latest code from GitHub"
echo "  2. Rebuild backend (npm install && npm run build)"
echo "  3. Restart backend service (~10 seconds downtime)"
echo "  4. Verify health endpoint"
echo ""
read -p "Proceed with production deployment? (yes/no): " deploy_confirm
if [ "$deploy_confirm" != "yes" ]; then
    echo "Deployment cancelled. Code has been pushed to GitHub but not deployed."
    exit 1
fi

# Step 6: Deploy to production
echo ""
echo "Deploying to production..."
echo "=========================================="
echo ""

ssh root@192.168.1.190 <<'ENDSSH'
    echo "Executing on production server..."
    
    pct exec 201 -- bash -c '
        set -e
        cd /opt/trade-show-app
        
        echo "Current commit: $(git rev-parse --short HEAD)"
        
        echo "Fetching latest changes..."
        git fetch origin
        
        echo ""
        echo "Changes to be pulled:"
        git log --oneline HEAD..origin/main
        echo ""
        
        echo "Pulling latest code..."
        git pull origin main
        
        echo "New commit: $(git rev-parse --short HEAD)"
        echo ""
        
        echo "Installing dependencies..."
        cd backend
        npm install
        
        echo ""
        echo "Building backend..."
        npm run build
        
        echo ""
        echo "Restarting backend service..."
        systemctl restart trade-show-app-backend
        
        echo "Waiting for service to start..."
        sleep 5
        
        echo ""
        echo "Service status:"
        systemctl status trade-show-app-backend --no-pager -l | head -20
    '
ENDSSH

echo ""
echo "=========================================="
echo "DEPLOYMENT COMPLETE"
echo "=========================================="
echo ""

# Step 7: Verify deployment
echo "Verifying deployment..."
echo ""

HEALTH_CHECK=$(ssh root@192.168.1.190 "pct exec 201 -- curl -s http://localhost:3000/api/health")
echo "Health check response: $HEALTH_CHECK"

if echo "$HEALTH_CHECK" | grep -q '"status":"ok"'; then
    echo "✓ Backend is healthy"
else
    echo "⚠️  WARNING: Backend health check failed"
    echo "Check logs: ssh root@192.168.1.190 'pct exec 201 -- journalctl -u trade-show-app-backend -n 50'"
    exit 1
fi

echo ""
echo "=========================================="
echo "DEPLOYMENT SUCCESSFUL ✓"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Test user registration"
echo "2. Test expense creation"
echo "3. Test approval workflow"
echo "4. Monitor logs for errors"
echo ""
echo "Rollback (if needed):"
echo "  ssh root@192.168.1.190 'pct exec 201 -- bash -c \"cd /opt/trade-show-app && git reset --hard c45b160 && cd backend && npm run build && systemctl restart trade-show-app-backend\"'"
echo ""

