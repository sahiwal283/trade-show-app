# Sample Requests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-rep "Sample Request" form to the Checklist page that opens at event creation, closes 7 days before travel, shows as a dashboard action item with a countdown, and notifies a designated sample puller on every submit.

**Architecture:** One new migration adds the catalog, request, general `notifications` and reminder-ledger tables. A `SampleRequestService` owns the window rule and all transitions; a new `NotificationService` writes bell rows and pushes in one call. The frontend adds a section to the My Checklist tab, rows to the dashboard action queue, a third bell source, a Samples summary tab, and an admin catalog editor.

**Tech Stack:** Express + TypeScript + raw `pg` (backend), Vitest, React + Vite + Tailwind (frontend), Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-07-sample-requests-design.md`

## Global Constraints

- Brand keys are exactly `haute_brands` and `boomin_brands`; display names "Haute Brands" and "Coolioh".
- Per-product fields are exactly `singles`, `displays`, `empty_displays` (integers ≥ 0). Materials: `qty` ≥ 0 and `notes`.
- Close time: 23:59:59 `America/New_York` on `(travel_start_date ?? show_start_date) − 7 days`. Never stored. Computed in one place: `backend/src/services/sampleRequests/sampleRequestWindow.ts`.
- Puller setting key: `app_settings.key = 'sample_puller_user_id'`, value `{ "userId": "<uuid>" | null }`.
- Puller is notified on submit and re-submit only. Never on draft saves.
- Admin, coordinator, developer may edit any rep's request after close. Nobody else may.
- Retired catalog rows are `is_active = false`; never hard-deleted.
- Version bumps to **2.30.0** in both `package.json` and `backend/package.json`.
- Raw SQL with parameterized queries. New schema goes in `043_create_sample_requests.sql` only.
- Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Frontend suite has ~90 pre-existing failures on main. Judge by the directories touched.

## Review Focus

1. **Event with travel date but no show date, or neither** — `getWindow` must not throw; neither-date events report `isOpen=false, closesAt=null`. Test in Task 2.
2. **Travel start date lands on a DST boundary** — close time must still be 23:59:59 Eastern (so UTC offset is −04:00 or −05:00 as appropriate, never off by an hour). Test in Task 2.
3. **Submitter is the puller** — a puller who also attends submits their own request; they still get the bell row, no crash, no self-skip. Test in Task 5.
4. **Payload contains a product id not in the catalog, a negative number, or a non-integer** — save returns 400, nothing is written. Test in Task 5.
5. **Participant removed from the show after submitting** — `listMyOpenRequests` no longer lists it and the summary no longer counts them. Test in Task 5 (summary joins through `event_participants`).

---

### Task 1: Migration 043 and schema check

**Files:**
- Create: `backend/src/database/migrations/043_create_sample_requests.sql`
- Create: `backend/tests/integration/sample-requests-schema.test.ts`

**Interfaces:**
- Produces: tables `sample_product_lines`, `sample_products`, `sample_materials`, `sample_requests`, `sample_request_items`, `sample_request_materials`, `notifications`, `sample_request_reminders`. Every later backend task reads these.

- [ ] **Step 1: Write the schema integration test**

```ts
// backend/tests/integration/sample-requests-schema.test.ts
import { describe, it, expect, afterAll } from 'vitest';
import { pool, query } from '../../src/config/database';

/**
 * Verifies migration 043 actually applied. migrate.ts silently skips a
 * migration on a 42501 permission error, so a clean start is not proof.
 */
const TABLES = [
  'sample_product_lines',
  'sample_products',
  'sample_materials',
  'sample_requests',
  'sample_request_items',
  'sample_request_materials',
  'notifications',
  'sample_request_reminders',
];

async function columnsOf(table: string): Promise<Set<string>> {
  const { rows } = await query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = $1`,
    [table]
  );
  return new Set(rows.map((r: { column_name: string }) => r.column_name));
}

describe('sample requests schema (migration 043)', () => {
  afterAll(async () => { await pool.end(); });

  it('creates all eight tables', async () => {
    const { rows } = await query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = ANY($1)`,
      [TABLES]
    );
    expect(rows.map((r: { table_name: string }) => r.table_name).sort()).toEqual([...TABLES].sort());
  });

  it('items carry the three agreed columns', async () => {
    const cols = await columnsOf('sample_request_items');
    expect(cols.has('singles')).toBe(true);
    expect(cols.has('displays')).toBe(true);
    expect(cols.has('empty_displays')).toBe(true);
  });

  it('seeds both brands and the materials list', async () => {
    const lines = await query(`SELECT brand, count(*)::int AS n FROM sample_product_lines GROUP BY brand`);
    const byBrand = Object.fromEntries(lines.rows.map((r: { brand: string; n: number }) => [r.brand, r.n]));
    expect(byBrand.boomin_brands).toBe(5);
    expect(byBrand.haute_brands).toBe(3);
    const products = await query(`SELECT count(*)::int AS n FROM sample_products`);
    expect(products.rows[0].n).toBe(40);
    const materials = await query(`SELECT count(*)::int AS n FROM sample_materials`);
    expect(materials.rows[0].n).toBe(6);
  });

  it('one request per user per event', async () => {
    const { rows } = await query(
      `SELECT indexdef FROM pg_indexes WHERE tablename = 'sample_requests' AND indexdef ILIKE '%UNIQUE%'`
    );
    expect(rows.some((r: { indexdef: string }) => /event_id, user_id/.test(r.indexdef))).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && npx vitest run tests/integration/sample-requests-schema.test.ts`
Expected: FAIL — tables missing (needs a local Postgres per `backend/tests/integration/README` conventions; if none is available, skip to Step 3 and rely on the migration test run in Step 4).

- [ ] **Step 3: Write the migration**

```sql
-- backend/src/database/migrations/043_create_sample_requests.sql
-- Sample requests: per-rep product sample orders for a show, a general
-- in-app notifications table, and the send-once reminder ledger.

-- ── Catalog ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sample_product_lines (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand       TEXT NOT NULL CHECK (brand IN ('haute_brands', 'boomin_brands')),
  name        TEXT NOT NULL,
  position    INT NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (brand, name)
);

CREATE TABLE IF NOT EXISTS sample_products (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_line_id  UUID NOT NULL REFERENCES sample_product_lines(id) ON DELETE RESTRICT,
  name             TEXT NOT NULL,
  position         INT NOT NULL DEFAULT 0,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_line_id, name)
);

CREATE TABLE IF NOT EXISTS sample_materials (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  position    INT NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Requests ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sample_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted')),
  submitted_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, user_id)
);

CREATE TABLE IF NOT EXISTS sample_request_items (
  request_id      UUID NOT NULL REFERENCES sample_requests(id) ON DELETE CASCADE,
  product_id      UUID NOT NULL REFERENCES sample_products(id) ON DELETE RESTRICT,
  singles         INT NOT NULL DEFAULT 0 CHECK (singles >= 0),
  displays        INT NOT NULL DEFAULT 0 CHECK (displays >= 0),
  empty_displays  INT NOT NULL DEFAULT 0 CHECK (empty_displays >= 0),
  PRIMARY KEY (request_id, product_id)
);

CREATE TABLE IF NOT EXISTS sample_request_materials (
  request_id    UUID NOT NULL REFERENCES sample_requests(id) ON DELETE CASCADE,
  material_id   UUID NOT NULL REFERENCES sample_materials(id) ON DELETE RESTRICT,
  qty           INT NOT NULL DEFAULT 0 CHECK (qty >= 0),
  notes         TEXT,
  PRIMARY KEY (request_id, material_id)
);

CREATE INDEX IF NOT EXISTS sample_requests_event_idx ON sample_requests (event_id);

-- ── General in-app notifications ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  link        JSONB,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_unread_idx ON notifications (user_id, read_at);

-- ── Send-once ledger ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sample_request_reminders (
  event_id   UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,
  sent_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id, kind)
);

-- ── Seed: Coolioh (boomin_brands) ────────────────────────────────────────
INSERT INTO sample_product_lines (brand, name, position) VALUES
  ('boomin_brands', 'Freeze Dried Candy', 1),
  ('boomin_brands', 'Peelz', 2),
  ('boomin_brands', 'Coolioh Fuego Peelz', 3),
  ('boomin_brands', 'Coolioh Fuegos', 4),
  ('boomin_brands', 'Tokyo Ice Cream', 5),
  ('haute_brands', 'Oh! Mit', 1),
  ('haute_brands', 'HyMIT', 2),
  ('haute_brands', 'Sex Strips', 3)
ON CONFLICT (brand, name) DO NOTHING;

INSERT INTO sample_products (product_line_id, name, position)
SELECT l.id, p.name, p.position
FROM (VALUES
  ('boomin_brands', 'Freeze Dried Candy', 'Rainbow Bursts', 1),
  ('boomin_brands', 'Freeze Dried Candy', 'Sour Bursts', 2),
  ('boomin_brands', 'Freeze Dried Candy', 'Fuego Bursts', 3),
  ('boomin_brands', 'Freeze Dried Candy', 'Polar Pops', 4),
  ('boomin_brands', 'Freeze Dried Candy', 'Smart Blasts', 5),
  ('boomin_brands', 'Freeze Dried Candy', 'Chic-Oh Stix', 6),
  ('boomin_brands', 'Freeze Dried Candy', 'Cosmic Caramel', 7),
  ('boomin_brands', 'Freeze Dried Candy', 'Dubai Chocolate', 8),
  ('boomin_brands', 'Freeze Dried Candy', 'Peach Pops', 9),
  ('boomin_brands', 'Freeze Dried Candy', 'Party Pack (40ct)', 10),
  ('boomin_brands', 'Freeze Dried Candy', 'Assorted Pack (5ct)', 11),
  ('boomin_brands', 'Peelz', 'Mango', 1),
  ('boomin_brands', 'Peelz', 'Grape', 2),
  ('boomin_brands', 'Peelz', 'Peach', 3),
  ('boomin_brands', 'Peelz', 'Banana', 4),
  ('boomin_brands', 'Coolioh Fuego Peelz', 'Mango Magma', 1),
  ('boomin_brands', 'Coolioh Fuego Peelz', 'Grapanero', 2),
  ('boomin_brands', 'Coolioh Fuego Peelz', 'Lava Banana', 3),
  ('boomin_brands', 'Coolioh Fuego Peelz', 'Peach Diablo', 4),
  ('boomin_brands', 'Coolioh Fuegos', 'Rushin'' Chili', 1),
  ('boomin_brands', 'Coolioh Fuegos', 'Flamin'' Pina', 2),
  ('boomin_brands', 'Coolioh Fuegos', 'Blazin'' Mango', 3),
  ('boomin_brands', 'Coolioh Fuegos', 'Gushin'' Dill Pickle', 4),
  ('boomin_brands', 'Tokyo Ice Cream', 'Tokyo Ice Cream', 1),
  ('haute_brands', 'Oh! Mit', 'Mango Peach', 1),
  ('haute_brands', 'Oh! Mit', 'Purple Haze', 2),
  ('haute_brands', 'Oh! Mit', 'Blue Razz', 3),
  ('haute_brands', 'Oh! Mit', 'Spear-mit', 4),
  ('haute_brands', 'Oh! Mit', 'Pink Rozay', 5),
  ('haute_brands', 'Oh! Mit', 'Pineapple Xpress', 6),
  ('haute_brands', 'HyMIT', 'Mango Peach', 1),
  ('haute_brands', 'HyMIT', 'Purple Haze', 2),
  ('haute_brands', 'HyMIT', 'Blue Razz', 3),
  ('haute_brands', 'HyMIT', 'Spear-mit', 4),
  ('haute_brands', 'HyMIT', 'Pink Rozay', 5),
  ('haute_brands', 'HyMIT', 'Pineapple Xpress', 6),
  ('haute_brands', 'Sex Strips', 'Fix Your Spark', 1),
  ('haute_brands', 'Sex Strips', 'Fix Him', 2),
  ('haute_brands', 'Sex Strips', 'Her Fix', 3),
  ('haute_brands', 'Sex Strips', 'Jack Rabbit (J.R.)', 4)
) AS p(brand, line_name, name, position)
JOIN sample_product_lines l ON l.brand = p.brand AND l.name = p.line_name
ON CONFLICT (product_line_id, name) DO NOTHING;

INSERT INTO sample_materials (name, position) VALUES
  ('Clip Strips', 1),
  ('T-Shirts', 2),
  ('Swag Bags', 3),
  ('Floor Displays', 4),
  ('Stickers', 5),
  ('Banner', 6)
ON CONFLICT (name) DO NOTHING;
```

- [ ] **Step 4: Apply and verify**

Run: `cd backend && npm run migrate && npx vitest run tests/integration/sample-requests-schema.test.ts`
Expected: migration 043 applied; 4 tests PASS. The product count is 40 (24 Coolioh + 16 Haute).

- [ ] **Step 5: Commit**

```bash
git add backend/src/database/migrations/043_create_sample_requests.sql backend/tests/integration/sample-requests-schema.test.ts
git commit -m "feat(sample-requests): migration 043 catalog, requests, notifications, reminder ledger

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Window rule

**Files:**
- Create: `backend/src/services/sampleRequests/types.ts`
- Create: `backend/src/services/sampleRequests/sampleRequestWindow.ts`
- Test: `backend/tests/services/sampleRequestWindow.test.ts`

**Interfaces:**
- Produces: `computeSampleWindow(event, now?) => SampleWindow` and the shared types below. Tasks 5, 8 consume.

- [ ] **Step 1: Write the shared types**

```ts
// backend/src/services/sampleRequests/types.ts
export type SampleBrand = 'haute_brands' | 'boomin_brands';
export const SAMPLE_BRANDS: readonly SampleBrand[] = ['haute_brands', 'boomin_brands'];
export const SAMPLE_BRAND_LABELS: Record<SampleBrand, string> = {
  haute_brands: 'Haute Brands',
  boomin_brands: 'Coolioh',
};

export interface SampleProductLine {
  id: string; brand: SampleBrand; name: string; position: number; is_active: boolean;
}
export interface SampleProduct {
  id: string; product_line_id: string; name: string; position: number; is_active: boolean;
}
export interface SampleMaterial {
  id: string; name: string; position: number; is_active: boolean;
}
export interface SampleCatalog {
  lines: SampleProductLine[]; products: SampleProduct[]; materials: SampleMaterial[];
}

export interface SampleRequestItemInput {
  productId: string; singles: number; displays: number; emptyDisplays: number;
}
export interface SampleRequestMaterialInput {
  materialId: string; qty: number; notes: string | null;
}
export interface SampleRequestPayload {
  items: SampleRequestItemInput[]; materials: SampleRequestMaterialInput[];
}

export type SampleRequestStatus = 'draft' | 'submitted';

export interface SampleRequestRow {
  id: string; event_id: string; user_id: string; status: SampleRequestStatus;
  submitted_at: string | null; created_at: string; updated_at: string;
}
export interface SampleRequestDetail extends SampleRequestRow {
  items: SampleRequestItemInput[]; materials: SampleRequestMaterialInput[];
}

export interface SampleWindow {
  opensAt: string | null; closesAt: string | null; isOpen: boolean;
}
export interface SampleRequestView {
  request: SampleRequestDetail; window: SampleWindow;
}

/** One dashboard action row. */
export interface OpenSampleRequest {
  eventId: string; eventName: string; closesAt: string;
  status: 'none' | SampleRequestStatus; submittedAt: string | null;
}

export interface SummaryByUser {
  userId: string; name: string; status: SampleRequestStatus;
  singles: number; displays: number; emptyDisplays: number;
}
export interface SummaryProduct {
  productId: string; productName: string; lineId: string; lineName: string; brand: SampleBrand;
  isActive: boolean; singles: number; displays: number; emptyDisplays: number; byUser: SummaryByUser[];
}
export interface SummaryMaterialByUser {
  userId: string; name: string; status: SampleRequestStatus; qty: number; notes: string | null;
}
export interface SummaryMaterial {
  materialId: string; materialName: string; isActive: boolean; qty: number; byUser: SummaryMaterialByUser[];
}
export interface SummaryParticipant {
  userId: string; name: string; status: 'none' | SampleRequestStatus; submittedAt: string | null;
}
export interface EventSampleSummary {
  eventId: string; eventName: string; window: SampleWindow; pullerUserId: string | null;
  participants: SummaryParticipant[]; products: SummaryProduct[]; materials: SummaryMaterial[];
}

/** Roles that may edit any rep's request, including after close. */
export const SAMPLE_OVERRIDE_ROLES = ['admin', 'coordinator', 'developer'] as const;
export const canOverrideSampleWindow = (role: string | undefined): boolean =>
  !!role && (SAMPLE_OVERRIDE_ROLES as readonly string[]).includes(role);
```

- [ ] **Step 2: Write the failing window tests**

```ts
// backend/tests/services/sampleRequestWindow.test.ts
import { describe, it, expect } from 'vitest';
import { computeSampleWindow, endOfDayEastern } from '../../src/services/sampleRequests/sampleRequestWindow';

const base = { created_at: '2026-10-01T12:00:00.000Z' };

describe('endOfDayEastern', () => {
  it('is 23:59:59 EDT in summer (UTC-4)', () => {
    expect(endOfDayEastern('2026-07-10').toISOString()).toBe('2026-07-11T03:59:59.000Z');
  });
  it('is 23:59:59 EST in winter (UTC-5)', () => {
    expect(endOfDayEastern('2026-01-10').toISOString()).toBe('2026-01-11T04:59:59.000Z');
  });
  it('handles the fall-back DST day without an off-by-one hour', () => {
    // 2026-11-01 is the day clocks fall back; end of day is already EST.
    expect(endOfDayEastern('2026-11-01').toISOString()).toBe('2026-11-02T04:59:59.000Z');
  });
  it('accepts a Date (pg DATE columns parse to local midnight)', () => {
    expect(endOfDayEastern(new Date(2026, 6, 10)).toISOString()).toBe('2026-07-11T03:59:59.000Z');
  });
});

describe('computeSampleWindow', () => {
  it('closes 7 days before travel start, end of day Eastern', () => {
    const w = computeSampleWindow({ ...base, travel_start_date: '2026-10-20' }, new Date('2026-10-05T00:00:00Z'));
    expect(w.closesAt).toBe('2026-10-14T03:59:59.000Z'); // Oct 13 23:59:59 EDT
    expect(w.opensAt).toBe('2026-10-01T12:00:00.000Z');
    expect(w.isOpen).toBe(true);
  });
  it('falls back to show start when travel start is null', () => {
    const w = computeSampleWindow({ ...base, travel_start_date: null, show_start_date: '2026-10-20' }, new Date('2026-10-05T00:00:00Z'));
    expect(w.closesAt).toBe('2026-10-14T03:59:59.000Z');
  });
  it('prefers travel start over show start when both are present', () => {
    const w = computeSampleWindow({ ...base, travel_start_date: '2026-10-18', show_start_date: '2026-10-20' }, new Date('2026-10-05T00:00:00Z'));
    expect(w.closesAt).toBe('2026-10-12T03:59:59.000Z');
  });
  it('has no window when neither date exists', () => {
    const w = computeSampleWindow({ ...base, travel_start_date: null, show_start_date: null });
    expect(w).toEqual({ opensAt: '2026-10-01T12:00:00.000Z', closesAt: null, isOpen: false });
  });
  it('is closed one second after closesAt and open one second before', () => {
    const ev = { ...base, travel_start_date: '2026-10-20' };
    expect(computeSampleWindow(ev, new Date('2026-10-14T03:59:58Z')).isOpen).toBe(true);
    expect(computeSampleWindow(ev, new Date('2026-10-14T04:00:00Z')).isOpen).toBe(false);
  });
  it('is closed before opensAt', () => {
    const w = computeSampleWindow({ ...base, travel_start_date: '2026-10-20' }, new Date('2026-09-30T00:00:00Z'));
    expect(w.isOpen).toBe(false);
  });
  it('is already closed for a show booked inside the 7-day window', () => {
    const w = computeSampleWindow({ created_at: '2026-10-15T00:00:00Z', travel_start_date: '2026-10-20' }, new Date('2026-10-15T01:00:00Z'));
    expect(w.isOpen).toBe(false);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd backend && npx vitest run tests/services/sampleRequestWindow.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the window module**

```ts
// backend/src/services/sampleRequests/sampleRequestWindow.ts
/**
 * The ONE place that knows when a show's sample request window opens and
 * closes. Opens at event creation; closes 23:59:59 America/New_York on
 * (travel_start_date ?? show_start_date) − 7 days. Never stored, so moving
 * a travel date moves the deadline and late-added participants just work.
 */
import { SampleWindow } from './types';

export const SAMPLE_WINDOW_TZ = 'America/New_York';
export const SAMPLE_CLOSE_DAYS_BEFORE = 7;

type DateLike = string | Date | null | undefined;

interface WindowEvent {
  created_at: string | Date;
  travel_start_date?: DateLike;
  show_start_date?: DateLike;
}

/** [year, month(1-12), day] of a pg DATE value, which may be a Date or 'YYYY-MM-DD…'. */
function dateParts(value: string | Date): [number, number, number] {
  if (value instanceof Date) return [value.getFullYear(), value.getMonth() + 1, value.getDate()];
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  return [y, m, d];
}

/** Offset (ms) of `tz` from UTC at the instant `utcMs`. */
function tzOffsetMs(utcMs: number, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(new Date(utcMs))) p[part.type] = part.value;
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - utcMs;
}

/** 23:59:59 in America/New_York on the given calendar date, as a UTC instant. */
export function endOfDayEastern(value: string | Date): Date {
  const [y, m, d] = dateParts(value);
  const wall = Date.UTC(y, m - 1, d, 23, 59, 59);
  let utc = wall - tzOffsetMs(wall, SAMPLE_WINDOW_TZ);
  // Re-check: the first guess used the offset at the wrong instant on DST days.
  const corrected = wall - tzOffsetMs(utc, SAMPLE_WINDOW_TZ);
  if (corrected !== utc) utc = corrected;
  return new Date(utc);
}

function minusDays(value: string | Date, days: number): Date {
  const [y, m, d] = dateParts(value);
  return new Date(Date.UTC(y, m - 1, d - days)); // date-only; only Y/M/D are read back
}

