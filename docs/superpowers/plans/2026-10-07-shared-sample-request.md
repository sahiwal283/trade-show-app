# Shared Sample Request Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the per-rep sample request (v2.30.0) into one shared request per event, edited row-by-row by anyone on the show, and move the Samples view onto the booking board.

**Architecture:** Migration 044 reshapes `sample_requests` to one row per event (merging existing per-rep rows by summing) and adds a server-written change log. The service collapses to event-scoped operations (`getForEvent`, `patchRows`, `submit`, `getHistory`). The frontend replaces the per-rep section, summary tab and hook with one `SamplesPanel` driven by `useEventSampleRequest`, which saves only dirty rows and reconciles untouched rows from the server on every response, poll and focus.

**Tech Stack:** Express + TypeScript + raw `pg` (backend), Vitest; React + Vite + Tailwind + Testing Library (frontend).

**Spec:** `docs/superpowers/specs/2026-10-07-shared-sample-request-design.md`

## Global Constraints

- One `sample_requests` row per event: `UNIQUE (event_id)`. Columns `created_by`, `submitted_by`, `last_edited_by` are nullable user refs with `ON DELETE SET NULL`.
- Close rule unchanged: 23:59:59 America/New_York on `(travel_start_date ?? show_start_date) − 10 days`, computed only by `backend/src/services/sampleRequests/sampleRequestWindow.ts` (`SAMPLE_CLOSE_DAYS_BEFORE = 10`).
- Read access: roster participants, override roles (`admin`, `coordinator`, `developer`), and the configured puller. Edit access: participants and override roles while open; override roles after close. A stranger gets 403.
- `PATCH` carries only changed rows; the server upserts row by row, deletes a row whose quantities are all 0 and notes blank, and writes one `sample_request_changes` row per field that actually changed, in the same transaction. A 400 writes nothing.
- Quantities are integers 0–10000 (`MAX_SAMPLE_QTY`); notes trimmed, ≤ 500 chars.
- Puller is notified on every submit/resubmit by anyone: first "New sample request · <show>", later "Sample request updated · <show>", body names the submitter. Notification failure never fails the submit.
- 48-hour reminder goes to every participant once per event, submitted or not.
- Dashboard: unsubmitted → amber/red countdown row (Start/Finish); submitted → stone "submitted · edit until <date>" row (Open). Both deep-link `#event=<id>&tab=samples`.
- Deep links: `tab=samples` opens the Samples board tab (admins) or the rep's Samples panel. `tab=my` unchanged.
- Version bumps to **2.31.0** in `package.json` and `backend/package.json`.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Backend tests: `cd backend && npx vitest run` (never `npm test`, it opens watch mode). Frontend: `npx vitest run <dir>` from the root; ~90 pre-existing failures live in files this work does not touch; judge by the directories touched.

## Review Focus

1. **Two people patch the same row within the same second** — both patches persist (later wins for that row), both appear in history, neither 500s. Test in Task 3 (sequential patches to one row from two actors).
2. **A patch arrives for a product retired after the form was opened** — accepted (inactive rows are valid), as in v2.30.0. Test in Task 3.
3. **The event's draft row does not exist yet when someone submits without ever typing** — submit creates the row and submits an empty form; the puller is notified. Test in Task 3.
4. **A rep's browser reconciles a poll while a field is focused** — the focused/dirty row keeps the local value; other rows update. Test in Task 7.
5. **The puller is not on the roster and is not an override role** — can read the panel and history, cannot edit; PATCH → 403. Test in Task 3 and Task 4.

---

### Task 1: Migration 044 — one request per event, change log, merge

**Files:**
- Create: `backend/src/database/migrations/044_shared_sample_requests.sql`
- Create: `backend/tests/integration/shared-sample-requests-schema.test.ts`

**Interfaces:**
- Produces: reshaped `sample_requests` (`created_by`, `submitted_by`, `last_edited_by`, `last_edited_at`, `UNIQUE (event_id)`), new `sample_request_changes`. Tasks 2–5 read these.

- [ ] **Step 1: Write the failing schema test**

```ts
// backend/tests/integration/shared-sample-requests-schema.test.ts
import { describe, it, expect, afterAll } from 'vitest';
import { pool, query } from '../../src/config/database';

/** Verifies migration 044 applied (migrate.ts silently skips on 42501). */
async function columnsOf(table: string): Promise<Set<string>> {
  const { rows } = await query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name = $1`,
    [table]
  );
  return new Set(rows.map((r: { column_name: string }) => r.column_name));
}

