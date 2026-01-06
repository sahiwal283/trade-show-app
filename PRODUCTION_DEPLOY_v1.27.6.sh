#!/bin/bash
# ========================================
# PRODUCTION DEPLOYMENT SCRIPT
# Version: v1.27.6 (Frontend) / v1.19.6 (Backend)
# Date: October 30, 2025
# ========================================
# 
# ⚠️  CRITICAL: This deploys to PRODUCTION (Container 201 & 202)
# ⚠️  Production has LIVE USERS and REAL FINANCIAL DATA
# ⚠️  Do NOT run without review and approval
#
# Features Being Deployed:
# - Trade Show Checklist (flights, hotels, car rentals, booth, shipping)
# - Google Document AI OCR integration
# - Receipt upload improvements
# - UX enhancements
#
# Database Migrations (6 new migrations):
# - 017_add_event_checklist.sql
# - 018_add_custom_checklist_items.sql
# - 019_add_checklist_templates.sql
# - 020_add_metadata_to_api_requests.sql
# - 021_add_booth_map.sql
# - 022_add_car_rental_assignment.sql
#
# ========================================

set -e  # Exit on any error

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROXMOX_IP="192.168.1.190"
PRODUCTION_BACKEND_CT="201"
PRODUCTION_FRONTEND_CT="202"
NPMPLUS_CT="104"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}ExpenseApp Production Deployment${NC}"
echo -e "${BLUE}Version: v1.27.6 / v1.19.6${NC}"
echo -e "${BLUE}Date: $(date)${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# ========================================
# STEP 1: Pre-Deployment Verification
# ========================================
echo -e "${YELLOW}=== STEP 1: Pre-Deployment Verification ===${NC}"
echo ""

echo "Current git branch:"
git branch --show-current
echo ""

echo "Latest commit:"
git log --oneline -1
echo ""

echo "Frontend version:"
grep '"version"' package.json | head -1
echo ""

echo "Backend version:"
grep '"version"' backend/package.json | head -1
echo ""

read -p "$(echo -e ${YELLOW}Does everything look correct? Type 'yes' to continue: ${NC})" confirm
if [ "$confirm" != "yes" ]; then
    echo -e "${RED}Deployment cancelled.${NC}"
    exit 1
fi

# ========================================
# STEP 2: Database Backup
# ========================================
echo ""
echo -e "${YELLOW}=== STEP 2: Database Backup ===${NC}"
echo ""

BACKUP_FILE="production_backup_$(date +%Y%m%d_%H%M%S).sql"

echo "Creating production database backup..."
ssh root@$PROXMOX_IP "pct exec $PRODUCTION_BACKEND_CT -- bash -c '
    cd /opt/trade-show-app/backend &&
    pg_dump -U expenseapp expenseapp > /tmp/$BACKUP_FILE
'" || {
    echo -e "${RED}❌ Database backup failed!${NC}"
    exit 1
}

echo -e "${GREEN}✓ Database backup created: /tmp/$BACKUP_FILE${NC}"
echo ""

read -p "$(echo -e ${YELLOW}Continue with deployment? Type 'yes' to proceed: ${NC})" confirm
if [ "$confirm" != "yes" ]; then
    echo -e "${RED}Deployment cancelled. Backup is saved in production.${NC}"
    exit 1
fi

# ========================================
# STEP 3: Run Database Migrations
# ========================================
echo ""
echo -e "${YELLOW}=== STEP 3: Run Database Migrations ===${NC}"
echo ""

echo "Migrations to execute:"
echo "  017_add_event_checklist.sql"
echo "  018_add_custom_checklist_items.sql"
echo "  019_add_checklist_templates.sql"
echo "  020_add_metadata_to_api_requests.sql"
echo "  021_add_booth_map.sql"
echo "  022_add_car_rental_assignment.sql"
echo ""

read -p "$(echo -e ${YELLOW}Ready to run migrations? Type 'yes' to proceed: ${NC})" confirm
if [ "$confirm" != "yes" ]; then
    echo -e "${RED}Deployment cancelled.${NC}"
    exit 1
fi

echo "Pulling latest code on production..."
ssh root@$PROXMOX_IP "pct exec $PRODUCTION_BACKEND_CT -- bash -c '
    cd /opt/trade-show-app &&
    git fetch origin &&
    git checkout main &&
    git pull origin main
'" || {
    echo -e "${RED}❌ Git pull failed!${NC}"
    exit 1
}

