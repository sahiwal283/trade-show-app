-- Migration: Repair users_role_check to include ALL system roles
-- Description: 002 added 'temporary', but 010 (developer) recreated the
--   constraint from a stale list and dropped it again — since then no
--   database that ran 002→010 in order can create temporary users
--   (INSERT fails on users_role_check). 013's conditional branch was worse
--   still. This recreates the constraint with the full system-role list
--   from the roles table.
--
-- Known limitation (pre-existing design conflict, not addressed here):
--   custom roles created via the Admin UI live in the roles table but any
--   hardcoded CHECK will reject assigning them to users. Fixing that needs
--   a UNIQUE(name) on roles + FK, done deliberately in a future migration.
-- Version: 1.55.0
-- Date: July 24, 2026

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'accountant', 'coordinator', 'salesperson', 'developer', 'pending', 'temporary'));
