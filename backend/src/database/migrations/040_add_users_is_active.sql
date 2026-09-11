-- Migration: soft-deactivation flag on users
-- Description: The admin UI only offered a hard DELETE, and users.id is the
--   join key for expenses living in the Midas store (external_user_id, no
--   foreign key), so deleting a person silently orphaned every expense they
--   ever filed while CASCADE-ing away their event participation and OCR
--   corrections. is_active gives admins a reversible alternative: an inactive
--   user cannot authenticate and is hidden from assignment pickers, but their
--   name still resolves on historical expenses, events and reports.
--   Deactivation events are recorded in audit_logs, not in extra columns here.
-- Version: 2.22.0
-- Date: September 11, 2026

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN users.is_active IS
  'False = deactivated: login is refused and the account is hidden from assignment pickers. Historical records still resolve the name.';
