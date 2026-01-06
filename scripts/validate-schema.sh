#!/bin/bash

#############################################################
# ExpenseApp - Pre-Deployment Schema Validation Script
# Version: 1.27.15
# Purpose: Compare production database schema to migration files
#          and detect mismatches before deployment
#
# Usage: 
#   ./scripts/validate-schema.sh [environment]
#
# Environments:
#   production  - Container 201 (192.168.1.138)
#   sandbox     - Container 203 (192.168.1.144)
#   local       - localhost development
#
# Exit Codes:
#   0 - Schema validation passed
#   1 - Schema mismatches found (blocks deployment)
#   2 - Script error (configuration/connection issues)
#############################################################

set -e  # Exit on error

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Emojis
CHECKMARK="✅"
CROSS="❌"
WARNING="⚠️"
INFO="ℹ️"
SEARCH="🔍"
DATABASE="🗄️"
SHIELD="🛡️"

# Script configuration
MIGRATIONS_DIR="backend/src/database/migrations"
TEMP_DIR="/tmp/trade-show-app-schema-validation-$$"
REPORT_FILE="$TEMP_DIR/validation-report.txt"
ERRORS_FOUND=0

# Database connection details will be set based on environment
DB_HOST=""
DB_PORT=""
DB_NAME=""
DB_USER=""
DB_PASSWORD=""
ENVIRONMENT="${1:-production}"

#############################################################
# Helper Functions
#############################################################

log_info() {
    echo -e "${BLUE}${INFO} $1${NC}"
}

log_success() {
    echo -e "${GREEN}${CHECKMARK} $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}${WARNING} $1${NC}"
}

log_error() {
    echo -e "${RED}${CROSS} $1${NC}"
}

log_section() {
    echo ""
    echo -e "${CYAN}${BOLD}═══════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}${BOLD} $1${NC}"
    echo -e "${CYAN}${BOLD}═══════════════════════════════════════════════════${NC}"
    echo ""
}

#############################################################
# Environment Configuration
#############################################################

configure_environment() {
    log_section "${SHIELD} Configuring Environment: $ENVIRONMENT"
    
    case "$ENVIRONMENT" in
        production)
            log_info "Loading production database configuration..."
            if [ ! -f "backend/env.production" ]; then
                log_error "Production environment file not found: backend/env.production"
                exit 2
            fi
            
            # Parse production environment file
            DB_HOST=$(grep "^DB_HOST=" backend/env.production | cut -d'=' -f2)
            DB_PORT=$(grep "^DB_PORT=" backend/env.production | cut -d'=' -f2)
            DB_NAME=$(grep "^DB_NAME=" backend/env.production | cut -d'=' -f2)
            DB_USER=$(grep "^DB_USER=" backend/env.production | cut -d'=' -f2)
            DB_PASSWORD=$(grep "^DB_PASSWORD=" backend/env.production | cut -d'=' -f2)
            
            log_success "Production environment configured"
            log_info "Database: $DB_NAME @ $DB_HOST:$DB_PORT"
            ;;
            
        sandbox)
            log_info "Loading sandbox database configuration..."
            if [ ! -f "backend/env.sandbox.READY" ]; then
                log_error "Sandbox environment file not found: backend/env.sandbox.READY"
                exit 2
            fi
            
            # Parse sandbox environment file
            DB_HOST=$(grep "^DB_HOST=" backend/env.sandbox.READY | cut -d'=' -f2)
            DB_PORT=$(grep "^DB_PORT=" backend/env.sandbox.READY | cut -d'=' -f2)
            DB_NAME=$(grep "^DB_NAME=" backend/env.sandbox.READY | cut -d'=' -f2)
            DB_USER=$(grep "^DB_USER=" backend/env.sandbox.READY | cut -d'=' -f2)
            DB_PASSWORD=$(grep "^DB_PASSWORD=" backend/env.sandbox.READY | cut -d'=' -f2)
            
            log_success "Sandbox environment configured"
            log_info "Database: $DB_NAME @ $DB_HOST:$DB_PORT"
            ;;
            
        local)
            log_info "Loading local database configuration..."
            if [ ! -f "backend/.env" ]; then
                log_error "Local environment file not found: backend/.env"
                exit 2
            fi
            
            # Parse local environment file
            DB_HOST=$(grep "^DB_HOST=" backend/.env | cut -d'=' -f2)
            DB_PORT=$(grep "^DB_PORT=" backend/.env | cut -d'=' -f2)
            DB_NAME=$(grep "^DB_NAME=" backend/.env | cut -d'=' -f2)
            DB_USER=$(grep "^DB_USER=" backend/.env | cut -d'=' -f2)
            DB_PASSWORD=$(grep "^DB_PASSWORD=" backend/.env | cut -d'=' -f2)
            
            log_success "Local environment configured"
            log_info "Database: $DB_NAME @ $DB_HOST:$DB_PORT"
            ;;
            
        *)
            log_error "Invalid environment: $ENVIRONMENT"
            echo "Usage: $0 [production|sandbox|local]"
            exit 2
            ;;
    esac
    
    # Validate configuration
    if [ -z "$DB_HOST" ] || [ -z "$DB_NAME" ] || [ -z "$DB_USER" ]; then
        log_error "Incomplete database configuration"
        log_error "DB_HOST: ${DB_HOST:-<missing>}"
        log_error "DB_NAME: ${DB_NAME:-<missing>}"
        log_error "DB_USER: ${DB_USER:-<missing>}"
        exit 2
    fi
}

