-- Migration: Flight departure time + travel reminder tracking
-- Description: Adds departure_at to checklist flights so the reminder
--   scheduler can push "check in now" (T-24h) and "flight today" (T-3h)
--   notifications. travel_reminders records what was already sent so a
--   reminder fires exactly once per flight per kind, across restarts.
-- Version: 1.52.0
-- Date: July 23, 2026

ALTER TABLE checklist_flights
  ADD COLUMN IF NOT EXISTS departure_at TIMESTAMPTZ;

COMMENT ON COLUMN checklist_flights.departure_at IS
  'Scheduled departure (with timezone). Drives check-in push reminders.';

CREATE TABLE IF NOT EXISTS travel_reminders (
    id SERIAL PRIMARY KEY,
    flight_id INTEGER NOT NULL REFERENCES checklist_flights(id) ON DELETE CASCADE,
    kind VARCHAR(30) NOT NULL,
    sent_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (flight_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_travel_reminders_flight_id ON travel_reminders(flight_id);

COMMENT ON TABLE travel_reminders IS
  'One row per reminder actually sent (kind: checkin_24h, departure_3h) — the send-once ledger';
