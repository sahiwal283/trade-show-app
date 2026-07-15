-- Migration: Add Push Subscriptions Table
-- Description: Stores Web Push subscriptions so users can receive booking notifications
-- Version: 1.46.0
-- Date: July 15, 2026
--
-- Each row is one browser/device subscription. A user may have multiple subscriptions
-- (phone, laptop, etc.). Subscriptions are removed when the push service reports the
-- endpoint is gone (404/410) or when the user disables notifications.

CREATE TABLE IF NOT EXISTS push_subscriptions (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint TEXT UNIQUE NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id);

-- Add table and column comments
COMMENT ON TABLE push_subscriptions IS 'Web Push subscriptions per user device/browser';
COMMENT ON COLUMN push_subscriptions.user_id IS 'User who owns this push subscription';
COMMENT ON COLUMN push_subscriptions.endpoint IS 'Unique push service endpoint URL for this subscription';
COMMENT ON COLUMN push_subscriptions.p256dh IS 'Client public key used to encrypt push payloads';
COMMENT ON COLUMN push_subscriptions.auth IS 'Client auth secret used to encrypt push payloads';
COMMENT ON COLUMN push_subscriptions.user_agent IS 'User agent string captured when the subscription was created';
