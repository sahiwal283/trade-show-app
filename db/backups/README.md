# Backup and Restore Procedures

## Backup Configuration

- **Service:** `trade-show-db-backup.service`
- **Timer:** `trade-show-db-backup.timer` (runs daily at 2 AM)
- **Script:** `/usr/local/bin/trade-show-db-backup.sh`
- **Environment:** `/etc/trade-show-app/backup.env`
- **Backup location (container):** `/var/backups/trade-show-app/`
- **Off-host location:** [Configure rsync/scp to NAS or S3]
- **Retention:** 14 days

## Manual Backup

```bash
pct exec 2320 -- sudo -u postgres pg_dump \
  -d expense_app_production \
  --format=custom \
  --file=/var/backups/trade-show-app/manual_$(date +%Y%m%d_%H%M%S).dump
```

## Restore Procedure

### For restoring into an EXISTING database (disaster recovery)

```bash
pct exec 2320 -- sudo -u postgres pg_restore \
  --dbname=expense_app_production \
  --verbose \
  --clean \
  --if-exists \
  /var/backups/trade-show-app/<backup_file>.dump
```

**Note:** `--clean --if-exists` drops existing objects before restore.

### For first-time restore into a brand-new empty database

Omit `--clean --if-exists`:

```bash
pct exec 2320 -- sudo -u postgres pg_restore \
  --dbname=expense_app_production \
  --verbose \
  --no-owner \
  /var/backups/trade-show-app/<backup_file>.dump
```

## Integrity Verification

After restore, verify:

1. **Table counts match expected values:**
```sql
SELECT 'users' as table_name, COUNT(*) FROM users
UNION ALL SELECT 'events', COUNT(*) FROM events
UNION ALL SELECT 'expenses', COUNT(*) FROM expenses;
```

2. **Recent records exist:**
```sql
SELECT id, merchant, amount, created_at 
FROM expenses 
ORDER BY created_at DESC 
LIMIT 5;
```

3. **Foreign key relationships are intact:**
```sql
SELECT COUNT(*) as orphaned_expenses 
FROM expenses e 
LEFT JOIN users u ON e.user_id = u.id 
WHERE u.id IS NULL;
-- Should return 0
```

## Backup Role

Backups use a dedicated read-only role (`trade_show_backup_prod`) following the principle of least privilege. This role cannot modify data.

## Future Enhancements

- **WAL-based backups:** For stricter RPO requirements, consider implementing point-in-time recovery using WAL file archiving or tools like pgBackRest.
- **Off-host replication:** Configure off-host backup sync (rsync/scp to NAS or S3).

## Log Rotation

PostgreSQL logs are located in `/var/log/postgresql/`. Monitor disk usage and ensure log rotation is configured to prevent disk fill.

## Pulling Backups Off-Host

Example rsync command (add to backup script):

```bash
rsync -avz /var/backups/trade-show-app/ user@nas.local:/backups/trade-show-app/
```

