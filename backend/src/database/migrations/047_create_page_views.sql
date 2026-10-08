-- Migration 047: page_views
-- One row each time a signed-in user opens a screen. Feeds the developer
-- dashboard's Usage tab. Rows are deleted after 90 days by RetentionJob.

CREATE TABLE IF NOT EXISTS page_views (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  page VARCHAR(64) NOT NULL,
  device VARCHAR(10) NOT NULL CHECK (device IN ('mobile', 'desktop')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_page_views_created_at ON page_views (created_at);
CREATE INDEX IF NOT EXISTS idx_page_views_user_created ON page_views (user_id, created_at DESC);

COMMENT ON TABLE page_views IS 'Screen opens by signed-in users; 90-day retention';
