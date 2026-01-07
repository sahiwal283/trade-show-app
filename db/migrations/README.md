# Migrations

All schema migrations are owned by the application:

- **Location:** `backend/src/database/migrations/`
- **Runner:** `backend/src/database/migrate.ts`
- **Tracking:** `schema_migrations` table in database

This folder exists for documentation only. **Do NOT add migration files here.**

## Running Migrations

```bash
cd backend
npm run db:migrate
```

## Creating New Migrations

Add a new `.sql` file to `backend/src/database/migrations/` with the naming convention:

```
NNN_description.sql
```

Where `NNN` is a zero-padded sequence number (e.g., `026_add_new_table.sql`).

## Migration Tracking

The `schema_migrations` table tracks which migrations have been applied:

```sql
SELECT version, applied_at FROM schema_migrations ORDER BY applied_at;
```

