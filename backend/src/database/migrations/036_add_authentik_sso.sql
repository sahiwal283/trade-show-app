-- Migration: Authentik SSO identity columns on users
-- Description: authentik_sub stores the OIDC subject (Authentik user UUID,
--   provider sub_mode=user_uuid). sso_linked_at records when the identity was
--   linked (merge script, email auto-link, or auto-provision). last_sso_login
--   is bookkeeping for admins. All columns nullable — password login is
--   unaffected. Unique partial index: one app account per Authentik identity.
-- Version: 2.16.0
-- Date: August 19, 2026

ALTER TABLE users ADD COLUMN IF NOT EXISTS authentik_sub VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS sso_linked_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_sso_login TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_authentik_sub
  ON users (authentik_sub)
  WHERE authentik_sub IS NOT NULL;

COMMENT ON COLUMN users.authentik_sub IS
  'OIDC subject from Authentik (user UUID under sub_mode=user_uuid); null = never linked';
COMMENT ON COLUMN users.sso_linked_at IS
  'When the Authentik identity was linked (merge script, email auto-link, or auto-provision)';