#############################################################
# Database Connection Test
#############################################################

test_database_connection() {
    log_section "${DATABASE} Testing Database Connection"
    
    log_info "Connecting to $DB_NAME..."
    
    # Set PGPASSWORD for psql
    export PGPASSWORD="$DB_PASSWORD"
    
    # Test connection
    if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" > /dev/null 2>&1; then
        log_success "Database connection successful"
    else
        log_error "Failed to connect to database"
        log_error "Host: $DB_HOST:$DB_PORT"
        log_error "Database: $DB_NAME"
        log_error "User: $DB_USER"
        unset PGPASSWORD
        exit 2
    fi
}

#############################################################
# Extract Schema from Migrations
#############################################################

extract_migration_schema() {
    log_section "${SEARCH} Analyzing Migration Files"
    
    if [ ! -d "$MIGRATIONS_DIR" ]; then
        log_error "Migrations directory not found: $MIGRATIONS_DIR"
        exit 2
    fi
    
    # Create temp directory
    mkdir -p "$TEMP_DIR"
    
    # Extract all CREATE TABLE statements from migrations
    local migration_count=0
    local table_count=0
    
    log_info "Scanning migration files..."
    
    for migration_file in "$MIGRATIONS_DIR"/*.sql; do
        if [ -f "$migration_file" ]; then
            migration_count=$((migration_count + 1))
            filename=$(basename "$migration_file")
            
            # Extract table names from CREATE TABLE statements
            # This handles CREATE TABLE IF NOT EXISTS as well
            grep -iE "CREATE TABLE (IF NOT EXISTS )?[a-zA-Z_]+" "$migration_file" | \
                sed -E 's/.*CREATE TABLE (IF NOT EXISTS )?([a-zA-Z_]+).*/\2/i' >> "$TEMP_DIR/expected_tables.txt" 2>/dev/null || true
            
            # Count tables found in this migration
            local tables_in_file=$(grep -icE "CREATE TABLE" "$migration_file" 2>/dev/null || echo "0")
            if [ "$tables_in_file" -gt 0 ]; then
                table_count=$((table_count + tables_in_file))
                log_info "  → $filename: $tables_in_file table(s)"
            fi
        fi
    done
    
    # Remove duplicates and sort
    if [ -f "$TEMP_DIR/expected_tables.txt" ]; then
        sort -u "$TEMP_DIR/expected_tables.txt" > "$TEMP_DIR/expected_tables_sorted.txt"
        mv "$TEMP_DIR/expected_tables_sorted.txt" "$TEMP_DIR/expected_tables.txt"
        
        local unique_tables=$(wc -l < "$TEMP_DIR/expected_tables.txt" | tr -d ' ')
        
        log_success "Analyzed $migration_count migration file(s)"
        log_success "Found $unique_tables unique table(s) defined in migrations"
    else
        log_warning "No tables found in migration files"
        touch "$TEMP_DIR/expected_tables.txt"
    fi
}

#############################################################
# Get Actual Database Schema
#############################################################

