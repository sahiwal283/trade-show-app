-- 028_add_telegram_event_drafts.sql
-- Stores in-flight Telegram event creation wizards and participant pickers.

CREATE TABLE IF NOT EXISTS telegram_event_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  telegram_user_id BIGINT NOT NULL,
  chat_id BIGINT NOT NULL,
  prompt_message_id BIGINT,
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  name TEXT,
  venue TEXT,
  city TEXT,
  state VARCHAR(8),
  start_date DATE,
  end_date DATE,
  budget NUMERIC(12,2),
  participant_user_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  search_query TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'awaiting_name'
    CHECK (status IN (
      'awaiting_name',
      'awaiting_venue',
      'awaiting_city_state',
      'awaiting_start_date',
      'awaiting_end_date',
      'awaiting_budget',
      'awaiting_confirmation',
      'awaiting_participant_search',
      'created',
      'cancelled',
      'failed'
    )),
  last_error TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tg_event_drafts_user ON telegram_event_drafts(user_id);
CREATE INDEX IF NOT EXISTS idx_tg_event_drafts_tg_user ON telegram_event_drafts(telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_tg_event_drafts_chat ON telegram_event_drafts(chat_id);
CREATE INDEX IF NOT EXISTS idx_tg_event_drafts_status ON telegram_event_drafts(status);
CREATE INDEX IF NOT EXISTS idx_tg_event_drafts_updated_at ON telegram_event_drafts(updated_at DESC);
