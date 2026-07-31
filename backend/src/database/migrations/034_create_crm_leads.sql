-- Migration: crm_leads — Zoho CRM tradeshow leads, one row per CRM record
-- Description: Mirror of the Zoho CRM "Tradeshows" custom module (leads
--   collected at trade shows). Synced by ZohoCrmLeadsService; show_key uses
--   the same normalization as show_summaries so leads join cost tiles by
--   (show_key, year). payload keeps the full CRM record for later remapping.
-- Version: 2.5.1
-- Date: July 31, 2026

CREATE TABLE IF NOT EXISTS crm_leads (
    id SERIAL PRIMARY KEY,
    crm_record_id TEXT UNIQUE NOT NULL,
    show_tag TEXT,
    show_key TEXT,
    year INTEGER,
    company TEXT,
    email TEXT,
    first_name TEXT,
    last_name TEXT,
    owner TEXT,
    email_opened BOOLEAN DEFAULT false,
    email_bounced BOOLEAN DEFAULT false,
    converted BOOLEAN DEFAULT false,
    created_time TIMESTAMPTZ,
    payload JSONB,
    synced_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_leads_show_year ON crm_leads(show_key, year);

COMMENT ON TABLE crm_leads IS
  'Zoho CRM tradeshow leads (CustomModule1 mirror). show_key + year joins show_summaries tiles.';
