-- backend/src/database/migrations/044_shared_sample_requests.sql
-- One sample request per event. Existing per-rep rows for the same event are
-- merged by summing quantities into the earliest row. Adds a server-written
-- change log so the puller can see who changed what.

-- ── 1. New columns ───────────────────────────────────────────────────────
ALTER TABLE sample_requests
  ADD COLUMN IF NOT EXISTS submitted_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_edited_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_edited_at TIMESTAMPTZ;

-- ── 2. Merge per-rep rows into one per event ─────────────────────────────
-- keeper = earliest created_at per event
CREATE TEMP TABLE sr_keeper AS
SELECT DISTINCT ON (event_id) id AS keeper_id, event_id
FROM sample_requests ORDER BY event_id, created_at ASC, id ASC;

-- items: sum per (event, product) into the keeper
WITH sums AS (
  SELECT k.keeper_id, i.product_id,
         SUM(i.singles)::int AS singles, SUM(i.displays)::int AS displays, SUM(i.empty_displays)::int AS empty_displays
  FROM sample_request_items i
  JOIN sample_requests sr ON sr.id = i.request_id
  JOIN sr_keeper k ON k.event_id = sr.event_id
  GROUP BY k.keeper_id, i.product_id
)
INSERT INTO sample_request_items (request_id, product_id, singles, displays, empty_displays)
SELECT keeper_id, product_id, singles, displays, empty_displays FROM sums
ON CONFLICT (request_id, product_id) DO UPDATE
  SET singles = EXCLUDED.singles, displays = EXCLUDED.displays, empty_displays = EXCLUDED.empty_displays;

-- materials: sum qty; notes = earliest non-blank by request created_at
WITH sums AS (
  SELECT k.keeper_id, m.material_id, SUM(m.qty)::int AS qty,
         (ARRAY_AGG(NULLIF(BTRIM(m.notes), '') ORDER BY sr.created_at ASC) FILTER (WHERE NULLIF(BTRIM(m.notes), '') IS NOT NULL))[1] AS notes
  FROM sample_request_materials m
  JOIN sample_requests sr ON sr.id = m.request_id
  JOIN sr_keeper k ON k.event_id = sr.event_id
  GROUP BY k.keeper_id, m.material_id
)
INSERT INTO sample_request_materials (request_id, material_id, qty, notes)
SELECT keeper_id, material_id, qty, notes FROM sums
ON CONFLICT (request_id, material_id) DO UPDATE
  SET qty = EXCLUDED.qty, notes = EXCLUDED.notes;

-- status / submitted / last edited onto the keeper
WITH agg AS (
  SELECT k.keeper_id,
         BOOL_OR(sr.status = 'submitted') AS any_submitted,
         MIN(sr.submitted_at) FILTER (WHERE sr.status = 'submitted') AS first_submitted_at,
         (ARRAY_AGG(sr.user_id ORDER BY sr.submitted_at ASC NULLS LAST) FILTER (WHERE sr.status = 'submitted'))[1] AS first_submitter,
         MAX(sr.updated_at) AS last_updated_at,
         (ARRAY_AGG(sr.user_id ORDER BY sr.updated_at DESC))[1] AS last_editor
  FROM sample_requests sr JOIN sr_keeper k ON k.event_id = sr.event_id
  GROUP BY k.keeper_id
  HAVING COUNT(*) > 1            -- single-row events keep their row untouched
)
UPDATE sample_requests s
SET status         = CASE WHEN a.any_submitted THEN 'submitted' ELSE s.status END,
    submitted_at   = COALESCE(a.first_submitted_at, s.submitted_at),
    submitted_by   = COALESCE(a.first_submitter, s.submitted_by),
    last_edited_at = a.last_updated_at,
    last_edited_by = a.last_editor
FROM agg a WHERE a.keeper_id = s.id;

DELETE FROM sample_requests s
USING sr_keeper k
WHERE k.event_id = s.event_id AND s.id <> k.keeper_id;

DROP TABLE sr_keeper;

-- ── 3. Reshape constraints and rename user_id → created_by ───────────────
ALTER TABLE sample_requests DROP CONSTRAINT IF EXISTS sample_requests_event_id_user_id_key;
ALTER TABLE sample_requests DROP CONSTRAINT IF EXISTS sample_requests_user_id_fkey;
ALTER TABLE sample_requests RENAME COLUMN user_id TO created_by;
ALTER TABLE sample_requests ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE sample_requests
  ADD CONSTRAINT sample_requests_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE sample_requests ADD CONSTRAINT sample_requests_event_id_key UNIQUE (event_id);
DROP INDEX IF EXISTS sample_requests_event_idx;  -- redundant with the unique constraint

-- ── 4. Change log ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sample_request_changes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id  UUID NOT NULL REFERENCES sample_requests(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('item', 'material')),
  target_id   UUID NOT NULL,
  field       TEXT NOT NULL CHECK (field IN ('singles', 'displays', 'empty_displays', 'qty', 'notes')),
  old_value   TEXT,
  new_value   TEXT,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sample_request_changes_request_idx ON sample_request_changes (request_id, changed_at DESC);
