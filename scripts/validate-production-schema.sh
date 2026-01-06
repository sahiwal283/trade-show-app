#!/bin/bash

#############################################################
# ExpenseApp - Production Schema Validation Script
# Version: 1.27.15
# Purpose: Validate production database schema before deployment
#
# This is a production-specific wrapper around validate-schema.sh
# that performs additional critical table checks
#
# Usage: ./scripts/validate-production-schema.sh
#
# Exit Codes:
#   0 - All validations passed (safe to deploy)
#   1 - Schema validation failed (DEPLOYMENT BLOCKED)
#   2 - Critical tables missing (CRITICAL ERROR)
#############################################################

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Emojis
CHECKMARK="✅"
CROSS="❌"
WARNING="⚠️"
SHIELD="🛡️"
DATABASE="🗄️"

# Critical tables that MUST exist in production
CRITICAL_TABLES=(
    "users"
    "audit_logs"
    "expenses"
    "events"
    "roles"
    "user_sessions"
)

# Tables added in recent migrations (v1.27.x)
RECENT_TABLES=(
    "event_checklists"
    "checklist_flights"
    "checklist_hotels"
    "checklist_car_rentals"
    "checklist_booth_shipping"
    "checklist_custom_items"
    "checklist_templates"
)

echo ""
echo -e "${CYAN}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║                                                               ║${NC}"
echo -e "${CYAN}║   ${SHIELD} Production Schema Validation                            ║${NC}"
echo -e "${CYAN}║   ${DATABASE} Critical Table Check + Full Schema Comparison         ║${NC}"
echo -e "${CYAN}║                                                               ║${NC}"
echo -e "${CYAN}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""

#############################################################
# Step 1: Check if production environment is configured
#############################################################

echo -e "${BLUE}🔍 Step 1: Checking production configuration...${NC}"
echo ""

if [ ! -f "backend/env.production" ]; then
    echo -e "${RED}${CROSS} Production environment file not found: backend/env.production${NC}"
    echo -e "${RED}Cannot validate production schema without configuration${NC}"
    exit 2
fi

# Extract database details
DB_HOST=$(grep "^DB_HOST=" backend/env.production | cut -d'=' -f2)
DB_NAME=$(grep "^DB_NAME=" backend/env.production | cut -d'=' -f2)
DB_USER=$(grep "^DB_USER=" backend/env.production | cut -d'=' -f2)
DB_PASSWORD=$(grep "^DB_PASSWORD=" backend/env.production | cut -d'=' -f2)

echo -e "${GREEN}${CHECKMARK} Production configuration found${NC}"
echo -e "${BLUE}   Database: ${BOLD}$DB_NAME${NC}${BLUE} @ $DB_HOST${NC}"
echo ""

#############################################################
# Step 2: Test database connection
#############################################################

echo -e "${BLUE}🔍 Step 2: Testing production database connection...${NC}"
echo ""

export PGPASSWORD="$DB_PASSWORD"

if ! psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" > /dev/null 2>&1; then
    echo -e "${RED}${CROSS} Failed to connect to production database${NC}"
    echo -e "${RED}Host: $DB_HOST${NC}"
    echo -e "${RED}Database: $DB_NAME${NC}"
    echo -e "${RED}User: $DB_USER${NC}"
    unset PGPASSWORD
    exit 2
fi

echo -e "${GREEN}${CHECKMARK} Production database connection successful${NC}"
echo ""

#############################################################
# Step 3: Check critical tables exist
#############################################################

echo -e "${BLUE}🔍 Step 3: Verifying critical tables exist...${NC}"
echo ""

CRITICAL_ERRORS=0

for table in "${CRITICAL_TABLES[@]}"; do
    if psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -t -A -c \
        "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '$table');" \
        | grep -q "t"; then
        echo -e "${GREEN}${CHECKMARK} $table${NC}"
    else
        echo -e "${RED}${CROSS} $table - MISSING (CRITICAL)${NC}"
        CRITICAL_ERRORS=$((CRITICAL_ERRORS + 1))
    fi
done

echo ""

if [ $CRITICAL_ERRORS -gt 0 ]; then
    echo -e "${RED}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║                                                               ║${NC}"
    echo -e "${RED}║   ${CROSS} CRITICAL ERROR: Missing Core Tables                   ║${NC}"
    echo -e "${RED}║                                                               ║${NC}"
    echo -e "${RED}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${RED}Found $CRITICAL_ERRORS missing critical table(s)${NC}"
    echo -e "${RED}Production database is in an invalid state${NC}"
    echo -e "${RED}DO NOT DEPLOY until this is resolved${NC}"
    echo ""
    unset PGPASSWORD
    exit 2
fi

echo -e "${GREEN}${CHECKMARK} All critical tables present${NC}"
echo ""

#############################################################
# Step 4: Check for recent migration tables
#############################################################

echo -e "${BLUE}🔍 Step 4: Checking recent migration tables (v1.27.x)...${NC}"
echo ""

MISSING_RECENT=0

for table in "${RECENT_TABLES[@]}"; do
    if psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -t -A -c \
        "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '$table');" \
        | grep -q "t"; then
        echo -e "${GREEN}${CHECKMARK} $table${NC}"
    else
        echo -e "${YELLOW}${WARNING} $table - MISSING (needs migration)${NC}"
        MISSING_RECENT=$((MISSING_RECENT + 1))
    fi
done

echo ""