get_actual_schema() {
    log_section "${DATABASE} Fetching Actual Database Schema"
    
    log_info "Querying database for table list..."
    
    # Get list of tables from database (excluding system tables)
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -A -c \
        "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;" \
        > "$TEMP_DIR/actual_tables.txt" 2>/dev/null
    
    local actual_count=$(wc -l < "$TEMP_DIR/actual_tables.txt" | tr -d ' ')
    log_success "Found $actual_count table(s) in database"
    
    # Get detailed schema information for each table
    log_info "Fetching column information for all tables..."
    
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -A -F'|' -c \
        "SELECT 
            table_name,
            column_name,
            data_type,
            character_maximum_length,
            is_nullable,
            column_default
         FROM information_schema.columns
         WHERE table_schema = 'public'
         ORDER BY table_name, ordinal_position;" \
        > "$TEMP_DIR/actual_columns.txt" 2>/dev/null
    
    local column_count=$(wc -l < "$TEMP_DIR/actual_columns.txt" | tr -d ' ')
    log_success "Retrieved $column_count column(s) from database"
}

#############################################################
# Compare Schemas
#############################################################

compare_schemas() {
    log_section "${SEARCH} Comparing Schemas"
    
    # Initialize report
    cat > "$REPORT_FILE" << EOF
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   📋 Schema Validation Report                                ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝

Environment: $ENVIRONMENT
Database: $DB_NAME
Host: $DB_HOST:$DB_PORT
Timestamp: $(date '+%Y-%m-%d %H:%M:%S')

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EOF
    
    # 1. Check for missing tables (in migrations but not in DB)
    log_info "Checking for missing tables..."
    
    local missing_tables=0
    echo "📊 MISSING TABLES CHECK:" >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
    
    while IFS= read -r expected_table; do
        if ! grep -q "^${expected_table}$" "$TEMP_DIR/actual_tables.txt" 2>/dev/null; then
            missing_tables=$((missing_tables + 1))
            ERRORS_FOUND=$((ERRORS_FOUND + 1))
            log_error "Missing table: $expected_table"
            echo "  ❌ MISSING: $expected_table" >> "$REPORT_FILE"
        fi
    done < "$TEMP_DIR/expected_tables.txt"
    
    if [ $missing_tables -eq 0 ]; then
        log_success "No missing tables"
        echo "  ✅ All expected tables exist in database" >> "$REPORT_FILE"
    else
        echo "" >> "$REPORT_FILE"
        echo "  ⚠️  Found $missing_tables missing table(s)" >> "$REPORT_FILE"
    fi
    
    echo "" >> "$REPORT_FILE"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
    
    # 2. Check for extra tables (in DB but not in migrations)
    log_info "Checking for undocumented tables..."
    
    local extra_tables=0
    echo "📊 EXTRA TABLES CHECK:" >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
    
    while IFS= read -r actual_table; do
        if ! grep -q "^${actual_table}$" "$TEMP_DIR/expected_tables.txt" 2>/dev/null; then
            extra_tables=$((extra_tables + 1))
            log_warning "Extra table (not in migrations): $actual_table"
            echo "  ⚠️  EXTRA: $actual_table (not defined in migrations)" >> "$REPORT_FILE"
        fi
    done < "$TEMP_DIR/actual_tables.txt"
    
    if [ $extra_tables -eq 0 ]; then
        log_success "No extra tables"
        echo "  ✅ No unexpected tables found" >> "$REPORT_FILE"
    else
        echo "" >> "$REPORT_FILE"
        echo "  ℹ️  Found $extra_tables table(s) not in migrations (may be system tables)" >> "$REPORT_FILE"
    fi
    
    echo "" >> "$REPORT_FILE"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
    
    # 3. Detailed column comparison for each expected table
    log_info "Analyzing table structures..."
    
    echo "📊 TABLE STRUCTURE ANALYSIS:" >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
    
    while IFS= read -r table_name; do
        # Check if table exists in database
        if grep -q "^${table_name}$" "$TEMP_DIR/actual_tables.txt" 2>/dev/null; then
            # Extract columns for this table from migration files
            local migration_file=$(grep -l "CREATE TABLE.*${table_name}" "$MIGRATIONS_DIR"/*.sql | head -1)
            
            if [ -n "$migration_file" ]; then
                echo "Table: $table_name" >> "$REPORT_FILE"
                echo "  Source: $(basename "$migration_file")" >> "$REPORT_FILE"
                
                # Get actual columns from database
                grep "^${table_name}|" "$TEMP_DIR/actual_columns.txt" > "$TEMP_DIR/current_table_columns.txt" 2>/dev/null || true
                
                local column_count=$(wc -l < "$TEMP_DIR/current_table_columns.txt" | tr -d ' ')
                echo "  Columns in DB: $column_count" >> "$REPORT_FILE"
                
                # Extract expected columns from migration file
                # This is a simplified extraction - in a real-world scenario, you'd use a SQL parser
                local migration_columns=$(sed -n "/CREATE TABLE.*${table_name}/,/);/p" "$migration_file" | \
                    grep -E "^\s*[a-zA-Z_]+ " | \
                    sed -E 's/^\s*([a-zA-Z_]+).*/\1/' | \
                    grep -v "CREATE" | grep -v "^$" || true)
                
                local expected_column_count=$(echo "$migration_columns" | grep -c "." || echo "0")
                echo "  Columns expected: $expected_column_count" >> "$REPORT_FILE"
                
                if [ $column_count -ne $expected_column_count ] && [ $expected_column_count -gt 0 ]; then
                    log_warning "Column count mismatch for table: $table_name (expected: $expected_column_count, actual: $column_count)"
                    echo "  ⚠️  Column count mismatch" >> "$REPORT_FILE"
                    ERRORS_FOUND=$((ERRORS_FOUND + 1))
                else
                    echo "  ✅ Column count matches" >> "$REPORT_FILE"
                fi
                
                echo "" >> "$REPORT_FILE"
            fi
        fi
    done < "$TEMP_DIR/expected_tables.txt"
    
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
}

#############################################################
# Generate Final Report
#############################################################

generate_report() {
    log_section "📋 Validation Summary"
    
    # Add summary to report
    cat >> "$REPORT_FILE" << EOF
📊 FINAL SUMMARY:

Environment: $ENVIRONMENT
Database: $DB_NAME @ $DB_HOST:$DB_PORT

Tables in Migrations: $(wc -l < "$TEMP_DIR/expected_tables.txt" | tr -d ' ')
Tables in Database:   $(wc -l < "$TEMP_DIR/actual_tables.txt" | tr -d ' ')

Total Issues Found: $ERRORS_FOUND

EOF
    
    if [ $ERRORS_FOUND -eq 0 ]; then
        cat >> "$REPORT_FILE" << EOF
✅ VALIDATION PASSED

All database tables match migration definitions.
Safe to proceed with deployment.

EOF
        log_success "Schema validation PASSED"
        log_success "All database tables match migration definitions"
    else
        cat >> "$REPORT_FILE" << EOF
❌ VALIDATION FAILED

Found $ERRORS_FOUND schema mismatch(es).
Review the issues above before deploying.

🛡️ DEPLOYMENT BLOCKED

EOF
        log_error "Schema validation FAILED"
        log_error "Found $ERRORS_FOUND schema mismatch(es)"
    fi
    
    cat >> "$REPORT_FILE" << EOF
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Report saved to: $REPORT_FILE

EOF
    
    # Display report
    echo ""
    cat "$REPORT_FILE"
    
    log_info "Detailed report saved to: $REPORT_FILE"
}

#############################################################
# Cleanup
#############################################################

cleanup() {
    unset PGPASSWORD
    
    # Keep report file but clean up temp data
    if [ -d "$TEMP_DIR" ]; then
        # Move report to a permanent location
        if [ -f "$REPORT_FILE" ]; then
            FINAL_REPORT="schema-validation-${ENVIRONMENT}-$(date +%Y%m%d_%H%M%S).txt"
            cp "$REPORT_FILE" "$FINAL_REPORT"
            log_info "Report saved to: $FINAL_REPORT"
        fi
        
        # Clean up temp directory
        rm -rf "$TEMP_DIR"
    fi
}

#############################################################
# Main Execution
#############################################################

main() {
    echo ""
    echo -e "${CYAN}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║                                                               ║${NC}"
    echo -e "${CYAN}║   ${SHIELD} Pre-Deployment Schema Validation                       ║${NC}"
    echo -e "${CYAN}║                                                               ║${NC}"
    echo -e "${CYAN}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    # Set up trap for cleanup
    trap cleanup EXIT
    
    # Execute validation steps
    configure_environment
    test_database_connection
    extract_migration_schema
    get_actual_schema
    compare_schemas
    generate_report
    
    # Exit with appropriate code
    if [ $ERRORS_FOUND -eq 0 ]; then
        echo ""
        log_success "Schema validation completed successfully"
        echo ""
        exit 0
    else
        echo ""
        log_error "Schema validation failed - deployment BLOCKED"
        log_error "Fix the issues above before deploying"
        echo ""
        exit 1
    fi
}

# Run main function
main

