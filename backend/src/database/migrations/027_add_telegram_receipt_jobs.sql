-- 027_add_telegram_receipt_jobs.sql
-- Tracks in-flight Telegram receipt uploads through OCR, event assignment,
-- field edits, and final expense creation.

CREATE TABLE IF NOT EXISTS telegram_receipt_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  telegram_user_id BIGINT NOT NULL,
  chat_id BIGINT NOT NULL,
  source_message_id BIGINT,
  prompt_message_id BIGINT,
  photo_file_id TEXT,
  receipt_path VARCHAR(500),
  receipt_url VARCHAR(500),
  ocr_raw JSONB,
  amount NUMERIC(12,2),
  merchant TEXT,
  expense_date DATE,
  category VARCHAR(100),
  location TEXT,
  card_used VARCHAR(255) NOT NULL DEFAULT 'Personal Card (Reimbursement)',
  reimbursement_required BOOLEAN NOT NULL DEFAULT TRUE,
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  candidate_event_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  status VARCHAR(50) NOT NULL DEFAULT 'ocr_pending'
    CHECK (status IN (
      'ocr_pending',
      'awaiting_event',
      'awaiting_confirmation',
      'awaiting_edit_amount',
      'awaiting_edit_merchant',
      'awaiting_edit_date',
      'awaiting_edit_category',
      'submitted',
      'cancelled',
      'failed'
    )),
  expense_id UUID REFERENCES expenses(id) ON DELETE SET NULL,
  last_error TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tg_receipt_jobs_user ON telegram_receipt_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_tg_receipt_jobs_tg_user ON telegram_receipt_jobs(telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_tg_receipt_jobs_chat ON telegram_receipt_jobs(chat_id);
CREATE INDEX IF NOT EXISTS idx_tg_receipt_jobs_status ON telegram_receipt_jobs(status);
CREATE INDEX IF NOT EXISTS idx_tg_receipt_jobs_updated_at ON telegram_receipt_jobs(updated_at DESC);
