-- Migration: badge_scans — partner webhook delivery status
-- Description: Nirvana Kulture receives each scan taken on its behalf as a
--   raw POST to its Zoho CRM function (BadgeWebhookService). Delivery is
--   tracked per row, like the CRM push, so a partner outage or a server
--   restart never silently drops a scan. Status meanings:
--     pending   - owed to the partner, not yet attempted (or URL not yet set)
--     delivered - partner acknowledged
--     failed    - attempted; retried with backoff up to five times
--     skipped   - not a webhook brand; never leaves the building
--   Rows that exist before this migration predate the integration and are
--   marked skipped rather than replayed at the partner.
-- Version: 2.25.0
-- Date: September 29, 2026

ALTER TABLE badge_scans
  ADD COLUMN IF NOT EXISTS webhook_status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (webhook_status IN ('pending','delivered','failed','skipped')),
  ADD COLUMN IF NOT EXISTS webhook_error TEXT,
  ADD COLUMN IF NOT EXISTS webhook_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS webhook_last_attempt_at TIMESTAMPTZ;

UPDATE badge_scans SET webhook_status = 'skipped';

CREATE INDEX IF NOT EXISTS idx_badge_scans_webhook_status
  ON badge_scans(webhook_status, brand);

COMMENT ON COLUMN badge_scans.webhook_status IS
  'Partner webhook delivery: pending | delivered | failed | skipped (not a webhook brand).';
