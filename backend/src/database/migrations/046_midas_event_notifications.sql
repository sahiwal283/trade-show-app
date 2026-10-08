-- Migration: Midas event notifications
-- Description: Expense notifications now arrive from Midas's event feed and
--   live in the general notifications table. source_event_id is the feed
--   event's id: a re-read page must not create a second bell row. Unread
--   rows from the old message-notification table are carried over so nobody
--   loses an unread message when the separate bell section is removed.
-- Version: 2.33.0
-- Date: October 8, 2026

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS source_event_id TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notifications_source_event_id_key') THEN
    ALTER TABLE notifications ADD CONSTRAINT notifications_source_event_id_key UNIQUE (source_event_id);
  END IF;
END $$;

COMMENT ON COLUMN notifications.source_event_id IS
  'Id of the external event this row was written for (Midas feed event id); NULL for notifications Argo raised itself';

INSERT INTO notifications (user_id, kind, title, body, link, source_event_id, created_at)
SELECT m.user_id,
       CASE WHEN m.request_type IS NOT NULL THEN 'expense.info_requested' ELSE 'expense.message' END,
       CASE WHEN m.request_type IS NOT NULL THEN 'More info needed on your expense' ELSE 'New message on your expense' END,
       m.sender_name || ': ' || m.body_snippet,
       CASE WHEN m.expense_ref_id IS NOT NULL
            THEN jsonb_build_object('page', 'expense', 'expenseId', m.expense_ref_id::text) END,
       'legacy-message:' || m.midas_message_id::text,
       m.message_created_at
FROM expense_message_notifications m
WHERE m.read_at IS NULL
ON CONFLICT (source_event_id) DO NOTHING;
