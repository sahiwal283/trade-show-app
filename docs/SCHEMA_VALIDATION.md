# 🛡️ Schema Validation Guide

**Version:** 1.27.15  
**Last Updated:** November 6, 2025  
**Purpose:** Pre-deployment schema validation to prevent database mismatches

---

## 📋 Overview

The schema validation script compares your production database schema against migration files to detect mismatches **before deployment**. This prevents runtime errors caused by schema drift.

---

## 🚀 Quick Start

### Basic Usage

```bash
# Validate production schema
./scripts/validate-schema.sh production

# Validate sandbox schema
./scripts/validate-schema.sh sandbox

# Validate local schema
./scripts/validate-schema.sh local
```

### Exit Codes

| Code | Meaning | Action |
|------|---------|--------|
| 0 | Validation passed | ✅ Safe to deploy |
| 1 | Schema mismatches found | ❌ **DEPLOYMENT BLOCKED** - Fix issues first |
| 2 | Script error | 🔧 Check configuration/connection |

---

## 🔍 What It Validates

### 1. Missing Tables

**Check:** Tables defined in migrations but missing from database

**Example Issue:**
```
❌ Missing table: checklist_templates
```

**Impact:** Application crashes when trying to access missing table

**Fix:** Run missing migrations

### 2. Extra Tables

**Check:** Tables in database but not defined in migrations

**Example Issue:**
```
⚠️  EXTRA: old_expenses_backup (not defined in migrations)
```

**Impact:** Schema drift, potential confusion

**Fix:** Either add migration or document as system table

### 3. Column Count Mismatches

**Check:** Number of columns differs between migration definition and actual table

**Example Issue:**
```
⚠️  Column count mismatch
  Expected: 10 columns
  Actual: 9 columns
```

**Impact:** Missing fields cause insertion errors or data loss

**Fix:** Run missing ALTER TABLE migrations

### 4. Column Type Mismatches

**Check:** Column data types differ from migration definition

**Example Issue:**
```
❌ Type mismatch: users.created_at
  Expected: TIMESTAMP
  Actual: DATE
```

**Impact:** Data truncation, query errors

**Fix:** Run ALTER TABLE to change column type

---

## 📊 Sample Output

### Successful Validation

```
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   🛡️ Pre-Deployment Schema Validation                        ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝

═══════════════════════════════════════════════════
 🛡️ Configuring Environment: production
═══════════════════════════════════════════════════

ℹ️  Loading production database configuration...
✅ Production environment configured
ℹ️  Database: expense_app_production @ 127.0.0.1:5432

═══════════════════════════════════════════════════
 🗄️  Testing Database Connection
═══════════════════════════════════════════════════

ℹ️  Connecting to expense_app_production...
✅ Database connection successful

═══════════════════════════════════════════════════
 🔍 Analyzing Migration Files
═══════════════════════════════════════════════════

ℹ️  Scanning migration files...
ℹ️    → 017_add_event_checklist.sql: 5 table(s)
ℹ️    → 018_add_custom_checklist_items.sql: 1 table(s)
ℹ️    → 019_add_checklist_templates.sql: 1 table(s)
✅ Analyzed 22 migration file(s)
✅ Found 28 unique table(s) defined in migrations

═══════════════════════════════════════════════════
 🗄️  Fetching Actual Database Schema
═══════════════════════════════════════════════════

ℹ️  Querying database for table list...
✅ Found 28 table(s) in database
ℹ️  Fetching column information for all tables...
✅ Retrieved 245 column(s) from database

═══════════════════════════════════════════════════
 🔍 Comparing Schemas
═══════════════════════════════════════════════════

ℹ️  Checking for missing tables...
✅ No missing tables
ℹ️  Checking for undocumented tables...
✅ No extra tables
ℹ️  Analyzing table structures...

═══════════════════════════════════════════════════
 📋 Validation Summary
═══════════════════════════════════════════════════

✅ Schema validation PASSED
✅ All database tables match migration definitions

Environment: production
Database: expense_app_production @ 127.0.0.1:5432

Tables in Migrations: 28
Tables in Database:   28

Total Issues Found: 0

✅ VALIDATION PASSED
Safe to proceed with deployment.

✅ Schema validation completed successfully
```

