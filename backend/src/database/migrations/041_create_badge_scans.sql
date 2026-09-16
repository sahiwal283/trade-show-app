-- Migration: badge_scans — PDF417 attendee badges scanned at the booth
-- Description: One row per scanned badge. raw_payload is never discarded:
--   parsers improve, barcodes do not, so any scan can be re-parsed later
--   without re-scanning. entity is part of the dedupe key because two brands
--   sharing a booth may both legitimately claim the same attendee — those are
--   two leads bound for two different CRMs, not a duplicate. brand is
--   nullable: companies with no Zoho destination still capture leads, stored
--   crm_status 'skipped'. client_scan_id is present from day one because
--   offline clients replay the queue.
-- Version: 2.23.0
-- Date: September 16, 2026

CREATE TABLE IF NOT EXISTS badge_scans (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id            UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  scanned_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  entity              VARCHAR(255) NOT NULL,
  brand               VARCHAR(50),
  client_scan_id      UUID UNIQUE,
  raw_payload         TEXT NOT NULL,
  payload_hash        TEXT NOT NULL,
  barcode_format      VARCHAR(20) NOT NULL DEFAULT 'PDF417',
  parser_version      VARCHAR(20),
  parse_confidence    NUMERIC(3,2),
  badge_id            VARCHAR(100),
  salutation          VARCHAR(50),
  first_name          VARCHAR(255),
  last_name           VARCHAR(255),
  title               VARCHAR(255),
  company             VARCHAR(255),
  email               VARCHAR(255),
  phone               VARCHAR(50),
  city                VARCHAR(100),
  state               VARCHAR(100),
  postal_code         VARCHAR(20),
  country             VARCHAR(100),
  attendee_type       VARCHAR(50),
  fields              JSONB,
  notes               TEXT,
  crm_status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                        CHECK (crm_status IN ('pending','synced','failed','skipped')),
  crm_record_id       TEXT,
  crm_error           TEXT,
  crm_attempts        INTEGER NOT NULL DEFAULT 0,
  crm_last_attempt_at TIMESTAMPTZ,
  scanned_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT badge_scans_event_entity_payload_unique
    UNIQUE (event_id, entity, payload_hash)
);

CREATE INDEX IF NOT EXISTS idx_badge_scans_event ON badge_scans(event_id);
CREATE INDEX IF NOT EXISTS idx_badge_scans_crm_status ON badge_scans(crm_status, brand);
CREATE INDEX IF NOT EXISTS idx_badge_scans_scanned_by ON badge_scans(scanned_by);

COMMENT ON TABLE badge_scans IS
  'PDF417 attendee badges scanned at the booth. raw_payload is authoritative and never discarded.';
COMMENT ON COLUMN badge_scans.entity IS
  'Company the rep represented, from the entityOptions picklist. Part of the dedupe key.';
COMMENT ON COLUMN badge_scans.brand IS
  'Normalized routing key from ENTITY_TO_BRAND; NULL means no Zoho destination (crm_status skipped).';
COMMENT ON COLUMN badge_scans.fields IS
  'Every parsed token as {index, value, mappedTo}, including tokens the parser could not map.';