describe('shared sample requests schema (migration 044)', () => {
  afterAll(async () => { await pool.end(); });

  it('reshapes sample_requests to one row per event', async () => {
    const cols = await columnsOf('sample_requests');
    expect(cols.has('created_by')).toBe(true);
    expect(cols.has('user_id')).toBe(false);
    expect(cols.has('submitted_by')).toBe(true);
    expect(cols.has('last_edited_by')).toBe(true);
    expect(cols.has('last_edited_at')).toBe(true);
    const { rows } = await query(
      `SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'sample_requests'::regclass`
    );
    const defs = rows.map((r: { conname: string; def: string }) => `${r.conname}: ${r.def}`);
    expect(defs.some((d: string) => /UNIQUE \(event_id\)$/.test(d))).toBe(true);
    expect(defs.some((d: string) => /\(event_id, user_id\)/.test(d))).toBe(false);
    expect(defs.some((d: string) => /\(created_by\) REFERENCES users\(id\) ON DELETE SET NULL/.test(d))).toBe(true);
  });

  it('creates sample_request_changes with its index', async () => {
    const cols = await columnsOf('sample_request_changes');
    for (const c of ['request_id', 'user_id', 'kind', 'target_id', 'field', 'old_value', 'new_value', 'changed_at']) {
      expect(cols.has(c)).toBe(true);
    }
    const { rows } = await query(`SELECT indexname FROM pg_indexes WHERE tablename = 'sample_request_changes'`);
    expect(rows.map((r: { indexname: string }) => r.indexname)).toContain('sample_request_changes_request_idx');
  });

  it('merged any per-rep rows: no event has more than one request', async () => {
    const { rows } = await query(`SELECT event_id, count(*)::int AS n FROM sample_requests GROUP BY event_id HAVING count(*) > 1`);
    expect(rows).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && npx vitest run tests/integration/shared-sample-requests-schema.test.ts`
Expected: FAIL (`user_id` still present, no `UNIQUE (event_id)`).

- [ ] **Step 3: Write the migration**

```sql
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
```

Note on atomicity: open `backend/src/database/migrate.ts` and check whether each migration file runs inside a transaction. If it does not, wrap this file's statements in `BEGIN;` … `COMMIT;` so a failed merge cannot leave half-merged rows.

Note on names: migration 043 left the constraints unnamed, so Postgres named them `sample_requests_event_id_user_id_key` and `sample_requests_user_id_fkey`; the `DROP CONSTRAINT IF EXISTS` lines use those defaults. If the dev DB shows different names (`\d sample_requests`), use the actual names.

- [ ] **Step 4: Apply and verify**

Run: `cd backend && npm run migrate && npx vitest run tests/integration/shared-sample-requests-schema.test.ts`
Expected: 3 PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/database/migrations/044_shared_sample_requests.sql backend/tests/integration/shared-sample-requests-schema.test.ts
git commit -m "feat(sample-requests): migration 044 one request per event with change log and merge

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Backend types and repository for the shared request

**Files:**
- Modify: `backend/src/services/sampleRequests/types.ts` (replace lines 33–74: request/view/summary types)
- Modify: `backend/src/database/repositories/SampleRequestRepository.ts` (replace lines 12–22 and 120–235; keep catalog methods 28–118 and `getPullerUserId` 237–245)
- Test: `backend/tests/repositories/SampleRequestRepository.test.ts` (replace the request-related cases)

**Interfaces:**
- Produces (types): `SampleRequestRow`, `UserRef`, `EventSampleRequest`, `EventSampleRequestView`, `SampleRequestPatch`, `SampleChangeRow`, `OpenSampleRequest` (unchanged shape).
- Produces (repository): `findByEvent(eventId)`, `upsertEventDraft(eventId, createdBy)`, `getContents(requestId)`, `applyRows(requestId, userId, patch)`, `markSubmitted(requestId, userId)`, `findStatusByEvents(eventIds)`, `listChanges(requestId, limit)`, `userRefs(ids)`. Removes `findRequest`, `upsertDraft`, `replaceContents`, `findRequestsForUser`, `findEventRequests`, `findEventItems`, `findEventMaterials` and the `Event*Row` interfaces.

- [ ] **Step 1: Replace the request types**

In `types.ts`, delete lines 33–74 (`SampleRequestRow` through `EventSampleSummary`) and insert:

```ts
export interface SampleRequestRow {
  id: string; event_id: string; created_by: string | null; status: SampleRequestStatus;
  submitted_at: string | null; submitted_by: string | null;
  last_edited_at: string | null; last_edited_by: string | null;
  created_at: string; updated_at: string;
}

export interface UserRef { id: string; name: string }

export interface EventSampleRequest {
  id: string; eventId: string; status: SampleRequestStatus;
  submittedAt: string | null; submittedBy: UserRef | null;
  lastEditedAt: string | null; lastEditedBy: UserRef | null;
  items: SampleRequestItemInput[]; materials: SampleRequestMaterialInput[];
}

export interface SampleWindow { opensAt: string | null; closesAt: string | null; isOpen: boolean }

export interface EventSampleRequestView { request: EventSampleRequest; window: SampleWindow; canEdit: boolean }

/** Only the rows the client changed. Same row shape as the full payload. */
export type SampleRequestPatch = SampleRequestPayload;

export type SampleChangeField = 'singles' | 'displays' | 'empty_displays' | 'qty' | 'notes';

export interface SampleChangeRow {
  id: string; userId: string | null; userName: string | null;
  kind: 'item' | 'material'; targetId: string; targetName: string;
  lineName: string | null; brand: SampleBrand | null;
  field: SampleChangeField; oldValue: string | null; newValue: string | null; changedAt: string;
}

/** One dashboard action row. */
export interface OpenSampleRequest {
  eventId: string; eventName: string; closesAt: string;
  status: 'none' | SampleRequestStatus; submittedAt: string | null;
}
```

Keep `SAMPLE_OVERRIDE_ROLES` / `canOverrideSampleWindow` (lines 77–79) and everything above line 33.

- [ ] **Step 2: Write the failing repository test**

Replace the request-related tests in `backend/tests/repositories/SampleRequestRepository.test.ts` (keep the `getPullerUserId` cases) with:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

const client = { query: vi.fn(async () => ({ rows: [], rowCount: 0 })), release: vi.fn() };
vi.mock('../../src/config/database', () => ({
  query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
  pool: { connect: vi.fn(async () => client) },
}));

import { sampleRequestRepository } from '../../src/database/repositories/SampleRequestRepository';
import { query } from '../../src/config/database';

const sqlOf = () => client.query.mock.calls.map((c: any[]) => String(c[0]));

describe('SampleRequestRepository.applyRows', () => {
  beforeEach(() => { vi.clearAllMocks(); client.query.mockImplementation(async () => ({ rows: [], rowCount: 0 })); });

  it('upserts a changed item, logs only changed fields, stamps last_edited, in one transaction', async () => {
    client.query.mockImplementation(async (sql: string) => {
      if (/SELECT singles, displays, empty_displays FROM sample_request_items/.test(sql)) {
        return { rows: [{ singles: 1, displays: 0, empty_displays: 0 }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    await sampleRequestRepository.applyRows('req-1', 'u-1', {
      items: [{ productId: 'p-1', singles: 3, displays: 0, emptyDisplays: 2 }],
      materials: [],
    });
    const sql = sqlOf();
    expect(sql[0]).toBe('BEGIN');
    expect(sql.some((s) => /FOR UPDATE/.test(s))).toBe(true);
    expect(sql.filter((s) => /INSERT INTO sample_request_items/.test(s))).toHaveLength(1);
    const changes = client.query.mock.calls.filter((c: any[]) => /INSERT INTO sample_request_changes/.test(String(c[0])));
    expect(changes).toHaveLength(2); // singles 1→3, empty_displays 0→2 ; displays unchanged
    expect(changes.map((c: any[]) => c[1][4])).toEqual(expect.arrayContaining(['singles', 'empty_displays']));
    expect(sql.some((s) => /UPDATE sample_requests SET last_edited_by/.test(s))).toBe(true);
    expect(sql[sql.length - 1]).toBe('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });

  it('deletes a row that went to all zeros and logs the zeroed fields', async () => {
    client.query.mockImplementation(async (sql: string) => {
      if (/SELECT singles, displays, empty_displays/.test(sql)) return { rows: [{ singles: 2, displays: 1, empty_displays: 0 }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    await sampleRequestRepository.applyRows('req-1', 'u-1', {
      items: [{ productId: 'p-1', singles: 0, displays: 0, emptyDisplays: 0 }], materials: [],
    });
    const sql = sqlOf();
    expect(sql.some((s) => /DELETE FROM sample_request_items WHERE request_id = \$1 AND product_id = \$2/.test(s))).toBe(true);
    expect(sql.filter((s) => /INSERT INTO sample_request_changes/.test(s))).toHaveLength(2);
  });

  it('writes no change rows when nothing changed', async () => {
    client.query.mockImplementation(async (sql: string) => {
      if (/SELECT qty, notes FROM sample_request_materials/.test(sql)) return { rows: [{ qty: 2, notes: 'big' }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    await sampleRequestRepository.applyRows('req-1', 'u-1', { items: [], materials: [{ materialId: 'm-1', qty: 2, notes: 'big' }] });
    expect(sqlOf().filter((s) => /INSERT INTO sample_request_changes/.test(s))).toHaveLength(0);
  });

  it('rolls back when a statement throws', async () => {
    client.query.mockImplementation(async (sql: string) => {
      if (/INSERT INTO sample_request_items/.test(sql)) throw new Error('fk');
      if (/SELECT singles/.test(sql)) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    });
    await expect(sampleRequestRepository.applyRows('req-1', 'u-1', {
      items: [{ productId: 'bad', singles: 1, displays: 0, emptyDisplays: 0 }], materials: [],
    })).rejects.toThrow('fk');
    expect(sqlOf()).toContain('ROLLBACK');
  });
});

describe('SampleRequestRepository reads', () => {
  beforeEach(() => vi.clearAllMocks());

  it('upsertEventDraft conflicts on event_id only', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [{ id: 'req-1', event_id: 'ev-1' }] } as any);
    await sampleRequestRepository.upsertEventDraft('ev-1', 'u-1');
    const [sql, params] = vi.mocked(query).mock.calls[0];
    expect(sql).toMatch(/ON CONFLICT \(event_id\) DO UPDATE/);
    expect(params).toEqual(['ev-1', 'u-1']);
  });

  it('findStatusByEvents takes an id array', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [] } as any);
    await sampleRequestRepository.findStatusByEvents(['ev-1', 'ev-2']);
    expect(vi.mocked(query).mock.calls[0][1]).toEqual([['ev-1', 'ev-2']]);
  });

  it('listChanges joins names and caps the limit', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [] } as any);
    await sampleRequestRepository.listChanges('req-1', 200);
    const [sql, params] = vi.mocked(query).mock.calls[0];
    expect(sql).toMatch(/LEFT JOIN users/);
    expect(sql).toMatch(/LEFT JOIN sample_products/);
    expect(sql).toMatch(/ORDER BY c.changed_at DESC/);
    expect(params).toEqual(['req-1', 200]);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd backend && npx vitest run tests/repositories/SampleRequestRepository.test.ts`
Expected: FAIL (`applyRows` etc. not defined).

- [ ] **Step 4: Implement the repository changes**

Delete lines 12–22 (`EventItemRow`, `EventMaterialRow`, `EventRequestRow`) and lines 120–235 (`attachContents` through `findEventMaterials`) of `SampleRequestRepository.ts`. Update the import to:

```ts
import {
  SampleCatalog, SampleProductLine, SampleProduct, SampleMaterial, SampleBrand,
  SampleRequestRow, SampleRequestPayload, SampleRequestStatus, SampleChangeRow, SampleChangeField, UserRef,
} from '../../services/sampleRequests/types';
```

Add these methods to the class (before `getPullerUserId`):

```ts
  // ── Shared request ─────────────────────────────────────────────────────
  async findByEvent(eventId: string): Promise<SampleRequestRow | null> {
    const r = await query(`SELECT * FROM sample_requests WHERE event_id = $1`, [eventId]);
    return r.rows[0] || null;
  }

  /** Creates the event's single draft row if missing; otherwise returns it unchanged. */
  async upsertEventDraft(eventId: string, createdBy: string): Promise<SampleRequestRow> {
    const r = await query(
      `INSERT INTO sample_requests (event_id, created_by)
       VALUES ($1, $2)
       ON CONFLICT (event_id) DO UPDATE SET updated_at = sample_requests.updated_at
       RETURNING *`,
      [eventId, createdBy]
    );
    return r.rows[0];
  }

  async getContents(requestId: string): Promise<{ items: SampleRequestPayload['items']; materials: SampleRequestPayload['materials'] }> {
    const [items, materials] = await Promise.all([
      query(`SELECT product_id, singles, displays, empty_displays FROM sample_request_items WHERE request_id = $1`, [requestId]),
      query(`SELECT material_id, qty, notes FROM sample_request_materials WHERE request_id = $1`, [requestId]),
    ]);
    return {
      items: items.rows.map((i: any) => ({ productId: i.product_id, singles: i.singles, displays: i.displays, emptyDisplays: i.empty_displays })),
      materials: materials.rows.map((m: any) => ({ materialId: m.material_id, qty: m.qty, notes: m.notes })),
    };
  }

  /**
   * Row-level merge. For each row in the patch: lock the current row, upsert
   * (or delete when everything is zero/blank), and log one change row per
   * field whose value differs. One transaction, so history matches storage.
   */
  async applyRows(requestId: string, userId: string, patch: SampleRequestPayload): Promise<void> {
    const client = await pool.connect();
    const log = (kind: 'item' | 'material', targetId: string, field: SampleChangeField, oldV: unknown, newV: unknown) =>
      client.query(
        `INSERT INTO sample_request_changes (request_id, user_id, kind, target_id, field, old_value, new_value)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [requestId, userId, kind, targetId, field, oldV == null ? null : String(oldV), newV == null ? null : String(newV)]
      );
    try {
      await client.query('BEGIN');
      for (const it of patch.items) {
        const cur = await client.query(
          `SELECT singles, displays, empty_displays FROM sample_request_items WHERE request_id = $1 AND product_id = $2 FOR UPDATE`,
          [requestId, it.productId]
        );
        const old = cur.rows[0] ?? { singles: 0, displays: 0, empty_displays: 0 };
        const next = { singles: it.singles, displays: it.displays, empty_displays: it.emptyDisplays };
        const changed = (Object.keys(next) as Array<keyof typeof next>).filter((k) => old[k] !== next[k]);
        if (changed.length === 0) continue;
        if (next.singles === 0 && next.displays === 0 && next.empty_displays === 0) {
          await client.query(`DELETE FROM sample_request_items WHERE request_id = $1 AND product_id = $2`, [requestId, it.productId]);
        } else {
          await client.query(
            `INSERT INTO sample_request_items (request_id, product_id, singles, displays, empty_displays)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (request_id, product_id) DO UPDATE
               SET singles = EXCLUDED.singles, displays = EXCLUDED.displays, empty_displays = EXCLUDED.empty_displays`,
            [requestId, it.productId, next.singles, next.displays, next.empty_displays]
          );
        }
        for (const k of changed) await log('item', it.productId, k, old[k], next[k]);
      }
      for (const m of patch.materials) {
        const cur = await client.query(
          `SELECT qty, notes FROM sample_request_materials WHERE request_id = $1 AND material_id = $2 FOR UPDATE`,
          [requestId, m.materialId]
        );
        const old = cur.rows[0] ?? { qty: 0, notes: null };
        const notes = m.notes && m.notes.trim().length > 0 ? m.notes.trim() : null;
        const changed: SampleChangeField[] = [];
        if (old.qty !== m.qty) changed.push('qty');
        if ((old.notes ?? null) !== notes) changed.push('notes');
        if (changed.length === 0) continue;
        if (m.qty === 0 && notes === null) {
          await client.query(`DELETE FROM sample_request_materials WHERE request_id = $1 AND material_id = $2`, [requestId, m.materialId]);
        } else {
          await client.query(
            `INSERT INTO sample_request_materials (request_id, material_id, qty, notes)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (request_id, material_id) DO UPDATE SET qty = EXCLUDED.qty, notes = EXCLUDED.notes`,
            [requestId, m.materialId, m.qty, notes]
          );
        }
        for (const k of changed) await log('material', m.materialId, k, k === 'qty' ? old.qty : old.notes, k === 'qty' ? m.qty : notes);
      }
      await client.query(
        `UPDATE sample_requests SET last_edited_by = $2, last_edited_at = now(), updated_at = now() WHERE id = $1`,
        [requestId, userId]
      );
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async markSubmitted(requestId: string, userId: string): Promise<SampleRequestRow> {
    const r = await query(
      `UPDATE sample_requests SET status = 'submitted', submitted_at = now(), submitted_by = $2, updated_at = now()
       WHERE id = $1 RETURNING *`,
      [requestId, userId]
    );
    return r.rows[0];
  }

  async findStatusByEvents(eventIds: string[]): Promise<Array<{ event_id: string; status: SampleRequestStatus; submitted_at: string | null }>> {
    if (eventIds.length === 0) return [];
    const r = await query(
      `SELECT event_id, status, submitted_at FROM sample_requests WHERE event_id = ANY($1::uuid[])`,
      [eventIds]
    );
    return r.rows;
  }

  async listChanges(requestId: string, limit = 200): Promise<SampleChangeRow[]> {
    const r = await query(
      `SELECT c.id, c.user_id, u.name AS user_name, c.kind, c.target_id, c.field, c.old_value, c.new_value, c.changed_at,
              COALESCE(p.name, m.name) AS target_name, l.name AS line_name, l.brand
       FROM sample_request_changes c
       LEFT JOIN users u ON u.id = c.user_id
       LEFT JOIN sample_products p ON c.kind = 'item' AND p.id = c.target_id
       LEFT JOIN sample_product_lines l ON l.id = p.product_line_id
       LEFT JOIN sample_materials m ON c.kind = 'material' AND m.id = c.target_id
       WHERE c.request_id = $1
       ORDER BY c.changed_at DESC
       LIMIT $2`,
      [requestId, limit]
    );
    return r.rows.map((row: any) => ({
      id: row.id, userId: row.user_id, userName: row.user_name, kind: row.kind, targetId: row.target_id,
      targetName: row.target_name ?? 'Unknown', lineName: row.line_name ?? null, brand: row.brand ?? null,
      field: row.field, oldValue: row.old_value, newValue: row.new_value, changedAt: row.changed_at,
    }));
  }

  async userRefs(ids: Array<string | null>): Promise<Map<string, UserRef>> {
    const wanted = [...new Set(ids.filter((v): v is string => !!v))];
    if (wanted.length === 0) return new Map();
    const r = await query(`SELECT id, name FROM users WHERE id = ANY($1::uuid[])`, [wanted]);
    return new Map(r.rows.map((u: any) => [u.id, { id: u.id, name: u.name }]));
  }
```

- [ ] **Step 5: Run tests and type-check**

Run: `cd backend && npx vitest run tests/repositories/SampleRequestRepository.test.ts && npx tsc --noEmit -p .`
Expected: repository tests PASS. `tsc` will FAIL in `SampleRequestService.ts` and `routes/sampleRequests.ts` because they still use removed methods/types — that is expected until Tasks 3 and 4; do not fix them here. Confirm the only tsc errors are in those two files (and their tests).

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/sampleRequests/types.ts backend/src/database/repositories/SampleRequestRepository.ts backend/tests/repositories/SampleRequestRepository.test.ts
git commit -m "feat(sample-requests): event-scoped repository with row-level patch and change log

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 3: SampleRequestService for the shared request

**Files:**
- Modify: `backend/src/services/sampleRequests/SampleRequestService.ts` (rewrite the class body; keep `Actor`, `fmtClose`, `loadEvent`, `getWindowForEvent`, `announceIfOpen`, `userName`)
- Test: `backend/tests/services/SampleRequestService.test.ts` (rewrite)

**Interfaces:**
- Consumes: repository methods from Task 2; `computeSampleWindow`; `validateSamplePayload(body, catalog)` (unchanged); `isEventParticipant`, `getCurrentParticipantIds`; `notificationService.notify`.
- Produces (`sampleRequestService`): `canViewSamples(eventId, actor)`, `canEditSamples(eventId, actor)`, `getForEvent(eventId, actor)`, `patchRows(eventId, body, actor)`, `submit(eventId, actor)`, `getHistory(eventId, actor)`, `listMyOpenRequests(userId)`, `announceIfOpen(eventId, userIds)`. Removes `getRequest`, `saveDraft`, `submit(eventId, targetUserId, actor)`, `canViewSummary`, `getEventSummary`.
- Notification links for `form_open` and the reminder change from `{ page: 'checklist' }` to `{ page: 'samples' }` so everyone lands on the Samples view.

- [ ] **Step 1: Write the failing service test**

```ts
// backend/tests/services/SampleRequestService.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

const OPEN_EVENT = { id: 'ev-1', name: 'Expo', created_at: '2026-10-01T00:00:00Z', travel_start_date: '2026-10-30', show_start_date: '2026-11-01' };
const CLOSED_EVENT = { id: 'ev-2', name: 'Soon', created_at: '2026-10-01T00:00:00Z', travel_start_date: '2026-10-09', show_start_date: '2026-10-10' };
const NOW = new Date('2026-10-07T15:00:00Z');

const row = (over = {}) => ({
  id: 'req-1', event_id: 'ev-1', created_by: 'u-1', status: 'draft', submitted_at: null, submitted_by: null,
  last_edited_at: null, last_edited_by: null, created_at: '', updated_at: '', ...over,
});

vi.mock('../../src/database/repositories/SampleRequestRepository', () => ({
  sampleRequestRepository: {
    getCatalog: vi.fn(async () => ({
      lines: [{ id: 'l-1', brand: 'boomin_brands', name: 'Peelz', position: 1, is_active: true }],
      products: [{ id: 'p-1', product_line_id: 'l-1', name: 'Mango', position: 1, is_active: true },
                 { id: 'p-old', product_line_id: 'l-1', name: 'Gone', position: 2, is_active: false }],
      materials: [{ id: 'm-1', name: 'Banner', position: 1, is_active: true }],
    })),
    findByEvent: vi.fn(async () => row()),
    upsertEventDraft: vi.fn(async (e: string, u: string) => row({ event_id: e, created_by: u })),
    getContents: vi.fn(async () => ({ items: [], materials: [] })),
    applyRows: vi.fn(async () => undefined),
    markSubmitted: vi.fn(async (id: string, u: string) => row({ id, status: 'submitted', submitted_at: '2026-10-07T15:00:00Z', submitted_by: u })),
    findStatusByEvents: vi.fn(async () => []),
    listChanges: vi.fn(async () => [{ id: 'c-1', userId: 'u-1', userName: 'Ana', kind: 'item', targetId: 'p-1', targetName: 'Mango', lineName: 'Peelz', brand: 'boomin_brands', field: 'singles', oldValue: '1', newValue: '3', changedAt: '2026-10-07T14:00:00Z' }]),
    userRefs: vi.fn(async (ids: string[]) => new Map(ids.filter(Boolean).map((id) => [id, { id, name: `User ${id}` }]))),
    getPullerUserId: vi.fn(async () => 'puller-1'),
  },
}));
vi.mock('../../src/database/repositories/EventRepository', () => ({
  eventRepository: { findById: vi.fn(async (id: string) => (id === 'ev-1' ? OPEN_EVENT : id === 'ev-2' ? CLOSED_EVENT : null)) },
}));
vi.mock('../../src/services/EventParticipantService', () => ({
  isEventParticipant: vi.fn(async (_e: string, u: string) => u === 'u-1' || u === 'u-3'),
  getCurrentParticipantIds: vi.fn(async () => ['u-1', 'u-3']),
}));
vi.mock('../../src/services/NotificationService', () => ({
  notificationService: { notify: vi.fn(async () => ({ id: 'n-1' })) },
}));
vi.mock('../../src/config/database', () => ({ query: vi.fn(async () => ({ rows: [{ name: 'Ana' }] })) }));

import { sampleRequestService } from '../../src/services/sampleRequests/SampleRequestService';
import { sampleRequestRepository } from '../../src/database/repositories/SampleRequestRepository';
import { notificationService } from '../../src/services/NotificationService';
import { query } from '../../src/config/database';

const rep = { id: 'u-1', role: 'salesperson' };
const otherRep = { id: 'u-3', role: 'salesperson' };
const stranger = { id: 'u-9', role: 'salesperson' };
const puller = { id: 'puller-1', role: 'salesperson' };
const admin = { id: 'adm', role: 'admin' };
const patch = { items: [{ productId: 'p-1', singles: 3, displays: 0, emptyDisplays: 0 }], materials: [] };

describe('SampleRequestService (shared request)', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(NOW); });

  describe('access', () => {
    it('participant, override role and puller can view; stranger cannot', async () => {
      expect(await sampleRequestService.canViewSamples('ev-1', rep)).toBe(true);
      expect(await sampleRequestService.canViewSamples('ev-1', admin)).toBe(true);
      expect(await sampleRequestService.canViewSamples('ev-1', puller)).toBe(true);
      expect(await sampleRequestService.canViewSamples('ev-1', stranger)).toBe(false);
    });
    it('puller off the roster can view but not edit; participant edits while open; admin edits after close', async () => {
      expect((await sampleRequestService.getForEvent('ev-1', puller)).canEdit).toBe(false);
      expect((await sampleRequestService.getForEvent('ev-1', rep)).canEdit).toBe(true);
      expect((await sampleRequestService.getForEvent('ev-2', rep)).canEdit).toBe(false);
      expect((await sampleRequestService.getForEvent('ev-2', admin)).canEdit).toBe(true);
    });
    it('getForEvent 403s a stranger and 404s an unknown event', async () => {
      await expect(sampleRequestService.getForEvent('ev-1', stranger)).rejects.toMatchObject({ statusCode: 403 });
      await expect(sampleRequestService.getForEvent('nope', rep)).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('getForEvent', () => {
    it('creates the event draft on first read and resolves user names', async () => {
      vi.mocked(sampleRequestRepository.findByEvent).mockResolvedValueOnce(null);
      vi.mocked(sampleRequestRepository.upsertEventDraft).mockResolvedValueOnce(row({ last_edited_by: 'u-3', last_edited_at: '2026-10-07T14:00:00Z' }) as any);
      const v = await sampleRequestService.getForEvent('ev-1', rep);
      expect(sampleRequestRepository.upsertEventDraft).toHaveBeenCalledWith('ev-1', 'u-1');
      expect(v.request.lastEditedBy).toEqual({ id: 'u-3', name: 'User u-3' });
      expect(v.request.submittedBy).toBeNull();
      expect(v.window.closesAt).toBe('2026-10-21T03:59:59.000Z');
    });
  });

  describe('patchRows', () => {
    it('validates then applies only the sent rows as the actor', async () => {
      await sampleRequestService.patchRows('ev-1', patch, rep);
      expect(sampleRequestRepository.applyRows).toHaveBeenCalledWith('req-1', 'u-1', patch);
    });
    it('accepts a retired product already on the request', async () => {
      await sampleRequestService.patchRows('ev-1', { items: [{ productId: 'p-old', singles: 1, displays: 0, emptyDisplays: 0 }], materials: [] }, rep);
      expect(sampleRequestRepository.applyRows).toHaveBeenCalled();
    });
    it('400s a bad row and writes nothing', async () => {
      await expect(sampleRequestService.patchRows('ev-1', { items: [{ productId: 'zzz', singles: 1, displays: 0, emptyDisplays: 0 }], materials: [] }, rep))
        .rejects.toMatchObject({ statusCode: 400 });
      expect(sampleRequestRepository.applyRows).not.toHaveBeenCalled();
    });
    it('409s a participant after close, lets an admin through', async () => {
      await expect(sampleRequestService.patchRows('ev-2', patch, rep)).rejects.toMatchObject({ statusCode: 409 });
      await sampleRequestService.patchRows('ev-2', patch, admin);
      expect(sampleRequestRepository.applyRows).toHaveBeenCalledTimes(1);
    });
    it('403s the off-roster puller and a stranger', async () => {
      await expect(sampleRequestService.patchRows('ev-1', patch, puller)).rejects.toMatchObject({ statusCode: 403 });
      await expect(sampleRequestService.patchRows('ev-1', patch, stranger)).rejects.toMatchObject({ statusCode: 403 });
    });
    it('two participants patching the same row in turn both persist', async () => {
      await sampleRequestService.patchRows('ev-1', patch, rep);
      await sampleRequestService.patchRows('ev-1', { items: [{ productId: 'p-1', singles: 5, displays: 0, emptyDisplays: 0 }], materials: [] }, otherRep);
      expect(vi.mocked(sampleRequestRepository.applyRows).mock.calls.map((c) => c[1])).toEqual(['u-1', 'u-3']);
    });
  });

  describe('submit', () => {
    it('creates the row if needed, marks submitted by the actor, notifies the puller with "New" wording', async () => {
      vi.mocked(sampleRequestRepository.findByEvent).mockResolvedValueOnce(null);
      const v = await sampleRequestService.submit('ev-1', rep);
      expect(sampleRequestRepository.markSubmitted).toHaveBeenCalledWith('req-1', 'u-1');
      expect(v.request.status).toBe('submitted');
      expect(notificationService.notify).toHaveBeenCalledWith('puller-1', expect.objectContaining({
        kind: 'sample_request.submitted', title: expect.stringMatching(/^New sample request/), body: expect.stringContaining('Ana'),
        link: { page: 'samples', eventId: 'ev-1' },
      }));
    });
    it('uses "updated" wording after a prior submission', async () => {
      vi.mocked(sampleRequestRepository.findByEvent).mockResolvedValueOnce(row({ status: 'submitted', submitted_at: '2026-10-05T00:00:00Z', submitted_by: 'u-3' }) as any);
      await sampleRequestService.submit('ev-1', rep);
      expect(notificationService.notify).toHaveBeenCalledWith('puller-1', expect.objectContaining({ title: expect.stringMatching(/updated/i) }));
    });
    it('survives a failing notification and a missing puller', async () => {
      vi.mocked(notificationService.notify).mockRejectedValueOnce(new Error('boom'));
      await expect(sampleRequestService.submit('ev-1', rep)).resolves.toMatchObject({ request: { status: 'submitted' } });
      vi.mocked(sampleRequestRepository.getPullerUserId).mockResolvedValueOnce(null);
      await expect(sampleRequestService.submit('ev-1', rep)).resolves.toBeTruthy();
    });
    it('409s a participant after close', async () => {
      await expect(sampleRequestService.submit('ev-2', rep)).rejects.toMatchObject({ statusCode: 409 });
      expect(sampleRequestRepository.markSubmitted).not.toHaveBeenCalled();
    });
  });

  describe('getHistory', () => {
    it('returns resolved change rows for viewers, 403 for strangers, empty when no request yet', async () => {
      const h = await sampleRequestService.getHistory('ev-1', puller);
      expect(h[0]).toMatchObject({ userName: 'Ana', targetName: 'Mango', field: 'singles', oldValue: '1', newValue: '3' });
      expect(sampleRequestRepository.listChanges).toHaveBeenCalledWith('req-1', 200);
      await expect(sampleRequestService.getHistory('ev-1', stranger)).rejects.toMatchObject({ statusCode: 403 });
      vi.mocked(sampleRequestRepository.findByEvent).mockResolvedValueOnce(null);
      expect(await sampleRequestService.getHistory('ev-1', rep)).toEqual([]);
    });
  });

  describe('listMyOpenRequests', () => {
    it('returns open shows with the event status, including submitted ones', async () => {
      vi.mocked(query).mockResolvedValueOnce({ rows: [OPEN_EVENT, CLOSED_EVENT] } as any);
      vi.mocked(sampleRequestRepository.findStatusByEvents).mockResolvedValueOnce([{ event_id: 'ev-1', status: 'submitted', submitted_at: '2026-10-06T00:00:00Z' }]);
      const rows = await sampleRequestService.listMyOpenRequests('u-1');
      expect(rows).toEqual([{ eventId: 'ev-1', eventName: 'Expo', closesAt: '2026-10-21T03:59:59.000Z', status: 'submitted', submittedAt: '2026-10-06T00:00:00Z' }]);
    });
    it('reports none when no request row exists', async () => {
      vi.mocked(query).mockResolvedValueOnce({ rows: [OPEN_EVENT] } as any);
      expect((await sampleRequestService.listMyOpenRequests('u-1'))[0].status).toBe('none');
    });
  });

  describe('announceIfOpen', () => {
    it('links to the samples view', async () => {
      vi.mocked(query).mockResolvedValueOnce({ rows: [{ event_id: 'ev-1' }] } as any);
      await sampleRequestService.announceIfOpen('ev-1', ['u-1']);
      expect(notificationService.notify).toHaveBeenCalledWith('u-1', expect.objectContaining({ kind: 'sample_request.open', link: { page: 'samples', eventId: 'ev-1' } }));
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && npx vitest run tests/services/SampleRequestService.test.ts`
Expected: FAIL (methods missing / old signatures).

- [ ] **Step 3: Rewrite the service**

Replace the class body of `SampleRequestService.ts` (keep the file header, imports, `Actor`, `fmtClose`, and `announceIfOpen` with its link changed to `{ page: 'samples', eventId }`):

```ts
import { query } from '../../config/database';
import { eventRepository } from '../../database/repositories/EventRepository';
import { sampleRequestRepository } from '../../database/repositories/SampleRequestRepository';
import { isEventParticipant } from '../EventParticipantService';
import { notificationService } from '../NotificationService';
import { NotFoundError, AuthorizationError, ConflictError } from '../../utils/errors';
import { computeSampleWindow } from './sampleRequestWindow';
import { validateSamplePayload } from './validateSamplePayload';
import {
  SampleWindow, SampleRequestRow, EventSampleRequest, EventSampleRequestView, SampleRequestPayload,
  OpenSampleRequest, SampleChangeRow, canOverrideSampleWindow,
} from './types';

export interface Actor { id: string; role: string }

const fmtClose = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'n/a';

interface Access { isParticipant: boolean; isOverride: boolean; isPuller: boolean }

class SampleRequestService {
  private async loadEvent(eventId: string) {
    const event = await eventRepository.findById(eventId);
    if (!event) throw new NotFoundError('Event', eventId);
    return event;
  }

  private async access(eventId: string, actor: Actor): Promise<Access> {
    const [isParticipant, pullerId] = await Promise.all([
      isEventParticipant(eventId, actor.id),
      sampleRequestRepository.getPullerUserId(),
    ]);
    return { isParticipant, isOverride: canOverrideSampleWindow(actor.role), isPuller: pullerId === actor.id };
  }

  private canView(a: Access): boolean { return a.isParticipant || a.isOverride || a.isPuller; }
  private canEdit(a: Access, window: SampleWindow): boolean {
    if (a.isOverride) return true;
    return a.isParticipant && window.isOpen;
  }

  async getWindowForEvent(eventId: string): Promise<SampleWindow> {
    return computeSampleWindow(await this.loadEvent(eventId));
  }

  async canViewSamples(eventId: string, actor: Actor): Promise<boolean> {
    return this.canView(await this.access(eventId, actor));
  }

  async canEditSamples(eventId: string, actor: Actor): Promise<boolean> {
    const [event, a] = await Promise.all([this.loadEvent(eventId), this.access(eventId, actor)]);
    return this.canEdit(a, computeSampleWindow(event));
  }

  private async toView(row: SampleRequestRow, window: SampleWindow, canEdit: boolean): Promise<EventSampleRequestView> {
    const [contents, users] = await Promise.all([
      sampleRequestRepository.getContents(row.id),
      sampleRequestRepository.userRefs([row.submitted_by, row.last_edited_by]),
    ]);
    const request: EventSampleRequest = {
      id: row.id, eventId: row.event_id, status: row.status,
      submittedAt: row.submitted_at, submittedBy: row.submitted_by ? users.get(row.submitted_by) ?? null : null,
      lastEditedAt: row.last_edited_at, lastEditedBy: row.last_edited_by ? users.get(row.last_edited_by) ?? null : null,
      items: contents.items, materials: contents.materials,
    };
    return { request, window, canEdit };
  }

  private async ensureRow(eventId: string, actor: Actor): Promise<SampleRequestRow> {
    return (await sampleRequestRepository.findByEvent(eventId)) ?? sampleRequestRepository.upsertEventDraft(eventId, actor.id);
  }

  async getForEvent(eventId: string, actor: Actor): Promise<EventSampleRequestView> {
    const event = await this.loadEvent(eventId);
    const a = await this.access(eventId, actor);
    if (!this.canView(a)) throw new AuthorizationError('You are not on this show');
    const window = computeSampleWindow(event);
    const row = await this.ensureRow(eventId, actor);
    return this.toView(row, window, this.canEdit(a, window));
  }

  private async guardEdit(eventId: string, actor: Actor) {
    const event = await this.loadEvent(eventId);
    const a = await this.access(eventId, actor);
    if (!this.canView(a)) throw new AuthorizationError('You are not on this show');
    const window = computeSampleWindow(event);
    if (!a.isOverride && !a.isParticipant) throw new AuthorizationError('Only participants can edit the sample request');
    if (!a.isOverride && !window.isOpen) {
      throw new ConflictError('Sample requests for this show are closed', { code: 'WINDOW_CLOSED', closesAt: window.closesAt });
    }
    return { event, window, a };
  }

  async patchRows(eventId: string, body: unknown, actor: Actor): Promise<EventSampleRequestView> {
    const { window, a } = await this.guardEdit(eventId, actor);
    const patch: SampleRequestPayload = validateSamplePayload(body, await sampleRequestRepository.getCatalog(true));
    const row = await this.ensureRow(eventId, actor);
    await sampleRequestRepository.applyRows(row.id, actor.id, patch);
    const fresh = (await sampleRequestRepository.findByEvent(eventId)) ?? row;
    return this.toView(fresh, window, this.canEdit(a, window));
  }

  async submit(eventId: string, actor: Actor): Promise<EventSampleRequestView> {
    const { event, window, a } = await this.guardEdit(eventId, actor);
    const before = await this.ensureRow(eventId, actor);
    const wasSubmitted = before.status === 'submitted';
    const row = await sampleRequestRepository.markSubmitted(before.id, actor.id);

    const pullerId = await sampleRequestRepository.getPullerUserId();
    if (pullerId) {
      try {
        const who = await this.userName(actor.id);
        await notificationService.notify(pullerId, {
          kind: 'sample_request.submitted',
          title: wasSubmitted ? `Sample request updated · ${event.name}` : `New sample request · ${event.name}`,
          body: `${who} ${wasSubmitted ? 'updated the' : 'submitted the'} sample request for ${event.name}.`,
          link: { page: 'samples', eventId },
        });
      } catch (error) {
        console.error('[SampleRequests] puller notify failed', error);
      }
    } else {
      console.warn(`[SampleRequests] No sample puller configured — submit for event ${eventId} by ${actor.id} not routed`);
    }
    return this.toView(row, window, this.canEdit(a, window));
  }

  async getHistory(eventId: string, actor: Actor): Promise<SampleChangeRow[]> {
    await this.loadEvent(eventId);
    const a = await this.access(eventId, actor);
    if (!this.canView(a)) throw new AuthorizationError('You are not on this show');
    const row = await sampleRequestRepository.findByEvent(eventId);
    if (!row) return [];
    return sampleRequestRepository.listChanges(row.id, 200);
  }

  async listMyOpenRequests(userId: string): Promise<OpenSampleRequest[]> {
    const events = await query(
      `SELECT e.id, e.name, e.created_at, e.travel_start_date, e.show_start_date
       FROM events e JOIN event_participants ep ON ep.event_id = e.id
       WHERE ep.user_id = $1 AND e.status <> 'cancelled'`,
      [userId]
    );
    const open = events.rows.map((e: any) => ({ e, w: computeSampleWindow(e) })).filter(({ w }) => w.isOpen && w.closesAt);
    const statuses = new Map((await sampleRequestRepository.findStatusByEvents(open.map(({ e }) => e.id))).map((s) => [s.event_id, s]));
    return open
      .map(({ e, w }) => {
        const s = statuses.get(e.id);
        return { eventId: e.id, eventName: e.name, closesAt: w.closesAt as string, status: s?.status ?? 'none', submittedAt: s?.submitted_at ?? null };
      })
      .sort((x, y) => x.closesAt.localeCompare(y.closesAt));
  }

  /** Called on event create/update and participant add. Ledger-first so re-adds never double-notify. */
  async announceIfOpen(eventId: string, userIds: string[]): Promise<void> {
    const event = await eventRepository.findById(eventId);
    if (!event) return;
    const window = computeSampleWindow(event);
    if (!window.isOpen || !window.closesAt) return;
    for (const userId of userIds) {
      const claimed = await query(
        `INSERT INTO sample_request_reminders (event_id, user_id, kind) VALUES ($1, $2, 'form_open')
         ON CONFLICT (event_id, user_id, kind) DO NOTHING RETURNING event_id`,
        [eventId, userId]
      );
      if (claimed.rows.length === 0) continue;
      await notificationService.notify(userId, {
        kind: 'sample_request.open',
        title: `Sample request open · ${event.name}`,
        body: `Tell us which samples the team needs for ${event.name}. Closes ${fmtClose(window.closesAt)} ET.`,
        link: { page: 'samples', eventId },
      }).catch((e) => console.error('[SampleRequests] announce failed', e));
    }
  }

  private async userName(userId: string): Promise<string> {
    const r = await query(`SELECT name FROM users WHERE id = $1`, [userId]);
    return r.rows[0]?.name ?? 'A participant';
  }
}

export const sampleRequestService = new SampleRequestService();
```

- [ ] **Step 4: Run tests**

Run: `cd backend && npx vitest run tests/services/SampleRequestService.test.ts tests/services/validateSamplePayload.test.ts`
Expected: all PASS. `tsc` still fails only in `routes/sampleRequests.ts` (Task 4).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/sampleRequests/SampleRequestService.ts backend/tests/services/SampleRequestService.test.ts
git commit -m "feat(sample-requests): event-scoped service with row patches, history and shared submit

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Routes for the shared request

**Files:**
- Modify: `backend/src/routes/sampleRequests.ts` (replace handlers at lines 173–213 and registrations 225–233; keep catalog handlers and routes, `hasValidIds`, `catalogWrite`)
- Test: `backend/tests/routes/sampleRequests.test.ts` (replace the request-handler cases)

**Interfaces:**
- Produces: `GET /mine` → `{ requests }`; `GET /:eventId/access` → `{ canView, canEdit }`; `GET /:eventId` → `EventSampleRequestView`; `PATCH /:eventId` → `EventSampleRequestView`; `POST /:eventId/submit` → `EventSampleRequestView`; `GET /:eventId/history` → `{ changes: SampleChangeRow[] }`. Removes `/access`, `/:eventId/mine*`, `/:eventId/users/*`, `/:eventId/summary`.

- [ ] **Step 1: Write the failing route test**

Replace the request-handler section of the test file (keep catalog tests and the router-order test, updating the latter's expectation as below):

```ts
vi.mock('../../src/services/sampleRequests/SampleRequestService', () => ({
  sampleRequestService: {
    getForEvent: vi.fn(async () => ({ request: { id: 'r' }, window: { isOpen: true }, canEdit: true })),
    patchRows: vi.fn(async () => ({ request: { id: 'r' }, window: { isOpen: true }, canEdit: true })),
    submit: vi.fn(async () => ({ request: { id: 'r', status: 'submitted' }, window: { isOpen: true }, canEdit: true })),
    getHistory: vi.fn(async () => [{ id: 'c-1' }]),
    listMyOpenRequests: vi.fn(async () => [{ eventId: 'ev-1' }]),
    canViewSamples: vi.fn(async () => true),
    canEditSamples: vi.fn(async () => false),
  },
}));
// … existing repository mock …

import { handleGetEvent, handlePatchEvent, handleSubmitEvent, handleGetHistory, handleListMine, handleEventAccess } from '../../src/routes/sampleRequests';
import router from '../../src/routes/sampleRequests';

const EV = '11111111-1111-4111-8111-111111111111';

describe('shared request routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('get/patch/submit/history pass the event and the actor', async () => {
    await handleGetEvent({ user: rep, params: { eventId: EV } } as any, mockRes());
    expect(sampleRequestService.getForEvent).toHaveBeenCalledWith(EV, rep);
    await handlePatchEvent({ user: rep, params: { eventId: EV }, body: { items: [], materials: [] } } as any, mockRes());
    expect(sampleRequestService.patchRows).toHaveBeenCalledWith(EV, { items: [], materials: [] }, rep);
    await handleSubmitEvent({ user: rep, params: { eventId: EV } } as any, mockRes());
    expect(sampleRequestService.submit).toHaveBeenCalledWith(EV, rep);
    const res = mockRes();
    await handleGetHistory({ user: rep, params: { eventId: EV } } as any, res);
    expect(res.json).toHaveBeenCalledWith({ changes: [{ id: 'c-1' }] });
  });

  it('access returns both flags', async () => {
    const res = mockRes();
    await handleEventAccess({ user: rep, params: { eventId: EV } } as any, res);
    expect(res.json).toHaveBeenCalledWith({ canView: true, canEdit: false });
  });

  it('400s a non-UUID eventId before the service', async () => {
    const res = mockRes();
    await handleGetEvent({ user: rep, params: { eventId: 'nope' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(sampleRequestService.getForEvent).not.toHaveBeenCalled();
  });

  it('registers /mine before /:eventId and no per-user or summary routes', () => {
    const paths = (router as any).stack.filter((l: any) => l.route).map((l: any) => l.route.path);
    expect(paths.indexOf('/mine')).toBeLessThan(paths.findIndex((p: string) => p.startsWith('/:eventId')));
    expect(paths.some((p: string) => /mine$|users|summary/.test(p) && p !== '/mine')).toBe(false);
    expect(paths).toEqual(expect.arrayContaining(['/:eventId', '/:eventId/access', '/:eventId/submit', '/:eventId/history']));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && npx vitest run tests/routes/sampleRequests.test.ts`
Expected: FAIL (handlers missing).

- [ ] **Step 3: Implement the handlers and registrations**

Replace the request handlers (`handleListMine` … `handleGetSummary`) with:

```ts
export async function handleListMine(req: AuthRequest, res: Response): Promise<void> {
  res.json({ requests: await sampleRequestService.listMyOpenRequests(req.user!.id) });
}

export async function handleEventAccess(req: AuthRequest, res: Response): Promise<void> {
  if (!hasValidIds(req, res)) return;
  const [canView, canEdit] = await Promise.all([
    sampleRequestService.canViewSamples(req.params.eventId, req.user!),
    sampleRequestService.canEditSamples(req.params.eventId, req.user!).catch(() => false),
  ]);
  res.json({ canView, canEdit: canView && canEdit });
}

export async function handleGetEvent(req: AuthRequest, res: Response): Promise<void> {
  if (!hasValidIds(req, res)) return;
  res.json(await sampleRequestService.getForEvent(req.params.eventId, req.user!));
}

export async function handlePatchEvent(req: AuthRequest, res: Response): Promise<void> {
  if (!hasValidIds(req, res)) return;
  res.json(await sampleRequestService.patchRows(req.params.eventId, req.body, req.user!));
}

export async function handleSubmitEvent(req: AuthRequest, res: Response): Promise<void> {
  if (!hasValidIds(req, res)) return;
  res.json(await sampleRequestService.submit(req.params.eventId, req.user!));
}

export async function handleGetHistory(req: AuthRequest, res: Response): Promise<void> {
  if (!hasValidIds(req, res)) return;
  res.json({ changes: await sampleRequestService.getHistory(req.params.eventId, req.user!) });
}
```

`hasValidIds` currently also checks `req.params.userId` when present; with no user routes it only needs `eventId` — keep it as is if it already guards on presence. Replace the registrations after the catalog routes with:

```ts
router.get('/mine', asyncHandler(handleListMine));
router.get('/:eventId/access', asyncHandler(handleEventAccess));
router.get('/:eventId', asyncHandler(handleGetEvent));
router.patch('/:eventId', asyncHandler(handlePatchEvent));
router.post('/:eventId/submit', asyncHandler(handleSubmitEvent));
router.get('/:eventId/history', asyncHandler(handleGetHistory));
```

Remove the `OVERRIDE_ROLES` constant if nothing else uses it. Update the file header comment to describe the shared request.

- [ ] **Step 4: Run tests and type-check**

Run: `cd backend && npx vitest run tests/routes/sampleRequests.test.ts && npx tsc --noEmit -p .`
Expected: PASS; tsc clean across the backend.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/sampleRequests.ts backend/tests/routes/sampleRequests.test.ts
git commit -m "feat(sample-requests): event-scoped routes (get, patch, submit, history, access)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Reminder scanner reminds everyone

**Files:**
- Modify: `backend/src/services/sampleRequests/SampleRequestReminderService.ts` (lines 62–69: `remindEvent` query; the notification link)
- Test: `backend/tests/services/SampleRequestReminderService.test.ts`

**Interfaces:**
- Consumes nothing new. Produces the same scanner; the per-user "unsubmitted" filter is gone and the link is `{ page: 'samples', eventId }`.

- [ ] **Step 1: Update the tests**

In the first test ("reminds unsubmitted participants inside the 48h window, once"), rename it to "reminds every participant inside the 48h window, once, submitted or not" and change the second mocked query result to `{ rows: [{ user_id: 'u-1' }, { user_id: 'u-2' }] }` (unchanged shape). Add an assertion that the participants SQL (`query` call 2) does NOT contain `sample_requests` and does not filter on `status`:

```ts
    const participantsSql = String(vi.mocked(query).mock.calls[1][0]);
    expect(participantsSql).not.toMatch(/sample_requests|status/);
    expect(notificationService.notify).toHaveBeenCalledWith('u-1', expect.objectContaining({ link: { page: 'samples', eventId: 'ev-1' } }));
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && npx vitest run tests/services/SampleRequestReminderService.test.ts`
Expected: FAIL on the SQL/link assertions.

- [ ] **Step 3: Change the query and link**

Replace the `due` query in `remindEvent` with:

```ts
    const due = await query(`SELECT user_id FROM event_participants WHERE event_id = $1`, [event.id]);
```

and the notify `link` with `{ page: 'samples', eventId: event.id }`. Update the body copy to `You have not reviewed the team's sample request for ${event.name} recently. It closes soon.` → simpler and true for both states: `` `The sample request for ${event.name} closes soon. Review it before the window closes.` ``. Update the file header comment ("every participant, submitted or not").

- [ ] **Step 4: Run tests**

Run: `cd backend && npx vitest run tests/services/SampleRequestReminderService.test.ts && npx vitest run && npx tsc --noEmit -p .`
Expected: scanner tests PASS; whole backend suite green; tsc clean.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/sampleRequests/SampleRequestReminderService.ts backend/tests/services/SampleRequestReminderService.test.ts
git commit -m "feat(sample-requests): 48h reminder goes to every participant and links to the Samples view

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 6: Frontend API module for the shared request

**Files:**
- Modify: `src/utils/sampleRequestApi.ts` (replace lines 20–31 types and the request methods in lines 35–55; keep brand constants, catalog types, `MAX_SAMPLE_QTY`, catalog methods)
- Test: `src/utils/__tests__/sampleRequestApi.test.ts` (replace request-method cases)

**Interfaces:**
- Produces types `UserRef`, `EventSampleRequest`, `EventSampleRequestView`, `SampleRequestPatch`, `SampleChangeRow`, `OpenSampleRequest` (unchanged); methods `getEvent(eventId)`, `patchEvent(eventId, patch)`, `submitEvent(eventId)`, `getHistory(eventId)`, `getEventAccess(eventId)`, `listMine()`. Removes `getMine`, `saveMine`, `submitMine`, `getForUser`, `saveForUser`, `submitForUser`, `getSummary`, `getAccess`, and the `Summary*` types.

- [ ] **Step 1: Write the failing test**

Replace the request cases in `sampleRequestApi.test.ts` with:

```ts
  it('hits the event-scoped endpoints', async () => {
    await sampleRequestApi.getEvent('ev-1');
    expect(apiClient.get).toHaveBeenCalledWith('/sample-requests/ev-1');
    await sampleRequestApi.patchEvent('ev-1', { items: [{ productId: 'p', singles: 1, displays: 0, emptyDisplays: 0 }], materials: [] });
    expect(apiClient.patch).toHaveBeenCalledWith('/sample-requests/ev-1', { items: [{ productId: 'p', singles: 1, displays: 0, emptyDisplays: 0 }], materials: [] });
    await sampleRequestApi.submitEvent('ev-1');
    expect(apiClient.post).toHaveBeenCalledWith('/sample-requests/ev-1/submit');
    await sampleRequestApi.getHistory('ev-1');
    expect(apiClient.get).toHaveBeenCalledWith('/sample-requests/ev-1/history');
    await sampleRequestApi.getEventAccess('ev-1');
    expect(apiClient.get).toHaveBeenCalledWith('/sample-requests/ev-1/access');
  });
  it('has no per-user or summary methods', () => {
    for (const k of ['getMine', 'saveMine', 'submitMine', 'getForUser', 'saveForUser', 'submitForUser', 'getSummary', 'getAccess']) {
      expect((sampleRequestApi as any)[k]).toBeUndefined();
    }
  });
```

Add `patch: vi.fn(async () => ({}))` to the `apiClient` mock. Check `src/utils/apiClient.ts` for a `patch<T>` method; if it does not exist, add one next to `put` with the same shape (`patch<T = unknown>(path: string, data?: unknown, config?: RequestConfig): Promise<T>` issuing `method: 'PATCH'`), and add one test for it in the apiClient tests if a test file exists.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/utils/__tests__/sampleRequestApi.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Replace the request types and methods:

```ts
export type SampleRequestStatus = 'draft' | 'submitted';
export interface SampleWindow { opensAt: string | null; closesAt: string | null; isOpen: boolean }
export interface UserRef { id: string; name: string }
export interface EventSampleRequest {
  id: string; eventId: string; status: SampleRequestStatus;
  submittedAt: string | null; submittedBy: UserRef | null;
  lastEditedAt: string | null; lastEditedBy: UserRef | null;
  items: SampleRequestItem[]; materials: SampleRequestMaterial[];
}
export interface EventSampleRequestView { request: EventSampleRequest; window: SampleWindow; canEdit: boolean }
export type SampleRequestPatch = SampleRequestPayload;
export type SampleChangeField = 'singles' | 'displays' | 'empty_displays' | 'qty' | 'notes';
export interface SampleChangeRow {
  id: string; userId: string | null; userName: string | null; kind: 'item' | 'material'; targetId: string; targetName: string;
  lineName: string | null; brand: SampleBrand | null; field: SampleChangeField; oldValue: string | null; newValue: string | null; changedAt: string;
}
export interface OpenSampleRequest { eventId: string; eventName: string; closesAt: string; status: 'none' | SampleRequestStatus; submittedAt: string | null }
```

```ts
  listMine: () => apiClient.get<{ requests: OpenSampleRequest[] }>(`${base}/mine`),
  getEventAccess: (eventId: string) => apiClient.get<{ canView: boolean; canEdit: boolean }>(`${base}/${eventId}/access`),
  getEvent: (eventId: string) => apiClient.get<EventSampleRequestView>(`${base}/${eventId}`),
  patchEvent: (eventId: string, patch: SampleRequestPatch) => apiClient.patch<EventSampleRequestView>(`${base}/${eventId}`, patch),
  submitEvent: (eventId: string) => apiClient.post<EventSampleRequestView>(`${base}/${eventId}/submit`),
  getHistory: (eventId: string) => apiClient.get<{ changes: SampleChangeRow[] }>(`${base}/${eventId}/history`),
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/utils/__tests__/sampleRequestApi.test.ts`
Expected: PASS. (`npx tsc --noEmit` for the frontend will fail in the old hook/section until Task 8; that is expected.)

- [ ] **Step 5: Commit**

```bash
git add src/utils/sampleRequestApi.ts src/utils/__tests__/sampleRequestApi.test.ts src/utils/apiClient.ts
git commit -m "feat(sample-requests): frontend api for the shared event request

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: `useEventSampleRequest` hook

**Files:**
- Create: `src/components/checklist/samples/useEventSampleRequest.ts`
- Test: `src/components/checklist/samples/__tests__/useEventSampleRequest.test.ts`

**Interfaces:**
- Consumes: `sampleRequestApi.getEvent/patchEvent/submitEvent/getCatalog` (Task 6), `MAX_SAMPLE_QTY`.
- Produces: `useEventSampleRequest({ eventId, userId, role })` returning `{ status: 'loading'|'ready'|'offline'|'error'|'forbidden', catalog, view, items: Map, materials: Map, dirtyCount, saving, submitting, closed, override, setOverride, canEdit, canSubmit, isOffline, error, updatedBy: { name, at } | null, setItem, setMaterial, markFocused(id, focused), submit, refresh }`.

- [ ] **Step 1: Write the failing hook test**

```ts
// src/components/checklist/samples/__tests__/useEventSampleRequest.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const view = (over: any = {}) => ({
  request: { id: 'r', eventId: 'ev-1', status: 'draft', submittedAt: null, submittedBy: null, lastEditedAt: null, lastEditedBy: null, items: [], materials: [], ...over.request },
  window: { opensAt: '2026-10-01T00:00:00Z', closesAt: '2099-01-01T00:00:00Z', isOpen: true, ...over.window },
  canEdit: over.canEdit ?? true,
});

vi.mock('../../../../utils/sampleRequestApi', async (orig) => {
  const actual = await orig<typeof import('../../../../utils/sampleRequestApi')>();
  return {
    ...actual,
    sampleRequestApi: {
      getCatalog: vi.fn(async () => ({
        lines: [{ id: 'l-1', brand: 'boomin_brands', name: 'Peelz', position: 1, is_active: true }],
        products: [{ id: 'p-1', product_line_id: 'l-1', name: 'Mango', position: 1, is_active: true }, { id: 'p-2', product_line_id: 'l-1', name: 'Grape', position: 2, is_active: true }],
        materials: [{ id: 'm-1', name: 'Banner', position: 1, is_active: true }],
      })),
      getEvent: vi.fn(async () => view()),
      patchEvent: vi.fn(async (_e: string, p: any) => view({ request: { items: p.items, materials: p.materials, lastEditedBy: { id: 'u-1', name: 'Me' }, lastEditedAt: '2026-10-07T15:00:00Z' } })),
      submitEvent: vi.fn(async () => view({ request: { status: 'submitted', submittedAt: '2026-10-07T15:00:00Z', submittedBy: { id: 'u-1', name: 'Me' } } })),
    },
  };
});

import { useEventSampleRequest } from '../useEventSampleRequest';
import { sampleRequestApi } from '../../../../utils/sampleRequestApi';

const args = { eventId: 'ev-1', userId: 'u-1', role: 'salesperson' };

describe('useEventSampleRequest', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers({ shouldAdvanceTime: true }); });
  afterEach(() => vi.useRealTimers());

  it('loads and autosaves only dirty rows', async () => {
    const { result } = renderHook(() => useEventSampleRequest(args));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(sampleRequestApi.getCatalog).toHaveBeenCalledWith(true);
    act(() => result.current.setItem('p-1', 'singles', 2));
    expect(result.current.dirtyCount).toBe(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(900); });
    expect(sampleRequestApi.patchEvent).toHaveBeenCalledWith('ev-1', { items: [{ productId: 'p-1', singles: 2, displays: 0, emptyDisplays: 0 }], materials: [] });
    expect(result.current.dirtyCount).toBe(0);
  });

  it('reconciles untouched rows from the server but keeps dirty and focused rows', async () => {
    const { result } = renderHook(() => useEventSampleRequest(args));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => { result.current.setItem('p-1', 'singles', 7); result.current.markFocused('p-2', true); result.current.setItem('p-2', 'displays', 1); });
    await act(async () => { await vi.advanceTimersByTimeAsync(900); });            // saves both
    vi.mocked(sampleRequestApi.getEvent).mockResolvedValueOnce(view({ request: {
      items: [{ productId: 'p-1', singles: 9, displays: 0, emptyDisplays: 0 }, { productId: 'p-2', singles: 0, displays: 5, emptyDisplays: 0 }],
      lastEditedBy: { id: 'u-2', name: 'Sameer' }, lastEditedAt: '2026-10-07T15:01:00Z',
    } }));
    await act(async () => { await result.current.refresh(); });
    expect(result.current.items.get('p-1')?.singles).toBe(9);      // untouched → server wins
    expect(result.current.items.get('p-2')?.displays).toBe(1);     // focused → local kept
    expect(result.current.updatedBy).toEqual({ name: 'Sameer', at: '2026-10-07T15:01:00Z' });
  });

  it('polls on window focus and every 30 s', async () => {
    renderHook(() => useEventSampleRequest(args));
    await waitFor(() => expect(sampleRequestApi.getEvent).toHaveBeenCalledTimes(1));
    act(() => { window.dispatchEvent(new Event('focus')); });
    await waitFor(() => expect(sampleRequestApi.getEvent).toHaveBeenCalledTimes(2));
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(sampleRequestApi.getEvent).toHaveBeenCalledTimes(3);
  });

  it('submit waits for an in-flight save, flushes dirty rows, aborts when the flush fails', async () => {
    const { result } = renderHook(() => useEventSampleRequest(args));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => result.current.setItem('p-1', 'singles', 1));
    vi.mocked(sampleRequestApi.patchEvent).mockRejectedValueOnce(new Error('net'));
    await act(async () => { await result.current.submit(); });
    expect(sampleRequestApi.submitEvent).not.toHaveBeenCalled();
    expect(result.current.error).toMatch(/submit/i);
    await act(async () => { await result.current.submit(); });   // second try: patch succeeds
    expect(sampleRequestApi.submitEvent).toHaveBeenCalledWith('ev-1');
    expect(result.current.view?.request.status).toBe('submitted');
    expect(result.current.canSubmit).toBe(false);
  });

  it('flips closed on a 409 and forbidden on a 403', async () => {
    const { result } = renderHook(() => useEventSampleRequest(args));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    vi.mocked(sampleRequestApi.patchEvent).mockRejectedValueOnce({ statusCode: 409, details: { error: 'closed', details: { code: 'WINDOW_CLOSED', closesAt: '2026-10-01T00:00:00Z' } } });
    act(() => result.current.setItem('p-1', 'singles', 1));
    await act(async () => { await vi.advanceTimersByTimeAsync(900); });
    expect(result.current.closed).toBe(true);
    vi.mocked(sampleRequestApi.getEvent).mockRejectedValueOnce({ statusCode: 403 });
    const second = renderHook(() => useEventSampleRequest({ ...args, eventId: 'ev-x' }));
    await waitFor(() => expect(second.result.current.status).toBe('forbidden'));
  });

  it('respects canEdit from the server and clamps quantities', async () => {
    vi.mocked(sampleRequestApi.getEvent).mockResolvedValueOnce(view({ canEdit: false }));
    const { result } = renderHook(() => useEventSampleRequest({ ...args, userId: 'puller' }));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.canEdit).toBe(false);
    const r2 = renderHook(() => useEventSampleRequest(args));
    await waitFor(() => expect(r2.result.current.status).toBe('ready'));
    act(() => r2.result.current.setItem('p-1', 'singles', 99999));
    expect(r2.result.current.items.get('p-1')?.singles).toBe(10000);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/checklist/samples/__tests__/useEventSampleRequest.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the hook**

```ts
// src/components/checklist/samples/useEventSampleRequest.ts
/**
 * One shared sample request per event. Rows are tracked individually:
 * only dirty rows are PATCHed, and every server response, poll or focus
 * reconciles the rows the user is not touching (dirty or focused rows keep
 * their local values). Carries over v2.30.0 behaviour: offline → read-only
 * and flush on reconnect, 403 → forbidden, 409 → closed, submit flushes first.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  sampleRequestApi, SampleCatalog, EventSampleRequestView, SampleRequestItem, SampleRequestMaterial, SampleRequestPatch, MAX_SAMPLE_QTY,
} from '../../../utils/sampleRequestApi';

export type SampleStatus = 'loading' | 'ready' | 'offline' | 'error' | 'forbidden';
export type ItemField = 'singles' | 'displays' | 'emptyDisplays';
interface Args { eventId: string; userId: string; role: string }

const AUTOSAVE_MS = 800;
const POLL_MS = 30_000;
const OVERRIDE = ['admin', 'coordinator', 'developer'];
const emptyItem = (productId: string): SampleRequestItem => ({ productId, singles: 0, displays: 0, emptyDisplays: 0 });
const emptyMaterial = (materialId: string): SampleRequestMaterial => ({ materialId, qty: 0, notes: null });
const clampQty = (v: number) => Math.min(MAX_SAMPLE_QTY, Math.max(0, Math.floor(v || 0)));
const isWindowClosed = (e: unknown): boolean =>
  !!e && typeof e === 'object' && (e as any).statusCode === 409 &&
  ((e as any).details?.code === 'WINDOW_CLOSED' || (e as any).details?.details?.code === 'WINDOW_CLOSED');
const isForbidden = (e: unknown): boolean => !!e && typeof e === 'object' && (e as any).statusCode === 403;

export function useEventSampleRequest({ eventId, userId, role }: Args) {
  const [status, setStatus] = useState<SampleStatus>('loading');
  const [catalog, setCatalog] = useState<SampleCatalog | null>(null);
  const [view, setView] = useState<EventSampleRequestView | null>(null);
  const [items, setItems] = useState<Map<string, SampleRequestItem>>(new Map());
  const [materials, setMaterials] = useState<Map<string, SampleRequestMaterial>>(new Map());
  const [dirtyItems, setDirtyItems] = useState<Set<string>>(new Set());
  const [dirtyMaterials, setDirtyMaterials] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [closed, setClosed] = useState(false);
  const [override, setOverride] = useState(false);
  const [isOffline, setIsOffline] = useState(() => typeof navigator !== 'undefined' && navigator.onLine === false);
  const [error, setError] = useState<string | null>(null);
  const [updatedBy, setUpdatedBy] = useState<{ name: string; at: string } | null>(null);
  const [submittedKey, setSubmittedKey] = useState<string | null>(null);

  const focused = useRef<Set<string>>(new Set());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<Promise<boolean> | null>(null);
  const lastEditedAt = useRef<string | null>(null);
  const latest = useRef({ items, materials, dirtyItems, dirtyMaterials, canEdit: false });

  const isOverride = OVERRIDE.includes(role);
  const serverCanEdit = view?.canEdit ?? false;
  const canEdit = status === 'ready' && !isOffline && serverCanEdit && (!closed || (isOverride && override));
  const dirtyCount = dirtyItems.size + dirtyMaterials.size;
  const snapshotKey = useMemo(() => JSON.stringify({
    i: [...items.values()].filter((i) => i.singles || i.displays || i.emptyDisplays).sort((a, b) => a.productId.localeCompare(b.productId)),
    m: [...materials.values()].filter((m) => m.qty || (m.notes && m.notes.trim())).sort((a, b) => a.materialId.localeCompare(b.materialId)).map((m) => ({ ...m, notes: m.notes?.trim() || null })),
  }), [items, materials]);
  const canSubmit = status === 'ready' && !submitting && canEdit && (submittedKey === null || snapshotKey !== submittedKey);

  /** Merge a server view into local state, keeping dirty/focused rows. */
  const reconcile = useCallback((v: EventSampleRequestView) => {
    const { dirtyItems: di, dirtyMaterials: dm } = latest.current;
    setItems((prev) => {
      const next = new Map<string, SampleRequestItem>();
      for (const i of v.request.items) next.set(i.productId, i);
      for (const [id, local] of prev) if (di.has(id) || focused.current.has(id)) next.set(id, local);
      return next;
    });
    setMaterials((prev) => {
      const next = new Map<string, SampleRequestMaterial>();
      for (const m of v.request.materials) next.set(m.materialId, m);
      for (const [id, local] of prev) if (dm.has(id) || focused.current.has(id)) next.set(id, local);
      return next;
    });
    setView(v);
    setClosed(!v.window.isOpen);
    if (v.request.status === 'submitted' && submittedKey === null) {
      setSubmittedKey(JSON.stringify({
        i: [...v.request.items].sort((a, b) => a.productId.localeCompare(b.productId)),
        m: [...v.request.materials].sort((a, b) => a.materialId.localeCompare(b.materialId)).map((m) => ({ ...m, notes: m.notes?.trim() || null })),
      }));
    }
    const at = v.request.lastEditedAt;
    if (at && at !== lastEditedAt.current && v.request.lastEditedBy && v.request.lastEditedBy.id !== userId && lastEditedAt.current !== null) {
      setUpdatedBy({ name: v.request.lastEditedBy.name, at });
    }
    lastEditedAt.current = at;
  }, [userId, submittedKey]);

  latest.current = { items, materials, dirtyItems, dirtyMaterials, canEdit };

  const refresh = useCallback(async () => {
    try { reconcile(await sampleRequestApi.getEvent(eventId)); } catch { /* keep last state */ }
  }, [eventId, reconcile]);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    (async () => {
      try {
        const [c, v] = await Promise.all([sampleRequestApi.getCatalog(true), sampleRequestApi.getEvent(eventId)]);
        if (cancelled) return;
        setCatalog(c); reconcile(v); setStatus('ready');
      } catch (e) {
        if (cancelled) return;
        setStatus(isForbidden(e) ? 'forbidden' : (typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'error'));
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  // Poll + focus
  useEffect(() => {
    if (status !== 'ready') return;
    const onFocus = () => { void refresh(); };
    window.addEventListener('focus', onFocus);
    const id = setInterval(() => { void refresh(); }, POLL_MS);
    return () => { window.removeEventListener('focus', onFocus); clearInterval(id); };
  }, [status, refresh]);

  const buildPatch = useCallback((): SampleRequestPatch => {
    const { items: it, materials: mt, dirtyItems: di, dirtyMaterials: dm } = latest.current;
    return {
      items: [...di].map((id) => it.get(id) ?? emptyItem(id)),
      materials: [...dm].map((id) => mt.get(id) ?? emptyMaterial(id)),
    };
  }, []);

  const persist = useCallback(async (): Promise<boolean> => {
    const patch = buildPatch();
    if (patch.items.length === 0 && patch.materials.length === 0) return true;
    const sentItems = new Set(patch.items.map((i) => i.productId));
    const sentMaterials = new Set(patch.materials.map((m) => m.materialId));
    setSaving(true); setError(null);
    try {
      const v = await sampleRequestApi.patchEvent(eventId, patch);
      // Rows edited again while in flight stay dirty; the rest are clean now.
      setDirtyItems((prev) => new Set([...prev].filter((id) => !sentItems.has(id) || latest.current.items.get(id) !== patch.items.find((i) => i.productId === id))));
      setDirtyMaterials((prev) => new Set([...prev].filter((id) => !sentMaterials.has(id) || latest.current.materials.get(id) !== patch.materials.find((m) => m.materialId === id))));
      reconcile(v);
      return true;
    } catch (e) {
      if (isWindowClosed(e)) setClosed(true);
      else setError('Could not save your changes. Check your connection and try again.');
      return false;
    } finally {
      setSaving(false);
    }
  }, [buildPatch, eventId, reconcile]);

  // Debounced autosave
  useEffect(() => {
    if (dirtyCount === 0 || !canEdit) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const p = persist();
      pending.current = p;
      void p.finally(() => { if (pending.current === p) pending.current = null; });
    }, AUTOSAVE_MS);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [dirtyCount, canEdit, persist, snapshotKey]);

  // Online / offline
  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => { setIsOffline(false); if (latest.current.dirtyItems.size + latest.current.dirtyMaterials.size > 0) void persist(); };
    window.addEventListener('offline', goOffline); window.addEventListener('online', goOnline);
    return () => { window.removeEventListener('offline', goOffline); window.removeEventListener('online', goOnline); };
  }, [persist]);

  // Best-effort save on unmount
  useEffect(() => () => {
    const { dirtyItems: di, dirtyMaterials: dm, canEdit: ce } = latest.current;
    if (!ce || di.size + dm.size === 0) return;
    void sampleRequestApi.patchEvent(eventId, buildPatch()).catch(() => undefined);
  }, [eventId, buildPatch]);

  const setItem = useCallback((productId: string, field: ItemField, value: number) => {
    setItems((prev) => { const next = new Map(prev); next.set(productId, { ...(prev.get(productId) ?? emptyItem(productId)), [field]: clampQty(value) }); return next; });
    setDirtyItems((prev) => new Set(prev).add(productId));
  }, []);

  const setMaterial = useCallback((materialId: string, patch: Partial<Pick<SampleRequestMaterial, 'qty' | 'notes'>>) => {
    setMaterials((prev) => {
      const next = new Map(prev); const cur = prev.get(materialId) ?? emptyMaterial(materialId);
      next.set(materialId, { ...cur, ...patch, qty: patch.qty === undefined ? cur.qty : clampQty(patch.qty) });
      return next;
    });
    setDirtyMaterials((prev) => new Set(prev).add(materialId));
  }, []);

  const markFocused = useCallback((id: string, isFocused: boolean) => {
    if (isFocused) focused.current.add(id); else focused.current.delete(id);
  }, []);

  const submit = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true); setError(null);
    try {
      if (timer.current) clearTimeout(timer.current);
      if (pending.current) await pending.current;
      if (!(await persist())) { setError('Could not submit: your latest changes did not save.'); return; }
      const v = await sampleRequestApi.submitEvent(eventId);
      setSubmittedKey(snapshotKey);
      reconcile(v);
    } catch (e) {
      if (isWindowClosed(e)) setClosed(true);
      else setError('Could not submit. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, persist, eventId, snapshotKey, reconcile]);

  return {
    status, catalog, view, items, materials, dirtyCount, saving, submitting, closed, override, setOverride,
    canEdit, canSubmit, isOffline, error, updatedBy, setItem, setMaterial, markFocused, submit, refresh,
  };
}
```

Note on `submittedKey`: after a submit, `canSubmit` is false until any row changes (`snapshotKey` moves). After a fresh load of an already-submitted form, `reconcile` seeds `submittedKey` from the server contents so "Resubmit changes" starts disabled.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/components/checklist/samples/__tests__/useEventSampleRequest.test.ts`
Expected: 6 PASS. If the reconcile test's `updatedBy` assertion fails because the initial load sets `lastEditedAt.current` to null and the first refresh then counts as "first", confirm the guard `lastEditedAt.current !== null` is evaluated before assignment as written; the initial load has `lastEditedAt: null`, so the subsequent refresh with Sameer's timestamp must set `updatedBy` — adjust the guard to `(lastEditedAt.current !== null || v.request.lastEditedBy.id !== userId)` only if the test still fails, and say so in the report.

- [ ] **Step 5: Commit**

```bash
git add src/components/checklist/samples/useEventSampleRequest.ts src/components/checklist/samples/__tests__/useEventSampleRequest.test.ts
git commit -m "feat(sample-requests): shared-request hook with row-level saves and reconciliation

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 8: `SamplesPanel` and `SampleHistory`

**Files:**
- Modify: `src/components/checklist/samples/sampleRequestText.ts` (add `formatRelative`, `formatShortDate`, `describeChange`)
- Modify: `src/components/checklist/samples/ProductTable.tsx`, `MaterialsTable.tsx` (optional `onFocusChange` prop)
- Create: `src/components/checklist/samples/SampleHistory.tsx`
- Create: `src/components/checklist/samples/SamplesPanel.tsx`
- Test: `src/components/checklist/samples/__tests__/sampleRequestText.test.ts` (add cases), `SamplesPanel.test.tsx`, `SampleHistory.test.tsx`

**Interfaces:**
- Consumes: `useEventSampleRequest` (Task 7), `sampleRequestApi.getHistory` and `SampleChangeRow` (Task 6), existing `formatCountdown`/`isUrgent`/`formatCloseDate`.
- Produces: `<SamplesPanel eventId userId role onStatusChange? />` where `onStatusChange?: (status: 'draft' | 'submitted') => void`; `<SampleHistory eventId refreshKey />`; text helpers `formatRelative(iso, now?)`, `formatShortDate(iso)`, `describeChange(row)`.
- The old `SampleRequestSection`, `SamplesSummaryTab` and `useSampleRequest` stay in place in this task (Task 9 removes them), so the app keeps compiling.

- [ ] **Step 1: Write the failing text-helper tests**

Append to `sampleRequestText.test.ts`:

```ts
import { formatRelative, formatShortDate, describeChange } from '../sampleRequestText';

describe('formatRelative', () => {
  const now = new Date('2026-10-15T12:00:00Z');
  it('says just now under a minute', () => { expect(formatRelative('2026-10-15T11:59:30Z', now)).toBe('just now'); });
  it('uses minutes under an hour', () => { expect(formatRelative('2026-10-15T11:55:00Z', now)).toBe('5 min ago'); });
  it('uses hours under a day', () => { expect(formatRelative('2026-10-15T09:00:00Z', now)).toBe('3 h ago'); });
  it('falls back to a short date', () => { expect(formatRelative('2026-10-12T09:00:00Z', now)).toBe('on Oct 12'); });
});

describe('formatShortDate', () => {
  it('renders month and day in Eastern time', () => { expect(formatShortDate('2026-10-14T16:00:00Z')).toBe('Oct 14'); });
});

describe('describeChange', () => {
  const base = { id: 'c', userId: 'u', userName: 'Sameer', kind: 'item' as const, targetId: 'p', targetName: 'Mango', lineName: 'Peelz', brand: 'boomin_brands' as const, changedAt: '' };
  it('describes a quantity change', () => {
    expect(describeChange({ ...base, field: 'singles', oldValue: '2', newValue: '4' })).toBe('Sameer changed Mango singles 2 → 4');
    expect(describeChange({ ...base, field: 'empty_displays', oldValue: '0', newValue: '1' })).toBe('Sameer changed Mango empty displays 0 → 1');
  });
  it('describes notes and a missing user', () => {
    expect(describeChange({ ...base, userName: null, kind: 'material', targetName: 'Banner', lineName: null, brand: null, field: 'notes', oldValue: null, newValue: 'big one' }))
      .toBe('Someone changed Banner notes to "big one"');
    expect(describeChange({ ...base, kind: 'material', targetName: 'Banner', field: 'notes', oldValue: 'x', newValue: null })).toBe('Sameer cleared Banner notes');
  });
});
```

- [ ] **Step 2: Implement the helpers**

Append to `sampleRequestText.ts`:

```ts
import type { SampleChangeRow } from '../../../utils/sampleRequestApi';

export function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' });
}

export function formatRelative(iso: string, now: Date = new Date()): string {
  const ago = now.getTime() - new Date(iso).getTime();
  if (ago < 60_000) return 'just now';
  if (ago < 3_600_000) return `${Math.floor(ago / 60_000)} min ago`;
  if (ago < 86_400_000) return `${Math.floor(ago / 3_600_000)} h ago`;
  return `on ${formatShortDate(iso)}`;
}

const FIELD_LABEL: Record<SampleChangeRow['field'], string> = {
  singles: 'singles', displays: 'displays', empty_displays: 'empty displays', qty: 'qty', notes: 'notes',
};

export function describeChange(c: SampleChangeRow): string {
  const who = c.userName ?? 'Someone';
  if (c.field === 'notes') {
    return c.newValue ? `${who} changed ${c.targetName} notes to "${c.newValue}"` : `${who} cleared ${c.targetName} notes`;
  }
  return `${who} changed ${c.targetName} ${FIELD_LABEL[c.field]} ${c.oldValue ?? '0'} → ${c.newValue ?? '0'}`;
}
```

Put the `import type` at the top of the file with any existing imports. Run: `npx vitest run src/components/checklist/samples/__tests__/sampleRequestText.test.ts` → all PASS.

- [ ] **Step 3: Add focus reporting to the two tables**

In `ProductTable.tsx` add to `Props`: `onFocusChange?: (productId: string, focused: boolean) => void;`, destructure it, and add to the `<input>`:

```tsx
                    onFocus={() => onFocusChange?.(p.id, true)}
                    onBlur={() => onFocusChange?.(p.id, false)}
```

In `MaterialsTable.tsx` add `onFocusChange?: (materialId: string, focused: boolean) => void;` and the same two handlers (with `m.id`) on BOTH the qty and the notes inputs.

- [ ] **Step 4: Write the failing component tests**

```tsx
// src/components/checklist/samples/__tests__/SampleHistory.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../../../utils/sampleRequestApi', async (orig) => {
  const actual = await orig<typeof import('../../../../utils/sampleRequestApi')>();
  return { ...actual, sampleRequestApi: { getHistory: vi.fn() } };
});
import { SampleHistory } from '../SampleHistory';
import { sampleRequestApi } from '../../../../utils/sampleRequestApi';

const change = { id: 'c-1', userId: 'u-2', userName: 'Sameer', kind: 'item', targetId: 'p-1', targetName: 'Mango', lineName: 'Peelz', brand: 'boomin_brands', field: 'singles', oldValue: '2', newValue: '4', changedAt: new Date(Date.now() - 5 * 60_000).toISOString() };

describe('SampleHistory', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads only when opened and lists changes newest first as given', async () => {
    vi.mocked(sampleRequestApi.getHistory).mockResolvedValue({ changes: [change] } as any);
    render(<SampleHistory eventId="ev-1" refreshKey="a" />);
    expect(sampleRequestApi.getHistory).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /History/ }));
    expect(await screen.findByText(/Sameer changed Mango singles 2 → 4/)).toBeInTheDocument();
    expect(screen.getByText(/5 min ago/)).toBeInTheDocument();
  });

  it('reloads when refreshKey changes while open, and shows the empty and failure states', async () => {
    vi.mocked(sampleRequestApi.getHistory).mockResolvedValueOnce({ changes: [] } as any);
    const { rerender } = render(<SampleHistory eventId="ev-1" refreshKey="a" />);
    fireEvent.click(screen.getByRole('button', { name: /History/ }));
    expect(await screen.findByText(/No changes yet/)).toBeInTheDocument();
    vi.mocked(sampleRequestApi.getHistory).mockRejectedValueOnce(new Error('x'));
    rerender(<SampleHistory eventId="ev-1" refreshKey="b" />);
    await waitFor(() => expect(sampleRequestApi.getHistory).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/History unavailable/)).toBeInTheDocument();
  });
});
```

```tsx
// src/components/checklist/samples/__tests__/SamplesPanel.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const makeHook = () => ({
  status: 'ready',
  catalog: {
    lines: [{ id: 'l-1', brand: 'boomin_brands', name: 'Peelz', position: 1, is_active: true }, { id: 'l-2', brand: 'haute_brands', name: 'Oh! Mit', position: 1, is_active: true }],
    products: [{ id: 'p-1', product_line_id: 'l-1', name: 'Mango', position: 1, is_active: true }, { id: 'p-2', product_line_id: 'l-2', name: 'Blue Razz', position: 1, is_active: true }],
    materials: [{ id: 'm-1', name: 'Banner', position: 1, is_active: true }],
  },
  view: {
    request: { id: 'r', eventId: 'ev-1', status: 'draft', submittedAt: null, submittedBy: null, lastEditedAt: null, lastEditedBy: null, items: [], materials: [] },
    window: { opensAt: null, closesAt: '2099-01-01T05:00:00Z', isOpen: true }, canEdit: true,
  } as any,
  items: new Map(), materials: new Map(), dirtyCount: 0, saving: false, submitting: false, closed: false, override: false,
  setOverride: vi.fn(), canEdit: true, canSubmit: true, isOffline: false, error: null as string | null, updatedBy: null as { name: string; at: string } | null,
  setItem: vi.fn(), setMaterial: vi.fn(), markFocused: vi.fn(), submit: vi.fn(), refresh: vi.fn(),
});
let hook = makeHook();
vi.mock('../useEventSampleRequest', () => ({ useEventSampleRequest: () => hook }));
vi.mock('../SampleHistory', () => ({ SampleHistory: (p: any) => <div data-testid="history" data-key={p.refreshKey} /> }));