### Failed Validation

```
═══════════════════════════════════════════════════
 🔍 Comparing Schemas
═══════════════════════════════════════════════════

ℹ️  Checking for missing tables...
❌ Missing table: checklist_templates
❌ Missing table: checklist_custom_items
ℹ️  Checking for undocumented tables...
⚠️  Extra table (not in migrations): temp_migration_backup
ℹ️  Analyzing table structures...
⚠️  Column count mismatch for table: users (expected: 12, actual: 11)

═══════════════════════════════════════════════════
 📋 Validation Summary
═══════════════════════════════════════════════════

❌ Schema validation FAILED
❌ Found 4 schema mismatch(es)

Environment: production
Database: expense_app_production @ 127.0.0.1:5432

Tables in Migrations: 28
Tables in Database:   26

Total Issues Found: 4

❌ VALIDATION FAILED

🛡️ DEPLOYMENT BLOCKED

❌ Schema validation failed - deployment BLOCKED
❌ Fix the issues above before deploying
```

---

## 🔧 Integration with Deployment

### Manual Deployment

```bash
#!/bin/bash
# Pre-deployment checklist

# 1. Validate schema
./scripts/validate-schema.sh production
if [ $? -ne 0 ]; then
    echo "❌ Schema validation failed - aborting deployment"
    exit 1
fi

# 2. Run deployment
./deploy-to-production.sh
```

### GitHub Actions (CI/CD)

```yaml
name: Deploy to Production

on:
  workflow_dispatch:
    inputs:
      confirm:
        description: 'Type "DEPLOY" to confirm'
        required: true

jobs:
  validate-schema:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Install PostgreSQL Client
        run: sudo apt-get install -y postgresql-client
      
      - name: Validate Production Schema
        run: ./scripts/validate-schema.sh production
        env:
          # Use secrets for production credentials
          DB_HOST: ${{ secrets.PROD_DB_HOST }}
          DB_PASSWORD: ${{ secrets.PROD_DB_PASSWORD }}
      
      - name: Block on Validation Failure
        if: failure()
        run: |
          echo "❌ Schema validation failed"
          exit 1
  
  deploy:
    needs: validate-schema
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to Production
        run: ./DEPLOY_TO_PRODUCTION.sh
```

---

## 🐛 Troubleshooting

### Connection Failed

**Error:**
```
❌ Failed to connect to database
```

**Solutions:**

1. **Check VPN connection** (for remote databases)
   ```bash
   ping 192.168.1.138
   ```

2. **Verify credentials**
   ```bash
   cat backend/env.production | grep DB_
   ```

3. **Test connection manually**
   ```bash
   psql -h 127.0.0.1 -U sahil -d expense_app_production
   ```

4. **Check firewall rules**
   ```bash
   # On production server
   sudo ufw status
   ```

### Missing Migration Files

**Error:**
```
❌ Migrations directory not found: backend/src/database/migrations
```

**Solution:**
```bash
# Ensure you're in the project root
cd /path/to/expenseApp

# Verify migrations exist
ls -la backend/src/database/migrations/
```

### Environment File Not Found

**Error:**
```
❌ Production environment file not found: backend/env.production
```

**Solution:**

1. **For production:** Ensure `backend/env.production` exists
2. **For sandbox:** Ensure `backend/env.sandbox.READY` exists
3. **For local:** Ensure `backend/.env` exists

### False Positives

**Issue:** Extra tables reported that are intentional (backups, temp tables)

**Solution:** Document them in a whitelist or migration file with comment:

```sql
-- NOTE: temp_migration_backup is intentional, created manually for data migration
-- This table will be dropped after verification
```

---

## 📁 Generated Reports

### Report Location

Reports are saved to the project root with timestamp:

```
schema-validation-production-20251106_143052.txt
schema-validation-sandbox-20251106_143105.txt
```

### Report Format

Each report includes:
- Environment details
- Tables comparison
- Column analysis
- Final summary
- Recommendations

### Viewing Reports