echo ""
echo "Running migrations..."

ssh root@$PROXMOX_IP "pct exec $PRODUCTION_BACKEND_CT -- bash -c '
    cd /opt/trade-show-app/backend/src/database/migrations &&
    
    echo \"Running migration 017...\" &&
    psql -U expenseapp -d expenseapp -f 017_add_event_checklist.sql &&
    
    echo \"Running migration 018...\" &&
    psql -U expenseapp -d expenseapp -f 018_add_custom_checklist_items.sql &&
    
    echo \"Running migration 019...\" &&
    psql -U expenseapp -d expenseapp -f 019_add_checklist_templates.sql &&
    
    echo \"Running migration 020...\" &&
    psql -U expenseapp -d expenseapp -f 020_add_metadata_to_api_requests.sql &&
    
    echo \"Running migration 021...\" &&
    psql -U expenseapp -d expenseapp -f 021_add_booth_map.sql &&
    
    echo \"Running migration 022...\" &&
    psql -U expenseapp -d expenseapp -f 022_add_car_rental_assignment.sql &&
    
    echo \"All migrations completed!\"
'" || {
    echo -e "${RED}❌ Migrations failed!${NC}"
    echo -e "${YELLOW}To rollback, restore from backup:${NC}"
    echo "  ssh root@$PROXMOX_IP \"pct exec $PRODUCTION_BACKEND_CT -- psql -U expenseapp expenseapp < /tmp/$BACKUP_FILE\""
    exit 1
}

echo -e "${GREEN}✓ All migrations completed successfully${NC}"
echo ""

# ========================================
# STEP 4: Deploy Backend
# ========================================
echo ""
echo -e "${YELLOW}=== STEP 4: Deploy Backend ===${NC}"
echo ""

echo "Building backend..."
ssh root@$PROXMOX_IP "pct exec $PRODUCTION_BACKEND_CT -- bash -c '
    cd /opt/trade-show-app/backend &&
    npm install &&
    npm run build
'" || {
    echo -e "${RED}❌ Backend build failed!${NC}"
    exit 1
}

echo -e "${GREEN}✓ Backend built successfully${NC}"
echo ""

echo "Restarting backend service..."
ssh root@$PROXMOX_IP "pct exec $PRODUCTION_BACKEND_CT -- systemctl restart trade-show-app-backend" || {
    echo -e "${RED}❌ Backend restart failed!${NC}"
    exit 1
}

echo "Waiting for backend to start..."
sleep 5

echo "Checking backend status..."
ssh root@$PROXMOX_IP "pct exec $PRODUCTION_BACKEND_CT -- systemctl status trade-show-app-backend --no-pager | head -10"

echo -e "${GREEN}✓ Backend deployed${NC}"
echo ""

# ========================================
# STEP 5: Build Frontend
# ========================================
echo ""
echo -e "${YELLOW}=== STEP 5: Build Frontend (Production Mode) ===${NC}"
echo ""

echo "Building frontend with production configuration..."
npm run build:production || {
    echo -e "${RED}❌ Frontend build failed!${NC}"
    exit 1
}

BUILD_ID=$(date +%Y%m%d_%H%M%S)
echo "<!-- Build: ${BUILD_ID} -->" >> dist/index.html

FRONTEND_PACKAGE="frontend-v1.27.6-${BUILD_ID}.tar.gz"
tar -czf $FRONTEND_PACKAGE -C dist .

echo -e "${GREEN}✓ Frontend built: $FRONTEND_PACKAGE${NC}"
echo ""

# ========================================
# STEP 6: Deploy Frontend
# ========================================
echo ""
echo -e "${YELLOW}=== STEP 6: Deploy Frontend ===${NC}"
echo ""

echo "Uploading frontend to Proxmox..."
scp $FRONTEND_PACKAGE root@$PROXMOX_IP:/tmp/production-frontend.tar.gz || {
    echo -e "${RED}❌ Frontend upload failed!${NC}"
    exit 1
}

echo "Deploying to Container 202..."
ssh root@$PROXMOX_IP "
    pct push $PRODUCTION_FRONTEND_CT /tmp/production-frontend.tar.gz /tmp/production-frontend.tar.gz &&
    pct exec $PRODUCTION_FRONTEND_CT -- bash -c 'cd /var/www/trade-show-app && rm -rf * && tar -xzf /tmp/production-frontend.tar.gz && systemctl restart nginx'
