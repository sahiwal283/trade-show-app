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
