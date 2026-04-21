-- Migration: Create Schema Migrations Tracking Table
-- Description: Tracks which migrations have been applied to enable explicit migration tracking
-- Version: 1.28.0
-- Date: November 12, 2025
-- 
-- This table replaces the error-code-based migration skipping approach with explicit tracking.
-- Benefits:
-- - Faster deployments (only new migrations run)
-- - Clear visibility of applied migrations
-- - More reliable than error handling
-- - Better for production environments

-- Create schema migrations tracking table
CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(255) PRIMARY KEY,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_schema_migrations_applied_at ON schema_migrations(applied_at DESC);

-- Add table comment
COMMENT ON TABLE schema_migrations IS 'Tracks which database migrations have been applied to prevent re-running';
COMMENT ON COLUMN schema_migrations.version IS 'Migration filename (e.g., 002_add_temporary_role.sql)';
COMMENT ON COLUMN schema_migrations.applied_at IS 'Timestamp when migration was applied';