" || {
    echo -e "${RED}❌ Frontend deployment failed!${NC}"
    exit 1
}

echo -e "${GREEN}✓ Frontend deployed${NC}"
echo ""

# ========================================
# STEP 7: Clear Proxy Cache (CRITICAL!)
# ========================================
echo ""
echo -e "${YELLOW}=== STEP 7: Clear NPMplus Proxy Cache ===${NC}"
echo ""

echo "Restarting NPMplus proxy (Container 104)..."
ssh root@$PROXMOX_IP "pct stop $NPMPLUS_CT && sleep 3 && pct start $NPMPLUS_CT && sleep 2" || {
    echo -e "${RED}❌ NPMplus restart failed!${NC}"
    exit 1
}

echo -e "${GREEN}✓ Proxy cache cleared${NC}"
echo ""

# ========================================
# STEP 8: Health Checks
# ========================================
echo ""
echo -e "${YELLOW}=== STEP 8: Health Checks ===${NC}"
echo ""

echo "Checking backend health..."
HEALTH_CHECK=$(ssh root@$PROXMOX_IP "pct exec $PRODUCTION_BACKEND_CT -- curl -s http://localhost:3000/api/health")
echo "Response: $HEALTH_CHECK"

if echo "$HEALTH_CHECK" | grep -q '"status":"ok"'; then
    echo -e "${GREEN}✓ Backend is healthy${NC}"
else
    echo -e "${RED}⚠️  WARNING: Backend health check failed${NC}"
fi

echo ""
echo "Verifying frontend deployment..."
ssh root@$PROXMOX_IP "pct exec $PRODUCTION_FRONTEND_CT -- bash -c 'grep \"Version:\" /var/www/trade-show-app/service-worker.js | head -1'"

echo ""
echo "Checking database tables..."
ssh root@$PROXMOX_IP "pct exec $PRODUCTION_BACKEND_CT -- bash -c '
    psql -U expenseapp -d expenseapp -c \"SELECT tablename FROM pg_tables WHERE schemaname = '\''public'\'' AND tablename LIKE '\''checklist%'\'' ORDER BY tablename;\"
'" || echo -e "${YELLOW}Could not verify database tables${NC}"

# ========================================
# STEP 9: Deployment Summary
# ========================================
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✅ DEPLOYMENT COMPLETE!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

echo "Deployed Versions:"
echo "  Frontend: v1.27.6"
echo "  Backend: v1.19.6"
echo "  Build ID: $BUILD_ID"
echo ""

echo "What's New:"
echo "  ✓ Trade Show Checklist (flights, hotels, car rentals, booth)"
echo "  ✓ Google Document AI OCR"
echo "  ✓ Receipt upload improvements"
echo "  ✓ UX enhancements"
echo ""

echo "Database Migrations:"
echo "  ✓ 017_add_event_checklist.sql"
echo "  ✓ 018_add_custom_checklist_items.sql"
echo "  ✓ 019_add_checklist_templates.sql"
echo "  ✓ 020_add_metadata_to_api_requests.sql"
echo "  ✓ 021_add_booth_map.sql"
echo "  ✓ 022_add_car_rental_assignment.sql"
echo ""

echo "Backup Location:"
echo "  /tmp/$BACKUP_FILE (on Container 201)"
echo ""

echo "Next Steps:"
echo "  1. Test checklist feature in production"
echo "  2. Test existing expense workflows"
echo "  3. Monitor backend logs for errors"
echo "  4. Check user reports"
echo ""

echo "Monitoring Commands:"
echo "  Backend logs:  ssh root@$PROXMOX_IP 'pct exec 201 -- journalctl -u trade-show-app-backend -f'"
echo "  Backend status: ssh root@$PROXMOX_IP 'pct exec 201 -- systemctl status trade-show-app-backend'"
echo "  Health check:  curl https://expapp.duckdns.org/api/health"
echo ""

echo "Rollback (if needed):"
echo "  Backend:  ssh root@$PROXMOX_IP 'pct exec 201 -- bash -c \"cd /opt/trade-show-app && git checkout v1.5.1 && cd backend && npm install && npm run build && systemctl restart trade-show-app-backend\"'"
echo "  Database: ssh root@$PROXMOX_IP 'pct exec 201 -- psql -U expenseapp expenseapp < /tmp/$BACKUP_FILE'"
echo ""

echo -e "${GREEN}Production deployment successful! 🚀${NC}"