export function computeSampleWindow(event: WindowEvent, now: Date = new Date()): SampleWindow {
  const opensAtDate = event.created_at instanceof Date ? event.created_at : new Date(event.created_at);
  const opensAt = Number.isNaN(opensAtDate.getTime()) ? null : opensAtDate.toISOString();

  const anchor = event.travel_start_date || event.show_start_date;
  if (!anchor) return { opensAt, closesAt: null, isOpen: false };

  const closeDay = minusDays(anchor, SAMPLE_CLOSE_DAYS_BEFORE);
  const closeDayStr = `${closeDay.getUTCFullYear()}-${String(closeDay.getUTCMonth() + 1).padStart(2, '0')}-${String(closeDay.getUTCDate()).padStart(2, '0')}`;
  const closesAtDate = endOfDayEastern(closeDayStr);

  const t = now.getTime();
  const isOpen = (opensAt === null || t >= opensAtDate.getTime()) && t <= closesAtDate.getTime();
  return { opensAt, closesAt: closesAtDate.toISOString(), isOpen };
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd backend && npx vitest run tests/services/sampleRequestWindow.test.ts`
Expected: 12 PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/sampleRequests/
git add backend/tests/services/sampleRequestWindow.test.ts
git commit -m "feat(sample-requests): window rule and shared types

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: General notifications (repository, service, routes)

**Files:**
- Create: `backend/src/database/repositories/NotificationRepository.ts`
- Create: `backend/src/services/NotificationService.ts`
- Create: `backend/src/routes/notifications.ts`
- Modify: `backend/src/server.ts` (import + mount after the `/api/push` line)
- Test: `backend/tests/services/NotificationService.test.ts`, `backend/tests/routes/notifications.test.ts`

**Interfaces:**
- Produces: `notificationService.notify(userId, { kind, title, body, link? })` → `Promise<NotificationRow>`; `listUnread(userId)`; `markRead(userId, ids)`; `markAllRead(userId)`. Tasks 5 and 8 call `notify`.
- Routes: `GET /api/notifications/unread` → `{ notifications: NotificationRow[] }`; `POST /api/notifications/read` body `{ ids: string[] }`; `POST /api/notifications/read-all`.

- [ ] **Step 1: Write the failing service test**

```ts
// backend/tests/services/NotificationService.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/database/repositories/NotificationRepository', () => ({
  notificationRepository: {
    insert: vi.fn(async (d: any) => ({ id: 'n-1', read_at: null, created_at: '2026-10-07T00:00:00Z', ...d })),
    listUnread: vi.fn(async () => []),
    markRead: vi.fn(async () => 1),
    markAllRead: vi.fn(async () => 2),
  },
}));
vi.mock('../../src/services/PushService', () => ({
  pushService: { sendToUser: vi.fn(async () => undefined), isEnabled: vi.fn(() => true) },
}));

import { notificationService } from '../../src/services/NotificationService';
import { notificationRepository } from '../../src/database/repositories/NotificationRepository';
import { pushService } from '../../src/services/PushService';

describe('NotificationService.notify', () => {
  beforeEach(() => vi.clearAllMocks());

  it('writes the bell row and sends a push with the link as the url', async () => {
    const row = await notificationService.notify('u-1', {
      kind: 'sample_request.open', title: 'T', body: 'B', link: { page: 'checklist', eventId: 'ev-1' },
    });
    expect(row.id).toBe('n-1');
    expect(notificationRepository.insert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'u-1', kind: 'sample_request.open', title: 'T', body: 'B',
    }));
    expect(pushService.sendToUser).toHaveBeenCalledWith('u-1', { title: 'T', body: 'B', url: '/#event=ev-1&tab=my' });
  });

  it('still returns the row when the push fails', async () => {
    vi.mocked(pushService.sendToUser).mockRejectedValueOnce(new Error('boom'));
    const row = await notificationService.notify('u-1', { kind: 'x', title: 'T', body: 'B' });
    expect(row.id).toBe('n-1');
  });

  it('uses "/" as the push url when there is no link', async () => {
    await notificationService.notify('u-1', { kind: 'x', title: 'T', body: 'B' });
    expect(pushService.sendToUser).toHaveBeenCalledWith('u-1', expect.objectContaining({ url: '/' }));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && npx vitest run tests/services/NotificationService.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement repository and service**

```ts
// backend/src/database/repositories/NotificationRepository.ts
/**
 * General in-app notifications (the header bell). Sample requests are the
 * first producer; expense/message notifications are NOT migrated here.
 */
import { query } from '../../config/database';

export interface NotificationLink { page: string; eventId?: string }

export interface NotificationRow {
  id: string; user_id: string; kind: string; title: string; body: string;
  link: NotificationLink | null; read_at: string | null; created_at: string;
}

export interface NotificationInsert {
  user_id: string; kind: string; title: string; body: string; link: NotificationLink | null;
}

class NotificationRepository {
  async insert(data: NotificationInsert): Promise<NotificationRow> {
    const r = await query(
      `INSERT INTO notifications (user_id, kind, title, body, link)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [data.user_id, data.kind, data.title, data.body, data.link ? JSON.stringify(data.link) : null]
    );
    return r.rows[0] as NotificationRow;
  }

  async listUnread(userId: string, limit = 50): Promise<NotificationRow[]> {
    const r = await query(
      `SELECT * FROM notifications WHERE user_id = $1 AND read_at IS NULL
       ORDER BY created_at DESC LIMIT $2`,
      [userId, limit]
    );
    return r.rows as NotificationRow[];
  }

  /** Scoped to the user so one caller cannot mark another's rows. */
  async markRead(userId: string, ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const r = await query(
      `UPDATE notifications SET read_at = now()
       WHERE user_id = $1 AND id = ANY($2::uuid[]) AND read_at IS NULL`,
      [userId, ids]
    );
    return r.rowCount ?? 0;
  }

  async markAllRead(userId: string): Promise<number> {
    const r = await query(
      `UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL`,
      [userId]
    );
    return r.rowCount ?? 0;
  }
}

export const notificationRepository = new NotificationRepository();
```

```ts
// backend/src/services/NotificationService.ts
/**
 * One call = one bell row + one push. Callers never do both by hand, so a
 * channel can never be forgotten. Push failure is logged, never thrown.
 */
import { notificationRepository, NotificationRow, NotificationLink } from '../database/repositories/NotificationRepository';
import { pushService } from './PushService';

export interface NotifyInput {
  kind: string; title: string; body: string; link?: NotificationLink | null;
}

/** Hash deep link understood by App.tsx / the checklist page (Task 10). */
export function linkToUrl(link: NotificationLink | null | undefined): string {
  if (!link) return '/';
  if (link.page === 'checklist' && link.eventId) return `/#event=${link.eventId}&tab=my`;
  if (link.page === 'samples' && link.eventId) return `/#event=${link.eventId}&tab=samples`;
  return '/';
}

class NotificationService {
  async notify(userId: string, input: NotifyInput): Promise<NotificationRow> {
    const row = await notificationRepository.insert({
      user_id: userId, kind: input.kind, title: input.title, body: input.body, link: input.link ?? null,
    });
    try {
      await pushService.sendToUser(userId, { title: input.title, body: input.body, url: linkToUrl(input.link) });
    } catch (error) {
      console.error(`[Notifications] push failed for user ${userId} (${input.kind}):`, error);
    }
    return row;
  }

  listUnread(userId: string): Promise<NotificationRow[]> {
    return notificationRepository.listUnread(userId);
  }

  markRead(userId: string, ids: string[]): Promise<number> {
    return notificationRepository.markRead(userId, ids);
  }

  markAllRead(userId: string): Promise<number> {
    return notificationRepository.markAllRead(userId);
  }
}

export const notificationService = new NotificationService();
```

- [ ] **Step 4: Run service tests**

Run: `cd backend && npx vitest run tests/services/NotificationService.test.ts`
Expected: 3 PASS.

- [ ] **Step 5: Write the failing route test**

```ts
// backend/tests/routes/notifications.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Response } from 'express';

vi.mock('../../src/services/NotificationService', () => ({
  notificationService: {
    listUnread: vi.fn(async () => [{ id: 'n-1' }]),
    markRead: vi.fn(async () => 1),
    markAllRead: vi.fn(async () => 3),
  },
}));

import { handleListUnread, handleMarkRead, handleMarkAllRead } from '../../src/routes/notifications';
import { notificationService } from '../../src/services/NotificationService';

function mockRes() {
  return { json: vi.fn().mockReturnThis(), status: vi.fn().mockReturnThis() } as unknown as Response & {
    json: ReturnType<typeof vi.fn>; status: ReturnType<typeof vi.fn>;
  };
}

