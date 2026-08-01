-- Migration: crm_leads conversion columns — proven sales from Zoho Books
-- Description: LeadConversionService matches leads against Zoho Books
--   customers/invoices (brand nirvana_kulture) and records WHICH customer a
--   lead became, HOW it matched (email/company), and the invoice revenue it
--   produced. converted_source distinguishes automatic matches ('auto',
--   re-derived nightly) from human overrides ('manual', never touched by the
--   reconciler).
-- Version: 2.7.0
-- Date: July 31, 2026

ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS converted_customer_id TEXT;
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS converted_customer_name TEXT;
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS revenue NUMERIC DEFAULT 0;
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS converted_matched_by TEXT;
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS converted_source TEXT DEFAULT 'auto';
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ;

COMMENT ON COLUMN crm_leads.converted_customer_id IS
  'Zoho Books contact_id this lead converted into (null while unmatched)';
COMMENT ON COLUMN crm_leads.revenue IS
  'Sum of the matched Books customer''s invoice totals, excluding draft/void';
COMMENT ON COLUMN crm_leads.converted_matched_by IS
  'How the Books customer was matched: email | company';
COMMENT ON COLUMN crm_leads.converted_source IS
  'auto = nightly reconciler owns the row; manual = human override, never auto-touched';
