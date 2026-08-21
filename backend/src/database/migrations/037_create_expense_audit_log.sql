-- Migration: create the expense_audit_log table ExpenseAuditService writes to
-- Description: ExpenseAuditService has always targeted expense_audit_log, but
--   no migration ever created it, so every audit write in production failed
--   silently (the service intentionally swallows errors) and GET
--   /api/expenses/:id/audit returned an empty trail. expense_id is a plain
--   UUID with NO foreign key: expenses now live in the Midas store
--   (EXPENSE_BACKEND=midas), so the ids referenced here are not rows in the
--   local, stale expenses table.
-- Version: 2.16.4
-- Date: August 21, 2026

CREATE TABLE IF NOT EXISTS expense_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id UUID NOT NULL,
  user_id UUID,
  user_name VARCHAR(255) NOT NULL,
  action VARCHAR(50) NOT NULL,
  changes JSONB NOT NULL DEFAULT '{}'::jsonb,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_expense_audit_log_expense
  ON expense_audit_log (expense_id, timestamp DESC);

COMMENT ON TABLE expense_audit_log IS
  'Expense-level audit trail (created/updated/status_changed/...). expense_id references the Midas store, not the local expenses table.';