describe('notification routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists unread for the caller only', async () => {
    const res = mockRes();
    await handleListUnread({ user: { id: 'u-1' } } as any, res);
    expect(notificationService.listUnread).toHaveBeenCalledWith('u-1');
    expect(res.json).toHaveBeenCalledWith({ notifications: [{ id: 'n-1' }] });
  });

  it('rejects a read call without a string id array', async () => {
    const res = mockRes();
    await handleMarkRead({ user: { id: 'u-1' }, body: { ids: 'n-1' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(notificationService.markRead).not.toHaveBeenCalled();
  });

  it('marks the given ids read for the caller', async () => {
    const res = mockRes();
    await handleMarkRead({ user: { id: 'u-1' }, body: { ids: ['n-1', 7] } } as any, res);
    expect(notificationService.markRead).toHaveBeenCalledWith('u-1', ['n-1']);
    expect(res.json).toHaveBeenCalledWith({ updated: 1 });
  });

  it('marks all read', async () => {
    const res = mockRes();
    await handleMarkAllRead({ user: { id: 'u-1' } } as any, res);
    expect(res.json).toHaveBeenCalledWith({ updated: 3 });
  });
});
```

- [ ] **Step 6: Implement routes and mount**

```ts
// backend/src/routes/notifications.ts
/**
 * General in-app notifications — /api/notifications
 * Handlers are exported by name so tests call them with a mock req/res.
 */
import express, { Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/errors';
import { notificationService } from '../services/NotificationService';

const router = express.Router();
router.use(authenticateToken);

export async function handleListUnread(req: AuthRequest, res: Response): Promise<void> {
  const notifications = await notificationService.listUnread(req.user!.id);
  res.json({ notifications });
}

export async function handleMarkRead(req: AuthRequest, res: Response): Promise<void> {
  const raw = req.body?.ids;
  if (!Array.isArray(raw)) {
    res.status(400).json({ error: 'ids must be an array of notification ids' });
    return;
  }
  const ids = raw.filter((v: unknown): v is string => typeof v === 'string' && v.length > 0);
  const updated = await notificationService.markRead(req.user!.id, ids);
  res.json({ updated });
}

export async function handleMarkAllRead(req: AuthRequest, res: Response): Promise<void> {
  const updated = await notificationService.markAllRead(req.user!.id);
  res.json({ updated });
}

router.get('/unread', asyncHandler(handleListUnread));
router.post('/read', asyncHandler(handleMarkRead));
router.post('/read-all', asyncHandler(handleMarkAllRead));

export default router;
```

In `backend/src/server.ts`, add after the `badgeScanRoutes` import:

```ts
import notificationRoutes from './routes/notifications';
```

and after the `/api/badge-scans` mount:

```ts
app.use('/api/notifications', authenticateToken, sessionTracker, notificationRoutes);
```

- [ ] **Step 7: Run route tests and type-check**

Run: `cd backend && npx vitest run tests/routes/notifications.test.ts && npx tsc --noEmit -p .`
Expected: 4 PASS; tsc clean.

- [ ] **Step 8: Commit**

```bash
git add backend/src/database/repositories/NotificationRepository.ts backend/src/services/NotificationService.ts backend/src/routes/notifications.ts backend/src/server.ts backend/tests/services/NotificationService.test.ts backend/tests/routes/notifications.test.ts
git commit -m "feat(notifications): general in-app notification table, service and routes

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 4: SampleRequestRepository

**Files:**
- Create: `backend/src/database/repositories/SampleRequestRepository.ts`
- Test: `backend/tests/repositories/SampleRequestRepository.test.ts`

**Interfaces:**
- Produces (all on `sampleRequestRepository`):
  - `getCatalog(includeInactive: boolean): Promise<SampleCatalog>`
  - `createLine({brand,name})`, `updateLine(id,{name?,is_active?})`, `createProduct({product_line_id,name})`, `updateProduct(id,{name?,is_active?})`, `createMaterial({name})`, `updateMaterial(id,{name?,is_active?})`, `reorder(kind: 'lines'|'products'|'materials', orderedIds: string[])`
  - `findRequest(eventId, userId): Promise<SampleRequestDetail | null>`
  - `upsertDraft(eventId, userId): Promise<SampleRequestDetail>` (creates the draft row if missing)
  - `replaceContents(requestId, payload: SampleRequestPayload): Promise<void>` (transaction; drops all-zero rows)
  - `markSubmitted(requestId): Promise<SampleRequestRow>`
  - `findRequestsForUser(userId): Promise<Array<{event_id: string; status; submitted_at}>>`
  - `findEventItems(eventId)` / `findEventMaterials(eventId)` / `findEventRequests(eventId)` — joined through `event_participants` so removed participants vanish
  - `getPullerUserId(): Promise<string | null>`

- [ ] **Step 1: Write the failing repository test**

```ts
// backend/tests/repositories/SampleRequestRepository.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

const client = { query: vi.fn(async () => ({ rows: [], rowCount: 0 })), release: vi.fn() };
vi.mock('../../src/config/database', () => ({
  query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
  pool: { connect: vi.fn(async () => client) },
}));

import { sampleRequestRepository } from '../../src/database/repositories/SampleRequestRepository';
import { query } from '../../src/config/database';

describe('SampleRequestRepository.replaceContents', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('deletes then inserts inside one transaction and skips all-zero rows', async () => {
    await sampleRequestRepository.replaceContents('req-1', {
      items: [
        { productId: 'p-1', singles: 2, displays: 0, emptyDisplays: 0 },
        { productId: 'p-2', singles: 0, displays: 0, emptyDisplays: 0 }, // dropped
      ],
      materials: [
        { materialId: 'm-1', qty: 0, notes: 'two banners please' }, // kept: has notes
        { materialId: 'm-2', qty: 0, notes: '' },                  // dropped
      ],
    });
    const sql = client.query.mock.calls.map((c: any[]) => String(c[0]));
    expect(sql[0]).toBe('BEGIN');
    expect(sql.some((s) => /DELETE FROM sample_request_items/.test(s))).toBe(true);
    expect(sql.some((s) => /DELETE FROM sample_request_materials/.test(s))).toBe(true);
    expect(sql.filter((s) => /INSERT INTO sample_request_items/.test(s))).toHaveLength(1);
    expect(sql.filter((s) => /INSERT INTO sample_request_materials/.test(s))).toHaveLength(1);
    expect(sql[sql.length - 1]).toBe('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });

  it('rolls back when an insert throws', async () => {
    client.query.mockImplementation(async (sql: string) => {
      if (/INSERT INTO sample_request_items/.test(sql)) throw new Error('fk');
      return { rows: [], rowCount: 0 };
    });
    await expect(sampleRequestRepository.replaceContents('req-1', {
      items: [{ productId: 'bad', singles: 1, displays: 0, emptyDisplays: 0 }], materials: [],
    })).rejects.toThrow('fk');
    expect(client.query.mock.calls.map((c: any[]) => c[0])).toContain('ROLLBACK');
    client.query.mockImplementation(async () => ({ rows: [], rowCount: 0 }));
  });
});

describe('SampleRequestRepository.getPullerUserId', () => {
  it('reads the userId out of the app_settings JSON', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [{ value: { userId: 'u-9' } }] } as any);
    expect(await sampleRequestRepository.getPullerUserId()).toBe('u-9');
  });
  it('returns null when unset', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [] } as any);
    expect(await sampleRequestRepository.getPullerUserId()).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && npx vitest run tests/repositories/SampleRequestRepository.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the repository**

```ts
// backend/src/database/repositories/SampleRequestRepository.ts
/**
 * All SQL for sample requests and the catalog. Event-scoped reads join
 * through event_participants so a rep removed from a show drops out of the
 * summary and the dashboard without any cleanup job.
 */
import { query, pool } from '../../config/database';
import {
  SampleCatalog, SampleProductLine, SampleProduct, SampleMaterial, SampleBrand,
  SampleRequestRow, SampleRequestDetail, SampleRequestPayload, SampleRequestStatus,
} from '../../services/sampleRequests/types';

export interface EventItemRow {
  user_id: string; user_name: string; status: SampleRequestStatus;
  product_id: string; singles: number; displays: number; empty_displays: number;
}
export interface EventMaterialRow {
  user_id: string; user_name: string; status: SampleRequestStatus;
  material_id: string; qty: number; notes: string | null;
}
export interface EventRequestRow {
  user_id: string; user_name: string; status: SampleRequestStatus | null; submitted_at: string | null;
}

const ACTIVE = (includeInactive: boolean) => (includeInactive ? '' : 'WHERE is_active = TRUE');

class SampleRequestRepository {
  // ── Catalog ────────────────────────────────────────────────────────────
  async getCatalog(includeInactive = false): Promise<SampleCatalog> {
    const [lines, products, materials] = await Promise.all([
      query(`SELECT * FROM sample_product_lines ${ACTIVE(includeInactive)} ORDER BY brand, position, name`),
      query(`SELECT * FROM sample_products ${ACTIVE(includeInactive)} ORDER BY position, name`),
      query(`SELECT * FROM sample_materials ${ACTIVE(includeInactive)} ORDER BY position, name`),
    ]);
    return {
      lines: lines.rows as SampleProductLine[],
      products: products.rows as SampleProduct[],
      materials: materials.rows as SampleMaterial[],
    };
  }

  async createLine(input: { brand: SampleBrand; name: string }): Promise<SampleProductLine> {
    const r = await query(
      `INSERT INTO sample_product_lines (brand, name, position)
       VALUES ($1, $2, (SELECT COALESCE(MAX(position), 0) + 1 FROM sample_product_lines WHERE brand = $1))
       RETURNING *`,
      [input.brand, input.name]
    );
    return r.rows[0];
  }

  async updateLine(id: string, patch: { name?: string; is_active?: boolean }): Promise<SampleProductLine | null> {
    const r = await query(
      `UPDATE sample_product_lines
       SET name = COALESCE($2, name), is_active = COALESCE($3, is_active), updated_at = now()
       WHERE id = $1 RETURNING *`,
      [id, patch.name ?? null, patch.is_active ?? null]
    );
    return r.rows[0] || null;
  }

  async createProduct(input: { product_line_id: string; name: string }): Promise<SampleProduct> {
    const r = await query(
      `INSERT INTO sample_products (product_line_id, name, position)
       VALUES ($1, $2, (SELECT COALESCE(MAX(position), 0) + 1 FROM sample_products WHERE product_line_id = $1))
       RETURNING *`,
      [input.product_line_id, input.name]
    );
    return r.rows[0];
  }

  async updateProduct(id: string, patch: { name?: string; is_active?: boolean }): Promise<SampleProduct | null> {
    const r = await query(
      `UPDATE sample_products
       SET name = COALESCE($2, name), is_active = COALESCE($3, is_active), updated_at = now()
       WHERE id = $1 RETURNING *`,
      [id, patch.name ?? null, patch.is_active ?? null]
    );
    return r.rows[0] || null;
  }

  async createMaterial(input: { name: string }): Promise<SampleMaterial> {
    const r = await query(
      `INSERT INTO sample_materials (name, position)
       VALUES ($1, (SELECT COALESCE(MAX(position), 0) + 1 FROM sample_materials))
       RETURNING *`,
      [input.name]
    );
    return r.rows[0];
  }

  async updateMaterial(id: string, patch: { name?: string; is_active?: boolean }): Promise<SampleMaterial | null> {
    const r = await query(
      `UPDATE sample_materials
       SET name = COALESCE($2, name), is_active = COALESCE($3, is_active), updated_at = now()
       WHERE id = $1 RETURNING *`,
      [id, patch.name ?? null, patch.is_active ?? null]
    );
    return r.rows[0] || null;
  }

  /** Positions become 1..n in the order given. Ids not listed are untouched. */
  async reorder(kind: 'lines' | 'products' | 'materials', orderedIds: string[]): Promise<void> {
    const table = { lines: 'sample_product_lines', products: 'sample_products', materials: 'sample_materials' }[kind];
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (let i = 0; i < orderedIds.length; i++) {
        await client.query(`UPDATE ${table} SET position = $2, updated_at = now() WHERE id = $1`, [orderedIds[i], i + 1]);
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  // ── Requests ───────────────────────────────────────────────────────────
  private async attachContents(row: SampleRequestRow): Promise<SampleRequestDetail> {
    const [items, materials] = await Promise.all([
      query(`SELECT product_id, singles, displays, empty_displays FROM sample_request_items WHERE request_id = $1`, [row.id]),
      query(`SELECT material_id, qty, notes FROM sample_request_materials WHERE request_id = $1`, [row.id]),
    ]);
    return {
      ...row,
      items: items.rows.map((i: any) => ({ productId: i.product_id, singles: i.singles, displays: i.displays, emptyDisplays: i.empty_displays })),
      materials: materials.rows.map((m: any) => ({ materialId: m.material_id, qty: m.qty, notes: m.notes })),
    };
  }

  async findRequest(eventId: string, userId: string): Promise<SampleRequestDetail | null> {
    const r = await query(`SELECT * FROM sample_requests WHERE event_id = $1 AND user_id = $2`, [eventId, userId]);
    if (!r.rows[0]) return null;
    return this.attachContents(r.rows[0]);
  }

  async upsertDraft(eventId: string, userId: string): Promise<SampleRequestDetail> {
    const r = await query(
      `INSERT INTO sample_requests (event_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT (event_id, user_id) DO UPDATE SET updated_at = sample_requests.updated_at
       RETURNING *`,
      [eventId, userId]
    );
    return this.attachContents(r.rows[0]);
  }

  async replaceContents(requestId: string, payload: SampleRequestPayload): Promise<void> {
    const items = payload.items.filter((i) => i.singles > 0 || i.displays > 0 || i.emptyDisplays > 0);
    const materials = payload.materials.filter((m) => m.qty > 0 || (m.notes && m.notes.trim().length > 0));
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`DELETE FROM sample_request_items WHERE request_id = $1`, [requestId]);
      await client.query(`DELETE FROM sample_request_materials WHERE request_id = $1`, [requestId]);
      if (items.length > 0) {
        await client.query(
          `INSERT INTO sample_request_items (request_id, product_id, singles, displays, empty_displays)
           SELECT $1, * FROM UNNEST($2::uuid[], $3::int[], $4::int[], $5::int[])`,
          [requestId, items.map((i) => i.productId), items.map((i) => i.singles), items.map((i) => i.displays), items.map((i) => i.emptyDisplays)]
        );
      }
      if (materials.length > 0) {
        await client.query(
          `INSERT INTO sample_request_materials (request_id, material_id, qty, notes)
           SELECT $1, * FROM UNNEST($2::uuid[], $3::int[], $4::text[])`,
          [requestId, materials.map((m) => m.materialId), materials.map((m) => m.qty), materials.map((m) => m.notes?.trim() || null)]
        );
      }
      await client.query(`UPDATE sample_requests SET updated_at = now() WHERE id = $1`, [requestId]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async markSubmitted(requestId: string): Promise<SampleRequestRow> {
    const r = await query(
      `UPDATE sample_requests SET status = 'submitted', submitted_at = now(), updated_at = now()
       WHERE id = $1 RETURNING *`,
      [requestId]
    );
    return r.rows[0];
  }

  async findRequestsForUser(userId: string): Promise<Array<{ event_id: string; status: SampleRequestStatus; submitted_at: string | null }>> {
    const r = await query(`SELECT event_id, status, submitted_at FROM sample_requests WHERE user_id = $1`, [userId]);
    return r.rows;
  }

  // ── Event-wide reads (through the roster) ──────────────────────────────
  async findEventRequests(eventId: string): Promise<EventRequestRow[]> {
    const r = await query(
      `SELECT ep.user_id, u.name AS user_name, sr.status, sr.submitted_at
       FROM event_participants ep
       JOIN users u ON u.id = ep.user_id
       LEFT JOIN sample_requests sr ON sr.event_id = ep.event_id AND sr.user_id = ep.user_id
       WHERE ep.event_id = $1
       ORDER BY u.name`,
      [eventId]
    );
    return r.rows;
  }

  async findEventItems(eventId: string): Promise<EventItemRow[]> {
    const r = await query(
      `SELECT sr.user_id, u.name AS user_name, sr.status,
              i.product_id, i.singles, i.displays, i.empty_displays
       FROM sample_requests sr
       JOIN event_participants ep ON ep.event_id = sr.event_id AND ep.user_id = sr.user_id
       JOIN users u ON u.id = sr.user_id
       JOIN sample_request_items i ON i.request_id = sr.id
       WHERE sr.event_id = $1`,
      [eventId]
    );
    return r.rows;
  }

  async findEventMaterials(eventId: string): Promise<EventMaterialRow[]> {
    const r = await query(
      `SELECT sr.user_id, u.name AS user_name, sr.status, m.material_id, m.qty, m.notes
       FROM sample_requests sr
       JOIN event_participants ep ON ep.event_id = sr.event_id AND ep.user_id = sr.user_id
       JOIN users u ON u.id = sr.user_id
       JOIN sample_request_materials m ON m.request_id = sr.id
       WHERE sr.event_id = $1`,
      [eventId]
    );
    return r.rows;
  }

  // ── Setting ────────────────────────────────────────────────────────────
  async getPullerUserId(): Promise<string | null> {
    const r = await query(`SELECT value FROM app_settings WHERE key = 'sample_puller_user_id'`);
    const v = r.rows[0]?.value;
    return v && typeof v.userId === 'string' && v.userId.length > 0 ? v.userId : null;
  }
}

export const sampleRequestRepository = new SampleRequestRepository();
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && npx vitest run tests/repositories/SampleRequestRepository.test.ts`
Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/database/repositories/SampleRequestRepository.ts backend/tests/repositories/SampleRequestRepository.test.ts
git commit -m "feat(sample-requests): repository for catalog, requests and event summaries

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: SampleRequestService

**Files:**
- Create: `backend/src/services/sampleRequests/SampleRequestService.ts`
- Create: `backend/src/services/sampleRequests/validateSamplePayload.ts`
- Test: `backend/tests/services/SampleRequestService.test.ts`, `backend/tests/services/validateSamplePayload.test.ts`

**Interfaces:**
- Consumes: `sampleRequestRepository` (Task 4), `computeSampleWindow` (Task 2), `notificationService.notify` (Task 3), `eventRepository.findById`, `isEventParticipant`, `getCurrentParticipantIds` from `EventParticipantService`.
- Produces (`sampleRequestService`):
  - `getWindowForEvent(eventId): Promise<SampleWindow>`
  - `getRequest(eventId, targetUserId, actor): Promise<SampleRequestView>`
  - `saveDraft(eventId, targetUserId, payload, actor): Promise<SampleRequestView>`
  - `submit(eventId, targetUserId, actor): Promise<SampleRequestView>`
  - `listMyOpenRequests(userId): Promise<OpenSampleRequest[]>`
  - `getEventSummary(eventId, actor): Promise<EventSampleSummary>`
  - `announceIfOpen(eventId, userIds: string[]): Promise<void>`
  - `canViewSummary(actor): Promise<boolean>`
  - Actor shape: `{ id: string; role: string }`.

- [ ] **Step 1: Write the failing payload validator test**

```ts
// backend/tests/services/validateSamplePayload.test.ts
import { describe, it, expect } from 'vitest';
import { validateSamplePayload } from '../../src/services/sampleRequests/validateSamplePayload';

const catalog = {
  lines: [], materials: [{ id: 'm-1', name: 'Banner', position: 1, is_active: true }],
  products: [{ id: 'p-1', product_line_id: 'l-1', name: 'Mango', position: 1, is_active: true },
             { id: 'p-old', product_line_id: 'l-1', name: 'Gone', position: 2, is_active: false }],
};

describe('validateSamplePayload', () => {
  it('accepts a well-formed payload and coerces notes', () => {
    const out = validateSamplePayload({
      items: [{ productId: 'p-1', singles: 2, displays: 0, emptyDisplays: 1 }],
      materials: [{ materialId: 'm-1', qty: 1, notes: '  two  ' }],
    }, catalog);
    expect(out.items).toEqual([{ productId: 'p-1', singles: 2, displays: 0, emptyDisplays: 1 }]);
    expect(out.materials).toEqual([{ materialId: 'm-1', qty: 1, notes: 'two' }]);
  });
  it('rejects a product not in the catalog', () => {
    expect(() => validateSamplePayload({ items: [{ productId: 'nope', singles: 1, displays: 0, emptyDisplays: 0 }], materials: [] }, catalog))
      .toThrow(/unknown product/i);
  });
  it('keeps a retired product that is already on the request', () => {
    const out = validateSamplePayload({ items: [{ productId: 'p-old', singles: 1, displays: 0, emptyDisplays: 0 }], materials: [] }, catalog);
    expect(out.items[0].productId).toBe('p-old');
  });
  it('rejects negatives and non-integers', () => {
    expect(() => validateSamplePayload({ items: [{ productId: 'p-1', singles: -1, displays: 0, emptyDisplays: 0 }], materials: [] }, catalog)).toThrow(/non-negative integer/i);
    expect(() => validateSamplePayload({ items: [{ productId: 'p-1', singles: 1.5, displays: 0, emptyDisplays: 0 }], materials: [] }, catalog)).toThrow(/non-negative integer/i);
    expect(() => validateSamplePayload({ items: [], materials: [{ materialId: 'm-1', qty: '3' as any, notes: null }] }, catalog)).toThrow(/non-negative integer/i);
  });
  it('rejects a non-object body and missing arrays', () => {
    expect(() => validateSamplePayload(null, catalog)).toThrow(/items/i);
    expect(() => validateSamplePayload({ items: 'x', materials: [] }, catalog)).toThrow(/items/i);
  });
  it('rejects duplicate product ids', () => {
    expect(() => validateSamplePayload({
      items: [{ productId: 'p-1', singles: 1, displays: 0, emptyDisplays: 0 }, { productId: 'p-1', singles: 2, displays: 0, emptyDisplays: 0 }], materials: [],
    }, catalog)).toThrow(/duplicate/i);
  });
});
```

- [ ] **Step 2: Implement the validator**

```ts
// backend/src/services/sampleRequests/validateSamplePayload.ts
import { ValidationError } from '../../utils/errors';
import { SampleCatalog, SampleRequestPayload } from './types';

const nonNegInt = (v: unknown, field: string): number => {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
    throw new ValidationError(`${field} must be a non-negative integer`);
  }
  return v;
};

/**
 * Shape + referential checks. The catalog passed in must INCLUDE inactive
 * rows: a retired product already on a request stays valid so a rep's old
 * numbers are never silently dropped on save.
 */
export function validateSamplePayload(body: unknown, catalog: SampleCatalog): SampleRequestPayload {
  if (!body || typeof body !== 'object') throw new ValidationError('items and materials are required');
  const { items, materials } = body as { items?: unknown; materials?: unknown };
  if (!Array.isArray(items)) throw new ValidationError('items must be an array');
  if (!Array.isArray(materials)) throw new ValidationError('materials must be an array');

  const productIds = new Set(catalog.products.map((p) => p.id));
  const materialIds = new Set(catalog.materials.map((m) => m.id));
  const seenP = new Set<string>();
  const seenM = new Set<string>();

  const outItems = items.map((raw: any, idx: number) => {
    const productId = typeof raw?.productId === 'string' ? raw.productId : '';
    if (!productIds.has(productId)) throw new ValidationError(`items[${idx}]: unknown product`);
    if (seenP.has(productId)) throw new ValidationError(`items[${idx}]: duplicate product`);
    seenP.add(productId);
    return {
      productId,
      singles: nonNegInt(raw.singles, `items[${idx}].singles`),
      displays: nonNegInt(raw.displays, `items[${idx}].displays`),
      emptyDisplays: nonNegInt(raw.emptyDisplays, `items[${idx}].emptyDisplays`),
    };
  });

  const outMaterials = materials.map((raw: any, idx: number) => {
    const materialId = typeof raw?.materialId === 'string' ? raw.materialId : '';
    if (!materialIds.has(materialId)) throw new ValidationError(`materials[${idx}]: unknown material`);
    if (seenM.has(materialId)) throw new ValidationError(`materials[${idx}]: duplicate material`);
    seenM.add(materialId);
    const notes = typeof raw.notes === 'string' ? raw.notes.trim().slice(0, 500) : '';
    return { materialId, qty: nonNegInt(raw.qty, `materials[${idx}].qty`), notes: notes.length > 0 ? notes : null };
  });

  return { items: outItems, materials: outMaterials };
}
```

Run: `cd backend && npx vitest run tests/services/validateSamplePayload.test.ts` → 6 PASS.

- [ ] **Step 3: Write the failing service test**

```ts
// backend/tests/services/SampleRequestService.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

const OPEN_EVENT = { id: 'ev-1', name: 'Expo', created_at: '2026-10-01T00:00:00Z', travel_start_date: '2026-10-30', show_start_date: '2026-11-01' };
const CLOSED_EVENT = { id: 'ev-2', name: 'Soon', created_at: '2026-10-01T00:00:00Z', travel_start_date: '2026-10-09', show_start_date: '2026-10-10' };
const NOW = new Date('2026-10-07T15:00:00Z');

const draft = (over = {}) => ({
  id: 'req-1', event_id: 'ev-1', user_id: 'u-1', status: 'draft', submitted_at: null,
  created_at: '', updated_at: '', items: [], materials: [], ...over,
});

vi.mock('../../src/database/repositories/SampleRequestRepository', () => ({
  sampleRequestRepository: {
    getCatalog: vi.fn(async () => ({
      lines: [{ id: 'l-1', brand: 'boomin_brands', name: 'Peelz', position: 1, is_active: true }],
      products: [{ id: 'p-1', product_line_id: 'l-1', name: 'Mango', position: 1, is_active: true }],
      materials: [{ id: 'm-1', name: 'Banner', position: 1, is_active: true }],
    })),
    findRequest: vi.fn(async () => null),
    upsertDraft: vi.fn(async (e: string, u: string) => draft({ event_id: e, user_id: u })),
    replaceContents: vi.fn(async () => undefined),
    markSubmitted: vi.fn(async () => ({ ...draft(), status: 'submitted', submitted_at: '2026-10-07T15:00:00Z' })),
    findRequestsForUser: vi.fn(async () => []),
    findEventRequests: vi.fn(async () => []),
    findEventItems: vi.fn(async () => []),
    findEventMaterials: vi.fn(async () => []),
    getPullerUserId: vi.fn(async () => 'puller-1'),
  },
}));
vi.mock('../../src/database/repositories/EventRepository', () => ({
  eventRepository: {
    findById: vi.fn(async (id: string) => (id === 'ev-1' ? OPEN_EVENT : id === 'ev-2' ? CLOSED_EVENT : null)),
    findAll: vi.fn(async () => [OPEN_EVENT, CLOSED_EVENT]),
  },
}));
vi.mock('../../src/services/EventParticipantService', () => ({
  isEventParticipant: vi.fn(async (_e: string, u: string) => u === 'u-1' || u === 'puller-1'),
  getCurrentParticipantIds: vi.fn(async () => ['u-1']),
}));
vi.mock('../../src/services/NotificationService', () => ({
  notificationService: { notify: vi.fn(async () => ({ id: 'n-1' })) },
}));
vi.mock('../../src/config/database', () => ({
  query: vi.fn(async () => ({ rows: [{ id: 'ev-1', user_id: 'u-1' }] })),
}));

import { sampleRequestService } from '../../src/services/sampleRequests/SampleRequestService';
import { sampleRequestRepository } from '../../src/database/repositories/SampleRequestRepository';
import { notificationService } from '../../src/services/NotificationService';
import { query } from '../../src/config/database';

const rep = { id: 'u-1', role: 'salesperson' };
const stranger = { id: 'u-2', role: 'salesperson' };
const admin = { id: 'adm', role: 'admin' };
const payload = { items: [{ productId: 'p-1', singles: 3, displays: 1, emptyDisplays: 0 }], materials: [] };

describe('SampleRequestService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  describe('getRequest', () => {
    it('creates the draft for a participant and returns the window', async () => {
      const view = await sampleRequestService.getRequest('ev-1', 'u-1', rep);
      expect(view.request.status).toBe('draft');
      expect(view.window.isOpen).toBe(true);
      expect(view.window.closesAt).toBe('2026-10-24T03:59:59.000Z');
    });
    it('rejects a non-participant', async () => {
      await expect(sampleRequestService.getRequest('ev-1', 'u-2', stranger)).rejects.toThrow(/participant/i);
    });
    it('rejects a rep reading another rep', async () => {
      await expect(sampleRequestService.getRequest('ev-1', 'u-1', stranger)).rejects.toThrow(/own/i);
    });
    it('lets an admin read any participant', async () => {
      const view = await sampleRequestService.getRequest('ev-1', 'u-1', admin);
      expect(view.request.user_id).toBe('u-1');
    });
    it('404s an unknown event', async () => {
      await expect(sampleRequestService.getRequest('nope', 'u-1', rep)).rejects.toThrow(/not found/i);
    });
  });

  describe('saveDraft', () => {
    it('validates and writes contents while open', async () => {
      await sampleRequestService.saveDraft('ev-1', 'u-1', payload, rep);
      expect(sampleRequestRepository.replaceContents).toHaveBeenCalledWith('req-1', payload);
      expect(notificationService.notify).not.toHaveBeenCalled();
    });
    it('409s when the window is closed', async () => {
      await expect(sampleRequestService.saveDraft('ev-2', 'u-1', payload, rep)).rejects.toMatchObject({ statusCode: 409 });
      expect(sampleRequestRepository.replaceContents).not.toHaveBeenCalled();
    });
    it('lets an admin save after close', async () => {
      await sampleRequestService.saveDraft('ev-2', 'u-1', payload, admin);
      expect(sampleRequestRepository.replaceContents).toHaveBeenCalled();
    });
    it('400s a bad payload and writes nothing', async () => {
      await expect(sampleRequestService.saveDraft('ev-1', 'u-1', { items: [{ productId: 'zzz', singles: 1, displays: 0, emptyDisplays: 0 }], materials: [] }, rep))
        .rejects.toMatchObject({ statusCode: 400 });
      expect(sampleRequestRepository.replaceContents).not.toHaveBeenCalled();
    });
  });

  describe('submit', () => {
    it('marks submitted and notifies the puller with "New" wording the first time', async () => {
      await sampleRequestService.submit('ev-1', 'u-1', rep);
      expect(sampleRequestRepository.markSubmitted).toHaveBeenCalledWith('req-1');
      expect(notificationService.notify).toHaveBeenCalledWith('puller-1', expect.objectContaining({
        kind: 'sample_request.submitted', title: expect.stringMatching(/^New sample request/),
        link: { page: 'samples', eventId: 'ev-1' },
      }));
    });
    it('uses "updated" wording on a re-submit', async () => {
      vi.mocked(sampleRequestRepository.upsertDraft).mockResolvedValueOnce(draft({ status: 'submitted', submitted_at: '2026-10-05T00:00:00Z' }) as any);
      await sampleRequestService.submit('ev-1', 'u-1', rep);
      expect(notificationService.notify).toHaveBeenCalledWith('puller-1', expect.objectContaining({ title: expect.stringMatching(/updated/i) }));
    });
    it('still notifies when the submitter is the puller', async () => {
      await sampleRequestService.submit('ev-1', 'puller-1', { id: 'puller-1', role: 'salesperson' });
      expect(notificationService.notify).toHaveBeenCalledWith('puller-1', expect.anything());
    });
    it('succeeds without a puller configured', async () => {
      vi.mocked(sampleRequestRepository.getPullerUserId).mockResolvedValueOnce(null);
      const view = await sampleRequestService.submit('ev-1', 'u-1', rep);
      expect(view.request.status).toBe('submitted');
      expect(notificationService.notify).not.toHaveBeenCalled();
    });
    it('409s when closed for a rep', async () => {
      await expect(sampleRequestService.submit('ev-2', 'u-1', rep)).rejects.toMatchObject({ statusCode: 409 });
    });
  });

  describe('listMyOpenRequests', () => {
    it('lists open shows the user is on with their status, excluding closed ones', async () => {
      vi.mocked(query).mockResolvedValueOnce({ rows: [OPEN_EVENT, CLOSED_EVENT] } as any);
      vi.mocked(sampleRequestRepository.findRequestsForUser).mockResolvedValueOnce([{ event_id: 'ev-1', status: 'draft', submitted_at: null }]);
      const rows = await sampleRequestService.listMyOpenRequests('u-1');
      expect(rows).toEqual([{ eventId: 'ev-1', eventName: 'Expo', closesAt: '2026-10-24T03:59:59.000Z', status: 'draft', submittedAt: null }]);
    });
    it('reports status none when no draft exists yet', async () => {
      vi.mocked(query).mockResolvedValueOnce({ rows: [OPEN_EVENT] } as any);
      const rows = await sampleRequestService.listMyOpenRequests('u-1');
      expect(rows[0].status).toBe('none');
    });
  });

  describe('getEventSummary', () => {
    it('sums per product across reps and flags drafts', async () => {
      vi.mocked(sampleRequestRepository.findEventRequests).mockResolvedValueOnce([
        { user_id: 'u-1', user_name: 'Ana', status: 'submitted', submitted_at: '2026-10-06T00:00:00Z' },
        { user_id: 'u-3', user_name: 'Bo', status: 'draft', submitted_at: null },
        { user_id: 'u-4', user_name: 'Cy', status: null, submitted_at: null },
      ]);
      vi.mocked(sampleRequestRepository.findEventItems).mockResolvedValueOnce([
        { user_id: 'u-1', user_name: 'Ana', status: 'submitted', product_id: 'p-1', singles: 2, displays: 1, empty_displays: 0 },
        { user_id: 'u-3', user_name: 'Bo', status: 'draft', product_id: 'p-1', singles: 1, displays: 0, empty_displays: 2 },
      ]);
      const s = await sampleRequestService.getEventSummary('ev-1', admin);
      expect(s.products).toHaveLength(1);
      expect(s.products[0]).toMatchObject({ productId: 'p-1', productName: 'Mango', lineName: 'Peelz', brand: 'boomin_brands', singles: 3, displays: 1, emptyDisplays: 2 });
      expect(s.products[0].byUser.map((b) => b.status)).toEqual(['submitted', 'draft']);
      expect(s.participants.map((p) => p.status)).toEqual(['submitted', 'draft', 'none']);
      expect(s.pullerUserId).toBe('puller-1');
    });
    it('allows the puller even without a privileged role', async () => {
      await expect(sampleRequestService.getEventSummary('ev-1', { id: 'puller-1', role: 'salesperson' })).resolves.toBeTruthy();
    });
    it('rejects a plain participant', async () => {
      await expect(sampleRequestService.getEventSummary('ev-1', rep)).rejects.toMatchObject({ statusCode: 403 });
    });
  });

  describe('announceIfOpen', () => {
    it('notifies each user once, keyed by the ledger', async () => {
      vi.mocked(query)
        .mockResolvedValueOnce({ rows: [{ event_id: 'ev-1' }] } as any)   // claim u-1: inserted
        .mockResolvedValueOnce({ rows: [] } as any);                        // claim u-5: conflict
      await sampleRequestService.announceIfOpen('ev-1', ['u-1', 'u-5']);
      expect(notificationService.notify).toHaveBeenCalledTimes(1);
      expect(notificationService.notify).toHaveBeenCalledWith('u-1', expect.objectContaining({
        kind: 'sample_request.open', link: { page: 'checklist', eventId: 'ev-1' },
      }));
    });
    it('does nothing when the window is closed', async () => {
      await sampleRequestService.announceIfOpen('ev-2', ['u-1']);
      expect(notificationService.notify).not.toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 4: Run to verify it fails**

Run: `cd backend && npx vitest run tests/services/SampleRequestService.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 5: Implement the service**

```ts
// backend/src/services/sampleRequests/SampleRequestService.ts
/**
 * Owns every sample request state transition and the authorization rules:
 *  - a rep may read/write only their own request, only while the window is open
 *  - admin/coordinator/developer may read/write anyone's, at any time
 *  - the puller (app_settings) may read the per-event summary
 * The puller is notified on submit and re-submit only. Draft saves are silent.
 */
import { query } from '../../config/database';
import { eventRepository } from '../../database/repositories/EventRepository';
import { sampleRequestRepository } from '../../database/repositories/SampleRequestRepository';
import { isEventParticipant, getCurrentParticipantIds } from '../EventParticipantService';
import { notificationService } from '../NotificationService';
import { NotFoundError, AuthorizationError, ConflictError } from '../../utils/errors';
import { computeSampleWindow } from './sampleRequestWindow';
import { validateSamplePayload } from './validateSamplePayload';
import {
  SampleWindow, SampleRequestView, SampleRequestPayload, OpenSampleRequest,
  EventSampleSummary, SummaryProduct, SummaryMaterial, canOverrideSampleWindow,
} from './types';

export interface Actor { id: string; role: string }

const fmtClose = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'n/a';

class SampleRequestService {
  private async loadEvent(eventId: string) {
    const event = await eventRepository.findById(eventId);
    if (!event) throw new NotFoundError('Event', eventId);
    return event;
  }

  async getWindowForEvent(eventId: string): Promise<SampleWindow> {
    return computeSampleWindow(await this.loadEvent(eventId));
  }

  /** Rep → own request only, and must be on the roster. Override roles → anyone on the roster. */
  private async authorizeTarget(eventId: string, targetUserId: string, actor: Actor): Promise<void> {
    if (!canOverrideSampleWindow(actor.role) && actor.id !== targetUserId) {
      throw new AuthorizationError('You can only access your own sample request');
    }
    if (!(await isEventParticipant(eventId, targetUserId))) {
      throw new AuthorizationError('User is not a participant of this event');
    }
  }

  private assertOpenOrOverride(window: SampleWindow, actor: Actor): void {
    if (window.isOpen || canOverrideSampleWindow(actor.role)) return;
    throw new ConflictError('Sample requests for this show are closed', { code: 'WINDOW_CLOSED', closesAt: window.closesAt });
  }

  async getRequest(eventId: string, targetUserId: string, actor: Actor): Promise<SampleRequestView> {
    const event = await this.loadEvent(eventId);
    await this.authorizeTarget(eventId, targetUserId, actor);
    const request = await sampleRequestRepository.upsertDraft(eventId, targetUserId);
    return { request, window: computeSampleWindow(event) };
  }

  async saveDraft(eventId: string, targetUserId: string, body: unknown, actor: Actor): Promise<SampleRequestView> {
    const event = await this.loadEvent(eventId);
    await this.authorizeTarget(eventId, targetUserId, actor);
    const window = computeSampleWindow(event);
    this.assertOpenOrOverride(window, actor);
    const payload: SampleRequestPayload = validateSamplePayload(body, await sampleRequestRepository.getCatalog(true));
    const request = await sampleRequestRepository.upsertDraft(eventId, targetUserId);
    await sampleRequestRepository.replaceContents(request.id, payload);
    return { request: { ...request, items: payload.items, materials: payload.materials }, window };
  }

  async submit(eventId: string, targetUserId: string, actor: Actor): Promise<SampleRequestView> {
    const event = await this.loadEvent(eventId);
    await this.authorizeTarget(eventId, targetUserId, actor);
    const window = computeSampleWindow(event);
    this.assertOpenOrOverride(window, actor);

    const before = await sampleRequestRepository.upsertDraft(eventId, targetUserId);
    const wasSubmitted = before.status === 'submitted';
    const row = await sampleRequestRepository.markSubmitted(before.id);

    const pullerId = await sampleRequestRepository.getPullerUserId();
    if (pullerId) {
      const who = await this.userName(targetUserId);
      await notificationService.notify(pullerId, {
        kind: 'sample_request.submitted',
        title: wasSubmitted ? `Sample request updated · ${event.name}` : `New sample request · ${event.name}`,
        body: `${who} ${wasSubmitted ? 'updated their' : 'submitted a'} sample request for ${event.name}.`,
        link: { page: 'samples', eventId },
      });
    } else {
      console.warn(`[SampleRequests] No sample puller configured — submit for event ${eventId} by ${targetUserId} not routed`);
    }
    return { request: { ...before, ...row }, window };
  }

  async listMyOpenRequests(userId: string): Promise<OpenSampleRequest[]> {
    const events = await query(
      `SELECT e.id, e.name, e.created_at, e.travel_start_date, e.show_start_date
       FROM events e JOIN event_participants ep ON ep.event_id = e.id
       WHERE ep.user_id = $1 AND e.status <> 'cancelled'`,
      [userId]
    );
    const mine = new Map((await sampleRequestRepository.findRequestsForUser(userId)).map((r) => [r.event_id, r]));
    const out: OpenSampleRequest[] = [];
    for (const e of events.rows) {
      const w = computeSampleWindow(e);
      if (!w.isOpen || !w.closesAt) continue;
      const r = mine.get(e.id);
      out.push({ eventId: e.id, eventName: e.name, closesAt: w.closesAt, status: r?.status ?? 'none', submittedAt: r?.submitted_at ?? null });
    }
    return out.sort((a, b) => a.closesAt.localeCompare(b.closesAt));
  }

  async canViewSummary(actor: Actor): Promise<boolean> {
    if (canOverrideSampleWindow(actor.role)) return true;
    return (await sampleRequestRepository.getPullerUserId()) === actor.id;
  }

  async getEventSummary(eventId: string, actor: Actor): Promise<EventSampleSummary> {
    if (!(await this.canViewSummary(actor))) throw new AuthorizationError('Only the sample puller or a coordinator can view this summary');
    const event = await this.loadEvent(eventId);
    const [catalog, requests, items, materials, pullerUserId] = await Promise.all([
      sampleRequestRepository.getCatalog(true),
      sampleRequestRepository.findEventRequests(eventId),
      sampleRequestRepository.findEventItems(eventId),
      sampleRequestRepository.findEventMaterials(eventId),
      sampleRequestRepository.getPullerUserId(),
    ]);
    const lineById = new Map(catalog.lines.map((l) => [l.id, l]));
    const productById = new Map(catalog.products.map((p) => [p.id, p]));
    const materialById = new Map(catalog.materials.map((m) => [m.id, m]));

    const products = new Map<string, SummaryProduct>();
    for (const row of items) {
      const p = productById.get(row.product_id);
      const l = p ? lineById.get(p.product_line_id) : undefined;
      if (!p || !l) continue;
      const entry = products.get(p.id) ?? {
        productId: p.id, productName: p.name, lineId: l.id, lineName: l.name, brand: l.brand, isActive: p.is_active,
        singles: 0, displays: 0, emptyDisplays: 0, byUser: [],
      };
      entry.singles += row.singles; entry.displays += row.displays; entry.emptyDisplays += row.empty_displays;
      entry.byUser.push({ userId: row.user_id, name: row.user_name, status: row.status, singles: row.singles, displays: row.displays, emptyDisplays: row.empty_displays });
      products.set(p.id, entry);
    }

    const mats = new Map<string, SummaryMaterial>();
    for (const row of materials) {
      const m = materialById.get(row.material_id);
      if (!m) continue;
      const entry = mats.get(m.id) ?? { materialId: m.id, materialName: m.name, isActive: m.is_active, qty: 0, byUser: [] };
      entry.qty += row.qty;
      entry.byUser.push({ userId: row.user_id, name: row.user_name, status: row.status, qty: row.qty, notes: row.notes });
      mats.set(m.id, entry);
    }

    const order = (a: SummaryProduct, b: SummaryProduct) => {
      const la = lineById.get(a.lineId)!, lb = lineById.get(b.lineId)!;
      return la.brand.localeCompare(lb.brand) || la.position - lb.position || productById.get(a.productId)!.position - productById.get(b.productId)!.position;
    };

    return {
      eventId, eventName: event.name, window: computeSampleWindow(event), pullerUserId,
      participants: requests.map((r) => ({ userId: r.user_id, name: r.user_name, status: r.status ?? 'none', submittedAt: r.submitted_at })),
      products: [...products.values()].sort(order),
      materials: [...mats.values()].sort((a, b) => materialById.get(a.materialId)!.position - materialById.get(b.materialId)!.position),
    };
  }

  /** Called on event create and participant add. Ledger-first so re-adds never double-notify. */
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
        body: `Tell us which samples you need for ${event.name}. Closes ${fmtClose(window.closesAt)} ET.`,
        link: { page: 'checklist', eventId },
      }).catch((e) => console.error('[SampleRequests] announce failed', e));
    }
  }

  private async userName(userId: string): Promise<string> {
    const r = await query(`SELECT name FROM users WHERE id = $1`, [userId]);
    return r.rows[0]?.name ?? 'A participant';
  }
}

export const sampleRequestService = new SampleRequestService();
export { getCurrentParticipantIds }; // re-export for the reminder scanner
```

Note: the test's generic `query` mock returns `{ rows: [{ id: 'ev-1', user_id: 'u-1' }] }` by default; `userName` reads `rows[0]?.name` → `'A participant'`, which is fine.

- [ ] **Step 6: Run to verify it passes**

Run: `cd backend && npx vitest run tests/services/SampleRequestService.test.ts tests/services/validateSamplePayload.test.ts`
Expected: all PASS (20 service + 6 validator). If `announceIfOpen`'s first test fails because `loadEvent` consumed a queued `query` mock, note that `eventRepository.findById` is mocked separately and does not touch `query`; the two queued `query` results are consumed by the two ledger inserts in order.

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/sampleRequests/ backend/tests/services/SampleRequestService.test.ts backend/tests/services/validateSamplePayload.test.ts
git commit -m "feat(sample-requests): service with window guards, submit notifications and event summary

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 6: Sample request routes

**Files:**
- Create: `backend/src/routes/sampleRequests.ts`
- Modify: `backend/src/server.ts` (import + mount)
- Test: `backend/tests/routes/sampleRequests.test.ts`

**Interfaces:**
- Consumes: `sampleRequestService` (Task 5), `sampleRequestRepository` catalog CRUD (Task 4).
- Produces HTTP surface, all under `/api/sample-requests`:
  - `GET /catalog?includeInactive=1` → `SampleCatalog`
  - `POST /catalog/lines {brand,name}`, `PUT /catalog/lines/:id {name?,isActive?}` (admin, developer)
  - `POST /catalog/products {productLineId,name}`, `PUT /catalog/products/:id`
  - `POST /catalog/materials {name}`, `PUT /catalog/materials/:id`
  - `PUT /catalog/reorder {kind, orderedIds}`
  - `GET /mine` → `{ requests: OpenSampleRequest[] }`
  - `GET /access` → `{ canViewSummary: boolean }` (frontend uses this to show the Samples tab)
  - `GET /:eventId/mine` / `PUT /:eventId/mine` / `POST /:eventId/mine/submit` → `SampleRequestView`
  - `GET /:eventId/summary` → `EventSampleSummary`
  - `PUT /:eventId/users/:userId` / `POST /:eventId/users/:userId/submit` → `SampleRequestView` (override roles)

- [ ] **Step 1: Write the failing route test**

```ts
// backend/tests/routes/sampleRequests.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Response } from 'express';

vi.mock('../../src/services/sampleRequests/SampleRequestService', () => ({
  sampleRequestService: {
    getRequest: vi.fn(async () => ({ request: { id: 'r' }, window: { isOpen: true } })),
    saveDraft: vi.fn(async () => ({ request: { id: 'r' }, window: { isOpen: true } })),
    submit: vi.fn(async () => ({ request: { id: 'r', status: 'submitted' }, window: { isOpen: true } })),
    listMyOpenRequests: vi.fn(async () => [{ eventId: 'ev-1' }]),
    getEventSummary: vi.fn(async () => ({ eventId: 'ev-1' })),
    canViewSummary: vi.fn(async () => true),
  },
}));
vi.mock('../../src/database/repositories/SampleRequestRepository', () => ({
  sampleRequestRepository: {
    getCatalog: vi.fn(async () => ({ lines: [], products: [], materials: [] })),
    createLine: vi.fn(async (d: any) => ({ id: 'l-1', ...d })),
    updateLine: vi.fn(async (id: string, p: any) => ({ id, ...p })),
    createProduct: vi.fn(async (d: any) => ({ id: 'p-1', ...d })),
    updateProduct: vi.fn(async () => null),
    createMaterial: vi.fn(async (d: any) => ({ id: 'm-1', ...d })),
    updateMaterial: vi.fn(async (id: string, p: any) => ({ id, ...p })),
    reorder: vi.fn(async () => undefined),
  },
}));

import {
  handleGetCatalog, handleCreateLine, handleUpdateProduct, handleReorder,
  handleGetMine, handleSaveMine, handleSubmitMine, handleSaveForUser, handleGetSummary, handleAccess,
} from '../../src/routes/sampleRequests';
import { sampleRequestService } from '../../src/services/sampleRequests/SampleRequestService';
import { sampleRequestRepository } from '../../src/database/repositories/SampleRequestRepository';

function mockRes() {
  return { json: vi.fn().mockReturnThis(), status: vi.fn().mockReturnThis() } as unknown as Response & {
    json: ReturnType<typeof vi.fn>; status: ReturnType<typeof vi.fn>;
  };
}
const rep = { id: 'u-1', role: 'salesperson' };

describe('sample request routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('catalog hides inactive rows unless asked', async () => {
    await handleGetCatalog({ user: rep, query: {} } as any, mockRes());
    expect(sampleRequestRepository.getCatalog).toHaveBeenCalledWith(false);
    await handleGetCatalog({ user: rep, query: { includeInactive: '1' } } as any, mockRes());
    expect(sampleRequestRepository.getCatalog).toHaveBeenCalledWith(true);
  });

  it('rejects a line with an unknown brand or blank name', async () => {
    const res = mockRes();
    await handleCreateLine({ user: rep, body: { brand: 'acme', name: 'X' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
    await handleCreateLine({ user: rep, body: { brand: 'haute_brands', name: '  ' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(sampleRequestRepository.createLine).not.toHaveBeenCalled();
  });

  it('creates a line with a trimmed name', async () => {
    const res = mockRes();
    await handleCreateLine({ user: rep, body: { brand: 'haute_brands', name: ' Oh! Mit ' } } as any, res);
    expect(sampleRequestRepository.createLine).toHaveBeenCalledWith({ brand: 'haute_brands', name: 'Oh! Mit' });
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('404s an update to a missing product', async () => {
    const res = mockRes();
    await handleUpdateProduct({ user: rep, params: { id: 'nope' }, body: { isActive: false } } as any, res);
    expect(sampleRequestRepository.updateProduct).toHaveBeenCalledWith('nope', { name: undefined, is_active: false });
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('validates reorder input', async () => {
    const res = mockRes();
    await handleReorder({ user: rep, body: { kind: 'things', orderedIds: ['a'] } } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
    await handleReorder({ user: rep, body: { kind: 'products', orderedIds: ['a', 'b'] } } as any, res);
    expect(sampleRequestRepository.reorder).toHaveBeenCalledWith('products', ['a', 'b']);
  });

  it('mine endpoints always target the caller', async () => {
    await handleGetMine({ user: rep, params: { eventId: 'ev-1' } } as any, mockRes());
    expect(sampleRequestService.getRequest).toHaveBeenCalledWith('ev-1', 'u-1', rep);
    await handleSaveMine({ user: rep, params: { eventId: 'ev-1' }, body: { items: [], materials: [] } } as any, mockRes());
    expect(sampleRequestService.saveDraft).toHaveBeenCalledWith('ev-1', 'u-1', { items: [], materials: [] }, rep);
    await handleSubmitMine({ user: rep, params: { eventId: 'ev-1' } } as any, mockRes());
    expect(sampleRequestService.submit).toHaveBeenCalledWith('ev-1', 'u-1', rep);
  });

  it('on-behalf save targets the path user and passes the actor', async () => {
    const admin = { id: 'adm', role: 'admin' };
    await handleSaveForUser({ user: admin, params: { eventId: 'ev-1', userId: 'u-9' }, body: { items: [], materials: [] } } as any, mockRes());
    expect(sampleRequestService.saveDraft).toHaveBeenCalledWith('ev-1', 'u-9', { items: [], materials: [] }, admin);
  });

  it('summary and access pass the actor through', async () => {
    const res = mockRes();
    await handleGetSummary({ user: rep, params: { eventId: 'ev-1' } } as any, res);
    expect(sampleRequestService.getEventSummary).toHaveBeenCalledWith('ev-1', rep);
    await handleAccess({ user: rep } as any, res);
    expect(res.json).toHaveBeenCalledWith({ canViewSummary: true });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && npx vitest run tests/routes/sampleRequests.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the routes**

```ts
// backend/src/routes/sampleRequests.ts
/**
 * Sample Requests — /api/sample-requests
 *
 * "mine" handlers always target req.user; on-behalf handlers take the user
 * from the path and are gated to admin/coordinator/developer by authorize()
 * AND re-checked in the service. The summary is gated in the service only,
 * because the puller may hold any role.
 */
import express, { Response } from 'express';
import { authenticateToken, authorize, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/errors';
import { sampleRequestService } from '../services/sampleRequests/SampleRequestService';
import { sampleRequestRepository } from '../database/repositories/SampleRequestRepository';
import { SAMPLE_BRANDS, SampleBrand } from '../services/sampleRequests/types';

const router = express.Router();
router.use(authenticateToken);

const CATALOG_ROLES = ['admin', 'developer'];
const OVERRIDE_ROLES = ['admin', 'coordinator', 'developer'];

const cleanName = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s.length > 0 && s.length <= 120 ? s : null;
};
const patchFrom = (body: any) => ({
  name: body?.name === undefined ? undefined : cleanName(body.name) ?? undefined,
  is_active: typeof body?.isActive === 'boolean' ? body.isActive : undefined,
});

// ── Catalog ───────────────────────────────────────────────────────────────
export async function handleGetCatalog(req: AuthRequest, res: Response): Promise<void> {
  const includeInactive = req.query.includeInactive === '1' || req.query.includeInactive === 'true';
  res.json(await sampleRequestRepository.getCatalog(includeInactive));
}

export async function handleCreateLine(req: AuthRequest, res: Response): Promise<void> {
  const brand = req.body?.brand;
  const name = cleanName(req.body?.name);
  if (!(SAMPLE_BRANDS as readonly string[]).includes(brand) || !name) {
    res.status(400).json({ error: 'brand (haute_brands|boomin_brands) and name are required' });
    return;
  }
  res.status(201).json(await sampleRequestRepository.createLine({ brand: brand as SampleBrand, name }));
}

export async function handleUpdateLine(req: AuthRequest, res: Response): Promise<void> {
  const row = await sampleRequestRepository.updateLine(req.params.id, patchFrom(req.body));
  if (!row) { res.status(404).json({ error: 'Product line not found' }); return; }
  res.json(row);
}

export async function handleCreateProduct(req: AuthRequest, res: Response): Promise<void> {
  const productLineId = typeof req.body?.productLineId === 'string' ? req.body.productLineId : '';
  const name = cleanName(req.body?.name);
  if (!productLineId || !name) { res.status(400).json({ error: 'productLineId and name are required' }); return; }
  res.status(201).json(await sampleRequestRepository.createProduct({ product_line_id: productLineId, name }));
}

export async function handleUpdateProduct(req: AuthRequest, res: Response): Promise<void> {
  const row = await sampleRequestRepository.updateProduct(req.params.id, patchFrom(req.body));
  if (!row) { res.status(404).json({ error: 'Product not found' }); return; }
  res.json(row);
}

export async function handleCreateMaterial(req: AuthRequest, res: Response): Promise<void> {
  const name = cleanName(req.body?.name);
  if (!name) { res.status(400).json({ error: 'name is required' }); return; }
  res.status(201).json(await sampleRequestRepository.createMaterial({ name }));
}

export async function handleUpdateMaterial(req: AuthRequest, res: Response): Promise<void> {
  const row = await sampleRequestRepository.updateMaterial(req.params.id, patchFrom(req.body));
  if (!row) { res.status(404).json({ error: 'Material not found' }); return; }
  res.json(row);
}

export async function handleReorder(req: AuthRequest, res: Response): Promise<void> {
  const kind = req.body?.kind;
  const ids = Array.isArray(req.body?.orderedIds) ? req.body.orderedIds.filter((v: unknown) => typeof v === 'string') : [];
  if (!['lines', 'products', 'materials'].includes(kind) || ids.length === 0) {
    res.status(400).json({ error: 'kind (lines|products|materials) and orderedIds are required' });
    return;
  }
  await sampleRequestRepository.reorder(kind, ids);
  res.json({ ok: true });
}

// ── Requests ──────────────────────────────────────────────────────────────
export async function handleListMine(req: AuthRequest, res: Response): Promise<void> {
  res.json({ requests: await sampleRequestService.listMyOpenRequests(req.user!.id) });
}

export async function handleAccess(req: AuthRequest, res: Response): Promise<void> {
  res.json({ canViewSummary: await sampleRequestService.canViewSummary(req.user!) });
}

export async function handleGetMine(req: AuthRequest, res: Response): Promise<void> {
  res.json(await sampleRequestService.getRequest(req.params.eventId, req.user!.id, req.user!));
}

export async function handleSaveMine(req: AuthRequest, res: Response): Promise<void> {
  res.json(await sampleRequestService.saveDraft(req.params.eventId, req.user!.id, req.body, req.user!));
}

export async function handleSubmitMine(req: AuthRequest, res: Response): Promise<void> {
  res.json(await sampleRequestService.submit(req.params.eventId, req.user!.id, req.user!));
}

export async function handleGetForUser(req: AuthRequest, res: Response): Promise<void> {
  res.json(await sampleRequestService.getRequest(req.params.eventId, req.params.userId, req.user!));
}

export async function handleSaveForUser(req: AuthRequest, res: Response): Promise<void> {
  res.json(await sampleRequestService.saveDraft(req.params.eventId, req.params.userId, req.body, req.user!));
}

export async function handleSubmitForUser(req: AuthRequest, res: Response): Promise<void> {
  res.json(await sampleRequestService.submit(req.params.eventId, req.params.userId, req.user!));
}

export async function handleGetSummary(req: AuthRequest, res: Response): Promise<void> {
  res.json(await sampleRequestService.getEventSummary(req.params.eventId, req.user!));
}

router.get('/catalog', asyncHandler(handleGetCatalog));
router.post('/catalog/lines', authorize(...CATALOG_ROLES), asyncHandler(handleCreateLine));
router.put('/catalog/lines/:id', authorize(...CATALOG_ROLES), asyncHandler(handleUpdateLine));
router.post('/catalog/products', authorize(...CATALOG_ROLES), asyncHandler(handleCreateProduct));
router.put('/catalog/products/:id', authorize(...CATALOG_ROLES), asyncHandler(handleUpdateProduct));
router.post('/catalog/materials', authorize(...CATALOG_ROLES), asyncHandler(handleCreateMaterial));
router.put('/catalog/materials/:id', authorize(...CATALOG_ROLES), asyncHandler(handleUpdateMaterial));
router.put('/catalog/reorder', authorize(...CATALOG_ROLES), asyncHandler(handleReorder));

router.get('/mine', asyncHandler(handleListMine));
router.get('/access', asyncHandler(handleAccess));
router.get('/:eventId/mine', asyncHandler(handleGetMine));
router.put('/:eventId/mine', asyncHandler(handleSaveMine));
router.post('/:eventId/mine/submit', asyncHandler(handleSubmitMine));
router.get('/:eventId/summary', asyncHandler(handleGetSummary));
router.get('/:eventId/users/:userId', authorize(...OVERRIDE_ROLES), asyncHandler(handleGetForUser));
router.put('/:eventId/users/:userId', authorize(...OVERRIDE_ROLES), asyncHandler(handleSaveForUser));
router.post('/:eventId/users/:userId/submit', authorize(...OVERRIDE_ROLES), asyncHandler(handleSubmitForUser));

export default router;
```

Mount in `backend/src/server.ts` next to the notifications import/mount from Task 3:

```ts
import sampleRequestRoutes from './routes/sampleRequests';
// …
app.use('/api/sample-requests', authenticateToken, sessionTracker, sampleRequestRoutes);
```

Check that `asyncHandler` forwards `AppError` instances with their `statusCode` and `context` (it does; `ConflictError` carries `{ code: 'WINDOW_CLOSED', closesAt }` in `context`). Open `backend/src/utils/errors/errorHandler.ts` and confirm the error response includes `context` under some key; if it does not, add `...(err.context ? { details: err.context } : {})` to the JSON body so the frontend can read `details.code === 'WINDOW_CLOSED'`.

- [ ] **Step 4: Run tests and type-check**

Run: `cd backend && npx vitest run tests/routes/sampleRequests.test.ts && npx tsc --noEmit -p .`
Expected: 8 PASS; tsc clean.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/sampleRequests.ts backend/src/server.ts backend/src/utils/errors/errorHandler.ts backend/tests/routes/sampleRequests.test.ts
git commit -m "feat(sample-requests): routes for catalog, drafts, submit, summary

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Announce on event creation and participant add

**Files:**
- Modify: `backend/src/routes/events.ts:85-121` (POST `/`) and `:188-212` (POST `/:id/participants`)
- Test: `backend/tests/routes/events.sampleAnnounce.test.ts`

**Interfaces:**
- Consumes: `sampleRequestService.announceIfOpen(eventId, userIds)` (Task 5), `processParticipants` return value (array of added ids).

- [ ] **Step 1: Check what `processParticipants` returns**

Run: `cd backend && sed -n 34,100p src/services/EventParticipantService.ts`
Confirm it resolves to `string[]` of participant user ids (the add-participants route already uses it that way: `addedIds.filter(...)`). If the create route's call discards the result, capture it.

- [ ] **Step 2: Write the failing test**

```ts
// backend/tests/routes/events.sampleAnnounce.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../src/middleware/auth', () => ({
  authenticateToken: (req: any, _res: any, next: any) => { req.user = { id: 'adm', role: 'admin' }; next(); },
  authorize: () => (_req: any, _res: any, next: any) => next(),
}));
vi.mock('../../src/database/repositories/EventRepository', () => ({
  eventRepository: { create: vi.fn(async (d: any) => ({ id: 'ev-new', ...d })) },
}));
vi.mock('../../src/services/EventParticipantService', () => ({
  processParticipants: vi.fn(async () => ['u-1', 'u-2']),
  getCurrentParticipantIds: vi.fn(async () => ['u-1']),
}));
vi.mock('../../src/services/sampleRequests/SampleRequestService', () => ({
  sampleRequestService: { announceIfOpen: vi.fn(async () => undefined) },
}));
vi.mock('../../src/config/database', () => ({ pool: { connect: vi.fn() }, query: vi.fn() }));

import eventRoutes from '../../src/routes/events';
import { sampleRequestService } from '../../src/services/sampleRequests/SampleRequestService';

const app = express();
app.use(express.json());
app.use('/api/events', eventRoutes);

describe('events → sample request announcements', () => {
  beforeEach(() => vi.clearAllMocks());

  it('announces to every participant after create', async () => {
    await request(app).post('/api/events').send({
      name: 'X', venue: 'V', city: 'C', state: 'S', start_date: '2026-12-01', end_date: '2026-12-02', participant_ids: ['u-1', 'u-2'],
    }).expect(201);
    expect(sampleRequestService.announceIfOpen).toHaveBeenCalledWith('ev-new', ['u-1', 'u-2']);
  });

  it('announces only to newly added participants', async () => {
    await request(app).post('/api/events/ev-1/participants').send({ user_ids: ['u-1', 'u-2'] }).expect(200);
    expect(sampleRequestService.announceIfOpen).toHaveBeenCalledWith('ev-1', ['u-2']);
  });
});
```

If `supertest` is not in `backend/package.json` devDependencies, check with `grep supertest backend/package.json`; if absent, rewrite the test to import the router's handlers the way `tests/routes/badgeScans.test.ts` does (export `handleCreateEvent` and `handleAddParticipants` from `events.ts` and call them with a mock req/res).

- [ ] **Step 3: Wire the calls**

In `POST /` (after `processParticipants`):

```ts
    const addedIds = await processParticipants(event.id, participants, participant_ids);
    // Sample request window opens at creation — tell the roster. Off the
    // response path; a notification failure must never fail event creation.
    void sampleRequestService.announceIfOpen(event.id, addedIds).catch((e) =>
      console.error('[Events] sample request announce failed:', e));
```

In `POST /:id/participants` (after `newlyAddedIds` is computed):

```ts
    void sampleRequestService.announceIfOpen(id, newlyAddedIds).catch((e) =>
      console.error('[Events] sample request announce failed:', e));
```

Add the import at the top of `events.ts`:

```ts
import { sampleRequestService } from '../services/sampleRequests/SampleRequestService';
```

Because the call is fire-and-forget, the test's `expect` runs after the handler resolved; `announceIfOpen` is invoked synchronously before the first `await` inside it, so the assertion holds.

- [ ] **Step 4: Run tests**

Run: `cd backend && npx vitest run tests/routes/events.sampleAnnounce.test.ts && npx vitest run tests/routes`
Expected: 2 PASS; no regressions in the routes directory.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/events.ts backend/tests/routes/events.sampleAnnounce.test.ts
git commit -m "feat(sample-requests): notify roster when the window opens

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: 48-hour reminder scanner

**Files:**
- Create: `backend/src/services/sampleRequests/SampleRequestReminderService.ts`
- Modify: `backend/src/server.ts` (start it after `travelReminderService.start()`)
- Test: `backend/tests/services/SampleRequestReminderService.test.ts`

**Interfaces:**
- Consumes: `computeSampleWindow` (Task 2), `notificationService.notify` (Task 3), `query`.
- Produces: `sampleRequestReminderService.start()`, `.stop()`, `.scan()`.

- [ ] **Step 1: Write the failing test**

```ts
// backend/tests/services/SampleRequestReminderService.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/config/database', () => ({ query: vi.fn() }));
vi.mock('../../src/services/NotificationService', () => ({
  notificationService: { notify: vi.fn(async () => ({ id: 'n' })) },
}));

import { sampleRequestReminderService } from '../../src/services/sampleRequests/SampleRequestReminderService';
import { notificationService } from '../../src/services/NotificationService';
import { query } from '../../src/config/database';

// Window closes 2026-10-24T03:59:59Z (travel 10/31 − 7 = 10/24 → EOD Eastern 10/23 23:59:59 EDT)
const EVENT = { id: 'ev-1', name: 'Expo', created_at: '2026-10-01T00:00:00Z', travel_start_date: '2026-10-31', show_start_date: '2026-11-01' };

describe('SampleRequestReminderService.scan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  it('reminds unsubmitted participants inside the 48h window, once', async () => {
    vi.setSystemTime(new Date('2026-10-22T12:00:00Z')); // ~40h before close
    vi.mocked(query)
      .mockResolvedValueOnce({ rows: [EVENT] } as any)                                  // candidate events
      .mockResolvedValueOnce({ rows: [{ user_id: 'u-1' }, { user_id: 'u-2' }] } as any)  // unsubmitted
      .mockResolvedValueOnce({ rows: [{ event_id: 'ev-1' }] } as any)                    // claim u-1 ok
      .mockResolvedValueOnce({ rows: [] } as any);                                       // claim u-2 conflict
    await sampleRequestReminderService.scan();
    expect(notificationService.notify).toHaveBeenCalledTimes(1);
    expect(notificationService.notify).toHaveBeenCalledWith('u-1', expect.objectContaining({
      kind: 'sample_request.closing_48h', link: { page: 'checklist', eventId: 'ev-1' },
    }));
  });

  it('skips events whose close is more than 48h away or already past', async () => {
    vi.setSystemTime(new Date('2026-10-15T12:00:00Z'));
    vi.mocked(query).mockResolvedValueOnce({ rows: [EVENT] } as any);
    await sampleRequestReminderService.scan();
    expect(notificationService.notify).not.toHaveBeenCalled();

    vi.setSystemTime(new Date('2026-10-25T12:00:00Z'));
    vi.mocked(query).mockResolvedValueOnce({ rows: [EVENT] } as any);
    await sampleRequestReminderService.scan();
    expect(notificationService.notify).not.toHaveBeenCalled();
  });

  it('never throws out of scan', async () => {
    vi.mocked(query).mockRejectedValueOnce(new Error('db down'));
    await expect(sampleRequestReminderService.scan()).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && npx vitest run tests/services/SampleRequestReminderService.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the scanner**

```ts
// backend/src/services/sampleRequests/SampleRequestReminderService.ts
/**
 * Every 15 minutes: for each show whose sample window closes within 48h,
 * remind every participant who has not submitted. Ledger-first send-once,
 * same pattern as TravelReminderService. Bell rows are written even when
 * push is not configured, so this scheduler always runs.
 */
import { query } from '../../config/database';
import { notificationService } from '../NotificationService';
import { computeSampleWindow } from './sampleRequestWindow';

const SCAN_INTERVAL_MS = 15 * 60 * 1000;
const STARTUP_DELAY_MS = 20 * 1000;
const WINDOW_MS = 48 * 60 * 60 * 1000;
export const REMINDER_KIND = 'closing_48h';

interface CandidateEvent {
  id: string; name: string; created_at: string;
  travel_start_date: string | null; show_start_date: string | null;
}

const hoursLeft = (closesAt: string, now: number): number => Math.max(1, Math.round((new Date(closesAt).getTime() - now) / 3_600_000));

class SampleRequestReminderService {
  private timer: NodeJS.Timeout | null = null;

  start(): void {
    if (this.timer) return;
    setTimeout(() => this.scan(), STARTUP_DELAY_MS);
    this.timer = setInterval(() => this.scan(), SCAN_INTERVAL_MS);
    console.log('[SampleReminders] Scheduler started (every 15 minutes: closing T-48h)');
  }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  /** One pass. Never throws. */
  async scan(): Promise<void> {
    try {
      const now = Date.now();
      // Candidate shows: anchor date within the next ~10 days keeps the scan cheap.
      const events = await query(
        `SELECT id, name, created_at, travel_start_date, show_start_date
         FROM events
         WHERE status <> 'cancelled'
           AND COALESCE(travel_start_date, show_start_date) BETWEEN CURRENT_DATE AND CURRENT_DATE + 10`
      );
      for (const event of events.rows as CandidateEvent[]) {
        const w = computeSampleWindow(event, new Date(now));
        if (!w.closesAt) continue;
        const closeMs = new Date(w.closesAt).getTime();
        if (closeMs <= now || closeMs - now > WINDOW_MS) continue;
        await this.remindEvent(event, w.closesAt, now);
      }
    } catch (error) {
      console.error('[SampleReminders] Scan failed:', error);
    }
  }

  private async remindEvent(event: CandidateEvent, closesAt: string, now: number): Promise<void> {
    const due = await query(
      `SELECT ep.user_id
       FROM event_participants ep
       LEFT JOIN sample_requests sr ON sr.event_id = ep.event_id AND sr.user_id = ep.user_id
       WHERE ep.event_id = $1 AND (sr.status IS NULL OR sr.status <> 'submitted')`,
      [event.id]
    );
    for (const { user_id } of due.rows as Array<{ user_id: string }>) {
      const claimed = await query(
        `INSERT INTO sample_request_reminders (event_id, user_id, kind) VALUES ($1, $2, $3)
         ON CONFLICT (event_id, user_id, kind) DO NOTHING RETURNING event_id`,
        [event.id, user_id, REMINDER_KIND]
      );
      if (claimed.rows.length === 0) continue;
      await notificationService.notify(user_id, {
        kind: `sample_request.${REMINDER_KIND}`,
        title: `Sample request closes in ${hoursLeft(closesAt, now)}h · ${event.name}`,
        body: `You have not submitted your sample request for ${event.name}. Submit it before the window closes.`,
        link: { page: 'checklist', eventId: event.id },
      });
      console.log(`[SampleReminders] Sent ${REMINDER_KIND} for event ${event.id} to ${user_id}`);
    }
  }
}

export const sampleRequestReminderService = new SampleRequestReminderService();
```

In `backend/src/server.ts`, import and start after `travelReminderService.start();`:

```ts
import { sampleRequestReminderService } from './services/sampleRequests/SampleRequestReminderService';
// …
    // Sample request closing reminders (bell + push; runs even without push)
    sampleRequestReminderService.start();
```

- [ ] **Step 4: Run tests and type-check**

Run: `cd backend && npx vitest run tests/services/SampleRequestReminderService.test.ts && npx tsc --noEmit -p .`
Expected: 3 PASS; tsc clean.

- [ ] **Step 5: Run the whole backend suite**

Run: `cd backend && npm test`
Expected: all green except any failure already present on `main` (compare with `git stash && npm test` if unsure).

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/sampleRequests/SampleRequestReminderService.ts backend/src/server.ts backend/tests/services/SampleRequestReminderService.test.ts
git commit -m "feat(sample-requests): 48-hour closing reminder scanner

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 9: Frontend API modules and countdown text

**Files:**
- Create: `src/utils/sampleRequestApi.ts`
- Create: `src/utils/notificationsApi.ts`
- Create: `src/components/checklist/samples/sampleRequestText.ts`
- Test: `src/components/checklist/samples/__tests__/sampleRequestText.test.ts`, `src/utils/__tests__/sampleRequestApi.test.ts`

**Interfaces:**
- Produces `sampleRequestApi`: `getCatalog(includeInactive?)`, `listMine()`, `getAccess()`, `getMine(eventId)`, `saveMine(eventId, payload)`, `submitMine(eventId)`, `getForUser(eventId,userId)`, `saveForUser(eventId,userId,payload)`, `submitForUser(eventId,userId)`, `getSummary(eventId)`, catalog admin calls `createLine`, `updateLine`, `createProduct`, `updateProduct`, `createMaterial`, `updateMaterial`, `reorder`.
- Produces `notificationsApi`: `listUnread()`, `markRead(ids)`, `markAllRead()`.
- Produces text helpers: `formatCountdown(closesAt, now)`, `isUrgent(closesAt, now)`, `formatCloseDate(closesAt)`.
- Frontend types mirror the backend `types.ts` in camelCase and are exported from `sampleRequestApi.ts`.

- [ ] **Step 1: Write the failing text tests**

```ts
// src/components/checklist/samples/__tests__/sampleRequestText.test.ts
import { describe, it, expect } from 'vitest';
import { formatCountdown, isUrgent, formatCloseDate } from '../sampleRequestText';

const close = '2026-10-24T03:59:59.000Z';

describe('formatCountdown', () => {
  it('shows days and hours when more than a day remains', () => {
    expect(formatCountdown(close, new Date('2026-10-20T23:59:59Z'))).toBe('3d 4h');
  });
  it('shows hours and minutes under a day', () => {
    expect(formatCountdown(close, new Date('2026-10-23T22:30:00Z'))).toBe('5h 29m');
  });
  it('shows minutes under an hour', () => {
    expect(formatCountdown(close, new Date('2026-10-24T03:45:00Z'))).toBe('14m');
  });
  it('says closed once past', () => {
    expect(formatCountdown(close, new Date('2026-10-24T04:00:00Z'))).toBe('Closed');
  });
});

describe('isUrgent', () => {
  it('is urgent inside 48 hours', () => {
    expect(isUrgent(close, new Date('2026-10-22T12:00:00Z'))).toBe(true);
    expect(isUrgent(close, new Date('2026-10-20T12:00:00Z'))).toBe(false);
  });
});

describe('formatCloseDate', () => {
  it('renders in Eastern time with the zone label', () => {
    expect(formatCloseDate(close)).toBe('Oct 23, 11:59 PM ET');
  });
});
```

- [ ] **Step 2: Implement the text helpers**

```ts
// src/components/checklist/samples/sampleRequestText.ts
/** Countdown + date copy for the sample request window. closesAt is ISO. */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export function formatCountdown(closesAt: string, now: Date = new Date()): string {
  const left = new Date(closesAt).getTime() - now.getTime();
  if (left <= 0) return 'Closed';
  if (left >= DAY) {
    const days = Math.floor(left / DAY);
    const hours = Math.floor((left % DAY) / HOUR);
    return `${days}d ${hours}h`;
  }
  if (left >= HOUR) {
    const hours = Math.floor(left / HOUR);
    const mins = Math.floor((left % HOUR) / 60_000);
    return `${hours}h ${mins}m`;
  }
  return `${Math.max(1, Math.floor(left / 60_000))}m`;
}

export function isUrgent(closesAt: string, now: Date = new Date()): boolean {
  const left = new Date(closesAt).getTime() - now.getTime();
  return left > 0 && left <= 48 * HOUR;
}

export function formatCloseDate(closesAt: string): string {
  const s = new Date(closesAt).toLocaleString('en-US', {
    timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
  return `${s} ET`;
}
```

Run: `npx vitest run src/components/checklist/samples/__tests__/sampleRequestText.test.ts` → 7 PASS. (If `toLocaleString` renders a narrow no-break space before "PM" on this Node, normalise with `.replace(/ /g, ' ')` inside `formatCloseDate`.)

- [ ] **Step 3: Write the failing API test**

```ts
// src/utils/__tests__/sampleRequestApi.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../apiClient', () => ({
  apiClient: { get: vi.fn(async () => ({})), put: vi.fn(async () => ({})), post: vi.fn(async () => ({})) },
}));

import { apiClient } from '../apiClient';
import { sampleRequestApi } from '../sampleRequestApi';
import { notificationsApi } from '../notificationsApi';

describe('sampleRequestApi', () => {
  beforeEach(() => vi.clearAllMocks());

  it('hits the mine endpoints', async () => {
    await sampleRequestApi.getMine('ev-1');
    expect(apiClient.get).toHaveBeenCalledWith('/sample-requests/ev-1/mine');
    await sampleRequestApi.saveMine('ev-1', { items: [], materials: [] });
    expect(apiClient.put).toHaveBeenCalledWith('/sample-requests/ev-1/mine', { items: [], materials: [] });
    await sampleRequestApi.submitMine('ev-1');
    expect(apiClient.post).toHaveBeenCalledWith('/sample-requests/ev-1/mine/submit');
  });

  it('asks for inactive catalog rows only when told', async () => {
    await sampleRequestApi.getCatalog();
    expect(apiClient.get).toHaveBeenCalledWith('/sample-requests/catalog');
    await sampleRequestApi.getCatalog(true);
    expect(apiClient.get).toHaveBeenCalledWith('/sample-requests/catalog?includeInactive=1');
  });

  it('on-behalf calls include the user id', async () => {
    await sampleRequestApi.saveForUser('ev-1', 'u-9', { items: [], materials: [] });
    expect(apiClient.put).toHaveBeenCalledWith('/sample-requests/ev-1/users/u-9', { items: [], materials: [] });
  });
});

describe('notificationsApi', () => {
  it('marks ids read', async () => {
    await notificationsApi.markRead(['n-1']);
    expect(apiClient.post).toHaveBeenCalledWith('/notifications/read', { ids: ['n-1'] });
  });
});
```

- [ ] **Step 4: Implement the API modules**

```ts
// src/utils/sampleRequestApi.ts
import { apiClient } from './apiClient';

export type SampleBrand = 'haute_brands' | 'boomin_brands';
export const SAMPLE_BRAND_LABELS: Record<SampleBrand, string> = { haute_brands: 'Haute Brands', boomin_brands: 'Coolioh' };
export const SAMPLE_BRAND_ORDER: SampleBrand[] = ['haute_brands', 'boomin_brands'];

export interface SampleProductLine { id: string; brand: SampleBrand; name: string; position: number; is_active: boolean }
export interface SampleProduct { id: string; product_line_id: string; name: string; position: number; is_active: boolean }
export interface SampleMaterial { id: string; name: string; position: number; is_active: boolean }
export interface SampleCatalog { lines: SampleProductLine[]; products: SampleProduct[]; materials: SampleMaterial[] }

export interface SampleRequestItem { productId: string; singles: number; displays: number; emptyDisplays: number }
export interface SampleRequestMaterial { materialId: string; qty: number; notes: string | null }
export interface SampleRequestPayload { items: SampleRequestItem[]; materials: SampleRequestMaterial[] }

export type SampleRequestStatus = 'draft' | 'submitted';
export interface SampleWindow { opensAt: string | null; closesAt: string | null; isOpen: boolean }
export interface SampleRequestView {
  request: { id: string; event_id: string; user_id: string; status: SampleRequestStatus; submitted_at: string | null; items: SampleRequestItem[]; materials: SampleRequestMaterial[] };
  window: SampleWindow;
}
export interface OpenSampleRequest { eventId: string; eventName: string; closesAt: string; status: 'none' | SampleRequestStatus; submittedAt: string | null }

export interface SummaryByUser { userId: string; name: string; status: SampleRequestStatus; singles: number; displays: number; emptyDisplays: number }
export interface SummaryProduct { productId: string; productName: string; lineId: string; lineName: string; brand: SampleBrand; isActive: boolean; singles: number; displays: number; emptyDisplays: number; byUser: SummaryByUser[] }
export interface SummaryMaterialByUser { userId: string; name: string; status: SampleRequestStatus; qty: number; notes: string | null }
export interface SummaryMaterial { materialId: string; materialName: string; isActive: boolean; qty: number; byUser: SummaryMaterialByUser[] }
export interface SummaryParticipant { userId: string; name: string; status: 'none' | SampleRequestStatus; submittedAt: string | null }
export interface EventSampleSummary { eventId: string; eventName: string; window: SampleWindow; pullerUserId: string | null; participants: SummaryParticipant[]; products: SummaryProduct[]; materials: SummaryMaterial[] }

const base = '/sample-requests';

export const sampleRequestApi = {
  getCatalog: (includeInactive = false) =>
    apiClient.get<SampleCatalog>(includeInactive ? `${base}/catalog?includeInactive=1` : `${base}/catalog`),
  listMine: () => apiClient.get<{ requests: OpenSampleRequest[] }>(`${base}/mine`),
  getAccess: () => apiClient.get<{ canViewSummary: boolean }>(`${base}/access`),
  getMine: (eventId: string) => apiClient.get<SampleRequestView>(`${base}/${eventId}/mine`),
  saveMine: (eventId: string, payload: SampleRequestPayload) => apiClient.put<SampleRequestView>(`${base}/${eventId}/mine`, payload),
  submitMine: (eventId: string) => apiClient.post<SampleRequestView>(`${base}/${eventId}/mine/submit`),
  getForUser: (eventId: string, userId: string) => apiClient.get<SampleRequestView>(`${base}/${eventId}/users/${userId}`),
  saveForUser: (eventId: string, userId: string, payload: SampleRequestPayload) => apiClient.put<SampleRequestView>(`${base}/${eventId}/users/${userId}`, payload),
  submitForUser: (eventId: string, userId: string) => apiClient.post<SampleRequestView>(`${base}/${eventId}/users/${userId}/submit`),
  getSummary: (eventId: string) => apiClient.get<EventSampleSummary>(`${base}/${eventId}/summary`),

  createLine: (brand: SampleBrand, name: string) => apiClient.post<SampleProductLine>(`${base}/catalog/lines`, { brand, name }),
  updateLine: (id: string, patch: { name?: string; isActive?: boolean }) => apiClient.put<SampleProductLine>(`${base}/catalog/lines/${id}`, patch),
  createProduct: (productLineId: string, name: string) => apiClient.post<SampleProduct>(`${base}/catalog/products`, { productLineId, name }),
  updateProduct: (id: string, patch: { name?: string; isActive?: boolean }) => apiClient.put<SampleProduct>(`${base}/catalog/products/${id}`, patch),
  createMaterial: (name: string) => apiClient.post<SampleMaterial>(`${base}/catalog/materials`, { name }),
  updateMaterial: (id: string, patch: { name?: string; isActive?: boolean }) => apiClient.put<SampleMaterial>(`${base}/catalog/materials/${id}`, patch),
  reorder: (kind: 'lines' | 'products' | 'materials', orderedIds: string[]) => apiClient.put<{ ok: true }>(`${base}/catalog/reorder`, { kind, orderedIds }),
};
```

```ts
// src/utils/notificationsApi.ts
import { apiClient } from './apiClient';

export interface AppNotification {
  id: string; kind: string; title: string; body: string;
  link: { page: string; eventId?: string } | null; read_at: string | null; created_at: string;
}

export const notificationsApi = {
  listUnread: () => apiClient.get<{ notifications: AppNotification[] }>('/notifications/unread'),
  markRead: (ids: string[]) => apiClient.post<{ updated: number }>('/notifications/read', { ids }),
  markAllRead: () => apiClient.post<{ updated: number }>('/notifications/read-all'),
};
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/utils/__tests__/sampleRequestApi.test.ts src/components/checklist/samples/__tests__/sampleRequestText.test.ts`
Expected: 11 PASS.

- [ ] **Step 6: Commit**

```bash
git add src/utils/sampleRequestApi.ts src/utils/notificationsApi.ts src/components/checklist/samples/ src/utils/__tests__/sampleRequestApi.test.ts
git commit -m "feat(sample-requests): frontend api modules and countdown copy

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: SampleRequestSection on My Checklist

**Files:**
- Create: `src/components/checklist/samples/useSampleRequest.ts`
- Create: `src/components/checklist/samples/SampleRequestSection.tsx`
- Create: `src/components/checklist/samples/ProductTable.tsx`
- Create: `src/components/checklist/samples/MaterialsTable.tsx`
- Modify: `src/components/checklist/UserChecklist.tsx` (deep link + render section above itinerary)
- Modify: `src/components/checklist/TradeShowChecklist.tsx:179-186` (hash parsing) and the tab default
- Test: `src/components/checklist/samples/__tests__/useSampleRequest.test.ts`, `src/components/checklist/samples/__tests__/SampleRequestSection.test.tsx`

**Interfaces:**
- Consumes: `sampleRequestApi` and types (Task 9), `formatCountdown`/`isUrgent`/`formatCloseDate`.
- Produces: `<SampleRequestSection eventId userId role />` and the hook `useSampleRequest({ eventId, userId, role })` returning `{ status: 'loading'|'ready'|'offline'|'error', catalog, view, draft, setItem, setMaterial, dirty, saving, submit, submitting, closed, override, setOverride, error }`.
- Deep link: `#event=<id>&tab=my` selects the show and the My tab. The hash is cleared after it is consumed.

- [ ] **Step 1: Write the failing hook test**

```ts
// src/components/checklist/samples/__tests__/useSampleRequest.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('../../../../utils/sampleRequestApi', async (orig) => {
  const actual = await orig<typeof import('../../../../utils/sampleRequestApi')>();
  return {
    ...actual,
    sampleRequestApi: {
      getCatalog: vi.fn(async () => ({
        lines: [{ id: 'l-1', brand: 'boomin_brands', name: 'Peelz', position: 1, is_active: true }],
        products: [{ id: 'p-1', product_line_id: 'l-1', name: 'Mango', position: 1, is_active: true }],
        materials: [{ id: 'm-1', name: 'Banner', position: 1, is_active: true }],
      })),
      getMine: vi.fn(async () => ({
        request: { id: 'r', event_id: 'ev-1', user_id: 'u-1', status: 'draft', submitted_at: null, items: [], materials: [] },
        window: { opensAt: '2026-10-01T00:00:00Z', closesAt: '2099-01-01T00:00:00Z', isOpen: true },
      })),
      saveMine: vi.fn(async (_e: string, p: any) => ({
        request: { id: 'r', event_id: 'ev-1', user_id: 'u-1', status: 'draft', submitted_at: null, ...p },
        window: { opensAt: '2026-10-01T00:00:00Z', closesAt: '2099-01-01T00:00:00Z', isOpen: true },
      })),
      submitMine: vi.fn(async () => ({
        request: { id: 'r', event_id: 'ev-1', user_id: 'u-1', status: 'submitted', submitted_at: '2026-10-07T00:00:00Z', items: [{ productId: 'p-1', singles: 2, displays: 0, emptyDisplays: 0 }], materials: [] },
        window: { opensAt: '2026-10-01T00:00:00Z', closesAt: '2099-01-01T00:00:00Z', isOpen: true },
      })),
      getForUser: vi.fn(), saveForUser: vi.fn(), submitForUser: vi.fn(),
    },
  };
});

import { useSampleRequest } from '../useSampleRequest';
import { sampleRequestApi } from '../../../../utils/sampleRequestApi';

describe('useSampleRequest', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers({ shouldAdvanceTime: true }); });

  it('loads catalog and request, then autosaves a changed quantity after the debounce', async () => {
    const { result } = renderHook(() => useSampleRequest({ eventId: 'ev-1', userId: 'u-1', role: 'salesperson' }));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => result.current.setItem('p-1', 'singles', 2));
    expect(result.current.dirty).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(900); });
    expect(sampleRequestApi.saveMine).toHaveBeenCalledWith('ev-1', {
      items: [{ productId: 'p-1', singles: 2, displays: 0, emptyDisplays: 0 }], materials: [],
    });
  });

  it('submit enables only when the draft differs from the last submission', async () => {
    const { result } = renderHook(() => useSampleRequest({ eventId: 'ev-1', userId: 'u-1', role: 'salesperson' }));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.canSubmit).toBe(true); // never submitted → can submit
    act(() => result.current.setItem('p-1', 'singles', 2));
    await act(async () => { await result.current.submit(); });
    expect(sampleRequestApi.saveMine).toHaveBeenCalled(); // flushes pending draft first
    expect(sampleRequestApi.submitMine).toHaveBeenCalledWith('ev-1');
    expect(result.current.view?.request.status).toBe('submitted');
    expect(result.current.canSubmit).toBe(false); // nothing changed since submit
    act(() => result.current.setItem('p-1', 'singles', 3));
    expect(result.current.canSubmit).toBe(true);
  });

  it('flips to closed on a 409 WINDOW_CLOSED', async () => {
    vi.mocked(sampleRequestApi.saveMine).mockRejectedValueOnce({ statusCode: 409, details: { code: 'WINDOW_CLOSED', closesAt: '2026-10-01T00:00:00Z' } });
    const { result } = renderHook(() => useSampleRequest({ eventId: 'ev-1', userId: 'u-1', role: 'salesperson' }));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => result.current.setItem('p-1', 'singles', 1));
    await act(async () => { await vi.advanceTimersByTimeAsync(900); });
    expect(result.current.closed).toBe(true);
  });

  it('reports offline instead of error when the browser is offline', async () => {
    vi.mocked(sampleRequestApi.getMine).mockRejectedValueOnce(new Error('net'));
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    const { result } = renderHook(() => useSampleRequest({ eventId: 'ev-1', userId: 'u-1', role: 'salesperson' }));
    await waitFor(() => expect(result.current.status).toBe('offline'));
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  });

  it('uses on-behalf endpoints when an override role edits another user', async () => {
    vi.mocked(sampleRequestApi.getForUser).mockResolvedValueOnce(await (sampleRequestApi.getMine as any)());
    const { result } = renderHook(() => useSampleRequest({ eventId: 'ev-1', userId: 'u-9', role: 'admin', actorId: 'adm' }));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(sampleRequestApi.getForUser).toHaveBeenCalledWith('ev-1', 'u-9');
  });
});
```

- [ ] **Step 2: Implement the hook**

```ts
// src/components/checklist/samples/useSampleRequest.ts
/**
 * Draft state for one user's sample request on one show. Autosaves ~800ms
 * after the last change; submit flushes any pending save first. The draft
 * is a Map keyed by product/material id so the table can render every
 * catalog row and read its numbers in O(1).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  sampleRequestApi, SampleCatalog, SampleRequestView, SampleRequestPayload,
  SampleRequestItem, SampleRequestMaterial,
} from '../../../utils/sampleRequestApi';

export type SampleStatus = 'loading' | 'ready' | 'offline' | 'error';
export type ItemField = 'singles' | 'displays' | 'emptyDisplays';

interface Args { eventId: string; userId: string; role: string; actorId?: string }

const AUTOSAVE_MS = 800;
const OVERRIDE = ['admin', 'coordinator', 'developer'];

const emptyItem = (productId: string): SampleRequestItem => ({ productId, singles: 0, displays: 0, emptyDisplays: 0 });
const emptyMaterial = (materialId: string): SampleRequestMaterial => ({ materialId, qty: 0, notes: null });

function toPayload(items: Map<string, SampleRequestItem>, materials: Map<string, SampleRequestMaterial>): SampleRequestPayload {
  return {
    items: [...items.values()].filter((i) => i.singles > 0 || i.displays > 0 || i.emptyDisplays > 0),
    materials: [...materials.values()].filter((m) => m.qty > 0 || (m.notes && m.notes.trim().length > 0)),
  };
}
const serialize = (p: SampleRequestPayload): string =>
  JSON.stringify({
    items: [...p.items].sort((a, b) => a.productId.localeCompare(b.productId)),
    materials: [...p.materials].sort((a, b) => a.materialId.localeCompare(b.materialId)).map((m) => ({ ...m, notes: m.notes?.trim() || null })),
  });

const isWindowClosed = (e: unknown): boolean =>
  !!e && typeof e === 'object' && (e as any).statusCode === 409 && (e as any).details?.code === 'WINDOW_CLOSED';

export function useSampleRequest({ eventId, userId, role, actorId }: Args) {
  const onBehalf = !!actorId && actorId !== userId && OVERRIDE.includes(role);
  const api = useMemo(() => ({
    get: () => (onBehalf ? sampleRequestApi.getForUser(eventId, userId) : sampleRequestApi.getMine(eventId)),
    save: (p: SampleRequestPayload) => (onBehalf ? sampleRequestApi.saveForUser(eventId, userId, p) : sampleRequestApi.saveMine(eventId, p)),
    submit: () => (onBehalf ? sampleRequestApi.submitForUser(eventId, userId) : sampleRequestApi.submitMine(eventId)),
  }), [eventId, userId, onBehalf]);

  const [status, setStatus] = useState<SampleStatus>('loading');
  const [catalog, setCatalog] = useState<SampleCatalog | null>(null);
  const [view, setView] = useState<SampleRequestView | null>(null);
  const [items, setItems] = useState<Map<string, SampleRequestItem>>(new Map());
  const [materials, setMaterials] = useState<Map<string, SampleRequestMaterial>>(new Map());
  const [savedKey, setSavedKey] = useState('');          // last payload persisted as draft
  const [submittedKey, setSubmittedKey] = useState<string | null>(null); // payload at last submit
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [closed, setClosed] = useState(false);
  const [override, setOverride] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<Promise<void> | null>(null);

  const payload = useMemo(() => toPayload(items, materials), [items, materials]);
  const key = useMemo(() => serialize(payload), [payload]);
  const dirty = key !== savedKey;
  const canSubmit = status === 'ready' && !submitting && (submittedKey === null || key !== submittedKey);
  const canEdit = status === 'ready' && (!closed || (OVERRIDE.includes(role) && override));

  const applyView = useCallback((v: SampleRequestView) => {
    const im = new Map(v.request.items.map((i) => [i.productId, i]));
    const mm = new Map(v.request.materials.map((m) => [m.materialId, m]));
    setView(v);
    setItems(im);
    setMaterials(mm);
    const k = serialize(toPayload(im, mm));
    setSavedKey(k);
    setSubmittedKey(v.request.status === 'submitted' ? k : null);
    setClosed(!v.window.isOpen);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    (async () => {
      try {
        const [c, v] = await Promise.all([sampleRequestApi.getCatalog(), api.get()]);
        if (cancelled) return;
        setCatalog(c);
        applyView(v);
        setStatus('ready');
      } catch (e) {
        if (cancelled) return;
        setStatus(typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'error');
      }
    })();
    return () => { cancelled = true; };
  }, [api, applyView]);

  const persist = useCallback(async (): Promise<void> => {
    if (!dirty) return;
    setSaving(true);
    setError(null);
    try {
      const v = await api.save(payload);
      setSavedKey(key);
      setView((prev) => (prev ? { ...prev, window: v.window } : v));
    } catch (e) {
      if (isWindowClosed(e)) setClosed(true);
      else setError('Could not save your changes. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  }, [api, dirty, payload, key]);

  // Debounced autosave
  useEffect(() => {
    if (!dirty || !canEdit) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { pending.current = persist(); }, AUTOSAVE_MS);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [dirty, canEdit, persist]);

  const setItem = useCallback((productId: string, field: ItemField, value: number) => {
    setItems((prev) => {
      const next = new Map(prev);
      next.set(productId, { ...(prev.get(productId) ?? emptyItem(productId)), [field]: Math.max(0, Math.floor(value || 0)) });
      return next;
    });
  }, []);

  const setMaterial = useCallback((materialId: string, patch: Partial<Pick<SampleRequestMaterial, 'qty' | 'notes'>>) => {
    setMaterials((prev) => {
      const next = new Map(prev);
      const cur = prev.get(materialId) ?? emptyMaterial(materialId);
      next.set(materialId, { ...cur, ...patch, qty: patch.qty === undefined ? cur.qty : Math.max(0, Math.floor(patch.qty || 0)) });
      return next;
    });
  }, []);

  const submit = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      if (timer.current) clearTimeout(timer.current);
      await persist();
      if (pending.current) await pending.current;
      const v = await api.submit();
      setView(v);
      setSubmittedKey(key);
      setSavedKey(key);
      setClosed(!v.window.isOpen);
    } catch (e) {
      if (isWindowClosed(e)) setClosed(true);
      else setError('Could not submit. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }, [api, canSubmit, persist, key]);

  return {
    status, catalog, view, items, materials, dirty, saving, submitting, closed, override, setOverride,
    canEdit, canSubmit, error, setItem, setMaterial, submit,
  };
}
```

Run: `npx vitest run src/components/checklist/samples/__tests__/useSampleRequest.test.ts` → 5 PASS. If the 409 test fails because `apiClient` throws an `AppError` whose fields differ, open `src/utils/apiClient.ts` and `src/types/types.ts` (`AppError`) and align `isWindowClosed` to the real property names (`statusCode` and whichever key carries the backend `details`).

- [ ] **Step 3: Write the failing section test**

```tsx
// src/components/checklist/samples/__tests__/SampleRequestSection.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const hook = {
  status: 'ready', catalog: {
    lines: [{ id: 'l-1', brand: 'boomin_brands', name: 'Peelz', position: 1, is_active: true },
            { id: 'l-2', brand: 'haute_brands', name: 'Oh! Mit', position: 1, is_active: true }],
    products: [{ id: 'p-1', product_line_id: 'l-1', name: 'Mango', position: 1, is_active: true },
               { id: 'p-2', product_line_id: 'l-2', name: 'Blue Razz', position: 1, is_active: true },
               { id: 'p-old', product_line_id: 'l-1', name: 'Gone', position: 9, is_active: false }],
    materials: [{ id: 'm-1', name: 'Banner', position: 1, is_active: true }],
  },
  view: { request: { id: 'r', event_id: 'ev-1', user_id: 'u-1', status: 'draft', submitted_at: null, items: [], materials: [] },
          window: { opensAt: null, closesAt: '2099-01-01T05:00:00Z', isOpen: true } },
  items: new Map([['p-old', { productId: 'p-old', singles: 1, displays: 0, emptyDisplays: 0 }]]),
  materials: new Map(), dirty: false, saving: false, submitting: false, closed: false, override: false,
  setOverride: vi.fn(), canEdit: true, canSubmit: true, error: null, setItem: vi.fn(), setMaterial: vi.fn(), submit: vi.fn(),
};
vi.mock('../useSampleRequest', () => ({ useSampleRequest: () => hook }));

import { SampleRequestSection } from '../SampleRequestSection';

describe('SampleRequestSection', () => {
  beforeEach(() => { vi.clearAllMocks(); hook.closed = false; hook.view.request.status = 'draft'; hook.canSubmit = true; hook.status = 'ready'; });

  it('renders both brands, the countdown, and a Submit button', () => {
    render(<SampleRequestSection eventId="ev-1" userId="u-1" role="salesperson" />);
    expect(screen.getByText('Coolioh')).toBeInTheDocument();
    expect(screen.getByText('Haute Brands')).toBeInTheDocument();
    expect(screen.getByText(/Closes in/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Submit/ })).toBeEnabled();
  });

  it('shows a retired product that is on the request, labeled', () => {
    render(<SampleRequestSection eventId="ev-1" userId="u-1" role="salesperson" />);
    expect(screen.getByText('Gone')).toBeInTheDocument();
    expect(screen.getByText(/no longer offered/i)).toBeInTheDocument();
  });

  it('calls setItem with a parsed integer', () => {
    render(<SampleRequestSection eventId="ev-1" userId="u-1" role="salesperson" />);
    const input = screen.getByLabelText('Mango singles');
    fireEvent.change(input, { target: { value: '4' } });
    expect(hook.setItem).toHaveBeenCalledWith('p-1', 'singles', 4);
  });

  it('reads "Resubmit changes" after a submission and disables when unchanged', () => {
    hook.view.request.status = 'submitted';
    hook.canSubmit = false;
    render(<SampleRequestSection eventId="ev-1" userId="u-1" role="salesperson" />);
    expect(screen.getByRole('button', { name: /Resubmit changes/ })).toBeDisabled();
    expect(screen.getByText('Submitted')).toBeInTheDocument();
  });

  it('is read-only with a banner when closed, and offers Edit anyway to an admin', () => {
    hook.closed = true;
    hook.canEdit = false;
    const { rerender } = render(<SampleRequestSection eventId="ev-1" userId="u-1" role="salesperson" />);
    expect(screen.getByText(/closed on/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Mango singles')).toBeDisabled();
    expect(screen.queryByText(/Edit anyway/)).not.toBeInTheDocument();
    rerender(<SampleRequestSection eventId="ev-1" userId="u-1" role="admin" />);
    expect(screen.getByText(/Edit anyway/)).toBeInTheDocument();
    hook.canEdit = true;
  });

  it('shows the offline note', () => {
    hook.status = 'offline';
    render(<SampleRequestSection eventId="ev-1" userId="u-1" role="salesperson" />);
    expect(screen.getByText(/reconnect to edit/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Implement the tables and section**

```tsx
// src/components/checklist/samples/ProductTable.tsx
import React from 'react';
import { SampleProduct, SampleRequestItem } from '../../../utils/sampleRequestApi';
import { ItemField } from './useSampleRequest';

interface Props {
  lineName: string;
  products: SampleProduct[];           // active ones, plus retired ones already on the request
  items: Map<string, SampleRequestItem>;
  disabled: boolean;
  onChange: (productId: string, field: ItemField, value: number) => void;
}

const COLS: Array<{ field: ItemField; label: string }> = [
  { field: 'singles', label: 'Singles' },
  { field: 'displays', label: 'Displays' },
  { field: 'emptyDisplays', label: 'Empty displays' },
];

export const ProductTable: React.FC<Props> = ({ lineName, products, items, disabled, onChange }) => (
  <div>
    <h4 className="micro-label mb-2">{lineName}</h4>
    <table className="w-full text-sm">
      <thead>
        <tr className="text-[11px] uppercase tracking-wide text-stone-400">
          <th className="pb-1 text-left font-semibold">Item</th>
          {COLS.map((c) => <th key={c.field} className="pb-1 text-right font-semibold">{c.label}</th>)}
        </tr>
      </thead>
      <tbody>
        {products.map((p) => {
          const row = items.get(p.id);
          return (
            <tr key={p.id} className={`border-t border-stone-100 ${p.is_active ? '' : 'text-stone-400'}`}>
              <td className="py-1.5 pr-2">
                {p.name}
                {!p.is_active && <span className="ml-2 text-[11px] italic">no longer offered</span>}
              </td>
              {COLS.map((c) => (
                <td key={c.field} className="py-1 text-right">
                  <input
                    type="number" inputMode="numeric" min={0} step={1}
                    aria-label={`${p.name} ${c.label.toLowerCase()}`}
                    value={row?.[c.field] ?? 0}
                    disabled={disabled}
                    onChange={(e) => onChange(p.id, c.field, parseInt(e.target.value, 10) || 0)}
                    className="w-16 rounded-lg border border-stone-200 px-2 py-1 text-right tabular-nums focus-visible:ring-2 focus-visible:ring-brand-500 disabled:bg-stone-50 disabled:text-stone-400"
                  />
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);
```

```tsx
// src/components/checklist/samples/MaterialsTable.tsx
import React from 'react';
import { SampleMaterial, SampleRequestMaterial } from '../../../utils/sampleRequestApi';

interface Props {
  materials: SampleMaterial[];
  values: Map<string, SampleRequestMaterial>;
  disabled: boolean;
  onChange: (materialId: string, patch: { qty?: number; notes?: string | null }) => void;
}

export const MaterialsTable: React.FC<Props> = ({ materials, values, disabled, onChange }) => (
  <table className="w-full text-sm">
    <thead>
      <tr className="text-[11px] uppercase tracking-wide text-stone-400">
        <th className="pb-1 text-left font-semibold">Item</th>
        <th className="pb-1 text-right font-semibold">Qty</th>
        <th className="pb-1 text-left font-semibold pl-3">Notes</th>
      </tr>
    </thead>
    <tbody>
      {materials.map((m) => {
        const row = values.get(m.id);
        return (
          <tr key={m.id} className={`border-t border-stone-100 ${m.is_active ? '' : 'text-stone-400'}`}>
            <td className="py-1.5 pr-2">{m.name}{!m.is_active && <span className="ml-2 text-[11px] italic">no longer offered</span>}</td>
            <td className="py-1 text-right">
              <input type="number" inputMode="numeric" min={0} step={1} aria-label={`${m.name} qty`}
                value={row?.qty ?? 0} disabled={disabled}
                onChange={(e) => onChange(m.id, { qty: parseInt(e.target.value, 10) || 0 })}
                className="w-16 rounded-lg border border-stone-200 px-2 py-1 text-right tabular-nums disabled:bg-stone-50 disabled:text-stone-400" />
            </td>
            <td className="py-1 pl-3">
              <input type="text" aria-label={`${m.name} notes`} maxLength={500}
                value={row?.notes ?? ''} disabled={disabled} placeholder="Optional"
                onChange={(e) => onChange(m.id, { notes: e.target.value })}
                className="w-full rounded-lg border border-stone-200 px-2 py-1 disabled:bg-stone-50 disabled:text-stone-400" />
            </td>
          </tr>
        );
      })}
    </tbody>
  </table>
);
```

```tsx
// src/components/checklist/samples/SampleRequestSection.tsx
/**
 * "Sample Request" on My Checklist: one card per brand with its product
 * lines, a marketing materials card, autosaving draft, one Submit button.
 * Read-only after close (reps) with an "Edit anyway" toggle for override roles.
 */
import React, { useEffect, useState } from 'react';
import { Package, AlertCircle, WifiOff, CheckCircle2 } from 'lucide-react';
import { SAMPLE_BRAND_LABELS, SAMPLE_BRAND_ORDER, SampleBrand } from '../../../utils/sampleRequestApi';
import { useSampleRequest } from './useSampleRequest';
import { ProductTable } from './ProductTable';
import { MaterialsTable } from './MaterialsTable';
import { formatCountdown, isUrgent, formatCloseDate } from './sampleRequestText';

interface Props { eventId: string; userId: string; role: string; actorId?: string }

const OVERRIDE = ['admin', 'coordinator', 'developer'];

export const SampleRequestSection: React.FC<Props> = ({ eventId, userId, role, actorId }) => {
  const s = useSampleRequest({ eventId, userId, role, actorId });
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(t); }, []);

  const closesAt = s.view?.window.closesAt ?? null;
  const submitted = s.view?.request.status === 'submitted';

  const statusPill = s.closed
    ? { text: 'Closed', cls: 'bg-stone-100 text-stone-600 ring-stone-200' }
    : submitted
      ? { text: 'Submitted', cls: 'bg-accent-50 text-accent-700 ring-accent-200' }
      : { text: 'Draft', cls: 'bg-amber-50 text-amber-800 ring-amber-200' };

  return (
    <section aria-label="Sample request" className="card p-4 md:p-5 space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50">
            <Package aria-hidden="true" className="h-5 w-5 text-brand-600" />
          </span>
          <div>
            <h3 className="font-display font-semibold tracking-tight text-stone-900">Sample Request</h3>
            <p className="mt-0.5 text-sm text-stone-500">Products and marketing materials you need pulled for this show.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`chip px-2 py-0.5 text-[11px] ring-1 ${statusPill.cls}`}>{statusPill.text}</span>
          {closesAt && !s.closed && (
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
          <p>You're offline. Reconnect to edit your sample request.</p>
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
          {s.closed && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-stone-200 bg-stone-50 p-3 text-sm text-stone-700">
              <p>
                Sample requests for this show closed on {closesAt ? formatCloseDate(closesAt) : 'the deadline'}. Contact your coordinator for changes.
              </p>
              {OVERRIDE.includes(role) && (
                <label className="inline-flex items-center gap-2 text-xs font-semibold">
                  <input type="checkbox" checked={s.override} onChange={(e) => s.setOverride(e.target.checked)} />
                  Edit anyway
                </label>
              )}
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            {SAMPLE_BRAND_ORDER.map((brand: SampleBrand) => {
              const lines = s.catalog!.lines.filter((l) => l.brand === brand);
              return (
                <div key={brand} className="rounded-xl border border-stone-100 p-3 md:p-4 space-y-4">
                  <h4 className="font-display font-semibold text-stone-900">{SAMPLE_BRAND_LABELS[brand]}</h4>
                  {lines.map((line) => {
                    const products = s.catalog!.products
                      .filter((p) => p.product_line_id === line.id && (p.is_active || s.items.has(p.id)))
                      .sort((a, b) => a.position - b.position);
                    if (products.length === 0) return null;
                    return (
                      <ProductTable key={line.id} lineName={line.name} products={products}
                        items={s.items} disabled={!s.canEdit} onChange={s.setItem} />
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
              values={s.materials} disabled={!s.canEdit} onChange={s.setMaterial} />
          </div>

          <footer className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-stone-500" aria-live="polite">
              {s.error ? <span className="text-red-600">{s.error}</span>
                : s.saving ? 'Saving…' : s.dirty ? 'Unsaved changes' : submitted && s.view?.request.submitted_at
                  ? <span className="inline-flex items-center gap-1"><CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5 text-accent-600" /> Submitted {new Date(s.view.request.submitted_at).toLocaleString()}</span>
                  : 'Draft saved'}
            </p>
            <button type="button" onClick={s.submit} disabled={!s.canSubmit || !s.canEdit}
              className="btn-primary min-h-[44px] px-5 lg:min-h-0">
              {s.submitting ? 'Submitting…' : submitted ? 'Resubmit changes' : 'Submit sample request'}
            </button>
          </footer>
        </>
      )}
    </section>
  );
};
```

Check `btn-primary`, `chip`, `micro-label` exist in `src/index.css` (they are used elsewhere in the checklist). If `btn-primary` does not exist, use the primary button classes from `ChecklistPrimitives.tsx`.

- [ ] **Step 5: Embed in UserChecklist and honor the deep link**

In `src/components/checklist/UserChecklist.tsx`:

1. Import: `import { SampleRequestSection } from './samples/SampleRequestSection';`
2. In `loadEvents`, after `setEvents(visible)`, replace the default selection with:

```ts
        const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        const linkedId = params.get('event');
        if (linkedId && visible.some((e) => e.id === linkedId)) {
          setSelectedEventId(linkedId);
          history.replaceState(null, '', window.location.pathname + window.location.search);
        } else if (visible.length > 0) {
          setSelectedEventId(visible[0].id);
        }
```

3. Render the section directly under the show switcher, before the `{loading && …}` block:

```tsx
      {selectedEventId && (
        <SampleRequestSection eventId={selectedEventId} userId={user.id} role={user.role} actorId={user.id} />
      )}
```

In `src/components/checklist/TradeShowChecklist.tsx`:

1. Tab default: `useState<ChecklistTab>(() => { const p = new URLSearchParams(window.location.hash.replace(/^#/, '')); return p.get('tab') === 'my' ? 'user' : isPrivilegedUser ? 'admin' : 'user'; })`.
2. In `loadEvents`, replace the `hash.startsWith('#event=')` parsing with the same `URLSearchParams` reading as above (`params.get('event')`). Keep the `history.replaceState` call. Because `UserChecklist` is rendered when the tab is `user`, and it clears the hash itself, make `TradeShowChecklist` only clear the hash when the admin tab consumed it (`activeTab === 'admin'`).

- [ ] **Step 6: Run tests**

Run: `npx vitest run src/components/checklist`
Expected: new tests PASS (6 section + 5 hook); existing checklist tests still pass. Then `npm run lint`.

- [ ] **Step 7: Commit**

```bash
git add src/components/checklist/samples src/components/checklist/UserChecklist.tsx src/components/checklist/TradeShowChecklist.tsx
git commit -m "feat(sample-requests): sample request section on My Checklist with autosave and submit

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 11: Dashboard action rows

**Files:**
- Create: `src/components/dashboard/hooks/useSampleRequestActions.ts`
- Modify: `src/components/dashboard/ActionQueue.tsx`
- Modify: `src/components/dashboard/Dashboard.tsx:133-139`
- Test: `src/components/dashboard/__tests__/ActionQueue.samples.test.tsx`

**Interfaces:**
- Consumes: `sampleRequestApi.listMine()` (Task 9), `formatCountdown`, `isUrgent`.
- Produces: `useSampleRequestActions(): { pending: OpenSampleRequest[] }` (open shows not yet submitted); `ActionQueue` gains prop `sampleRequests: OpenSampleRequest[]`.
- Navigation: sets `window.location.hash = 'event=<id>&tab=my'` then `onPageChange('checklist')`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/dashboard/__tests__/ActionQueue.samples.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ActionQueue } from '../ActionQueue';

const base = { canManage: false, pendingCount: 0, ocrReviewCount: 0, zohoQueueCount: 0 };

describe('ActionQueue sample request rows', () => {
  it('renders one row per open, unsubmitted show with a countdown', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-20T12:00:00Z'));
    render(<ActionQueue {...base} onPageChange={vi.fn()} sampleRequests={[
      { eventId: 'ev-1', eventName: 'Expo West', closesAt: '2026-10-24T03:59:59Z', status: 'draft', submittedAt: null },
    ]} />);
    expect(screen.getByText(/Sample request for Expo West closes in 3d 15h/)).toBeInTheDocument();
    vi.useRealTimers();
  });

  it('deep-links to the checklist My tab for that show', () => {
    const onPageChange = vi.fn();
    render(<ActionQueue {...base} onPageChange={onPageChange} sampleRequests={[
      { eventId: 'ev-1', eventName: 'Expo', closesAt: '2099-01-01T00:00:00Z', status: 'none', submittedAt: null },
    ]} />);
    fireEvent.click(screen.getByRole('button', { name: /Sample request for Expo/ }));
    expect(window.location.hash).toBe('#event=ev-1&tab=my');
    expect(onPageChange).toHaveBeenCalledWith('checklist');
  });

  it('shows all clear with no rows', () => {
    render(<ActionQueue {...base} onPageChange={vi.fn()} sampleRequests={[]} />);
    expect(screen.getByText(/All clear/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Implement the hook and the rows**

```ts
// src/components/dashboard/hooks/useSampleRequestActions.ts
/** Open sample requests the signed-in user has not submitted yet. */
import { useEffect, useState } from 'react';
import { api } from '../../../utils/api';
import { sampleRequestApi, OpenSampleRequest } from '../../../utils/sampleRequestApi';

export function useSampleRequestActions(): { pending: OpenSampleRequest[] } {
  const [pending, setPending] = useState<OpenSampleRequest[]>([]);
  useEffect(() => {
    let mounted = true;
    if (!api.USE_SERVER) return;
    sampleRequestApi.listMine()
      .then((r) => { if (mounted) setPending((r.requests || []).filter((x) => x.status !== 'submitted')); })
      .catch((e) => console.error('[Dashboard] sample requests failed:', e));
    return () => { mounted = false; };
  }, []);
  return { pending };
}
```

In `ActionQueue.tsx`:

1. Add to imports: `import { OpenSampleRequest } from '../../utils/sampleRequestApi'; import { formatCountdown, isUrgent } from '../checklist/samples/sampleRequestText';`
2. Add `sampleRequests?: OpenSampleRequest[]` to `ActionQueueProps` and add a `red` tone:

```ts
  red: {
    wrap: 'border-red-200 bg-red-50 hover:border-red-300',
    label: 'text-red-900',
    action: 'text-red-700',
  },
```

and widen `tone: 'amber' | 'violet' | 'blue' | 'red'`.

3. After the Zoho block, push the sample rows:

```ts
  const now = new Date();
  for (const r of sampleRequests ?? []) {
    items.push({
      label: `Sample request for ${r.eventName} closes in ${formatCountdown(r.closesAt, now)}`,
      action: r.status === 'draft' ? 'Finish' : 'Start',
      tone: isUrgent(r.closesAt, now) ? 'red' : 'amber',
      onClick: () => {
        window.location.hash = `event=${r.eventId}&tab=my`;
        onPageChange('checklist');
      },
    });
  }
```

Set the QueueItem key to `item.label` as now (labels are unique per show).

In `Dashboard.tsx`, call the hook next to `useDashboardData` and pass it:

```tsx
  const { pending: sampleRequests } = useSampleRequestActions();
  // …
                <ActionQueue
                  canManage={board.canManage}
                  pendingCount={board.pendingCount}
                  ocrReviewCount={board.ocrReviewCount}
                  zohoQueueCount={board.zohoQueueCount}
                  sampleRequests={sampleRequests}
                  onPageChange={onPageChange}
                />
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/components/dashboard`
Expected: 3 new PASS; existing dashboard tests unchanged.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard
git commit -m "feat(sample-requests): dashboard action rows with closing countdown

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: Header bell third source

**Files:**
- Modify: `src/components/layout/Header.tsx` (new state + effect + panel block)
- Test: `src/components/layout/__tests__/Header.notifications.test.tsx`

**Interfaces:**
- Consumes: `notificationsApi` (Task 9).
- Behaviour: polls `/notifications/unread` every 60 s like messages; unread dot lights when any exist; clicking a row marks it read and navigates by `link` (`checklist` → `#event=<id>&tab=my`, `samples` → `#event=<id>&tab=samples`, then `onNavigate('checklist')`); "Mark all read" button.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/layout/__tests__/Header.notifications.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../../utils/api', () => ({
  api: { USE_SERVER: true, getExpenses: vi.fn(async () => []) },
  apiClient: { get: vi.fn(async () => ({ notifications: [] })) },
}));
vi.mock('../../../utils/notificationsApi', () => ({
  notificationsApi: {
    listUnread: vi.fn(async () => ({ notifications: [
      { id: 'n-1', kind: 'sample_request.open', title: 'Sample request open · Expo', body: 'Closes Oct 23', link: { page: 'checklist', eventId: 'ev-1' }, read_at: null, created_at: '2026-10-07T00:00:00Z' },
    ] })),
    markRead: vi.fn(async () => ({ updated: 1 })),
    markAllRead: vi.fn(async () => ({ updated: 1 })),
  },
}));

import { Header } from '../Header';
import { notificationsApi } from '../../../utils/notificationsApi';

const user = { id: 'u-1', name: 'Ana', username: 'ana', email: 'a@x.com', role: 'salesperson' as const };

describe('Header general notifications', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists the row, marks it read on click, and deep-links to the checklist', async () => {
    const onNavigate = vi.fn();
    render(<Header user={user} onLogout={vi.fn()} currentPage="dashboard" onPageChange={vi.fn()} onNavigate={onNavigate} onMenuToggle={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }));
    const row = await screen.findByText('Sample request open · Expo');
    fireEvent.click(row);
    await waitFor(() => expect(notificationsApi.markRead).toHaveBeenCalledWith(['n-1']));
    expect(window.location.hash).toBe('#event=ev-1&tab=my');
    expect(onNavigate).toHaveBeenCalledWith('checklist');
  });

  it('mark all read clears the list', async () => {
    render(<Header user={user} onLogout={vi.fn()} currentPage="dashboard" onPageChange={vi.fn()} onNavigate={vi.fn()} onMenuToggle={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }));
    await screen.findByText('Sample request open · Expo');
    fireEvent.click(screen.getByRole('button', { name: /Mark all read/ }));
    await waitFor(() => expect(notificationsApi.markAllRead).toHaveBeenCalled());
    expect(screen.queryByText('Sample request open · Expo')).not.toBeInTheDocument();
  });
});
```

Open `Header.tsx` lines 1–20 to confirm its prop names (`onNavigate`, `onPageChange`, `onMenuToggle`, …) and adjust the test's props to match exactly.

- [ ] **Step 2: Implement**

In `Header.tsx`:

1. Imports: `import { notificationsApi, AppNotification } from '../../utils/notificationsApi';`
2. State + poll, next to the `unreadMessages` effect:

```ts
  const [appNotifications, setAppNotifications] = React.useState<AppNotification[]>([]);
  React.useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await notificationsApi.listUnread();
        if (!cancelled) setAppNotifications(res.notifications || []);
      } catch {
        if (!cancelled) setAppNotifications([]);
      }
    };
    void load();
    const timer = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  const openAppNotification = (n: AppNotification) => {
    setShowNotifications(false);
    setAppNotifications((prev) => prev.filter((x) => x.id !== n.id));
    void notificationsApi.markRead([n.id]).catch(() => undefined);
    if (n.link?.page === 'checklist' && n.link.eventId) {
      window.location.hash = `event=${n.link.eventId}&tab=my`;
      onNavigate?.('checklist');
    } else if (n.link?.page === 'samples' && n.link.eventId) {
      window.location.hash = `event=${n.link.eventId}&tab=samples`;
      onNavigate?.('checklist');
    }
  };

  const markAllAppRead = () => {
    setAppNotifications([]);
    void notificationsApi.markAllRead().catch(() => undefined);
  };
```

3. Extend the unread dot: `const hasUnreadNotifications = appNotifications.length > 0 || unreadMessages.length > 0 || (notifications.length > 0 && !hasViewedNotifications);`
4. In the panel, directly after the header `<div className="px-4 py-3 border-b …">…</div>` and before the `unreadMessages` block, add:

```tsx
                  {appNotifications.length > 0 && (
                    <div className="border-b border-stone-100">
                      <div className="flex items-center justify-end px-4 pt-2">
                        <button type="button" onClick={markAllAppRead} className="text-[11px] font-semibold text-brand-700 hover:underline">
                          Mark all read
                        </button>
                      </div>
                      {appNotifications.map((n) => (
                        <button key={n.id} type="button" onClick={() => openAppNotification(n)}
                          className="block w-full px-4 py-3 text-left hover:bg-stone-50">
                          <p className="text-sm font-semibold text-stone-900">{n.title}</p>
                          <p className="mt-0.5 line-clamp-2 text-sm text-stone-600">{n.body}</p>
                          <p className="mt-1 text-[11px] text-stone-400">{new Date(n.created_at).toLocaleString()}</p>
                        </button>
                      ))}
                    </div>
                  )}
```

5. The "You're all caught up!" empty state currently keys off `notifications.length` only; leave it, since this block renders above it and the dot logic already includes app notifications.

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/components/layout`
Expected: 2 new PASS; other layout tests unchanged.

- [ ] **Step 4: Commit**

```bash
git add src/components/layout
git commit -m "feat(notifications): header bell reads the general notifications table

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 13: Samples summary tab for the puller

**Files:**
- Create: `src/components/checklist/samples/SamplesSummaryTab.tsx`
- Modify: `src/components/checklist/TradeShowChecklist.tsx` (third tab + non-privileged puller path)
- Test: `src/components/checklist/samples/__tests__/SamplesSummaryTab.test.tsx`

**Interfaces:**
- Consumes: `sampleRequestApi.getSummary(eventId)`, `sampleRequestApi.getAccess()`, `formatCloseDate`.
- Produces: `<SamplesSummaryTab eventId events selectedEventId onSelectEvent />`. The tab appears when `getAccess().canViewSummary` is true. Deep link `#event=<id>&tab=samples` opens it.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/checklist/samples/__tests__/SamplesSummaryTab.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../../../../utils/sampleRequestApi', async (orig) => {
  const actual = await orig<typeof import('../../../../utils/sampleRequestApi')>();
  return {
    ...actual,
    sampleRequestApi: {
      getSummary: vi.fn(async () => ({
        eventId: 'ev-1', eventName: 'Expo', pullerUserId: null,
        window: { opensAt: null, closesAt: '2026-10-24T03:59:59Z', isOpen: true },
        participants: [
          { userId: 'u-1', name: 'Ana', status: 'submitted', submittedAt: '2026-10-06T00:00:00Z' },
          { userId: 'u-2', name: 'Bo', status: 'none', submittedAt: null },
        ],
        products: [{ productId: 'p-1', productName: 'Mango', lineId: 'l-1', lineName: 'Peelz', brand: 'boomin_brands', isActive: true,
          singles: 3, displays: 1, emptyDisplays: 2,
          byUser: [{ userId: 'u-1', name: 'Ana', status: 'submitted', singles: 2, displays: 1, emptyDisplays: 0 },
                   { userId: 'u-3', name: 'Cy', status: 'draft', singles: 1, displays: 0, emptyDisplays: 2 }] }],
        materials: [{ materialId: 'm-1', materialName: 'Banner', isActive: true, qty: 2,
          byUser: [{ userId: 'u-1', name: 'Ana', status: 'submitted', qty: 2, notes: 'big one' }] }],
      })),
    },
  };
});

import { SamplesSummaryTab } from '../SamplesSummaryTab';

describe('SamplesSummaryTab', () => {
  it('shows totals, who has submitted, and per-rep rows on expand', async () => {
    render(<SamplesSummaryTab eventId="ev-1" />);
    expect(await screen.findByText('Mango')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();     // singles total
    expect(screen.getByText(/1 of 2 submitted/)).toBeInTheDocument();
    expect(screen.getByText(/No sample puller set/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Mango/ }));
    expect(screen.getByText('Cy')).toBeInTheDocument();
    expect(screen.getByText('draft')).toBeInTheDocument();
    expect(screen.getByText('big one')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Implement the tab**

```tsx
// src/components/checklist/samples/SamplesSummaryTab.tsx
/**
 * Puller view: every rep's request for one show, aggregated per product.
 * Drafts are counted in totals but flagged, so the puller can see what is
 * still moving. Visible to the puller, admin, coordinator, developer.
 */
import React, { useEffect, useState } from 'react';
import { AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { sampleRequestApi, EventSampleSummary, SAMPLE_BRAND_LABELS, SAMPLE_BRAND_ORDER } from '../../../utils/sampleRequestApi';
import { formatCloseDate } from './sampleRequestText';

interface Props { eventId: string }

export const SamplesSummaryTab: React.FC<Props> = ({ eventId }) => {
  const [summary, setSummary] = useState<EventSampleSummary | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setSummary(null); setFailed(false);
    sampleRequestApi.getSummary(eventId)
      .then((s) => { if (!cancelled) setSummary(s); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [eventId]);

  if (failed) return <div className="card p-4 text-sm text-stone-600">Couldn't load the sample summary for this show.</div>;
  if (!summary) return <div className="card p-4 text-sm text-stone-500">Loading sample summary…</div>;

  const submitted = summary.participants.filter((p) => p.status === 'submitted').length;
  const toggle = (id: string) => setOpen((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div className="space-y-4">
      {!summary.pullerUserId && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0" />
          <p>No sample puller set — configure one in Admin settings so submissions are routed.</p>
        </div>
      )}

      <section className="card p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display font-semibold text-stone-900">Sample requests · {summary.eventName}</h3>
          <p className="text-xs text-stone-500">
            {summary.window.closesAt ? `${summary.window.isOpen ? 'Closes' : 'Closed'} ${formatCloseDate(summary.window.closesAt)}` : 'No deadline set'}
          </p>
        </div>
        <p className="mt-1 text-sm text-stone-600">{submitted} of {summary.participants.length} submitted</p>
        <ul className="mt-2 flex flex-wrap gap-2">
          {summary.participants.map((p) => (
            <li key={p.userId} className={`chip px-2 py-0.5 text-[11px] ring-1 ${
              p.status === 'submitted' ? 'bg-accent-50 text-accent-700 ring-accent-200'
              : p.status === 'draft' ? 'bg-amber-50 text-amber-800 ring-amber-200' : 'bg-stone-50 text-stone-500 ring-stone-200'}`}>
              {p.name} · {p.status === 'none' ? 'not started' : p.status}
            </li>
          ))}
        </ul>
      </section>

      {SAMPLE_BRAND_ORDER.map((brand) => {
        const rows = summary.products.filter((p) => p.brand === brand);
        if (rows.length === 0) return null;
        return (
          <section key={brand} className="card p-4 md:p-5">
            <h3 className="font-display font-semibold text-stone-900 mb-2">{SAMPLE_BRAND_LABELS[brand]}</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-stone-400">
                  <th className="pb-1 text-left font-semibold">Item</th>
                  <th className="pb-1 text-right font-semibold">Singles</th>
                  <th className="pb-1 text-right font-semibold">Displays</th>
                  <th className="pb-1 text-right font-semibold">Empty</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <React.Fragment key={p.productId}>
                    <tr className="border-t border-stone-100">
                      <td className="py-1.5">
                        <button type="button" onClick={() => toggle(p.productId)} aria-expanded={open.has(p.productId)}
                          className="inline-flex items-center gap-1 text-left">
                          {open.has(p.productId) ? <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" /> : <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />}
                          <span className="text-stone-400 text-xs">{p.lineName} ·</span> {p.productName}
                          {!p.isActive && <span className="ml-1 text-[11px] italic text-stone-400">retired</span>}
                        </button>
                      </td>
                      <td className="py-1.5 text-right tabular-nums font-semibold">{p.singles}</td>
                      <td className="py-1.5 text-right tabular-nums font-semibold">{p.displays}</td>
                      <td className="py-1.5 text-right tabular-nums font-semibold">{p.emptyDisplays}</td>
                    </tr>
                    {open.has(p.productId) && p.byUser.map((u) => (
                      <tr key={u.userId} className="bg-stone-50 text-xs text-stone-600">
                        <td className="py-1 pl-6">{u.name} {u.status === 'draft' && <span className="ml-1 rounded bg-amber-100 px-1 text-amber-800">draft</span>}</td>
                        <td className="py-1 text-right tabular-nums">{u.singles}</td>
                        <td className="py-1 text-right tabular-nums">{u.displays}</td>
                        <td className="py-1 text-right tabular-nums">{u.emptyDisplays}</td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}

      {summary.materials.length > 0 && (
        <section className="card p-4 md:p-5">
          <h3 className="font-display font-semibold text-stone-900 mb-2">Marketing &amp; booth supplies</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-stone-400">
                <th className="pb-1 text-left font-semibold">Item</th>
                <th className="pb-1 text-right font-semibold">Qty</th>
              </tr>
            </thead>
            <tbody>
              {summary.materials.map((m) => (
                <React.Fragment key={m.materialId}>
                  <tr className="border-t border-stone-100">
                    <td className="py-1.5">
                      <button type="button" onClick={() => toggle(m.materialId)} aria-expanded={open.has(m.materialId)} className="inline-flex items-center gap-1 text-left">
                        {open.has(m.materialId) ? <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" /> : <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />}
                        {m.materialName}
                      </button>
                    </td>
                    <td className="py-1.5 text-right tabular-nums font-semibold">{m.qty}</td>
                  </tr>
                  {open.has(m.materialId) && m.byUser.map((u) => (
                    <tr key={u.userId} className="bg-stone-50 text-xs text-stone-600">
                      <td className="py-1 pl-6">{u.name}{u.notes ? <span className="ml-2 text-stone-500">— {u.notes}</span> : null}</td>
                      <td className="py-1 text-right tabular-nums">{u.qty}</td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
};
```

The test's "Mango" button lookup: the accessible name includes "Peelz · Mango", so `getByRole('button', { name: /Mango/ })` matches. The "3" assertion needs the singles total to be the only bare "3" on screen; the test data is chosen so that holds.

- [ ] **Step 3: Wire the tab into TradeShowChecklist**

In `TradeShowChecklist.tsx`:

1. `type ChecklistTab = 'admin' | 'user' | 'samples';`
2. Add state `const [canViewSamples, setCanViewSamples] = useState(false);` and an effect on mount: `sampleRequestApi.getAccess().then((r) => setCanViewSamples(r.canViewSummary)).catch(() => setCanViewSamples(false));`
3. Tab default from hash: `tab=samples` → `'samples'`, `tab=my` → `'user'`, else existing default.
4. Events load when `activeTab === 'admin' || activeTab === 'samples'` (change the `useEffect` condition).
5. The early return for non-privileged users becomes:

```tsx
  if (!isPrivilegedUser && !canViewSamples) {
    return <UserChecklist user={user} />;
  }
```

and for a non-privileged puller the segmented control shows only "My Checklist" and "Samples" (guard the Admin button with `isPrivilegedUser`). Show the Samples button when `canViewSamples || isPrivilegedUser`.

6. Render: `activeTab === 'samples' ? (selectedEventId ? <SamplesSummaryTab eventId={selectedEventId} /> : <no-event card as in admin>) : …`. The masthead gets `showSelector={activeTab !== 'user'}`.

- [ ] **Step 4: Run tests and lint**

Run: `npx vitest run src/components/checklist && npm run lint`
Expected: PASS; lint clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/checklist
git commit -m "feat(sample-requests): samples summary tab for the puller and coordinators

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 14: Admin catalog editor and puller picker

**Files:**
- Create: `src/components/admin/AdminSettings/SampleCatalogSection.tsx`
- Modify: `src/components/admin/AdminSettings/index.ts` (export)
- Modify: `src/components/admin/AdminSettings.tsx` (render in the System Settings tab, after the existing picklist grid, for admin/developer)
- Test: `src/components/admin/AdminSettings/__tests__/SampleCatalogSection.test.tsx`

**Interfaces:**
- Consumes: `sampleRequestApi` catalog calls (Task 9), `api.getUsers()`, `api.getSettings()`, `api.updateSettings({ sample_puller_user_id: { userId } })`.
- Produces: `<SampleCatalogSection />` (self-contained; loads its own data).

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/admin/AdminSettings/__tests__/SampleCatalogSection.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../../../utils/api', () => ({
  api: {
    USE_SERVER: true,
    getUsers: vi.fn(async () => [{ id: 'u-1', name: 'Ana', is_active: true }, { id: 'u-2', name: 'Old', is_active: false }]),
    getSettings: vi.fn(async () => ({ sample_puller_user_id: { userId: null } })),
    updateSettings: vi.fn(async () => ({})),
  },
}));
vi.mock('../../../../utils/sampleRequestApi', async (orig) => {
  const actual = await orig<typeof import('../../../../utils/sampleRequestApi')>();
  return {
    ...actual,
    sampleRequestApi: {
      getCatalog: vi.fn(async () => ({
        lines: [{ id: 'l-1', brand: 'haute_brands', name: 'Oh! Mit', position: 1, is_active: true }],
        products: [{ id: 'p-1', product_line_id: 'l-1', name: 'Blue Razz', position: 1, is_active: true }],
        materials: [{ id: 'm-1', name: 'Banner', position: 1, is_active: true }],
      })),
      createProduct: vi.fn(async (lineId: string, name: string) => ({ id: 'p-new', product_line_id: lineId, name, position: 2, is_active: true })),
      updateProduct: vi.fn(async (id: string, patch: any) => ({ id, product_line_id: 'l-1', name: 'Blue Razz', position: 1, is_active: patch.isActive ?? true })),
      createLine: vi.fn(), updateLine: vi.fn(), createMaterial: vi.fn(), updateMaterial: vi.fn(), reorder: vi.fn(),
    },
  };
});

import { SampleCatalogSection } from '../SampleCatalogSection';
import { sampleRequestApi } from '../../../../utils/sampleRequestApi';
import { api } from '../../../../utils/api';

describe('SampleCatalogSection', () => {
  beforeEach(() => vi.clearAllMocks());

  it('offers only active users as the puller and saves the choice', async () => {
    render(<SampleCatalogSection />);
    const select = await screen.findByLabelText('Sample puller');
    expect(screen.queryByText('Old')).not.toBeInTheDocument();
    fireEvent.change(select, { target: { value: 'u-1' } });
    await waitFor(() => expect(api.updateSettings).toHaveBeenCalledWith({ sample_puller_user_id: { userId: 'u-1' } }));
  });

  it('adds a product under a line', async () => {
    render(<SampleCatalogSection />);
    await screen.findByText('Blue Razz');
    fireEvent.change(screen.getByLabelText('New product in Oh! Mit'), { target: { value: 'Pink Rozay' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add product to Oh! Mit' }));
    await waitFor(() => expect(sampleRequestApi.createProduct).toHaveBeenCalledWith('l-1', 'Pink Rozay'));
    expect(await screen.findByText('Pink Rozay')).toBeInTheDocument();
  });

  it('retires a product instead of deleting it', async () => {
    render(<SampleCatalogSection />);
    await screen.findByText('Blue Razz');
    fireEvent.click(screen.getByRole('button', { name: 'Retire Blue Razz' }));
    await waitFor(() => expect(sampleRequestApi.updateProduct).toHaveBeenCalledWith('p-1', { isActive: false }));
    expect(screen.getByRole('button', { name: 'Restore Blue Razz' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Implement the section**

```tsx
// src/components/admin/AdminSettings/SampleCatalogSection.tsx
/**
 * Admin editor for the sample catalog (brand → line → product, plus the
 * shared materials list) and the sample puller setting. Retire = inactive;
 * nothing here deletes a row, because old requests still point at it.
 */
import React, { useEffect, useState } from 'react';
import { Package } from 'lucide-react';
import { api } from '../../../utils/api';
import {
  sampleRequestApi, SampleCatalog, SampleBrand, SAMPLE_BRAND_LABELS, SAMPLE_BRAND_ORDER,
} from '../../../utils/sampleRequestApi';

interface SimpleUser { id: string; name: string; is_active?: boolean }

export const SampleCatalogSection: React.FC = () => {
  const [catalog, setCatalog] = useState<SampleCatalog | null>(null);
  const [users, setUsers] = useState<SimpleUser[]>([]);
  const [pullerId, setPullerId] = useState<string>('');
  const [drafts, setDrafts] = useState<Record<string, string>>({}); // keyed by `line:<brand>`, `product:<lineId>`, `material`
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [c, u, s] = await Promise.all([sampleRequestApi.getCatalog(true), api.getUsers(), api.getSettings()]);
        if (cancelled) return;
        setCatalog(c);
        setUsers((Array.isArray(u) ? u : []).filter((x: SimpleUser) => x.is_active !== false));
        setPullerId((s as any)?.sample_puller_user_id?.userId ?? '');
      } catch {
        if (!cancelled) setError('Could not load the sample catalog.');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError(null);
    try { await fn(); } catch { setError('That change did not save. Try again.'); } finally { setBusy(false); }
  };

  const savePuller = (userId: string) => run(async () => {
    setPullerId(userId);
    await api.updateSettings({ sample_puller_user_id: { userId: userId || null } });
  });

  const addLine = (brand: SampleBrand) => run(async () => {
    const name = (drafts[`line:${brand}`] || '').trim();
    if (!name) return;
    const line = await sampleRequestApi.createLine(brand, name);
    setCatalog((c) => c && { ...c, lines: [...c.lines, line] });
    setDrafts((d) => ({ ...d, [`line:${brand}`]: '' }));
  });

  const toggleLine = (id: string, isActive: boolean) => run(async () => {
    const line = await sampleRequestApi.updateLine(id, { isActive });
    setCatalog((c) => c && { ...c, lines: c.lines.map((l) => (l.id === id ? line : l)) });
  });

  const addProduct = (lineId: string) => run(async () => {
    const name = (drafts[`product:${lineId}`] || '').trim();
    if (!name) return;
    const p = await sampleRequestApi.createProduct(lineId, name);
    setCatalog((c) => c && { ...c, products: [...c.products, p] });
    setDrafts((d) => ({ ...d, [`product:${lineId}`]: '' }));
  });

  const toggleProduct = (id: string, isActive: boolean) => run(async () => {
    const p = await sampleRequestApi.updateProduct(id, { isActive });
    setCatalog((c) => c && { ...c, products: c.products.map((x) => (x.id === id ? p : x)) });
  });

  const addMaterial = () => run(async () => {
    const name = (drafts.material || '').trim();
    if (!name) return;
    const m = await sampleRequestApi.createMaterial(name);
    setCatalog((c) => c && { ...c, materials: [...c.materials, m] });
    setDrafts((d) => ({ ...d, material: '' }));
  });

  const toggleMaterial = (id: string, isActive: boolean) => run(async () => {
    const m = await sampleRequestApi.updateMaterial(id, { isActive });
    setCatalog((c) => c && { ...c, materials: c.materials.map((x) => (x.id === id ? m : x)) });
  });

  const rename = (kind: 'line' | 'product' | 'material', id: string, current: string) => run(async () => {
    const name = window.prompt('Rename', current)?.trim();
    if (!name || name === current) return;
    if (kind === 'line') { const r = await sampleRequestApi.updateLine(id, { name }); setCatalog((c) => c && { ...c, lines: c.lines.map((l) => (l.id === id ? r : l)) }); }
    if (kind === 'product') { const r = await sampleRequestApi.updateProduct(id, { name }); setCatalog((c) => c && { ...c, products: c.products.map((p) => (p.id === id ? r : p)) }); }
    if (kind === 'material') { const r = await sampleRequestApi.updateMaterial(id, { name }); setCatalog((c) => c && { ...c, materials: c.materials.map((m) => (m.id === id ? r : m)) }); }
  });

  const RowActions = ({ name, active, onRename, onToggle }: { name: string; active: boolean; onRename: () => void; onToggle: () => void }) => (
    <span className="flex shrink-0 items-center gap-2 text-xs">
      <button type="button" disabled={busy} onClick={onRename} aria-label={`Rename ${name}`} className="text-brand-700 hover:underline">Rename</button>
      <button type="button" disabled={busy} onClick={onToggle} aria-label={`${active ? 'Retire' : 'Restore'} ${name}`} className="text-stone-500 hover:underline">
        {active ? 'Retire' : 'Restore'}
      </button>
    </span>
  );

  const AddRow = ({ id, label, buttonLabel, draftKey, onAdd }: { id: string; label: string; buttonLabel: string; draftKey: string; onAdd: () => void }) => (
    <div className="mt-2 flex gap-2">
      <input id={id} aria-label={label} value={drafts[draftKey] || ''} placeholder={label}
        onChange={(e) => setDrafts((d) => ({ ...d, [draftKey]: e.target.value }))}
        onKeyDown={(e) => { if (e.key === 'Enter') onAdd(); }}
        className="min-w-0 flex-1 rounded-lg border border-stone-200 px-2 py-1 text-sm" />
      <button type="button" disabled={busy} onClick={onAdd} aria-label={buttonLabel} className="btn-secondary px-3 text-sm">Add</button>
    </div>
  );

  return (
    <section className="card p-4 md:p-5 space-y-5" aria-label="Sample products">
      <header className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50">
          <Package aria-hidden="true" className="h-5 w-5 text-brand-600" />
        </span>
        <div>
          <h3 className="font-display font-semibold tracking-tight text-stone-900">Sample products</h3>
          <p className="mt-0.5 text-sm text-stone-500">What reps can request for a show, and who pulls the samples.</p>
        </div>
      </header>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <label className="block">
        <span className="micro-label">Sample puller</span>
        <select aria-label="Sample puller" value={pullerId} disabled={busy} onChange={(e) => savePuller(e.target.value)}
          className="mt-1 w-full max-w-sm rounded-lg border border-stone-200 px-3 py-2 text-sm">
          <option value="">— Not set —</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <span className="mt-1 block text-xs text-stone-500">Gets a notification every time a rep submits or re-submits a sample request.</span>
      </label>

      {catalog && (
        <div className="grid gap-4 xl:grid-cols-2">
          {SAMPLE_BRAND_ORDER.map((brand) => (
            <div key={brand} className="rounded-xl border border-stone-100 p-3 space-y-3">
              <h4 className="font-display font-semibold text-stone-900">{SAMPLE_BRAND_LABELS[brand]}</h4>
              {catalog.lines.filter((l) => l.brand === brand).sort((a, b) => a.position - b.position).map((line) => (
                <div key={line.id} className={line.is_active ? '' : 'opacity-60'}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="micro-label">{line.name}{!line.is_active && ' (retired)'}</span>
                    <RowActions name={line.name} active={line.is_active} onRename={() => rename('line', line.id, line.name)} onToggle={() => toggleLine(line.id, !line.is_active)} />
                  </div>
                  <ul className="mt-1 divide-y divide-stone-100">
                    {catalog.products.filter((p) => p.product_line_id === line.id).sort((a, b) => a.position - b.position).map((p) => (
                      <li key={p.id} className={`flex items-center justify-between gap-2 py-1 text-sm ${p.is_active ? '' : 'text-stone-400 line-through'}`}>
                        <span>{p.name}</span>
                        <RowActions name={p.name} active={p.is_active} onRename={() => rename('product', p.id, p.name)} onToggle={() => toggleProduct(p.id, !p.is_active)} />
                      </li>
                    ))}
                  </ul>
                  <AddRow id={`new-product-${line.id}`} label={`New product in ${line.name}`} buttonLabel={`Add product to ${line.name}`} draftKey={`product:${line.id}`} onAdd={() => addProduct(line.id)} />
                </div>
              ))}
              <AddRow id={`new-line-${brand}`} label={`New product line for ${SAMPLE_BRAND_LABELS[brand]}`} buttonLabel={`Add product line to ${SAMPLE_BRAND_LABELS[brand]}`} draftKey={`line:${brand}`} onAdd={() => addLine(brand)} />
            </div>
          ))}

          <div className="rounded-xl border border-stone-100 p-3 xl:col-span-2">
            <h4 className="font-display font-semibold text-stone-900">Marketing &amp; booth supplies</h4>
            <ul className="mt-1 divide-y divide-stone-100">
              {catalog.materials.sort((a, b) => a.position - b.position).map((m) => (
                <li key={m.id} className={`flex items-center justify-between gap-2 py-1 text-sm ${m.is_active ? '' : 'text-stone-400 line-through'}`}>
                  <span>{m.name}</span>
                  <RowActions name={m.name} active={m.is_active} onRename={() => rename('material', m.id, m.name)} onToggle={() => toggleMaterial(m.id, !m.is_active)} />
                </li>
              ))}
            </ul>
            <AddRow id="new-material" label="New material" buttonLabel="Add material" draftKey="material" onAdd={addMaterial} />
          </div>
        </div>
      )}
    </section>
  );
};
```

Reorder is exposed by the API but not by this UI in v1: order follows `position` from the seed, and new rows append. If `btn-secondary` does not exist in `src/index.css`, use the secondary button classes from `ChecklistPrimitives.tsx`.

Add `export { SampleCatalogSection } from './SampleCatalogSection';` to `src/components/admin/AdminSettings/index.ts`.

In `AdminSettings.tsx`, inside the `system` tab branch, after the picklist grid closes (after the `picklistSource === 'settings' && (…)` block), add:

```tsx
          {(user.role === 'admin' || user.role === 'developer') && (
            <div className="mt-4 md:mt-5 lg:mt-6">
              <SampleCatalogSection />
            </div>
          )}
```

and add `SampleCatalogSection` to the existing import from `./AdminSettings`.

- [ ] **Step 3: Run tests and lint**

Run: `npx vitest run src/components/admin && npm run lint`
Expected: 3 new PASS; admin tests unchanged; lint clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin
git commit -m "feat(sample-requests): admin catalog editor and sample puller setting

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 15: Version, docs, full verification

**Files:**
- Modify: `package.json`, `backend/package.json` (version → `2.30.0`)
- Modify: `CHANGELOG.md` (new `## [2.30.0]` section under `[Unreleased]`)
- Modify: `docs/ARCHITECTURE.md` (new `## 9. Sample requests` section after Badge scanning)
- Modify: `CLAUDE.md` (one bullet under "Key service boundaries")

- [ ] **Step 1: Bump versions**

```bash
sed -i '' 's/"version": "2.29.0"/"version": "2.30.0"/' package.json backend/package.json
grep -n '"version"' package.json backend/package.json
```

Expected: both show `2.30.0`.

- [ ] **Step 2: CHANGELOG entry**

Insert after `## [Unreleased]`:

```markdown
## [2.30.0] - 2026-10-07 - Sample requests on the checklist

### Added
- **Sample Request** section on My Checklist. Every participant on a show
  fills in Singles / Displays / Empty Displays per product across both
  brands (Haute Brands, Coolioh) plus Qty and Notes for marketing materials.
  Drafts autosave; one Submit button, "Resubmit changes" afterwards.
- The window opens when the event is created and closes at 23:59:59 ET seven
  days before travel start (show start when no travel date). Computed live,
  so a moved date moves the deadline. Admin/coordinator/developer may still
  edit after close ("Edit anyway").
- Dashboard "Needs your attention" rows with a live countdown for each open,
  unsubmitted show; red inside 48 hours.
- One designated **sample puller** (Admin settings) is notified on every
  submit and re-submit, and gets a **Samples** tab on the checklist with the
  per-show aggregate and per-rep breakdown.
- Roster notified when a window opens; 48-hour closing reminder for anyone
  who has not submitted (send-once ledger).
- General `notifications` table and `/api/notifications`; the header bell
  now reads it alongside expense and message notifications.
- Admin catalog editor (brand → line → product, materials). Retired rows are
  inactive, never deleted.
- Migration 043 (seeds the catalog from the paper checklists).

### Operations
- After deploy, pick the sample puller in Admin settings → System Settings.
```

- [ ] **Step 3: ARCHITECTURE section**

Append after section 8:

```markdown
## 9. Sample requests

Per-rep product sample orders for a show. `backend/src/services/sampleRequests/`
owns the rules: `sampleRequestWindow.ts` is the only place that computes the
open/close window (created_at → 23:59:59 America/New_York on
`(travel_start_date ?? show_start_date) − 7 days`; never stored);
`SampleRequestService.ts` owns draft/submit transitions and authorization
(reps: own request while open; admin/coordinator/developer: anyone, any time;
puller: read the summary); `SampleRequestReminderService.ts` sends the 48h
reminder through the `sample_request_reminders` ledger (insert-before-send).

`NotificationService` writes a `notifications` row and a push in one call.
The header bell reads `/api/notifications/unread` as a third source; expense
and message notifications are unchanged.

Frontend: `src/components/checklist/samples/` (section, hook, summary tab),
dashboard rows in `ActionQueue`, catalog editor in
`admin/AdminSettings/SampleCatalogSection.tsx`. Deep link
`#event=<id>&tab=my|samples` selects the show and tab on the checklist page.
```

- [ ] **Step 4: CLAUDE.md bullet**

Under "Key service boundaries", add:

```markdown
- **`sampleRequests/`** — Per-rep sample orders. `sampleRequestWindow.ts` is
  the single source of the open/close rule; `SampleRequestService` owns
  transitions and the puller notification; `NotificationService` is the one
  way to write a bell row + push.
```

- [ ] **Step 5: Full verification**

```bash
cd backend && npm test && npx tsc --noEmit -p . && cd ..
npm run lint && npm run format:check
npx vitest run src/components/checklist src/components/dashboard src/components/layout src/components/admin src/utils
npm run build
```

Expected: backend green; lint/format clean; the listed frontend directories green (ignore the ~90 pre-existing failures elsewhere); build succeeds.

- [ ] **Step 6: Commit**

```bash
git add package.json backend/package.json CHANGELOG.md docs/ARCHITECTURE.md CLAUDE.md
git commit -m "chore(release): v2.30.0 sample requests

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Self-review notes

- **Spec coverage:** data model → T1; window rule → T2; notifications table/service/routes → T3; repository → T4; service, validation, submit wording, summary, announce → T5; routes → T6; event hooks → T7; reminder → T8; frontend API → T9; section with autosave/submit/closed/offline/edit-anyway → T10; dashboard rows → T11; bell → T12; Samples tab → T13; admin catalog + puller picker → T14; release/docs → T15. Reorder UI is deferred (API exists); the spec lists reorder under admin settings, so this is a conscious v1 cut — surface it in the review.
- **Type consistency:** `SampleRequestView`, `OpenSampleRequest`, `EventSampleSummary` names and the `items[].productId/singles/displays/emptyDisplays` shape are identical in `backend/src/services/sampleRequests/types.ts` and `src/utils/sampleRequestApi.ts`. Hash deep link is `event=<id>&tab=my|samples` in T3 (`linkToUrl`), T10, T11, T12, T13.
- **Review Focus coverage:** 1 → T2 "no window when neither date exists"; 2 → T2 DST tests; 3 → T5 "still notifies when the submitter is the puller"; 4 → T5 validator tests + "400s a bad payload"; 5 → T4 event reads join `event_participants` (asserted structurally by the summary test's input shape in T5; the SQL join is the guarantee).
