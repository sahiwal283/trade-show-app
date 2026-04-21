# Database Migrations Index

**Execution Order:** Alphabetical (based on filename prefix)

## Migration History

| ID | Filename | Description | Status |
|----|----------|-------------|--------|
| 001 | *missing* | Initial schema (in schema.sql) | ✅ Applied |
| 002 | `002_add_temporary_role.sql` | Add temporary user role | ✅ Applied |
| 003 | `003_create_roles_table.sql` | Create roles table for dynamic role management | ✅ Applied |
| 004 | `004_create_audit_log.sql` | Create audit_logs table for comprehensive audit logging | ✅ Applied |
| 005 | *missing* | *(skipped sequence number)* | - |
| 006 | `006_create_ocr_corrections_table.sql` | Create OCR corrections table for ML feedback | ✅ Applied |
| 007 | `007_enhance_ocr_corrections_for_cross_environment.sql` | Add cross-environment sync for OCR training | ✅ Applied |
| 008 | `008_create_user_sessions_table.sql` | Create user_sessions table for session tracking | ✅ Applied |
| 009 | `009_create_api_requests_table.sql` | Create api_requests table for API analytics | ✅ Applied |
| 010 | `010_add_developer_role.sql` | Add developer role for DevDashboard access | ✅ Applied |
| 011 | `011_add_offline_sync_support.sql` | Add offline sync columns to expenses table | ✅ Applied |
| 012 | `012_add_pending_role.sql` | Add pending role for new user registrations | ✅ Applied |
| 013 | `013_add_pending_user_role.sql` | Update pending user role constraints | ✅ Applied |
| 014 | `014_add_zoho_expense_id.sql` | Add zoho_expense_id column for Zoho integration | ✅ Applied |
| 015 | `015_fix_needs_further_review_status.sql` | Fix expense status for needs_further_review | ✅ Applied |
| 016 | `016_add_show_and_travel_dates.sql` | Add show dates and travel dates to events table | ✅ Applied |
| 017 | `017_add_event_checklist.sql` | Create event checklist tables (flights, hotels, rentals, shipping) | ✅ Applied |
| 018 | `018_add_custom_checklist_items.sql` | Add custom checklist items per event | ✅ Applied |
| 019 | `019_add_checklist_templates.sql` | Add checklist templates for default tasks | ✅ Applied |
| 020 | `020_add_metadata_to_api_requests.sql` | Add metadata columns to api_requests table | ✅ Applied |
| 021 | `021_add_booth_map.sql` | Add booth_map_url to event_checklists | ✅ Applied |
| 022 | `022_add_car_rental_assignment.sql` | Add rental_type and assignment fields to car rentals | ✅ Applied |
| 023 | `023_fix_audit_log_table_name.sql` | Rename audit_log to audit_logs to match code expectations | ✅ Applied |
| 024 | `024_create_user_checklist_items.sql` | Create user-facing checklist items table (guidelines, packing lists) | ✅ Applied |
| 025 | `025_create_schema_migrations_table.sql` | Create migration tracking table for explicit migration management | ✅ Applied |
| 026 | `026_add_telegram_integration.sql` | Add Telegram account linking tables and one-time link tokens | ✅ Applied |

## Notes

- **Missing 001:** Base schema is in `schema.sql`, not a separate migration
- **Missing 005:** Sequence number was skipped (unknown reason)
- **Migration Safety:** All migrations use `IF NOT EXISTS` or similar checks to be idempotent
- **Rollback:** Migrations do not have automatic rollback. Manual SQL required for reversions.

## ⚠️ Critical Incident: audit_logs Schema Mismatch (Nov 10, 2025)

**Issue:** Production deployed with table name `audit_logs` (plural) but migration 004 originally created `audit_log` (singular). This caused a critical production login failure.

**Root Cause:** Migration was manually modified in production without updating the source migration file.

**Resolution:**
- Added 7 missing columns to production `audit_logs` table
- Updated migration 004 to match production schema exactly
- Added comprehensive documentation and comments

**Lessons Learned:**
1. ✅ **NEVER manually modify production schema** without updating migrations first
2. ✅ **ALWAYS test migrations in sandbox** before production deployment
3. ✅ **RUN pre-deployment schema checks** to detect mismatches
4. ✅ **Document any production hotfixes** immediately in migration files

## Adding New Migrations

1. **Filename Format:** `NNN_descriptive_name.sql` (e.g., `026_add_new_feature.sql`)
2. **Sequential Numbering:** Use next available number (currently 027)
3. **Idempotency:** Always use `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE IF NOT EXISTS`, etc.
4. **Testing:** Test on sandbox database before production
5. **Documentation:** Update this README with description
6. **Schema Verification:** Run pre-deployment schema check before deploying
7. **Table Naming:** Use consistent naming convention (check existing tables first)

## Migration Execution

Migrations are executed by `backend/src/database/migrate.ts`:

```bash
# Run all pending migrations
cd backend && npm run migrate

# Or manually
ts-node src/database/migrate.ts
```

### Migration Tracking System (Migration 025+)

**New System:** Explicit migration tracking via `schema_migrations` table.

**How It Works:**
1. Migration 025 creates `schema_migrations` tracking table
2. `migrate.ts` checks tracking table before running migrations
3. Only migrations not in tracking table are executed
4. Each successfully applied migration is recorded in tracking table

**Benefits:**
- ✅ Faster deployments (only new migrations run)
- ✅ Clear visibility of applied migrations
- ✅ More reliable than error-code handling
- ✅ Better for production environments

**Backward Compatibility:**
- System works with or without tracking table
- Fresh databases: Uses legacy error-code approach until migration 025 runs
- Existing databases: After migration 025, uses explicit tracking

**Marking Existing Migrations:**
For existing databases, run the one-time script to mark migrations 002-024 as applied:

```bash
ts-node src/database/scripts/mark-existing-migrations.ts
```

This prevents re-running old migrations on databases that already have them applied.

## Best Practices (Preventing Schema Mismatches)

### Before Creating a Migration:
1. ✅ Check production schema to verify table names and existing columns
2. ✅ Review code to understand exact column requirements
3. ✅ Use descriptive comments explaining the purpose of each change

### Before Deploying:
1. ✅ Test migration in sandbox environment first (Container 203)
2. ✅ Run schema comparison tool to detect mismatches
3. ✅ Verify code expectations match migration output
4. ✅ Review migration with Database Agent or senior developer

### Emergency Production Fixes:
1. ✅ Document the issue immediately in this README
2. ✅ Update the source migration file to match production
3. ✅ Create a post-incident report
4. ✅ Add preventive measures to deployment checklist

### Schema Verification Command:
```bash
# Compare migration output with production schema
npm run schema:check

# Or manually check a specific table
ssh root@192.168.1.190 "pct exec 201 -- sudo -u postgres psql expense_app_production -c '\\d table_name'"
```

**Last Updated:** November 10, 2025 (Post-Incident Documentation)

