-- Migration: show_summaries — aggregate trade-show cost totals
-- Description: One row per show × year × company × category. Holds imported
--   historical totals (accountant's workbook) alongside nothing else — live
--   shows compute the same shape on the fly from expenses. Deliberately NOT
--   linked to the expenses table: history has no line items.
-- Version: 1.56.0
-- Date: July 24, 2026

CREATE TABLE IF NOT EXISTS show_summaries (
    id SERIAL PRIMARY KEY,
    show_name VARCHAR(255) NOT NULL,
    show_key VARCHAR(255) NOT NULL,
    year INTEGER NOT NULL,
    company VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL,
    amount NUMERIC(12,2) NOT NULL,
    source VARCHAR(20) NOT NULL DEFAULT 'imported',
    city VARCHAR(255),
    start_date DATE,
    end_date DATE,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (show_key, year, company, category, source)
);

CREATE INDEX IF NOT EXISTS idx_show_summaries_year ON show_summaries(year);
CREATE INDEX IF NOT EXISTS idx_show_summaries_key ON show_summaries(show_key);

COMMENT ON TABLE show_summaries IS
  'Aggregate show totals (imported history + comparison layer). show_key joins the same show across years.';
