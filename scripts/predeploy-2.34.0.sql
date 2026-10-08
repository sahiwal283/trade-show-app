-- predeploy-2.34.0.sql
--
-- Run ONCE, as the postgres superuser, on the production database, BEFORE the
-- 2.34.0 backend starts. On the database container:
--
--   su postgres -c "psql -X -v ON_ERROR_STOP=1 -d expense_app_production -f /tmp/predeploy-2.34.0.sql"
--
-- Why: production's schema has drifted from the migrations. Some tables are
-- owned by postgres rather than the app's role, and migrate.ts skips a
-- migration it lacks the privilege to run (error 42501) without failing. Left
-- to the app, 2.34.0 could start with no page_views table, an audit_logs table
-- it cannot write to, and log tables it cannot prune. This script applies
-- migrations 047 and 048 with the privilege they need, hands the app's role
-- what it must own or be granted, and records both migrations as applied so
-- the backend does not try them again.
--
-- Safe to run more than once: every statement is idempotent and nothing fails
-- if things are already correct. It reads no table data and prints none. It
-- is one transaction, so a failure leaves the database as it was.
--
-- The app's role defaults to trade_show_app_prod; elsewhere pass
--   -v app_role=<role>
--
-- Sections 1 and 3 are copies of the migration files.
-- backend/tests/unit/predeploy-script.test.ts fails if they drift apart.

\if :{?app_role}
\else
  \set app_role trade_show_app_prod
\endif

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Migration 047_create_page_views.sql
-- ---------------------------------------------------------------------------

-- Migration 047: page_views
-- One row each time a signed-in user opens a screen. Feeds the developer
-- dashboard's Usage tab. Rows are deleted after 90 days by RetentionJob.

CREATE TABLE IF NOT EXISTS page_views (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  page VARCHAR(64) NOT NULL,
  device VARCHAR(10) NOT NULL CHECK (device IN ('mobile', 'desktop')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_page_views_created_at ON page_views (created_at);
CREATE INDEX IF NOT EXISTS idx_page_views_user_created ON page_views (user_id, created_at DESC);

COMMENT ON TABLE page_views IS 'Screen opens by signed-in users; 90-day retention';

-- ---------------------------------------------------------------------------
-- 2. The app owns page_views. Ownership carries the BIGSERIAL sequence with
--    it, so inserts work.
-- ---------------------------------------------------------------------------

ALTER TABLE page_views OWNER TO :"app_role";

-- ---------------------------------------------------------------------------
-- 3. Migration 048_ensure_audit_logs_shape.sql
-- ---------------------------------------------------------------------------

-- Migration 048: make sure audit_logs has the shape the code writes and reads
--
-- Why this exists: audit_logs was deployed to production by hand before
-- migration 004 was written, and migrate.ts skips a migration it lacks the
-- privilege to run (error 42501) without failing. So a database can hold an
-- audit_logs table that is missing columns the audit middleware inserts, or
-- whose status check predates the 'warning' value written for 4xx responses.
-- Either one makes every audit insert fail, quietly, since audit failures are
-- swallowed on purpose.
--
-- Every statement is idempotent and none depends on how the table was first
-- created. Existing columns keep their type: an ip_address that is VARCHAR
-- stays VARCHAR, and the dev dashboard reads it as text for that reason.

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50),
  entity_id UUID,
  details JSONB,
  ip_address INET,
  user_agent TEXT,
  status VARCHAR(20) DEFAULT 'success' CHECK (status IN ('success', 'failure', 'warning')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  user_name VARCHAR(255),
  user_email VARCHAR(255),
  user_role VARCHAR(50),
  request_method VARCHAR(10),
  request_path VARCHAR(500),
  changes JSONB,
  error_message TEXT
);

ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_name VARCHAR(255);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_email VARCHAR(255);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_role VARCHAR(50);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS entity_type VARCHAR(50);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS entity_id UUID;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'success';
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS ip_address INET;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS request_method VARCHAR(10);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS request_path VARCHAR(500);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS changes JSONB;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS details JSONB;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

-- The status check is replaced, not trusted: an older one may not allow
-- 'warning'. NOT VALID means existing rows are not examined, so a row holding
-- some other value cannot fail this migration; new rows are still checked.
-- audit_log_status_check is the same constraint under the table's old singular
-- name, left behind wherever the rename in migration 023 did not run.
DO $$
BEGIN
  ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_status_check;
  ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_log_status_check;
  ALTER TABLE audit_logs
    ADD CONSTRAINT audit_logs_status_check CHECK (status IN ('success', 'failure', 'warning')) NOT VALID;
END $$;

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- ---------------------------------------------------------------------------
-- 4. The app can read, write and prune the dashboard's tables whoever owns them.
-- ---------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE, DELETE ON audit_logs, api_requests, user_sessions, page_views TO :"app_role";

-- ---------------------------------------------------------------------------
-- 5. ...and use the sequences behind their id columns.
-- ---------------------------------------------------------------------------

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO :"app_role";

-- ---------------------------------------------------------------------------
-- 6. Record both migrations as applied, in the form migrate.ts writes
--    (version = the file name). A database with no tracking table is left
--    alone: migrate.ts then re-runs every file anyway, and both are idempotent.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    INSERT INTO schema_migrations (version, applied_at)
    VALUES ('047_create_page_views.sql', CURRENT_TIMESTAMP),
           ('048_ensure_audit_logs_shape.sql', CURRENT_TIMESTAMP)
    ON CONFLICT (version) DO NOTHING;
  END IF;
END $$;

COMMIT;