if [ $MISSING_RECENT -gt 0 ]; then
    echo -e "${YELLOW}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${YELLOW}║                                                               ║${NC}"
    echo -e "${YELLOW}║   ${WARNING} WARNING: Missing Recent Migration Tables            ║${NC}"
    echo -e "${YELLOW}║                                                               ║${NC}"
    echo -e "${YELLOW}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${YELLOW}Found $MISSING_RECENT table(s) from recent migrations${NC}"
    echo -e "${YELLOW}These tables should be created by running migrations 017-019${NC}"
    echo ""
    echo -e "${BLUE}To fix:${NC}"
    echo "  ssh root@192.168.1.190"
    echo "  pct exec 201 -- bash -c 'cd /opt/trade-show-app/backend && npm run migrate'"
    echo ""
fi

#############################################################
# Step 5: Check specific critical columns
#############################################################

echo -e "${BLUE}🔍 Step 5: Verifying critical columns exist...${NC}"
echo ""

# Define critical columns that must exist
check_column() {
    local table=$1
    local column=$2
    local type=$3
    
    if psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -t -A -c \
        "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '$table' AND column_name = '$column');" \
        | grep -q "t"; then
        
        # Verify data type if provided
        if [ -n "$type" ]; then
            actual_type=$(psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -t -A -c \
                "SELECT data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '$table' AND column_name = '$column';")
            
            if [[ "$actual_type" == *"$type"* ]]; then
                echo -e "${GREEN}${CHECKMARK} $table.$column ($actual_type)${NC}"
            else
                echo -e "${YELLOW}${WARNING} $table.$column - Type mismatch (expected: $type, got: $actual_type)${NC}"
                return 1
            fi
        else
            echo -e "${GREEN}${CHECKMARK} $table.$column${NC}"
        fi
        return 0
    else
        echo -e "${RED}${CROSS} $table.$column - MISSING${NC}"
        return 1
    fi
}

COLUMN_ERRORS=0

# Check critical columns
check_column "users" "id" "uuid" || COLUMN_ERRORS=$((COLUMN_ERRORS + 1))
check_column "users" "username" "character" || COLUMN_ERRORS=$((COLUMN_ERRORS + 1))
check_column "users" "role" "character" || COLUMN_ERRORS=$((COLUMN_ERRORS + 1))
check_column "users" "created_at" "timestamp" || COLUMN_ERRORS=$((COLUMN_ERRORS + 1))

check_column "audit_logs" "id" "" || COLUMN_ERRORS=$((COLUMN_ERRORS + 1))
check_column "audit_logs" "user_id" "uuid" || COLUMN_ERRORS=$((COLUMN_ERRORS + 1))
check_column "audit_logs" "action" "character" || COLUMN_ERRORS=$((COLUMN_ERRORS + 1))
check_column "audit_logs" "timestamp" "timestamp" || COLUMN_ERRORS=$((COLUMN_ERRORS + 1))

check_column "expenses" "id" "uuid" || COLUMN_ERRORS=$((COLUMN_ERRORS + 1))
check_column "expenses" "event_id" "uuid" || COLUMN_ERRORS=$((COLUMN_ERRORS + 1))
check_column "expenses" "amount" "" || COLUMN_ERRORS=$((COLUMN_ERRORS + 1))
check_column "expenses" "status" "character" || COLUMN_ERRORS=$((COLUMN_ERRORS + 1))

echo ""

if [ $COLUMN_ERRORS -gt 0 ]; then
    echo -e "${RED}${CROSS} Found $COLUMN_ERRORS column issue(s)${NC}"
    echo ""
fi

#############################################################
# Step 6: Run full schema validation
#############################################################

echo -e "${BLUE}🔍 Step 6: Running comprehensive schema validation...${NC}"
echo ""

unset PGPASSWORD

# Run the main validation script
if ! ./scripts/validate-schema.sh production; then
    echo ""
    echo -e "${RED}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║                                                               ║${NC}"
    echo -e "${RED}║   ${CROSS} SCHEMA VALIDATION FAILED                              ║${NC}"
    echo -e "${RED}║   ${SHIELD} DEPLOYMENT BLOCKED                                    ║${NC}"
    echo -e "${RED}║                                                               ║${NC}"
    echo -e "${RED}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${RED}Production schema does not match migration definitions${NC}"
    echo -e "${RED}Review the validation report and fix issues before deploying${NC}"
    echo ""
    exit 1
fi

#############################################################
# Final Summary
#############################################################

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                                                               ║${NC}"
echo -e "${GREEN}║   ${CHECKMARK} PRODUCTION SCHEMA VALIDATION PASSED                 ║${NC}"
echo -e "${GREEN}║   ${SHIELD} SAFE TO DEPLOY                                         ║${NC}"
echo -e "${GREEN}║                                                               ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""

echo -e "${CYAN}Validation Summary:${NC}"
echo -e "  ${GREEN}✅ Critical tables: All present${NC}"
if [ $MISSING_RECENT -gt 0 ]; then
    echo -e "  ${YELLOW}⚠️  Recent tables: $MISSING_RECENT missing (migrations needed)${NC}"
else
    echo -e "  ${GREEN}✅ Recent tables: All present${NC}"
fi
if [ $COLUMN_ERRORS -eq 0 ]; then
    echo -e "  ${GREEN}✅ Critical columns: All present and correct${NC}"
else
    echo -e "  ${YELLOW}⚠️  Columns: $COLUMN_ERRORS issue(s) detected${NC}"
fi
echo -e "  ${GREEN}✅ Full schema: Matches migrations${NC}"
echo ""

if [ $MISSING_RECENT -gt 0 ] || [ $COLUMN_ERRORS -gt 0 ]; then
    echo -e "${YELLOW}${WARNING} Warnings detected but not blocking deployment${NC}"
    echo -e "${YELLOW}Consider running migrations to fix warnings${NC}"
    echo ""
fi

echo -e "${GREEN}${CHECKMARK} Production database is ready for deployment${NC}"
echo ""

exit 0

