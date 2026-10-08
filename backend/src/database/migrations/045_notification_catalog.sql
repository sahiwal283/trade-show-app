-- Migration: Notification catalog
-- Description: One send-once ledger for every scheduled reminder (event,
--   expense and flight), replacing the flight-only travel_reminders ledger,
--   plus a marker so a badge scan that failed for good notifies its scanner
--   exactly once.
-- Version: 2.32.0
-- Date: October 8, 2026

CREATE TABLE IF NOT EXISTS notification_reminders (
  kind        TEXT NOT NULL,
  subject_id  TEXT NOT NULL,   -- event uuid, or flight id for flight reminders
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, subject_id, user_id)
);

COMMENT ON TABLE notification_reminders IS
  'Send-once ledger: a row is claimed before a reminder is sent, so it fires once per kind, subject and user';

-- Carry the flight ledger over so nobody is re-reminded on deploy.
INSERT INTO notification_reminders (kind, subject_id, user_id, sent_at)
SELECT 'reminder.flight_' || r.kind,   -- checkin_24h, departure_3h
       r.flight_id::text, f.attendee_id, r.sent_at
FROM travel_reminders r
JOIN checklist_flights f ON f.id = r.flight_id
WHERE f.attendee_id IS NOT NULL
ON CONFLICT DO NOTHING;

ALTER TABLE badge_scans ADD COLUMN IF NOT EXISTS crm_failure_notified_at TIMESTAMPTZ;

COMMENT ON COLUMN badge_scans.crm_failure_notified_at IS
  'When the scanner was told this lead failed to reach the CRM for good; NULL means not yet told';

-- Scans that had already failed for good before this release are history,
-- not news: mark them told so the first pass after deploy stays quiet.
UPDATE badge_scans
   SET crm_failure_notified_at = now()
 WHERE crm_status = 'failed' AND crm_attempts >= 5 AND crm_failure_notified_at IS NULL;