```bash
# List recent reports
ls -lt schema-validation-*.txt | head -5

# View latest report
cat $(ls -t schema-validation-*.txt | head -1)
```

---

## 🔄 Common Workflows

### Before Deploying New Migration

```bash
# 1. Validate current production schema
./scripts/validate-schema.sh production

# 2. If passed, apply new migration to production
ssh root@192.168.1.190
pct exec 201 -- bash -c 'cd /opt/trade-show-app/backend && npm run migrate'

# 3. Validate again
./scripts/validate-schema.sh production
```

### After Manual Schema Changes

```bash
# If you made manual changes to production (emergency fix)

# 1. Validate to see drift
./scripts/validate-schema.sh production

# 2. Create migration to match changes
cat > backend/src/database/migrations/023_emergency_fix.sql << 'EOF'
ALTER TABLE users ADD COLUMN emergency_field VARCHAR(255);
EOF

# 3. Validate again (should pass now)
./scripts/validate-schema.sh production
```

### Regular Audits

```bash
# Run weekly schema audit for all environments

# Production
./scripts/validate-schema.sh production > audit-prod-$(date +%Y%m%d).txt

# Sandbox
./scripts/validate-schema.sh sandbox > audit-sandbox-$(date +%Y%m%d).txt

# Local
./scripts/validate-schema.sh local > audit-local-$(date +%Y%m%d).txt

# Archive reports
mkdir -p schema-audits/$(date +%Y-%m)
mv audit-*.txt schema-audits/$(date +%Y-%m)/
```

---

## ⚙️ Advanced Configuration

### Custom Environment

If you need to validate against a custom database:

```bash
# Create custom environment file
cat > backend/env.custom << 'EOF'
DB_HOST=custom-host.example.com
DB_PORT=5432
DB_NAME=custom_database
DB_USER=custom_user
DB_PASSWORD=custom_password
EOF

# Modify script to support custom environment
# Add case for "custom" in configure_environment()
```

### Excluding Tables

To exclude specific tables from validation (e.g., temporary tables):

```bash
# Edit validate-schema.sh
# In compare_schemas(), add exclusion logic:

if [[ "$table_name" == "temp_"* ]] || [[ "$table_name" == "backup_"* ]]; then
    log_info "Skipping excluded table: $table_name"
    continue
fi
```

---

## 📚 Related Documentation

- `docs/DEPLOYMENT_PROXMOX.md` - Full deployment guide
- `docs/MASTER_GUIDE.md` - System architecture
- `backend/src/database/migrations/README.md` - Migration guidelines
- `PRE_PRODUCTION_CHECKLIST.md` - Pre-deployment checklist

---

## 🆘 Getting Help

If validation fails and you're not sure how to fix it:

1. **Review the validation report** - saved to `schema-validation-*.txt`
2. **Check migration history** - `ls backend/src/database/migrations/`
3. **Compare with sandbox** - `./scripts/validate-schema.sh sandbox`
4. **Check migration logs** - on production server
5. **Consult MASTER_GUIDE.md** - database section

**Emergency contacts:**
- DevOps issues: Check deployment logs
- Database issues: Connect to production and run `\dt` to list tables
- Migration issues: Review migration files for errors

---

## ✅ Best Practices

1. **Always validate before deployment**
   - Never deploy without schema validation
   - Treat validation failure as a blocker

2. **Keep migrations in sync**
   - Every database change should have a migration
   - Never modify production schema manually without a migration

3. **Test migrations on sandbox first**
   ```bash
   # Deploy to sandbox
   ./deploy-sandbox.sh
   
   # Validate sandbox
   ./scripts/validate-schema.sh sandbox
   
   # If passed, deploy to production
   ./DEPLOY_TO_PRODUCTION.sh
   ```

4. **Document manual changes**
   - If emergency requires manual change, create migration immediately
   - Document in CHANGELOG.md

5. **Regular audits**
   - Run weekly schema audits
   - Compare production and sandbox schemas
   - Keep audit trail

---

**Last Updated:** November 6, 2025  
**Script Version:** 1.27.15  
**Status:** ✅ Production Ready

