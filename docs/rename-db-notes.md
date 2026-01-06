# Database References Found During Rename

The following database identifiers contain 'expense' but were NOT renamed during the project rename from `expenseApp` to `trade-show-app`.

**Reason:** Database renames are risky and out of scope for this project rename. The application code uses environment variables for database connection, so these names don't need to match the project name.

## Database User and Name

The PostgreSQL database uses:
- **Database name:** `expenseapp`
- **Database user:** `expenseapp`

These are found in:
- `backend/scripts/retrain_from_corrections.ts` (default values when env vars not set)
- `PRODUCTION_DEPLOY_v1.27.6.sh` (pg_dump/psql commands)

## Recommendation

If you want to rename the database in the future:
1. Create new database `trade_show_app`
2. Migrate data using pg_dump/pg_restore
3. Update all `.env` files with new credentials
4. Update container environment files
5. Test thoroughly before switching production

This is a separate, significant operation and should be planned independently.

---
*Generated during rename: expenseApp → trade-show-app*