import { SamplesPanel } from '../SamplesPanel';

describe('SamplesPanel', () => {
  beforeEach(() => { hook = makeHook(); });

  it('shows not-yet-submitted, both brands (Haute first), the countdown, Submit and History', () => {
    render(<SamplesPanel eventId="ev-1" userId="u-1" role="salesperson" />);
    expect(screen.getByText('Not yet submitted')).toBeInTheDocument();
    const headings = screen.getAllByRole('heading', { level: 4 }).map((h) => h.textContent);
    expect(headings.indexOf('Haute Brands')).toBeLessThan(headings.indexOf('Coolioh'));
    expect(screen.getByText(/Closes in/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit sample request' })).toBeEnabled();
    expect(screen.getByTestId('history')).toBeInTheDocument();
  });

  it('shows who submitted and who last edited, and Resubmit changes', () => {
    hook.view.request = { ...hook.view.request, status: 'submitted', submittedAt: '2026-10-14T16:00:00Z', submittedBy: { id: 'u-5', name: 'Rita' },
      lastEditedAt: new Date(Date.now() - 5 * 60_000).toISOString(), lastEditedBy: { id: 'u-2', name: 'Sameer' } };
    hook.canSubmit = false;
    const onStatusChange = vi.fn();
    render(<SamplesPanel eventId="ev-1" userId="u-1" role="salesperson" onStatusChange={onStatusChange} />);
    expect(screen.getByText(/Submitted by Rita on Oct 14 · last edited by Sameer 5 min ago/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resubmit changes' })).toBeDisabled();
    expect(onStatusChange).toHaveBeenCalledWith('submitted');
  });

  it('reports focus to the hook and edits through setItem', () => {
    render(<SamplesPanel eventId="ev-1" userId="u-1" role="salesperson" />);
    const input = screen.getByLabelText('Mango singles');
    fireEvent.focus(input);
    expect(hook.markFocused).toHaveBeenCalledWith('p-1', true);
    fireEvent.change(input, { target: { value: '4' } });
    expect(hook.setItem).toHaveBeenCalledWith('p-1', 'singles', 4);
    fireEvent.blur(input);
    expect(hook.markFocused).toHaveBeenCalledWith('p-1', false);
  });

  it('shows the updated-by note', () => {
    hook.updatedBy = { name: 'Sameer', at: new Date().toISOString() };
    render(<SamplesPanel eventId="ev-1" userId="u-1" role="salesperson" />);
    expect(screen.getByText(/Updated by Sameer just now/)).toBeInTheDocument();
  });

  it('is view-only for someone who cannot edit while the window is open', () => {
    hook.view.canEdit = false; hook.canEdit = false; hook.canSubmit = false;
    render(<SamplesPanel eventId="ev-1" userId="puller" role="salesperson" />);
    expect(screen.getByText(/View only/)).toBeInTheDocument();
    expect(screen.getByLabelText('Mango singles')).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Submit sample request/ })).not.toBeInTheDocument();
  });

  it('closed: banner, disabled inputs, Edit anyway only for override roles', () => {
    hook.closed = true; hook.canEdit = false;
    const { rerender } = render(<SamplesPanel eventId="ev-1" userId="u-1" role="salesperson" />);
    expect(screen.getByText(/closed on/i)).toBeInTheDocument();
    expect(screen.queryByText(/Edit anyway/)).not.toBeInTheDocument();
    rerender(<SamplesPanel eventId="ev-1" userId="adm" role="admin" />);
    fireEvent.click(screen.getByLabelText(/Edit anyway/));
    expect(hook.setOverride).toHaveBeenCalledWith(true);
  });

  it('renders nothing when forbidden, and the offline note when offline', () => {
    hook.status = 'forbidden';
    const { container, rerender } = render(<SamplesPanel eventId="ev-1" userId="u-9" role="salesperson" />);
    expect(container).toBeEmptyDOMElement();
    hook = makeHook(); hook.isOffline = true; hook.canEdit = false;
    rerender(<SamplesPanel eventId="ev-1" userId="u-1" role="salesperson" />);
    expect(screen.getByText(/You're offline/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Run to verify they fail**

Run: `npx vitest run src/components/checklist/samples/__tests__/SamplesPanel.test.tsx src/components/checklist/samples/__tests__/SampleHistory.test.tsx`
Expected: FAIL (modules not found).

- [ ] **Step 6: Implement `SampleHistory`**

```tsx
// src/components/checklist/samples/SampleHistory.tsx
/**
 * Collapsible change history for an event's sample request. Loads when
 * opened and again whenever refreshKey changes while open. A failure here
 * never affects editing.
 */
import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { sampleRequestApi, SampleChangeRow } from '../../../utils/sampleRequestApi';
import { describeChange, formatRelative } from './sampleRequestText';

interface Props { eventId: string; refreshKey: string | null }

export const SampleHistory: React.FC<Props> = ({ eventId, refreshKey }) => {
  const [open, setOpen] = useState(false);
  const [changes, setChanges] = useState<SampleChangeRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setFailed(false);
    sampleRequestApi.getHistory(eventId)
      .then((r) => { if (!cancelled) setChanges(r.changes || []); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [open, eventId, refreshKey]);

  return (
    <div className="rounded-xl border border-stone-100 p-3 md:p-4">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="inline-flex items-center gap-1 font-display font-semibold text-stone-900">
        {open ? <ChevronDown aria-hidden="true" className="h-4 w-4" /> : <ChevronRight aria-hidden="true" className="h-4 w-4" />}
        History
      </button>
      {open && (
        failed ? <p className="mt-2 text-sm text-stone-500">History unavailable.</p>
        : changes === null ? <p className="mt-2 text-sm text-stone-500">Loading history…</p>
        : changes.length === 0 ? <p className="mt-2 text-sm text-stone-500">No changes yet.</p>
        : (
          <ul className="mt-2 divide-y divide-stone-100 text-sm">
            {changes.map((c) => (
              <li key={c.id} className="flex flex-wrap items-baseline justify-between gap-2 py-1.5">
                <span className="text-stone-700">{describeChange(c)}</span>
                <span className="text-[11px] text-stone-400">{formatRelative(c.changedAt)}</span>
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
};
```

- [ ] **Step 7: Implement `SamplesPanel`**

```tsx
// src/components/checklist/samples/SamplesPanel.tsx
/**
 * The event's one shared sample request. Used on the booking board (admins)
 * and under My Checklist (reps). Anyone on the show edits it; saves are
 * row-level; a puller off the roster sees it read-only. History below.
 */
import React, { useEffect, useState } from 'react';
import { Package, AlertCircle, WifiOff } from 'lucide-react';
import { SAMPLE_BRAND_LABELS, SAMPLE_BRAND_ORDER, SampleBrand } from '../../../utils/sampleRequestApi';
import { useEventSampleRequest } from './useEventSampleRequest';
import { ProductTable } from './ProductTable';
import { MaterialsTable } from './MaterialsTable';
import { SampleHistory } from './SampleHistory';
import { formatCountdown, isUrgent, formatCloseDate, formatRelative, formatShortDate } from './sampleRequestText';

interface Props {
  eventId: string; userId: string; role: string;
  /** Lets the booking board keep its 0/1 → 1/1 tab count current. */
  onStatusChange?: (status: 'draft' | 'submitted') => void;
}

const OVERRIDE = ['admin', 'coordinator', 'developer'];

export const SamplesPanel: React.FC<Props> = ({ eventId, userId, role, onStatusChange }) => {
  const s = useEventSampleRequest({ eventId, userId, role });
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(t); }, []);

  const req = s.view?.request ?? null;
  const reqStatus = req?.status;
  useEffect(() => { if (reqStatus) onStatusChange?.(reqStatus); }, [reqStatus, onStatusChange]);

  if (s.status === 'forbidden') return null;

  const closesAt = s.view?.window.closesAt ?? null;
  const submitted = reqStatus === 'submitted';
  const isOverride = OVERRIDE.includes(role);
  const pastDeadline = !!closesAt && new Date(closesAt).getTime() <= now.getTime();
  const closed = s.closed || pastDeadline;
  const canEdit = s.canEdit && (!pastDeadline || (isOverride && s.override));
  const viewOnly = s.status === 'ready' && !closed && !s.isOffline && s.view?.canEdit === false;

  const statusPill = closed
    ? { text: 'Closed', cls: 'bg-stone-100 text-stone-600 ring-stone-200' }
    : submitted
      ? { text: 'Submitted', cls: 'bg-accent-50 text-accent-700 ring-accent-200' }
      : { text: 'Draft', cls: 'bg-amber-50 text-amber-800 ring-amber-200' };

  const statusLine = !req ? null
    : [
        submitted && req.submittedAt ? `Submitted by ${req.submittedBy?.name ?? 'someone'} on ${formatShortDate(req.submittedAt)}` : 'Not yet submitted',
        req.lastEditedAt ? `last edited by ${req.lastEditedBy?.name ?? 'someone'} ${formatRelative(req.lastEditedAt, now)}` : null,
      ].filter(Boolean).join(' · ');

  return (
    <section aria-label="Sample request" className="space-y-4 p-4 md:p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50">
            <Package aria-hidden="true" className="h-5 w-5 text-brand-600" />
          </span>
          <div>
            <h3 className="font-display font-semibold tracking-tight text-stone-900">Sample Request</h3>
            <p className="mt-0.5 text-sm text-stone-500">One list for the whole show. Anyone attending can update it.</p>
            {statusLine && <p className="mt-1 text-xs text-stone-500">{statusLine}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`chip px-2 py-0.5 text-[11px] ring-1 ${statusPill.cls}`}>{statusPill.text}</span>
          {closesAt && !closed && (
            <span className={`text-xs font-semibold tabular-nums ${isUrgent(closesAt, now) ? 'text-red-600' : 'text-stone-600'}`}>
              Closes in {formatCountdown(closesAt, now)}
            </span>
          )}
        </div>
      </header>

      {s.status === 'loading' && <p className="text-sm text-stone-500">Loading sample request…</p>}

      {s.status === 'offline' && (
        <div className="flex items-start gap-2 rounded-xl border border-stone-200 bg-stone-50 p-3 text-sm text-stone-600">
          <WifiOff aria-hidden="true" className="h-4 w-4 shrink-0" />
          <p>You're offline. Reconnect to edit the sample request.</p>
        </div>
      )}

      {s.status === 'error' && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0" />
          <p>Couldn't load the sample request. Try refreshing.</p>
        </div>
      )}

      {s.status === 'ready' && s.catalog && (
        <>
          {s.isOffline && (
            <div className="flex items-start gap-2 rounded-xl border border-stone-200 bg-stone-50 p-3 text-sm text-stone-600">
              <WifiOff aria-hidden="true" className="h-4 w-4 shrink-0" />
              <p>You're offline. Reconnect to edit the sample request.</p>
            </div>
          )}
          {viewOnly && (
            <p className="rounded-xl border border-stone-200 bg-stone-50 p-3 text-sm text-stone-600">
              View only. People attending this show can edit the list.
            </p>
          )}
          {closed && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-stone-200 bg-stone-50 p-3 text-sm text-stone-700">
              <p>Sample requests for this show closed on {closesAt ? formatCloseDate(closesAt) : 'the deadline'}. Contact your coordinator for changes.</p>
              {isOverride && (
                <label className="inline-flex items-center gap-2 text-xs font-semibold">
                  <input type="checkbox" checked={s.override} onChange={(e) => s.setOverride(e.target.checked)} />
                  Edit anyway
                </label>
              )}
            </div>
          )}
          {s.updatedBy && (
            <p className="text-xs text-brand-700" aria-live="polite">Updated by {s.updatedBy.name} {formatRelative(s.updatedBy.at, now)}</p>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            {SAMPLE_BRAND_ORDER.map((brand: SampleBrand) => {
              const onRequest = (lineId: string) => s.catalog!.products.some((p) => p.product_line_id === lineId && s.items.has(p.id));
              const lines = s.catalog!.lines.filter((l) => l.brand === brand && (l.is_active || onRequest(l.id)));
              return (
                <div key={brand} className="rounded-xl border border-stone-100 p-3 md:p-4 space-y-4">
                  <h4 className="font-display font-semibold text-stone-900">{SAMPLE_BRAND_LABELS[brand]}</h4>
                  {lines.map((line) => {
                    const products = s.catalog!.products
                      .filter((p) => p.product_line_id === line.id && ((p.is_active && line.is_active) || s.items.has(p.id)))
                      .sort((a, b) => a.position - b.position);
                    if (products.length === 0) return null;
                    return (
                      <ProductTable key={line.id} lineName={line.name} products={products} items={s.items}
                        disabled={!canEdit} onChange={s.setItem} onFocusChange={s.markFocused} />
                    );
                  })}
                </div>
              );
            })}
          </div>

          <div className="rounded-xl border border-stone-100 p-3 md:p-4">
            <h4 className="font-display font-semibold text-stone-900 mb-2">Marketing &amp; booth supplies</h4>
            <MaterialsTable
              materials={s.catalog.materials.filter((m) => m.is_active || s.materials.has(m.id))}
              values={s.materials} disabled={!canEdit} onChange={s.setMaterial} onFocusChange={s.markFocused} />
          </div>

          {!viewOnly && (
            <footer className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-stone-500" aria-live="polite">
                {s.error ? <span className="text-red-600">{s.error}</span>
                  : s.saving ? 'Saving…' : s.dirtyCount > 0 ? 'Unsaved changes' : 'All changes saved'}
              </p>
              <button type="button" onClick={s.submit} disabled={!s.canSubmit || !canEdit} className="btn-primary min-h-[44px] px-5 lg:min-h-0">
                {s.submitting ? 'Submitting…' : submitted ? 'Resubmit changes' : 'Submit sample request'}
              </button>
            </footer>
          )}

          <SampleHistory eventId={eventId} refreshKey={req?.lastEditedAt ?? null} />
        </>
      )}
    </section>
  );
};
```

Note: the line sub-header inside `ProductTable` is an `h4` too; change it to `h5` in `ProductTable.tsx` so the panel test's level-4 heading query returns only brand and card titles (this also fixes the heading-level nit from the v2.30.0 review).

- [ ] **Step 8: Run tests and lint**

Run: `npx vitest run src/components/checklist/samples && npm run lint`
Expected: new tests PASS; the old `SampleRequestSection`/`SamplesSummaryTab`/`useSampleRequest` tests will now FAIL to type-check or run because Task 6 removed the API methods they mock — that is expected and they are deleted in Task 9. Report their names; do not fix them. Lint: 0 errors.

- [ ] **Step 9: Commit**

```bash
git add src/components/checklist/samples
git commit -m "feat(sample-requests): SamplesPanel and change history for the shared request

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 9: Placement — Samples on the booking board and under My Checklist; remove the per-rep UI

**Files:**
- Modify: `src/components/checklist/BookingBoardTabs.tsx:11` (`BoardTabKey`)
- Modify: `src/components/checklist/BookingBoard.tsx` (props, `tabs`, `panels`, tab state)
- Modify: `src/components/checklist/TradeShowChecklist.tsx` (`ChecklistTab`, hash handling, early return, segmented control, render)
- Modify: `src/components/checklist/UserChecklist.tsx` (hash handling, render)
- Modify: `src/components/checklist/samples/ProductTable.tsx:3` (import `ItemField` from `./useEventSampleRequest`)
- Delete: `src/components/checklist/samples/SampleRequestSection.tsx`, `SamplesSummaryTab.tsx`, `useSampleRequest.ts`, and `__tests__/SampleRequestSection.test.tsx`, `__tests__/SamplesSummaryTab.test.tsx`, `__tests__/useSampleRequest.test.ts`
- Test: rewrite `src/components/checklist/samples/__tests__/checklistHashLinks.test.tsx`; create `src/components/checklist/__tests__/BookingBoard.samples.test.tsx`

**Interfaces:**
- Consumes: `SamplesPanel` (Task 8), `sampleRequestApi.getEvent` and `getEventAccess` (Task 6).
- Produces: `BookingBoard` props `requestedTab?: BoardTabKey | null` and `onRequestedTabHandled?: () => void`; `BoardTabKey` includes `'samples'`; `ChecklistTab = 'admin' | 'user'`.
- Deep-link contract: `#event=<id>&tab=samples` → privileged users land on Admin Checklist with the Samples board tab active; reps land on My Checklist with that show selected (the panel is always visible there). `tab=my` unchanged.

- [ ] **Step 1: Write the failing board test**

```tsx
// src/components/checklist/__tests__/BookingBoard.samples.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';

let lastPanelProps: any = null;
vi.mock('../samples/SamplesPanel', () => ({
  SamplesPanel: (p: any) => { lastPanelProps = p; return <div data-testid="samples-panel" data-event={p.eventId} />; },
}));
vi.mock('../../../utils/sampleRequestApi', async (orig) => {
  const actual = await orig<typeof import('../../../utils/sampleRequestApi')>();
  return { ...actual, sampleRequestApi: { getEvent: vi.fn(async () => ({ request: { status: 'draft' }, window: {}, canEdit: true })) } };
});

import { BookingBoard } from '../BookingBoard';
import { sampleRequestApi } from '../../../utils/sampleRequestApi';

const user = { id: 'adm', name: 'Admin', username: 'a', email: 'a@x.com', role: 'admin' } as any;
const event = { id: 'ev-1', name: 'Expo', participants: [] } as any;
const checklist = { id: 1, event_id: 1, booth_ordered: false, booth_notes: null, booth_map_url: null, electricity_ordered: false, electricity_notes: null, flights: [], hotels: [], carRentals: [], boothShipping: [], customItems: [] } as any;
const props = { checklist, user, event, saving: false, onUpdate: vi.fn(async () => undefined), onReload: vi.fn() };

describe('BookingBoard samples tab', () => {
  beforeEach(() => { vi.clearAllMocks(); lastPanelProps = null; });

  it('has a Samples tab after Tasks showing 0/1, and opens it when requested', async () => {
    const handled = vi.fn();
    render(<BookingBoard {...props} requestedTab="samples" onRequestedTabHandled={handled} />);
    const tabs = screen.getAllByRole('tab').map((t) => t.textContent);
    expect(tabs[tabs.length - 1]).toMatch(/^Samples/);
    expect(screen.getByRole('tab', { name: /Samples/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /Samples/ }).textContent).toContain('0/1');
    expect(screen.getByTestId('samples-panel')).toHaveAttribute('data-event', 'ev-1');
    expect(lastPanelProps).toMatchObject({ eventId: 'ev-1', userId: 'adm', role: 'admin' });
    await waitFor(() => expect(handled).toHaveBeenCalled());
  });

  it('counts 1/1 once the event request is submitted, from the fetch or from the panel', async () => {
    vi.mocked(sampleRequestApi.getEvent).mockResolvedValueOnce({ request: { status: 'submitted' }, window: {}, canEdit: true } as any);
    const { unmount } = render(<BookingBoard {...props} requestedTab="samples" />);
    await waitFor(() => expect(screen.getByRole('tab', { name: /Samples/ }).textContent).toContain('1/1'));
    unmount();
    render(<BookingBoard {...props} requestedTab="samples" />);
    await waitFor(() => expect(sampleRequestApi.getEvent).toHaveBeenCalledTimes(2));
    await act(async () => { await Promise.resolve(); });   // let the board's own status fetch settle first
    act(() => lastPanelProps.onStatusChange('submitted'));
    expect(screen.getByRole('tab', { name: /Samples/ }).textContent).toContain('1/1');
  });
});
```

- [ ] **Step 2: Rewrite the hash-link test**

Replace the whole of `src/components/checklist/samples/__tests__/checklistHashLinks.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';

vi.mock('../../../../utils/api', () => ({
  api: {
    USE_SERVER: true,
    getEvents: vi.fn(),
    checklist: { getChecklist: vi.fn(async () => ({ id: 1, event_id: 1, flights: [], hotels: [], carRentals: [], boothShipping: [], customItems: [] })) },
  },
}));
vi.mock('../../../../utils/sampleRequestApi', async (orig) => {
  const actual = await orig<typeof import('../../../../utils/sampleRequestApi')>();
  return { ...actual, sampleRequestApi: { getEventAccess: vi.fn(async () => ({ canView: true, canEdit: true })) } };
});
vi.mock('../SamplesPanel', () => ({ SamplesPanel: (p: any) => <div data-testid="samples-panel" data-event={p.eventId} /> }));
vi.mock('../../BookingBoard', () => ({
  BookingBoard: (p: any) => <div data-testid="board" data-event={p.event.id} data-tab={p.requestedTab ?? ''} />,
}));

import { UserChecklist } from '../../UserChecklist';
import { TradeShowChecklist } from '../../TradeShowChecklist';
import { api } from '../../../../utils/api';
import { sampleRequestApi } from '../../../../utils/sampleRequestApi';

const rep = { id: 'u-1', name: 'Rep', username: 'r', email: 'r@x.com', role: 'salesperson' } as any;
const admin = { id: 'adm', name: 'Admin', username: 'a', email: 'a@x.com', role: 'admin' } as any;
const ev = (id: string) => ({ id, name: `Show ${id}`, startDate: '2099-01-01', endDate: '2099-01-02', showStartDate: '2099-01-01', showEndDate: '2099-01-02', participants: [{ id: 'u-1' }] });

const go = (hash: string) => act(() => { window.location.hash = hash; window.dispatchEvent(new HashChangeEvent('hashchange')); });

describe('checklist #event hash links (shared sample request)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    history.replaceState(null, '', window.location.pathname);
    vi.mocked(api.getEvents).mockResolvedValue([ev('ev-1'), ev('ev-2')] as any);
  });

  it('a rep sees the Samples panel for the selected show and follows a tab=samples link', async () => {
    render(<UserChecklist user={rep} />);
    expect(await screen.findByTestId('samples-panel')).toHaveAttribute('data-event', 'ev-1');
    expect(screen.getByRole('tab', { name: 'Samples' })).toBeInTheDocument();
    go('#event=ev-2&tab=samples');
    await waitFor(() => expect(screen.getByTestId('samples-panel')).toHaveAttribute('data-event', 'ev-2'));
    expect(window.location.hash).toBe('');
  });

  it('hides the Samples block when the rep cannot view that show', async () => {
    vi.mocked(sampleRequestApi.getEventAccess).mockResolvedValue({ canView: false, canEdit: false });
    render(<UserChecklist user={rep} />);
    await waitFor(() => expect(sampleRequestApi.getEventAccess).toHaveBeenCalledWith('ev-1'));
    expect(screen.queryByTestId('samples-panel')).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Samples' })).not.toBeInTheDocument();
  });

  it('an embedded My Checklist shows no Samples panel and leaves tab=samples links alone', async () => {
    render(<UserChecklist user={admin} embedded />);
    await waitFor(() => expect(api.getEvents).toHaveBeenCalled());
    expect(screen.queryByTestId('samples-panel')).not.toBeInTheDocument();
    go('#event=ev-2&tab=samples');
    expect(window.location.hash).toBe('#event=ev-2&tab=samples');
  });

  it('an admin opening a tab=samples link lands on the board with the Samples tab requested', async () => {
    window.location.hash = '#event=ev-2&tab=samples';
    render(<TradeShowChecklist user={admin} />);
    const board = await screen.findByTestId('board');
    expect(board).toHaveAttribute('data-event', 'ev-2');
    expect(board).toHaveAttribute('data-tab', 'samples');
    expect(screen.queryByRole('button', { name: 'Samples' })).not.toBeInTheDocument();
    expect(window.location.hash).toBe('');
  });

  it('a rep gets My Checklist straight away with no access round-trip at the page level', async () => {
    render(<TradeShowChecklist user={rep} />);
    expect(await screen.findByTestId('samples-panel')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Admin Checklist' })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run to verify both fail**

Run: `npx vitest run src/components/checklist/__tests__/BookingBoard.samples.test.tsx src/components/checklist/samples/__tests__/checklistHashLinks.test.tsx`
Expected: FAIL.

- [ ] **Step 4: Booking board**

`BookingBoardTabs.tsx` line 11:

```ts
export type BoardTabKey = 'booth' | 'flights' | 'hotels' | 'cars' | 'tasks' | 'samples';
```

`BookingBoard.tsx`:
- Imports: `useCallback, useEffect` alongside `useState`; `import { SamplesPanel } from './samples/SamplesPanel';` and `import { sampleRequestApi } from '../../utils/sampleRequestApi';`.
- Props: add

```ts
  /** A deep link asked for a specific board tab (e.g. samples). */
  requestedTab?: BoardTabKey | null;
  onRequestedTabHandled?: () => void;
```

- State and effects (replace the `boardTab` line):

```ts
  const [boardTab, setBoardTab] = useState<BoardTabKey>(requestedTab ?? 'booth');
  const [samplesSubmitted, setSamplesSubmitted] = useState(false);

  useEffect(() => {
    if (!requestedTab) return;
    setBoardTab(requestedTab);
    onRequestedTabHandled?.();
  }, [requestedTab, onRequestedTabHandled]);

  // The tab wears 0/1 → 1/1; the panel reports later changes itself.
  useEffect(() => {
    let cancelled = false;
    setSamplesSubmitted(false);
    sampleRequestApi.getEvent(event.id)
      .then((v) => { if (!cancelled) setSamplesSubmitted(v.request.status === 'submitted'); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [event.id]);

  const handleSamplesStatus = useCallback((s: 'draft' | 'submitted') => setSamplesSubmitted(s === 'submitted'), []);
```

- Append to `tabs` after the `tasks` entry:

```ts
    { key: 'samples', label: 'Samples', completed: samplesSubmitted ? 1 : 0, total: 1 },
```

- Append to `panels`:

```tsx
    samples: (
      <SamplesPanel key={event.id} eventId={event.id} userId={user.id} role={user.role} onStatusChange={handleSamplesStatus} />
    ),
```

- [ ] **Step 5: Checklist page**

In `TradeShowChecklist.tsx`:
- `type ChecklistTab = 'admin' | 'user';`
- Remove the imports of `SamplesSummaryTab` and `sampleRequestApi`, the `canViewSamples` state, the `getAccess` effect, and the tri-state loading return.
- Import `BoardTabKey` from `./BookingBoardTabs`.
- Tab state:

```ts
  const initialHash = () => new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const [activeTab, setActiveTab] = useState<ChecklistTab>(() =>
    initialHash().get('tab') === 'my' ? 'user' : isPrivilegedUser ? 'admin' : 'user');
  const [requestedBoardTab, setRequestedBoardTab] = useState<BoardTabKey | null>(() =>
    initialHash().get('tab') === 'samples' ? 'samples' : null);
```

- Events effect: `if (activeTab === 'admin') loadEvents();`
- Replace the `hashCtx`/`onHashChange` block with:

```ts
  // A deep link followed while the page is open. Reps' links are handled by UserChecklist.
  const eventsRef = useRef(events);
  eventsRef.current = events;
  useEffect(() => {
    if (!isPrivilegedUser) return;
    const onHashChange = () => {
      const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const linkedId = params.get('event');
      if (!linkedId) return;
      const tab = params.get('tab');
      if (tab === 'my') { setActiveTab('user'); return; }   // embedded UserChecklist consumes it
      setActiveTab('admin');
      if (tab === 'samples') setRequestedBoardTab('samples');
      const loaded = eventsRef.current;
      if (loaded.some((e) => e.id === linkedId)) setSelectedEventId(linkedId);
      if (loaded.length > 0) history.replaceState(null, '', window.location.pathname + window.location.search);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [isPrivilegedUser]);
```

- In `loadEvents`, the hash-clearing condition becomes `if (activeTab === 'admin')`.
- Early return: `if (!isPrivilegedUser) { return <UserChecklist user={user} />; }`
- Masthead: `showSelector={activeTab === 'admin'}`.
- Segmented control: two buttons only (Admin Checklist, My Checklist); delete the Samples button and the `isPrivilegedUser &&` guard on Admin (this branch is privileged-only now).
- Tab content: `activeTab === 'user' ? <UserChecklist user={user} embedded /> : (<>…admin content…</>)`; delete the `samples` branch.
- `BookingBoard` gets `requestedTab={requestedBoardTab}` and `onRequestedTabHandled={() => setRequestedBoardTab(null)}`. Wrap that callback in `useCallback` (declare `const clearRequestedBoardTab = useCallback(() => setRequestedBoardTab(null), []);`) so the board's effect does not loop.

- [ ] **Step 6: My Checklist**

In `UserChecklist.tsx`:
- Replace the `SampleRequestSection` import with `import { SamplesPanel } from './samples/SamplesPanel';` and `import { sampleRequestApi } from '../../utils/sampleRequestApi';`.
- Add a helper above the component:

```ts
/** Which hash links this instance owns: tab=my always; tab=samples only as the rep's page. */
const ownsLink = (tab: string | null, embedded: boolean) => !tab || tab === 'my' || (tab === 'samples' && !embedded);
```

- In the `loadEvents` hash logic: `if (linkedId && ownsLink(params.get('tab'), embedded) && visible.some(...))`. Add `embedded` to nothing else there (the effect keeps deps `[user.id]`; `embedded` is constant per mount).
- In the `hashchange` listener replace the `tab` guard with `if (!ownsLink(params.get('tab'), embedded)) return;` and add `embedded` to the effect deps.
- Samples access for the selected show:

```ts
  const [canViewSamples, setCanViewSamples] = useState(false);
  useEffect(() => {
    if (embedded || !selectedEventId) { setCanViewSamples(false); return; }
    let cancelled = false;
    setCanViewSamples(false);
    sampleRequestApi.getEventAccess(selectedEventId)
      .then((r) => { if (!cancelled) setCanViewSamples(r.canView); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [selectedEventId, embedded]);
```

- Replace the `SampleRequestSection` render with:

```tsx
      {!embedded && selectedEventId && canViewSamples && (
        <div className="space-y-3">
          <div className="seg-track" role="tablist" aria-label="Show sections">
            <button type="button" role="tab" aria-selected="true" className="seg-tab seg-tab-active">Samples</button>
          </div>
          <div className="card">
            <SamplesPanel key={selectedEventId} eventId={selectedEventId} userId={user.id} role={user.role} />
          </div>
        </div>
      )}
```

- [ ] **Step 7: Remove the per-rep UI**

```bash
git rm src/components/checklist/samples/SampleRequestSection.tsx \
       src/components/checklist/samples/SamplesSummaryTab.tsx \
       src/components/checklist/samples/useSampleRequest.ts \
       src/components/checklist/samples/__tests__/SampleRequestSection.test.tsx \
       src/components/checklist/samples/__tests__/SamplesSummaryTab.test.tsx \
       src/components/checklist/samples/__tests__/useSampleRequest.test.ts
```

In `ProductTable.tsx` line 3: `import { ItemField } from './useEventSampleRequest';`. Then `grep -rn "useSampleRequest'\|SampleRequestSection\|SamplesSummaryTab\|getAccess()\|canViewSummary" src` must return nothing.

- [ ] **Step 8: Run tests, type-check, lint**

Run: `npx vitest run src/components/checklist && npx tsc --noEmit && npm run lint`
Expected: the two new test files PASS; `src/components/checklist` failures are only the pre-existing files (CarRentalsSection, checklist-defensive, EventDropdown, HotelsSection, ReceiptsViewerModal, TradeShowChecklist.test). `tsc` may still report errors in `src/components/dashboard` (Task 10 changes the hook's return) only if you changed shared types; it should be clean, since `OpenSampleRequest` is unchanged. Lint 0 errors.

- [ ] **Step 9: Commit**

```bash
git add -A src/components/checklist
git commit -m "feat(sample-requests): Samples moves onto the booking board; one shared panel under My Checklist

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Dashboard rows for both states

**Files:**
- Modify: `src/components/dashboard/hooks/useSampleRequestActions.ts`
- Modify: `src/components/dashboard/ActionQueue.tsx` (tone map, sample rows block lines 104–116)
- Modify: `src/components/dashboard/Dashboard.tsx:40`
- Test: `src/components/dashboard/__tests__/ActionQueue.samples.test.tsx`

**Interfaces:**
- Consumes: `sampleRequestApi.listMine()` (now returns submitted shows too), `formatCountdown`, `isUrgent`, `formatCloseDate`.
- Produces: `useSampleRequestActions(): { requests: OpenSampleRequest[] }` (all open shows, any status).

- [ ] **Step 1: Update the tests**

In `ActionQueue.samples.test.tsx`: change the deep-link expectation to `'#event=ev-1&tab=samples'`, move `vi.useRealTimers()` into an `afterEach`, and add:

```tsx
  it('shows a quieter row for a submitted show and still links to the Samples view', () => {
    const onPageChange = vi.fn();
    render(<ActionQueue {...base} onPageChange={onPageChange} sampleRequests={[
      { eventId: 'ev-2', eventName: 'IGES', closesAt: '2099-10-24T03:59:59Z', status: 'submitted', submittedAt: '2099-10-01T00:00:00Z' },
    ]} />);
    const row = screen.getByRole('button', { name: /Sample request for IGES submitted · edit until Oct 23, 11:59 PM ET/ });
    expect(row.className).toMatch(/stone/);
    expect(row.textContent).toContain('Open');
    fireEvent.click(row);
    expect(window.location.hash).toBe('#event=ev-2&tab=samples');
    expect(onPageChange).toHaveBeenCalledWith('checklist');
  });

  it('labels the action Start with no draft and Finish with a draft', () => {
    render(<ActionQueue {...base} onPageChange={vi.fn()} sampleRequests={[
      { eventId: 'a', eventName: 'A', closesAt: '2099-01-01T00:00:00Z', status: 'none', submittedAt: null },
      { eventId: 'b', eventName: 'B', closesAt: '2099-01-01T00:00:00Z', status: 'draft', submittedAt: null },
    ]} />);
    expect(screen.getByRole('button', { name: /Sample request for A/ }).textContent).toContain('Start');
    expect(screen.getByRole('button', { name: /Sample request for B/ }).textContent).toContain('Finish');
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/dashboard`
Expected: FAIL on the new and changed cases.

- [ ] **Step 3: Implement**

`useSampleRequestActions.ts`:

```ts
/** Open sample requests for the signed-in user's shows, submitted or not. */
import { useEffect, useState } from 'react';
import { api } from '../../../utils/api';
import { sampleRequestApi, OpenSampleRequest } from '../../../utils/sampleRequestApi';

export function useSampleRequestActions(): { requests: OpenSampleRequest[] } {
  const [requests, setRequests] = useState<OpenSampleRequest[]>([]);
  useEffect(() => {
    let mounted = true;
    if (!api.USE_SERVER) return;
    sampleRequestApi.listMine()
      .then((r) => { if (mounted) setRequests(r.requests || []); })
      .catch((e) => console.error('[Dashboard] sample requests failed:', e));
    return () => { mounted = false; };
  }, []);
  return { requests };
}
```

`Dashboard.tsx` line 40: `const { requests: sampleRequests } = useSampleRequestActions();`

`ActionQueue.tsx`: widen the tone union to include `'stone'`, add to `toneClasses`:

```ts
  stone: {
    wrap: 'border-stone-200 bg-stone-50 hover:border-stone-300',
    label: 'text-stone-700',
    action: 'text-stone-500',
  },
```

import `formatCloseDate` alongside `formatCountdown, isUrgent`, and replace the sample rows block with:

```ts
  const now = new Date();
  for (const r of sampleRequests ?? []) {
    const submitted = r.status === 'submitted';
    items.push({
      label: submitted
        ? `Sample request for ${r.eventName} submitted · edit until ${formatCloseDate(r.closesAt)}`
        : `Sample request for ${r.eventName} closes in ${formatCountdown(r.closesAt, now)}`,
      action: submitted ? 'Open' : r.status === 'draft' ? 'Finish' : 'Start',
      tone: submitted ? 'stone' : isUrgent(r.closesAt, now) ? 'red' : 'amber',
      onClick: () => {
        window.location.hash = `event=${r.eventId}&tab=samples`;
        onPageChange('checklist');
      },
    });
  }
```

- [ ] **Step 4: Run tests and lint**

Run: `npx vitest run src/components/dashboard && npx tsc --noEmit && npm run lint`
Expected: PASS; tsc clean; lint 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard
git commit -m "feat(sample-requests): dashboard rows for unsubmitted and submitted shared requests

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Version, docs, full verification

**Files:**
- Modify: `package.json`, `backend/package.json`, `backend/src/config/version.ts` (→ `2.31.0`)
- Modify: `CHANGELOG.md`, `docs/ARCHITECTURE.md` (§9), `CLAUDE.md` (the `sampleRequests/` bullet)

- [ ] **Step 1: Bump versions**

```bash
OLD=$(grep '"version"' package.json | head -1 | sed 's/.*: "\(.*\)".*/\1/')
sed -i '' "s/\"version\": \"$OLD\"/\"version\": \"2.31.0\"/" package.json backend/package.json
sed -i '' "s/FRONTEND_VERSION = '$OLD'/FRONTEND_VERSION = '2.31.0'/" backend/src/config/version.ts
grep -n '"version"' package.json backend/package.json; grep -n FRONTEND_VERSION backend/src/config/version.ts
```

Expected: all three show `2.31.0`. If `main` has moved past 2.30.0 by execution time, still set 2.31.0 unless that version is already taken in `CHANGELOG.md`; in that case use the next minor and say so in the report.

- [ ] **Step 2: CHANGELOG**

Insert directly under `## [Unreleased]` (use the actual release date):

```markdown
## [2.31.0] - 2026-10-08 - One shared sample request per show

### Changed
- **One sample request per show**, not one per rep. Anyone attending can open
  it and change quantities. Saves are per row, so two people editing at once
  never overwrite each other; the form refreshes other people's rows every 30
  seconds and when the window regains focus, with an "Updated by <name>" note.
- **Samples is a booking-board tab** beside Booth, Flights, Hotels, Cars and
  Tasks (0/1 until submitted, 1/1 after). Reps see the same panel under My
  Checklist. The top-level toggle is back to Admin Checklist / My Checklist.
- The sample puller sees the same form, read-only unless they are on the
  show, with a status line ("Submitted by Rita on Oct 14 · last edited by
  Sameer 5 min ago") and a **History** of who changed which numbers. They are
  notified whenever anyone submits or resubmits.
- Dashboard: after submission the row stays as a quieter "submitted · edit
  until <date>" link. The 48-hour reminder now goes to every participant,
  submitted or not.

### Removed
- Per-rep sample requests, the roster/aggregate Samples view and the
  on-behalf editor. Existing per-rep rows were merged per show by summing
  quantities (migration 044).

### Operations
- Migration 044 reshapes `sample_requests` and adds `sample_request_changes`.
  Verify `schema_migrations` after deploy as usual.
```

- [ ] **Step 3: ARCHITECTURE §9**

Replace the body of `## 9. Sample requests` with:

```markdown
One shared sample order per show. `backend/src/services/sampleRequests/`
owns the rules: `sampleRequestWindow.ts` is the only place that computes the
open/close window (created_at → 23:59:59 America/New_York on
`(travel_start_date ?? show_start_date) − 10 days`; never stored);
`SampleRequestService.ts` owns access (participants and override roles edit;
the puller reads), row-level patches, submit and the puller notification;
`SampleRequestReminderService.ts` sends one 48h reminder per participant
through the `sample_request_reminders` ledger (insert-before-send).

`sample_requests` has one row per event (`UNIQUE (event_id)`). A PATCH carries
only the rows the client changed; `SampleRequestRepository.applyRows` upserts
them and writes `sample_request_changes` rows for each field that changed, in
one transaction, so the history is what was stored.

`NotificationService` writes a `notifications` row and a push in one call.

Frontend: `src/components/checklist/samples/` — `SamplesPanel` (the form,
status line, history) driven by `useEventSampleRequest` (dirty-row tracking,
30 s / on-focus reconciliation). The panel is a `BookingBoard` tab for
admins and sits under My Checklist for reps. Deep link
`#event=<id>&tab=samples` opens it in either place; `tab=my` selects My
Checklist.
```

- [ ] **Step 4: CLAUDE.md bullet**

Replace the `sampleRequests/` bullet under "Key service boundaries" with:

```markdown
- **`sampleRequests/`** — One shared sample order per show (`UNIQUE
  (event_id)`). `sampleRequestWindow.ts` is the single source of the
  open/close rule; `SampleRequestService` owns access, row-level patches,
  submit and the puller notification; the repository's `applyRows` writes the
  change log in the same transaction. `NotificationService` is the one way to
  write a bell row + push.
```

- [ ] **Step 5: Full verification**

```bash
cd backend && npx vitest run && npx tsc --noEmit -p . && cd ..
npx tsc --noEmit
npm run lint
npx vitest run src/components/checklist src/components/dashboard src/components/layout src/components/admin src/utils src/components/expenses src/components/reports
npm run build
grep -rn "getMine\|saveMine\|submitMine\|getForUser\|getSummary\|canViewSummary\|SamplesSummaryTab\|SampleRequestSection" src backend/src || echo "no stale references"
```

Expected: backend green; both type-checks clean; lint 0 errors; frontend failures only in files this work never touched (list them and confirm each has no commits from this branch); build succeeds; the final grep prints `no stale references`.

- [ ] **Step 6: Commit**

```bash
git add package.json backend/package.json backend/src/config/version.ts CHANGELOG.md docs/ARCHITECTURE.md CLAUDE.md
git commit -m "chore(release): v2.31.0 shared sample request

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Self-review notes

- **Spec coverage:** data model + merge → T1; types/repository/change log → T2; access rules, row patches, submit wording, history, dashboard feed → T3; routes (incl. per-event access, removals) → T4; reminder to everyone → T5; frontend API → T6; row-level hook with reconciliation, poll, focus, offline, closed, forbidden → T7; panel, status line, history, view-only, Edit anyway → T8; board tab, rep placement, deep links, removal of per-rep UI → T9; dashboard variants → T10; release/docs → T11.
- **Type consistency:** `EventSampleRequestView { request, window, canEdit }`, `EventSampleRequest` field names, `SampleChangeRow`, and `OpenSampleRequest` are identical in backend `types.ts` (T2) and `src/utils/sampleRequestApi.ts` (T6). Hook return keys used by the panel (T8) match T7. `BoardTabKey` gains `'samples'` in T9 only; `Record<BoardTabKey, …>` forces the panel entry.
- **Ordering hazard:** T6 removes API methods the old hook/section use, so the frontend does not type-check between T6 and T9. Old files are deleted in T9. Per-task verification commands say which failures are expected.
- **Review Focus coverage:** 1 → T3 "two participants patching the same row"; 2 → T3 "accepts a retired product"; 3 → T3 "creates the row if needed … submit"; 4 → T7 reconcile test; 5 → T3 access tests and T4 handler passing the actor (service returns 403).
- **Notification links** for `form_open` and the 48h reminder change to `{ page: 'samples' }` (T3, T5); `linkToUrl` and the Header already map that to `#event=<id>&tab=samples`.
