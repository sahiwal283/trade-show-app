# Database Operations

> **Authoritative schema evolution is maintained in `backend/src/database` migrations; `/db` is for operational runbooks, backups, and schema snapshots only.**

## Container Reference

| Environment | Container ID | Hostname | IP Address | Database Name |
|-------------|-------------|----------|------------|---------------|
| Production | 2320 | trade-show-db-prod | 192.168.1.152 | expense_app_production |
| Sandbox | 2300 | trade-show-db-sandbox | 192.168.1.151 | expense_app_sandbox |

## PostgreSQL Configuration

| Environment | Version | Port | Collation |
|-------------|---------|------|-----------|
| Production (2320) | 16.11 | 5432 | C (POSIX) |
| Sandbox (2300) | 16.11 | 5432 | C (POSIX) |

> ⚠️ **IP Note:** Do not assume IPs from historical plans — always verify with `pct config <container_id>` or `ip addr show eth0`.

## Database Roles

### Application Roles

| Environment | Role Name | Purpose |
|-------------|-----------|---------|
| Production | `trade_show_app_prod` | Application database user |
| Sandbox | `trade_show_app_sandbox` | Application database user |

### Backup Roles (Read-Only)

| Environment | Role Name | Purpose |
|-------------|-----------|---------|
| Production | `trade_show_backup_prod` | Backup operations only |
| Sandbox | `trade_show_backup_sandbox` | Backup operations only |

## Migrations

All schema migrations are managed by the application:
- **Location:** `backend/src/database/migrations/`
- **Runner:** `backend/src/database/migrate.ts`
- **Seeds:** `backend/src/database/seed.ts`

See `migrations/README.md` for details.

## Backups

- **Schedule:** Daily at 2 AM UTC
- **Retention:** 14 days
- **Location (container):** `/var/backups/trade-show-app/`
- **Off-host:** [Configure as needed]

See `backups/README.md` for procedures.

## Schema Snapshots

To generate a schema-only dump for reference:

```bash
pct exec 2320 -- sudo -u postgres pg_dump -s expense_app_production > db/schema/expense_app.sql
```

Note: Schema dumps are gitignored. They are for auditing/reference only.

## New Environment Bootstrap

1. Create new PostgreSQL container
2. Install PostgreSQL 16
3. Create database and application role
4. Run migrations: `cd backend && npm run db:migrate`
5. Run seeds: `cd backend && npm run db:seed`
6. Update backend `.env` to point to new database

## Version History

- **1.0.0** - Initial database infrastructure extraction to dedicated containers

## Storage

- Production container uses `local-lvm` storage
- Data directory: `/var/lib/postgresql/16/main`

