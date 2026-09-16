# Badge Scanning (PDF417) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let booth staff scan PDF417 attendee badges with their phone camera inside Argo, review the decoded contact, and have it stored as an event lead and pushed to the Zoho CRM of the brand the rep represents — replacing the per-show scanner rental.

**Architecture:** The barcode is decoded on-device by `zxing-wasm` in a live camera viewfinder, parsed by a pure client-side TypeScript module that classifies tokens by content rather than position, reviewed and corrected by the rep, then queued through the existing Dexie/`syncManager` path to a new `badge_scans` table. A background worker groups pending scans by brand and upserts them into that brand's Zoho CRM Tradeshows module with retry and backoff.

**Tech Stack:** React 18 + Vite + TypeScript + Tailwind (frontend), Express + TypeScript + raw `pg` (backend), PostgreSQL, Dexie (IndexedDB), Vitest (both sides), `zxing-wasm` (new dependency), `exceljs` (already present).

**Spec:** `docs/superpowers/specs/2026-09-16-badge-scanning-design.md`

## Global Constraints

- **Target version 2.23.0** — bump in BOTH `package.json` and `backend/package.json` before deploying.
- **Raw SQL only, parameterized.** No ORM. Repository pattern over `pg`.
- **Never modify an existing migration.** New numbered file only: `041_create_badge_scans.sql`.
- **`raw_payload` is never discarded**, on any code path, including parse failure.
- **Brand resolution happens server-side.** The client never asserts which CRM receives a lead.
- **Dedupe key is `(event_id, entity, payload_hash)`** — three columns, always all three.
- **The dedupe index is a plain UNIQUE constraint, not partial.** If anyone makes it partial, every `ON CONFLICT` must repeat the `WHERE` predicate, and mocked `pg` tests will not catch the omission.
- **`payload_hash` is `sha256(raw_payload)` recomputed server-side.** The client's value is never trusted.
- **Zoho access boundary:** `npm run check:zoho-boundary` must pass. Do not import `zohoMultiAccountService`, `zohoBooksService`, or `config/zohoAccounts` anywhere.
- **Every new backend file gets tests under `backend/tests/<area>/`; every new frontend component gets tests under `src/components/<feature>/__tests__/`.**

---

## File Structure

**Backend — create:**

| File | Responsibility |
|---|---|
| `backend/src/database/migrations/041_create_badge_scans.sql` | The `badge_scans` table, constraints, indexes |
| `backend/src/config/badgeScanRoles.ts` | Which roles may scan and which may see all events' scans |
| `backend/src/database/repositories/BadgeScanRepository.ts` | All SQL for `badge_scans` |
| `backend/src/services/badge/BadgeScanService.ts` | Validation, field whitelist, hash, brand resolution, upsert |
| `backend/src/services/badge/BadgeCrmPushService.ts` | Interval worker: group by brand, upsert to CRM, backoff |
| `backend/src/services/badge/badgeCrmConfig.ts` | Per-brand CRM credentials, module names, field mapping cache |
| `backend/src/services/badge/badgeCrmFields.ts` | Per-brand CRM field API name discovery, cached in `app_settings` |
| `backend/src/services/badge/BadgeExportService.ts` | CSV and XLSX export for an event |
| `backend/src/routes/badgeScans.ts` | `/api/badge-scans` HTTP surface |

**Backend — modify:**

| File | Change |
|---|---|
| `backend/src/services/zohoIntegrationClient.ts` | Expose `resolveBrand()` publicly (wraps the existing private `entityToBrand`) |
| `backend/src/server.ts` | Mount `/api/badge-scans`; start `badgeCrmPushService` |
| `backend/tests/integration/database-schema.test.ts` | Assert the new table and constraint exist |

**Frontend — create:**

| File | Responsibility |
|---|---|
| `src/utils/badge/parseBadgePayload.ts` | Pure parser: raw payload → fields + confidence |
| `src/utils/badge/tokenClassifiers.ts` | Content-based token classifiers used by the parser |
| `src/utils/badgeApi.ts` | Feature-scoped API client (precedent: `boothApi.ts`) |
| `src/components/leads/LeadsPage.tsx` | Event + company selectors, scan CTA, list, export |
| `src/components/leads/BadgeScanner.tsx` | Fullscreen viewfinder modal |
| `src/components/leads/ScanReviewSheet.tsx` | Editable decoded fields + notes |
| `src/components/leads/LeadList.tsx` | List + search + status chips |
| `src/components/leads/LeadDetailModal.tsx` | One lead, editable, with CRM status and retry |
| `src/components/leads/hooks/useBadgeDecoder.ts` | Camera stream + `zxing-wasm` decode loop |
| `src/components/leads/hooks/useBadgeScans.ts` | List/create/update against `badgeApi` |

**Frontend — modify:**

| File | Change |
|---|---|
| `src/utils/offlineDb.ts` | `version(5)` adds `pendingBadgeScans` |
| `src/utils/syncManager.ts` | New `badgeScan` entity in `queueAction` union and `syncItem` switch |
| `src/App.tsx` | Lazy-import and render the `leads` page |
| `src/components/layout/Sidebar.tsx` | "Leads" nav item under Workspace |
| `src/components/layout/MobileNav.tsx` | Leads as the fourth tab for salesperson/coordinator |

---

### Task 1: Database migration

**Files:**
- Create: `backend/src/database/migrations/041_create_badge_scans.sql`
- Modify: `backend/tests/integration/database-schema.test.ts` (append a new `describe` block)

**Interfaces:**
- Consumes: nothing (first task)
- Produces: the `badge_scans` table with columns `id, event_id, scanned_by, entity, brand, client_scan_id, raw_payload, payload_hash, barcode_format, parser_version, parse_confidence, badge_id, salutation, first_name, last_name, title, company, email, phone, city, state, postal_code, country, attendee_type, fields, notes, crm_status, crm_record_id, crm_error, crm_attempts, crm_last_attempt_at, scanned_at, created_at, updated_at`, and the constraint name `badge_scans_event_entity_payload_unique`

- [ ] **Step 1: Write the failing schema test**

Append to `backend/tests/integration/database-schema.test.ts`, inside the file's existing top-level scope (match the surrounding `describe.skipIf(!schemaDbReady)` style used by the other blocks in that file):

```typescript
describe.skipIf(!schemaDbReady)('badge_scans table', () => {
  it('exists with the columns the repository selects', async () => {
    const result = await testPool.query<ColumnInfo>(
      `SELECT column_name, data_type, is_nullable
         FROM information_schema.columns
        WHERE table_name = 'badge_scans'`
    );
    const byName = new Map(result.rows.map((r) => [r.column_name, r]));
    for (const col of [
      'id', 'event_id', 'scanned_by', 'entity', 'brand', 'client_scan_id',
      'raw_payload', 'payload_hash', 'crm_status', 'crm_attempts', 'fields',
    ]) {
      expect(byName.has(col), `missing column ${col}`).toBe(true);
    }
    // raw_payload is the one column the whole feature is built to never lose.
    expect(byName.get('raw_payload')!.is_nullable).toBe('NO');
    // brand is nullable on purpose: companies with no Zoho destination
    // (zohoEnabled false, e.g. Summitt Labs) still capture leads.
    expect(byName.get('brand')!.is_nullable).toBe('YES');
  });

  it('dedupes on (event_id, entity, payload_hash) with a NON-partial unique index', async () => {
    const result = await testPool.query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes
        WHERE tablename = 'badge_scans'
          AND indexname = 'badge_scans_event_entity_payload_unique'`
    );
    expect(result.rows).toHaveLength(1);
    const def = result.rows[0].indexdef;
    expect(def).toContain('UNIQUE');
    expect(def).toContain('event_id');
    expect(def).toContain('entity');
    expect(def).toContain('payload_hash');
    // A partial index would force every ON CONFLICT to repeat the WHERE
    // predicate, and mocked pg tests never catch a missing one.
    expect(def).not.toContain('WHERE');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npx vitest run tests/integration/database-schema.test.ts -t "badge_scans"`
Expected: FAIL — `expect(byName.has('id')).toBe(true)` receives `false`, because the table does not exist. (If it instead SKIPS, your `DB_*` env is not pointing at a running Postgres; fix that first or you are testing nothing.)

- [ ] **Step 3: Write the migration**

Create `backend/src/database/migrations/041_create_badge_scans.sql`:

```sql
-- Migration: badge_scans — PDF417 attendee badges scanned at the booth
-- Description: One row per scanned badge. raw_payload is never discarded:
--   parsers improve, barcodes do not, so any scan can be re-parsed later
--   without re-scanning. entity is part of the dedupe key because two brands
--   sharing a booth may both legitimately claim the same attendee — those are
--   two leads bound for two different CRMs, not a duplicate. brand is
--   nullable: companies with no Zoho destination still capture leads, stored
--   crm_status 'skipped'. client_scan_id is present from day one because
--   offline clients replay the queue.
-- Version: 2.23.0
-- Date: September 16, 2026

CREATE TABLE IF NOT EXISTS badge_scans (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id            UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  scanned_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  entity              VARCHAR(255) NOT NULL,
  brand               VARCHAR(50),
  client_scan_id      UUID UNIQUE,
  raw_payload         TEXT NOT NULL,
  payload_hash        TEXT NOT NULL,
  barcode_format      VARCHAR(20) NOT NULL DEFAULT 'PDF417',
  parser_version      VARCHAR(20),
  parse_confidence    NUMERIC(3,2),
  badge_id            VARCHAR(100),
  salutation          VARCHAR(50),
  first_name          VARCHAR(255),
  last_name           VARCHAR(255),
  title               VARCHAR(255),
  company             VARCHAR(255),
  email               VARCHAR(255),
  phone               VARCHAR(50),
  city                VARCHAR(100),
  state               VARCHAR(100),
  postal_code         VARCHAR(20),
  country             VARCHAR(100),
  attendee_type       VARCHAR(50),
  fields              JSONB,
  notes               TEXT,
  crm_status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                        CHECK (crm_status IN ('pending','synced','failed','skipped')),
  crm_record_id       TEXT,
  crm_error           TEXT,
  crm_attempts        INTEGER NOT NULL DEFAULT 0,
  crm_last_attempt_at TIMESTAMPTZ,
  scanned_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT badge_scans_event_entity_payload_unique
    UNIQUE (event_id, entity, payload_hash)
);

CREATE INDEX IF NOT EXISTS idx_badge_scans_event ON badge_scans(event_id);
CREATE INDEX IF NOT EXISTS idx_badge_scans_crm_status ON badge_scans(crm_status, brand);
CREATE INDEX IF NOT EXISTS idx_badge_scans_scanned_by ON badge_scans(scanned_by);

COMMENT ON TABLE badge_scans IS
  'PDF417 attendee badges scanned at the booth. raw_payload is authoritative and never discarded.';
COMMENT ON COLUMN badge_scans.entity IS
  'Company the rep represented, from the entityOptions picklist. Part of the dedupe key.';
COMMENT ON COLUMN badge_scans.brand IS
  'Normalized routing key from ENTITY_TO_BRAND; NULL means no Zoho destination (crm_status skipped).';
COMMENT ON COLUMN badge_scans.fields IS
  'Every parsed token as {index, value, mappedTo}, including tokens the parser could not map.';
```

- [ ] **Step 4: Run the migration and re-run the test**

Run: `cd backend && npm run migrate && npx vitest run tests/integration/database-schema.test.ts -t "badge_scans"`
Expected: PASS, both tests.

Note: `migrate.ts` silently skips on a `42501` permission error. If the migration appears to do nothing, verify directly:
`psql -c "\d badge_scans"` — and if ownership blocks it, apply as the `postgres` role.

- [ ] **Step 5: Commit**

```bash
git add backend/src/database/migrations/041_create_badge_scans.sql backend/tests/integration/database-schema.test.ts
git commit -m "feat(badge-scans): add badge_scans table"
```

---

### Task 2: Role config and public brand resolution

**Files:**
- Create: `backend/src/config/badgeScanRoles.ts`
- Create: `backend/tests/config/badgeScanRoles.test.ts`
- Modify: `backend/src/services/zohoIntegrationClient.ts` (add one public method beside the existing private `entityToBrand`)
- Create: `backend/tests/services/badgeBrandResolution.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1
- Produces:
  - `SCAN_ROLES: readonly string[]` and `VIEW_ALL_ROLES: readonly string[]` from `config/badgeScanRoles`
  - `zohoIntegrationClient.resolveBrand(entityName: string): string | null`

- [ ] **Step 1: Write the failing role test**

Create `backend/tests/config/badgeScanRoles.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { SCAN_ROLES, VIEW_ALL_ROLES } from '../../src/config/badgeScanRoles';

describe('badgeScanRoles', () => {
  it('lets the people who actually stand in the booth scan', () => {
    expect(SCAN_ROLES).toContain('salesperson');
    expect(SCAN_ROLES).toContain('coordinator');
    expect(SCAN_ROLES).toContain('admin');
    expect(SCAN_ROLES).toContain('developer');
  });

  it('keeps accountants out — they never work the floor', () => {
    expect(SCAN_ROLES).not.toContain('accountant');
  });

  it('keeps temporary staff out of lead capture', () => {
    // Temps do booth setup (booths/checklist), not customer lead capture.
    expect(SCAN_ROLES).not.toContain('temporary');
  });

  it('restricts cross-event visibility to admins and developers', () => {
    expect(VIEW_ALL_ROLES).toEqual(expect.arrayContaining(['admin', 'developer']));
    expect(VIEW_ALL_ROLES).not.toContain('salesperson');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && npx vitest run tests/config/badgeScanRoles.test.ts`
Expected: FAIL — "Failed to resolve import ... src/config/badgeScanRoles"

- [ ] **Step 3: Write the config**

Create `backend/src/config/badgeScanRoles.ts`:

```typescript
/**
 * Who may capture and read badge scans.
 *
 * SCAN_ROLES mirrors who actually works a booth. Accountants never do, and
 * temporary staff handle setup (booths/checklist), not customer lead capture.
 * VIEW_ALL_ROLES may read scans for every event; everyone else sees only
 * events they participate in.
 */
export const SCAN_ROLES = ['admin', 'coordinator', 'salesperson', 'developer'] as const;

export const VIEW_ALL_ROLES = ['admin', 'developer'] as const;
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd backend && npx vitest run tests/config/badgeScanRoles.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Write the failing brand-resolution test**

Create `backend/tests/services/badgeBrandResolution.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { zohoIntegrationClient } from '../../src/services/zohoIntegrationClient';

describe('zohoIntegrationClient.resolveBrand', () => {
  it('maps known company names to their brand key', () => {
    expect(zohoIntegrationClient.resolveBrand('Haute Brands')).toBe('haute_brands');
    expect(zohoIntegrationClient.resolveBrand('Nirvana Kulture')).toBe('nirvana_kulture');
    expect(zohoIntegrationClient.resolveBrand('Boomin Brands')).toBe('boomin_brands');
  });

  it('is case- and whitespace-insensitive, because picklist values are hand-entered', () => {
    expect(zohoIntegrationClient.resolveBrand('  haute brands  ')).toBe('haute_brands');
  });

  it('returns null for a company with no Zoho destination', () => {
    // Summitt Labs is a real, selectable picklist company with zohoEnabled
    // false. Leads for it are captured and marked skipped, never rejected.
    expect(zohoIntegrationClient.resolveBrand('Summitt Labs')).toBeNull();
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `cd backend && npx vitest run tests/services/badgeBrandResolution.test.ts`
Expected: FAIL — "zohoIntegrationClient.resolveBrand is not a function"

- [ ] **Step 7: Expose the resolver**

In `backend/src/services/zohoIntegrationClient.ts`, directly below the existing private `entityToBrand` method, add:

```typescript
  /**
   * Public entity -> brand resolution, for callers that route by brand rather
   * than post expenses (badge scans choose a destination CRM this way).
   * Returns null for companies with no Zoho destination — a real case
   * (PicklistCompany.zohoEnabled is false for Summitt Labs), not an error.
   */
  public resolveBrand(entityName: string): string | null {
    return this.entityToBrand(entityName);
  }
```

- [ ] **Step 8: Run it to verify it passes**

Run: `cd backend && npx vitest run tests/services/badgeBrandResolution.test.ts && npm run check:zoho-boundary`
Expected: PASS (3 tests), and the boundary check reports no violations.

- [ ] **Step 9: Commit**

```bash
git add backend/src/config/badgeScanRoles.ts backend/tests/config/badgeScanRoles.test.ts backend/src/services/zohoIntegrationClient.ts backend/tests/services/badgeBrandResolution.test.ts
git commit -m "feat(badge-scans): role config and public brand resolution"
```

---

### Task 3: BadgeScanRepository

**Files:**
- Create: `backend/src/database/repositories/BadgeScanRepository.ts`
- Create: `backend/tests/repositories/BadgeScanRepository.test.ts`
- Modify: `backend/src/database/repositories/index.ts` (export the new repository alongside the others)

**Interfaces:**
- Consumes: the `badge_scans` table from Task 1
- Produces:
  - `interface BadgeScan` — row shape, all columns from Task 1
  - `interface BadgeScanFilters { eventId?: string; entity?: string; crmStatus?: string; q?: string }`
  - `badgeScanRepository.upsert(data: Partial<BadgeScan>): Promise<BadgeScan>`
  - `badgeScanRepository.findByClientScanId(clientScanId: string): Promise<BadgeScan | null>`
  - `badgeScanRepository.search(filters: BadgeScanFilters): Promise<BadgeScan[]>`
  - `badgeScanRepository.updateFields(id: string, data: Partial<BadgeScan>): Promise<BadgeScan>`
  - `badgeScanRepository.claimPendingByBrand(limit: number): Promise<BadgeScan[]>`
  - `badgeScanRepository.markPushResult(id, result): Promise<void>`

- [ ] **Step 1: Write the failing repository test**

Create `backend/tests/repositories/BadgeScanRepository.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadgeScanRepository } from '../../src/database/repositories/BadgeScanRepository';
import { query as dbQuery } from '../../src/config/database';

vi.mock('../../src/config/database', () => ({ query: vi.fn() }));

const row = (over = {}) => ({
  id: 'scan-1', event_id: 'ev-1', entity: 'Haute Brands', brand: 'haute_brands',
  raw_payload: 'RAW', payload_hash: 'hash-1', crm_status: 'pending',
  crm_attempts: 0, ...over,
});

const ok = (rows: any[]) =>
  ({ rows, command: 'SELECT', rowCount: rows.length, oid: 0, fields: [] } as any);

describe('BadgeScanRepository', () => {
  let repo: BadgeScanRepository;
  beforeEach(() => { repo = new BadgeScanRepository(); vi.clearAllMocks(); });

  describe('upsert', () => {
    it('conflicts on all three dedupe columns, not just the payload hash', async () => {
      vi.mocked(dbQuery).mockResolvedValue(ok([row()]));
      await repo.upsert({ event_id: 'ev-1', entity: 'Haute Brands', raw_payload: 'RAW', payload_hash: 'hash-1' });
      const sql = vi.mocked(dbQuery).mock.calls[0][0] as string;
      expect(sql).toContain('ON CONFLICT (event_id, entity, payload_hash)');
    });

    it('preserves notes already on the row when the same badge is re-scanned', async () => {
      // A rep re-scans a badge they already noted. Overwriting the note with
      // NULL would silently destroy the only human-authored field on the lead.
      vi.mocked(dbQuery).mockResolvedValue(ok([row({ notes: 'wants samples' })]));
      await repo.upsert({ event_id: 'ev-1', entity: 'Haute Brands', raw_payload: 'RAW', payload_hash: 'hash-1' });
      const sql = vi.mocked(dbQuery).mock.calls[0][0] as string;
      expect(sql).toContain('notes = COALESCE(EXCLUDED.notes, badge_scans.notes)');
    });

    it('never writes a row without its raw payload', async () => {
      await expect(
        repo.upsert({ event_id: 'ev-1', entity: 'Haute Brands', payload_hash: 'h' } as any)
      ).rejects.toThrow(/raw_payload/i);
      expect(dbQuery).not.toHaveBeenCalled();
    });
  });

  describe('claimPendingByBrand', () => {
    it('claims pending and retry-eligible scans but never skipped ones', async () => {
      vi.mocked(dbQuery).mockResolvedValue(ok([row()]));
      await repo.claimPendingByBrand(100);
      const sql = vi.mocked(dbQuery).mock.calls[0][0] as string;
      expect(sql).toContain("crm_status = 'pending'");
      expect(sql).toContain("crm_status = 'failed'");
      expect(sql).not.toContain("'skipped'");
      expect(sql).toContain('brand IS NOT NULL');
    });

    it('stops retrying after 5 attempts', async () => {
      vi.mocked(dbQuery).mockResolvedValue(ok([]));
      await repo.claimPendingByBrand(100);
      const sql = vi.mocked(dbQuery).mock.calls[0][0] as string;
      expect(sql).toContain('crm_attempts < 5');
    });
  });

  describe('search', () => {
    it('filters by event and company with parameterized values', async () => {
      vi.mocked(dbQuery).mockResolvedValue(ok([row()]));
      await repo.search({ eventId: 'ev-1', entity: 'Haute Brands' });
      const [sql, params] = vi.mocked(dbQuery).mock.calls[0] as [string, any[]];
      expect(sql).toContain('event_id = $1');
      expect(sql).toContain('entity = $2');
      expect(params).toEqual(['ev-1', 'Haute Brands']);
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && npx vitest run tests/repositories/BadgeScanRepository.test.ts`
Expected: FAIL — "Failed to resolve import ... BadgeScanRepository"

- [ ] **Step 3: Write the repository**

Create `backend/src/database/repositories/BadgeScanRepository.ts`:

```typescript
/**
 * Badge Scan Repository
 *
 * All SQL for badge_scans. Two invariants live here rather than in callers:
 * raw_payload is never written empty, and the dedupe conflict target is all
 * three columns (event_id, entity, payload_hash) — two brands at one booth
 * may both legitimately claim the same attendee.
 */

import { BaseRepository } from './BaseRepository';

export interface BadgeScan {
  id: string;
  event_id: string;
  scanned_by: string | null;
  entity: string;
  brand: string | null;
  client_scan_id: string | null;
  raw_payload: string;
  payload_hash: string;
  barcode_format: string;
  parser_version: string | null;
  parse_confidence: string | null;
  badge_id: string | null;
  salutation: string | null;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  attendee_type: string | null;
  fields: unknown;
  notes: string | null;
  crm_status: 'pending' | 'synced' | 'failed' | 'skipped';
  crm_record_id: string | null;
  crm_error: string | null;
  crm_attempts: number;
  crm_last_attempt_at: string | null;
  scanned_at: string;
  created_at: string;
  updated_at: string;
}

export interface BadgeScanFilters {
  eventId?: string;
  entity?: string;
  crmStatus?: string;
  q?: string;
}

export interface PushResult {
  status: 'synced' | 'failed';
  crmRecordId?: string;
  error?: string;
}

/** Columns a caller may write. Anything else in the payload is ignored. */
const WRITABLE = [
  'event_id', 'scanned_by', 'entity', 'brand', 'client_scan_id',
  'raw_payload', 'payload_hash', 'barcode_format', 'parser_version',
  'parse_confidence', 'badge_id', 'salutation', 'first_name', 'last_name',
  'title', 'company', 'email', 'phone', 'city', 'state', 'postal_code',
  'country', 'attendee_type', 'fields', 'notes', 'crm_status', 'crm_error',
  'scanned_at',
] as const;

/** Parsed contact columns a user may correct after the fact. */
const EDITABLE = [
  'badge_id', 'salutation', 'first_name', 'last_name', 'title', 'company',
  'email', 'phone', 'city', 'state', 'postal_code', 'country',
  'attendee_type', 'notes',
] as const;

const MAX_CRM_ATTEMPTS = 5;

export class BadgeScanRepository extends BaseRepository<BadgeScan> {
  protected tableName = 'badge_scans';

  async upsert(data: Partial<BadgeScan>): Promise<BadgeScan> {
    if (!data.raw_payload) {
      throw new Error('BadgeScanRepository.upsert: raw_payload is required and is never discarded');
    }
    const cols = WRITABLE.filter((c) => data[c] !== undefined);
    const params = cols.map((c) => data[c]);

    // Re-scanning a badge updates the decoded fields but must not erase a
    // human-authored note, so notes coalesce rather than overwrite.
    const updates = cols
      .filter((c) => c !== 'event_id' && c !== 'entity' && c !== 'payload_hash' && c !== 'client_scan_id')
      .map((c) => (c === 'notes'
        ? 'notes = COALESCE(EXCLUDED.notes, badge_scans.notes)'
        : `${c} = EXCLUDED.${c}`));
    updates.push('updated_at = CURRENT_TIMESTAMP');

    const result = await this.executeQuery<BadgeScan>(
      `INSERT INTO badge_scans (${cols.join(', ')})
       VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})
       ON CONFLICT (event_id, entity, payload_hash)
       DO UPDATE SET ${updates.join(', ')}
       RETURNING *`,
      params as any[]
    );
    return result.rows[0];
  }

  async findByClientScanId(clientScanId: string): Promise<BadgeScan | null> {
    const result = await this.executeQuery<BadgeScan>(
      'SELECT * FROM badge_scans WHERE client_scan_id = $1',
      [clientScanId]
    );
    return result.rows[0] || null;
  }

  async search(filters: BadgeScanFilters): Promise<BadgeScan[]> {
    const where: string[] = [];
    const params: unknown[] = [];

    if (filters.eventId) { params.push(filters.eventId); where.push(`event_id = $${params.length}`); }
    if (filters.entity) { params.push(filters.entity); where.push(`entity = $${params.length}`); }
    if (filters.crmStatus) { params.push(filters.crmStatus); where.push(`crm_status = $${params.length}`); }
    if (filters.q) {
      params.push(`%${filters.q}%`);
      where.push(`(first_name ILIKE $${params.length} OR last_name ILIKE $${params.length}
                   OR company ILIKE $${params.length} OR email ILIKE $${params.length})`);
    }

    const result = await this.executeQuery<BadgeScan>(
      `SELECT * FROM badge_scans
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY scanned_at DESC`,
      params as any[]
    );
    return result.rows;
  }

  async updateFields(id: string, data: Partial<BadgeScan>): Promise<BadgeScan> {
    const cols = EDITABLE.filter((c) => data[c] !== undefined);
    if (cols.length === 0) {
      const existing = await this.findById(id);
      if (!existing) throw new Error(`Badge scan ${id} not found`);
      return existing;
    }
    const params = cols.map((c) => data[c]);
    params.push(id);
    const result = await this.executeQuery<BadgeScan>(
      `UPDATE badge_scans
          SET ${cols.map((c, i) => `${c} = $${i + 1}`).join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE id = $${params.length}
        RETURNING *`,
      params as any[]
    );
    return result.rows[0];
  }

  /**
   * Scans eligible for a CRM push, newest brand-grouped work first. 'skipped'
   * rows are deliberately excluded: they have no destination by design, and
   * claiming them would burn retry attempts against a CRM that will never
   * exist for that company.
   */
  async claimPendingByBrand(limit: number): Promise<BadgeScan[]> {
    const result = await this.executeQuery<BadgeScan>(
      `SELECT * FROM badge_scans
        WHERE brand IS NOT NULL
          AND (
            crm_status = 'pending'
            OR (
              crm_status = 'failed'
              AND crm_attempts < ${MAX_CRM_ATTEMPTS}
              AND (
                crm_last_attempt_at IS NULL
                OR crm_last_attempt_at < now() - (interval '1 minute' * power(3, crm_attempts))
              )
            )
          )
        ORDER BY brand, scanned_at ASC
        LIMIT $1`,
      [limit]
    );
    return result.rows;
  }

  async markPushResult(id: string, result: PushResult): Promise<void> {
    if (result.status === 'synced') {
      await this.executeQuery(
        `UPDATE badge_scans
            SET crm_status = 'synced', crm_record_id = $1, crm_error = NULL,
                crm_attempts = crm_attempts + 1,
                crm_last_attempt_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE id = $2`,
        [result.crmRecordId ?? null, id]
      );
      return;
    }
    await this.executeQuery(
      `UPDATE badge_scans
          SET crm_status = 'failed', crm_error = $1,
              crm_attempts = crm_attempts + 1,
              crm_last_attempt_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2`,
      [result.error ?? 'Unknown CRM error', id]
    );
  }
}

export const badgeScanRepository = new BadgeScanRepository();
```

- [ ] **Step 4: Export it from the repository index**

In `backend/src/database/repositories/index.ts`, follow the existing export style in that file and add:

```typescript
export * from './BadgeScanRepository';
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && npx vitest run tests/repositories/BadgeScanRepository.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 6: Commit**

```bash
git add backend/src/database/repositories/BadgeScanRepository.ts backend/src/database/repositories/index.ts backend/tests/repositories/BadgeScanRepository.test.ts
git commit -m "feat(badge-scans): BadgeScanRepository with three-column dedupe"
```

---

### Task 4: BadgeScanService

**Files:**
- Create: `backend/src/services/badge/BadgeScanService.ts`
- Create: `backend/tests/services/BadgeScanService.test.ts`

**Interfaces:**
- Consumes: `badgeScanRepository` (Task 3), `zohoIntegrationClient.resolveBrand` (Task 2), `getPicklists()` from `services/picklists/PicklistService`
- Produces:
  - `interface CreateScanInput { eventId, entity, rawPayload, clientScanId?, scannedAt?, parserVersion?, parseConfidence?, fields?, contact? }`
  - `badgeScanService.create(input: CreateScanInput, userId: string): Promise<BadgeScan>`
  - `badgeScanService.list(filters, user): Promise<BadgeScan[]>`
  - `badgeScanService.update(id: string, patch: Partial<BadgeScan>): Promise<BadgeScan>`

- [ ] **Step 1: Write the failing service test**

Create `backend/tests/services/BadgeScanService.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/database/repositories/BadgeScanRepository', () => ({
  badgeScanRepository: {
    upsert: vi.fn(async (d: any) => ({ id: 'scan-1', ...d })),
    findByClientScanId: vi.fn(async () => null),
    search: vi.fn(async () => []),
    updateFields: vi.fn(async (id: string, d: any) => ({ id, ...d })),
  },
}));
vi.mock('../../src/services/picklists/PicklistService', () => ({
  getPicklists: vi.fn(async () => ({
    companies: [
      { name: 'Haute Brands', zohoEnabled: true, sortOrder: 1 },
      { name: 'Summitt Labs', zohoEnabled: false, sortOrder: 2 },
    ],
  })),
}));

import { badgeScanService } from '../../src/services/badge/BadgeScanService';
import { badgeScanRepository } from '../../src/database/repositories/BadgeScanRepository';

const input = (over = {}) => ({
  eventId: 'ev-1',
  entity: 'Haute Brands',
  rawPayload: 'RAW|PAYLOAD|HERE',
  ...over,
});

describe('BadgeScanService.create', () => {
  beforeEach(() => vi.clearAllMocks());

  it('recomputes payload_hash server-side and ignores any hash the client sent', async () => {
    // The hash is the dedupe key. A client that computes it wrong — or lies —
    // could create duplicates or collide two different attendees into one row.
    await badgeScanService.create({ ...input(), payloadHash: 'attacker-supplied' } as any, 'user-1');
    const written = vi.mocked(badgeScanRepository.upsert).mock.calls[0][0];
    expect(written.payload_hash).toHaveLength(64);
    expect(written.payload_hash).not.toBe('attacker-supplied');
  });

  it('resolves the brand server-side from the company', async () => {
    await badgeScanService.create(input(), 'user-1');
    const written = vi.mocked(badgeScanRepository.upsert).mock.calls[0][0];
    expect(written.brand).toBe('haute_brands');
    expect(written.crm_status).toBe('pending');
  });

  it('captures the lead as skipped when the company has no Zoho destination', async () => {
    // Summitt Labs is selectable but has no CRM. Refusing the scan would
    // throw away a real lead to protect a push that could never happen.
    const scan = await badgeScanService.create(input({ entity: 'Summitt Labs' }), 'user-1');
    const written = vi.mocked(badgeScanRepository.upsert).mock.calls[0][0];
    expect(written.brand).toBeNull();
    expect(written.crm_status).toBe('skipped');
    expect(written.crm_error).toMatch(/no zoho crm/i);
    expect(scan).toBeTruthy();
  });

  it('rejects a company that is not in the picklist at all', async () => {
    await expect(
      badgeScanService.create(input({ entity: 'Totally Made Up Co' }), 'user-1')
    ).rejects.toThrow(/unknown company/i);
    expect(badgeScanRepository.upsert).not.toHaveBeenCalled();
  });

  it('refuses an empty payload rather than storing a contentless lead', async () => {
    await expect(badgeScanService.create(input({ rawPayload: '   ' }), 'user-1')).rejects.toThrow(/payload/i);
  });

  it('returns the existing scan for a replayed client_scan_id without writing again', async () => {
    // Offline replay: the queue may POST the same scan more than once.
    vi.mocked(badgeScanRepository.findByClientScanId).mockResolvedValueOnce({ id: 'existing' } as any);
    const scan = await badgeScanService.create(input({ clientScanId: 'c-1' }), 'user-1');
    expect(scan.id).toBe('existing');
    expect(badgeScanRepository.upsert).not.toHaveBeenCalled();
  });

  it('only persists whitelisted contact fields from the client', async () => {
    await badgeScanService.create(
      { ...input(), contact: { first_name: 'Shamsher', crm_status: 'synced', id: 'hijack' } } as any,
      'user-1'
    );
    const written = vi.mocked(badgeScanRepository.upsert).mock.calls[0][0];
    expect(written.first_name).toBe('Shamsher');
    expect(written.id).toBeUndefined();
    expect(written.crm_status).toBe('pending'); // not the client's 'synced'
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && npx vitest run tests/services/BadgeScanService.test.ts`
Expected: FAIL — "Failed to resolve import ... BadgeScanService"

- [ ] **Step 3: Write the service**

Create `backend/src/services/badge/BadgeScanService.ts`:

```typescript
/**
 * Badge Scan Service
 *
 * Owns what a badge scan is allowed to become. Three things are decided here
 * and nowhere else:
 *   - payload_hash is computed from raw_payload server-side; the client's is
 *     never trusted, because it is the dedupe key
 *   - brand is resolved from the company server-side; the client does not get
 *     to choose which CRM receives a lead
 *   - a company with no Zoho destination yields a captured, 'skipped' scan
 *     rather than a rejection
 */

import { createHash } from 'crypto';
import { badgeScanRepository, BadgeScan } from '../../database/repositories/BadgeScanRepository';
import { zohoIntegrationClient } from '../zohoIntegrationClient';
import { getPicklists } from '../picklists/PicklistService';
import { ValidationError } from '../../utils/errors';

/** Contact fields a client may supply. Anything else is dropped. */
const CONTACT_FIELDS = [
  'badge_id', 'salutation', 'first_name', 'last_name', 'title', 'company',
  'email', 'phone', 'city', 'state', 'postal_code', 'country', 'attendee_type',
] as const;

export interface CreateScanInput {
  eventId: string;
  entity: string;
  rawPayload: string;
  clientScanId?: string;
  scannedAt?: string;
  parserVersion?: string;
  parseConfidence?: number;
  barcodeFormat?: string;
  fields?: unknown;
  notes?: string;
  contact?: Record<string, unknown>;
}

export class BadgeScanService {
  async create(input: CreateScanInput, userId: string): Promise<BadgeScan> {
    const rawPayload = (input.rawPayload ?? '').trim();
    if (!rawPayload) {
      throw new ValidationError('Badge payload is empty — nothing to record');
    }
    if (!input.eventId) {
      throw new ValidationError('eventId is required');
    }

    // Replayed offline queue item: return what we already stored.
    if (input.clientScanId) {
      const existing = await badgeScanRepository.findByClientScanId(input.clientScanId);
      if (existing) return existing;
    }

    const entity = (input.entity ?? '').trim();
    const { companies } = await getPicklists();
    const known = companies.find(
      (c) => c.name.toLowerCase() === entity.toLowerCase()
    );
    if (!known) {
      throw new ValidationError(
        `Unknown company "${entity}" — pick one of: ${companies.map((c) => c.name).join(', ')}`
      );
    }

    const brand = zohoIntegrationClient.resolveBrand(entity);

    const contact: Record<string, unknown> = {};
    for (const field of CONTACT_FIELDS) {
      const value = input.contact?.[field];
      if (typeof value === 'string' && value.trim()) contact[field] = value.trim();
    }

    return badgeScanRepository.upsert({
      event_id: input.eventId,
      scanned_by: userId,
      entity: known.name, // canonical casing from the picklist
      brand,
      client_scan_id: input.clientScanId ?? null,
      raw_payload: rawPayload,
      payload_hash: createHash('sha256').update(rawPayload).digest('hex'),
      barcode_format: input.barcodeFormat || 'PDF417',
      parser_version: input.parserVersion ?? null,
      parse_confidence: input.parseConfidence ?? null,
      fields: input.fields ? JSON.stringify(input.fields) : null,
      notes: input.notes ?? null,
      scanned_at: input.scannedAt || new Date().toISOString(),
      crm_status: brand ? 'pending' : 'skipped',
      crm_error: brand
        ? null
        : `No Zoho CRM is configured for "${known.name}" — lead captured locally and included in exports`,
      ...contact,
    } as Partial<BadgeScan>);
  }

  async list(filters: Parameters<typeof badgeScanRepository.search>[0]): Promise<BadgeScan[]> {
    return badgeScanRepository.search(filters);
  }

  async update(id: string, patch: Partial<BadgeScan>): Promise<BadgeScan> {
    return badgeScanRepository.updateFields(id, patch);
  }
}

export const badgeScanService = new BadgeScanService();
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && npx vitest run tests/services/BadgeScanService.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/badge/BadgeScanService.ts backend/tests/services/BadgeScanService.test.ts
git commit -m "feat(badge-scans): BadgeScanService with server-side hash and brand resolution"
```

---

### Task 5: HTTP routes

**Files:**
- Create: `backend/src/routes/badgeScans.ts`
- Create: `backend/tests/routes/badgeScans.test.ts`
- Modify: `backend/src/server.ts` (import and mount, following the existing `app.use('/api/...', authenticateToken, sessionTracker, ...)` pattern)

**Interfaces:**
- Consumes: `badgeScanService` (Task 4), `SCAN_ROLES` (Task 2)
- Produces: `POST /api/badge-scans`, `GET /api/badge-scans`, `PATCH /api/badge-scans/:id`, and the named handlers `handleCreateScan`, `handleListScans`, `handlePatchScan` (exported so tests can call them directly)

**Testing note:** this repo has no `supertest`. Route tests export the handler
and invoke it with a mock req/res — see `backend/tests/routes/auth-me.test.ts`
for the exact shape. Follow that; do not add an HTTP test dependency.
Authorization itself is enforced by the shared `authorize()` middleware and
covered by Task 2's role test, so these tests exercise handler logic only.

- [ ] **Step 1: Write the failing route test**

Create `backend/tests/routes/badgeScans.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Response } from 'express';

vi.mock('../../src/services/badge/BadgeScanService', () => ({
  badgeScanService: {
    create: vi.fn(async (i: any, u: string) => ({ id: 'scan-1', ...i, scanned_by: u })),
    list: vi.fn(async () => [{ id: 'scan-1' }]),
    update: vi.fn(async (id: string, p: any) => ({ id, ...p })),
  },
}));

import { handleCreateScan, handleListScans, handlePatchScan } from '../../src/routes/badgeScans';
import { badgeScanService } from '../../src/services/badge/BadgeScanService';

function mockRes() {
  return { json: vi.fn().mockReturnThis(), status: vi.fn().mockReturnThis() } as unknown as Response & {
    json: ReturnType<typeof vi.fn>;
    status: ReturnType<typeof vi.fn>;
  };
}

describe('badge scan route handlers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a scan attributed to the authenticated user, not a client-supplied id', async () => {
    const res = mockRes();
    await handleCreateScan(
      { user: { id: 'user-1', role: 'salesperson' }, body: { eventId: 'ev-1', entity: 'Haute Brands', rawPayload: 'RAW', scannedBy: 'somebody-else' } } as any,
      res
    );
    expect(badgeScanService.create).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: 'ev-1', entity: 'Haute Brands' }),
      'user-1'
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('requires eventId on list so one rep cannot enumerate every show', async () => {
    const res = mockRes();
    await handleListScans({ user: { id: 'user-1' }, query: {} } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(badgeScanService.list).not.toHaveBeenCalled();
  });

  it('passes through the company and status filters', async () => {
    const res = mockRes();
    await handleListScans(
      { user: { id: 'user-1' }, query: { eventId: 'ev-1', entity: 'Haute Brands', crmStatus: 'failed' } } as any,
      res
    );
    expect(badgeScanService.list).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: 'ev-1', entity: 'Haute Brands', crmStatus: 'failed' })
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ count: 1 }));
  });

  it('ignores a non-string query param instead of passing it to SQL', async () => {
    const res = mockRes();
    await handleListScans({ user: { id: 'user-1' }, query: { eventId: 'ev-1', entity: ['a', 'b'] } } as any, res);
    expect(badgeScanService.list).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: 'ev-1', entity: undefined })
    );
  });

  it('patches editable contact fields', async () => {
    const res = mockRes();
    await handlePatchScan({ user: { id: 'user-1' }, params: { id: 'scan-1' }, body: { email: 'x@y.com' } } as any, res);
    expect(badgeScanService.update).toHaveBeenCalledWith('scan-1', expect.objectContaining({ email: 'x@y.com' }));
    expect(res.json).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && npx vitest run tests/routes/badgeScans.test.ts`
Expected: FAIL — "Failed to resolve import ... src/routes/badgeScans"

- [ ] **Step 3: Write the routes**

Create `backend/src/routes/badgeScans.ts`:

```typescript
/**
 * Badge Scan Routes — /api/badge-scans
 *
 * PDF417 attendee badges captured at the booth. eventId is required on list:
 * scans are event-scoped, and an unscoped list would hand any rep every lead
 * the company has ever collected.
 *
 * Handlers are exported by name so tests can call them with a mock req/res,
 * matching routes/auth.ts.
 */

import express, { Response } from 'express';
import { authenticateToken, authorize, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/errors';
import { badgeScanService } from '../services/badge/BadgeScanService';
import { SCAN_ROLES } from '../config/badgeScanRoles';

const router = express.Router();

router.use(authenticateToken);

/** Only strings survive: Express gives arrays for repeated query params. */
const asString = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

export async function handleCreateScan(req: AuthRequest, res: Response): Promise<void> {
  // scanned_by comes from the token, never from the body.
  const scan = await badgeScanService.create(req.body, req.user!.id);
  res.status(201).json(scan);
}

export async function handleListScans(req: AuthRequest, res: Response): Promise<void> {
  const eventId = asString(req.query.eventId);
  if (!eventId) {
    res.status(400).json({
      error: 'eventId is required',
      details: 'Badge scans are event-scoped; pass ?eventId=<uuid>',
    });
    return;
  }
  const scans = await badgeScanService.list({
    eventId,
    entity: asString(req.query.entity),
    crmStatus: asString(req.query.crmStatus),
    q: asString(req.query.q),
  });
  res.json({ scans, count: scans.length });
}

export async function handlePatchScan(req: AuthRequest, res: Response): Promise<void> {
  const scan = await badgeScanService.update(req.params.id, req.body);
  res.json(scan);
}

router.post('/', authorize(...SCAN_ROLES), asyncHandler(handleCreateScan as any));
router.get('/', authorize(...SCAN_ROLES), asyncHandler(handleListScans as any));
router.patch('/:id', authorize(...SCAN_ROLES), asyncHandler(handlePatchScan as any));

export default router;
```

- [ ] **Step 4: Mount the router**

In `backend/src/server.ts`, add the import beside the other route imports (near line 33):

```typescript
import badgeScanRoutes from './routes/badgeScans';
```

and the mount beside the other `app.use('/api/...')` calls (near line 103):

```typescript
app.use('/api/badge-scans', authenticateToken, sessionTracker, badgeScanRoutes);
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && npx vitest run tests/routes/badgeScans.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/badgeScans.ts backend/src/server.ts backend/tests/routes/badgeScans.test.ts
git commit -m "feat(badge-scans): /api/badge-scans routes"
```

---

---

### Task 6: Export to CSV and Excel

**Files:**
- Create: `backend/src/services/badge/BadgeExportService.ts`
- Create: `backend/tests/services/BadgeExportService.test.ts`
- Modify: `backend/src/routes/badgeScans.ts` (add the export handler and route)

**Interfaces:**
- Consumes: `badgeScanService.list` (Task 4), `exceljs` (already a dependency)
- Produces:
  - `badgeExportService.toCsv(scans: BadgeScan[]): string`
  - `badgeExportService.toXlsx(scans: BadgeScan[]): Promise<Buffer>`
  - `handleExportScans(req, res)` exported from `routes/badgeScans.ts`
  - Route: `GET /api/badge-scans/export?eventId=<uuid>&format=csv|xlsx`

- [ ] **Step 1: Write the failing export test**

Create `backend/tests/services/BadgeExportService.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { badgeExportService } from '../../src/services/badge/BadgeExportService';

const scan = (over = {}) => ({
  id: 'scan-1', entity: 'Haute Brands', brand: 'haute_brands',
  first_name: 'Shamsher', last_name: 'Jessani', company: 'Virginia Trade Association',
  title: 'President', email: 'sjessani@aol.com', city: 'Glen Allen', state: 'VA',
  postal_code: '23059-8006', country: 'United States', badge_id: '124649-907',
  notes: null, crm_status: 'pending', crm_error: null,
  scanned_at: '2026-09-16T14:00:00.000Z', ...over,
}) as any;

describe('BadgeExportService.toCsv', () => {
  it('includes the company, so a mixed-brand export is still attributable', () => {
    const csv = badgeExportService.toCsv([scan()]);
    expect(csv.split('\n')[0]).toContain('Company Represented');
    expect(csv).toContain('Haute Brands');
  });

  it('escapes commas and quotes rather than corrupting the row', () => {
    // "Jessani, Inc" would silently become two columns unquoted, shifting
    // every field after it in that row.
    const csv = badgeExportService.toCsv([scan({ company: 'Smith, Jones & Co "The Firm"' })]);
    expect(csv).toContain('"Smith, Jones & Co ""The Firm"""');
    expect(csv.trim().split('\n')).toHaveLength(2);
  });

  it('renders a skipped scan with its reason instead of a blank status', () => {
    const csv = badgeExportService.toCsv([
      scan({ crm_status: 'skipped', crm_error: 'No Zoho CRM is configured for "Summitt Labs"' }),
    ]);
    expect(csv).toContain('skipped');
    expect(csv).toContain('No Zoho CRM is configured');
  });

  it('never emits a raw newline inside a field', () => {
    const csv = badgeExportService.toCsv([scan({ notes: 'line one\nline two' })]);
    expect(csv.trim().split('\n')).toHaveLength(2);
  });
});

describe('BadgeExportService.toXlsx', () => {
  it('produces a non-empty workbook buffer', async () => {
    const buf = await badgeExportService.toXlsx([scan()]);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && npx vitest run tests/services/BadgeExportService.test.ts`
Expected: FAIL — "Failed to resolve import ... BadgeExportService"

- [ ] **Step 3: Write the export service**

Create `backend/src/services/badge/BadgeExportService.ts`:

```typescript
/**
 * Badge Scan Export
 *
 * The offline half of the feature's value: even with no CRM configured, a
 * show's leads come out as a file someone can work. Column order is chosen
 * for a human reading it in Excel, not for the database.
 */

import ExcelJS from 'exceljs';
import { BadgeScan } from '../../database/repositories/BadgeScanRepository';

const COLUMNS: Array<{ header: string; pick: (s: BadgeScan) => string }> = [
  { header: 'Scanned At', pick: (s) => s.scanned_at ?? '' },
  { header: 'Company Represented', pick: (s) => s.entity ?? '' },
  { header: 'First Name', pick: (s) => s.first_name ?? '' },
  { header: 'Last Name', pick: (s) => s.last_name ?? '' },
  { header: 'Title', pick: (s) => s.title ?? '' },
  { header: 'Organization', pick: (s) => s.company ?? '' },
  { header: 'Email', pick: (s) => s.email ?? '' },
  { header: 'Phone', pick: (s) => s.phone ?? '' },
  { header: 'City', pick: (s) => s.city ?? '' },
  { header: 'State', pick: (s) => s.state ?? '' },
  { header: 'ZIP', pick: (s) => s.postal_code ?? '' },
  { header: 'Country', pick: (s) => s.country ?? '' },
  { header: 'Badge ID', pick: (s) => s.badge_id ?? '' },
  { header: 'Attendee Type', pick: (s) => s.attendee_type ?? '' },
  { header: 'Notes', pick: (s) => s.notes ?? '' },
  { header: 'CRM Status', pick: (s) => s.crm_status ?? '' },
  { header: 'CRM Note', pick: (s) => s.crm_error ?? '' },
];

/**
 * RFC 4180 escaping. A company like `Smith, Jones & Co "The Firm"` shifts
 * every later column in its row if this is skipped, and the corruption is
 * invisible until someone reads the spreadsheet.
 */
function escapeCsv(value: string): string {
  const flattened = value.replace(/\r?\n/g, ' ');
  if (/[",]/.test(flattened)) {
    return `"${flattened.replace(/"/g, '""')}"`;
  }
  return flattened;
}

export class BadgeExportService {
  toCsv(scans: BadgeScan[]): string {
    const header = COLUMNS.map((c) => escapeCsv(c.header)).join(',');
    const rows = scans.map((s) => COLUMNS.map((c) => escapeCsv(c.pick(s))).join(','));
    return [header, ...rows].join('\n');
  }

  async toXlsx(scans: BadgeScan[]): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Leads');
    sheet.addRow(COLUMNS.map((c) => c.header));
    sheet.getRow(1).font = { bold: true };
    for (const scan of scans) {
      sheet.addRow(COLUMNS.map((c) => c.pick(scan)));
    }
    sheet.columns.forEach((col) => { col.width = 22; });
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
}

export const badgeExportService = new BadgeExportService();
```

- [ ] **Step 4: Add the export route**

In `backend/src/routes/badgeScans.ts`, add the import:

```typescript
import { badgeExportService } from '../services/badge/BadgeExportService';
```

the handler, beside the others:

```typescript
export async function handleExportScans(req: AuthRequest, res: Response): Promise<void> {
  const eventId = asString(req.query.eventId);
  if (!eventId) {
    res.status(400).json({ error: 'eventId is required' });
    return;
  }
  const scans = await badgeScanService.list({ eventId, entity: asString(req.query.entity) });
  const stamp = new Date().toISOString().slice(0, 10);

  if (asString(req.query.format) === 'xlsx') {
    const buffer = await badgeExportService.toXlsx(scans);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="leads-${stamp}.xlsx"`);
    res.send(buffer);
    return;
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="leads-${stamp}.csv"`);
  res.send(badgeExportService.toCsv(scans));
}
```

and the route registration — **above** the `/:id` routes, or `export` is swallowed as an id:

```typescript
router.get('/export', authorize(...SCAN_ROLES), asyncHandler(handleExportScans as any));
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && npx vitest run tests/services/BadgeExportService.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/badge/BadgeExportService.ts backend/src/routes/badgeScans.ts backend/tests/services/BadgeExportService.test.ts
git commit -m "feat(badge-scans): CSV and Excel export"
```

---

### Task 7: Per-brand CRM configuration

**Files:**
- Create: `backend/src/services/badge/badgeCrmConfig.ts`
- Create: `backend/tests/services/badgeCrmConfig.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces:
  - `interface BrandCrmConfig { brand: string; refreshToken: string; clientId: string; clientSecret: string; module: string }`
  - `getBrandCrmConfig(brand: string): BrandCrmConfig | null`
  - `isBrandCrmConfigured(brand: string): boolean`

- [ ] **Step 1: Write the failing config test**

Create `backend/tests/services/badgeCrmConfig.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getBrandCrmConfig, isBrandCrmConfigured } from '../../src/services/badge/badgeCrmConfig';

const ENV_KEYS = [
  'HAUTE_BRANDS_ZOHO_CRM_REFRESH_TOKEN', 'HAUTE_BRANDS_ZOHO_CRM_MODULE',
  'NIRVANA_KULTURE_ZOHO_CRM_REFRESH_TOKEN',
  'ZOHO_CRM_REFRESH_TOKEN', 'ZOHO_CRM_CLIENT_ID', 'ZOHO_CRM_CLIENT_SECRET',
  'ZOHO_CLIENT_ID', 'ZOHO_CLIENT_SECRET', 'ZOHO_CRM_TRADESHOWS_MODULE',
];
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
  process.env.ZOHO_CLIENT_ID = 'cid';
  process.env.ZOHO_CLIENT_SECRET = 'csec';
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('badgeCrmConfig', () => {
  it('prefers the brand-specific refresh token', () => {
    process.env.HAUTE_BRANDS_ZOHO_CRM_REFRESH_TOKEN = 'haute-token';
    process.env.ZOHO_CRM_REFRESH_TOKEN = 'shared-token';
    expect(getBrandCrmConfig('haute_brands')!.refreshToken).toBe('haute-token');
  });

  it('falls back to the shared token so the existing read sync keeps working', () => {
    process.env.ZOHO_CRM_REFRESH_TOKEN = 'shared-token';
    expect(getBrandCrmConfig('nirvana_kulture')!.refreshToken).toBe('shared-token');
  });

  it('reports a brand as unconfigured when no token exists anywhere', () => {
    expect(getBrandCrmConfig('boomin_brands')).toBeNull();
    expect(isBrandCrmConfigured('boomin_brands')).toBe(false);
  });

  it('allows a per-brand module name, because brands need not share one', () => {
    process.env.HAUTE_BRANDS_ZOHO_CRM_REFRESH_TOKEN = 't';
    process.env.HAUTE_BRANDS_ZOHO_CRM_MODULE = 'Tradeshows';
    process.env.ZOHO_CRM_TRADESHOWS_MODULE = 'CustomModule1';
    expect(getBrandCrmConfig('haute_brands')!.module).toBe('Tradeshows');
  });

  it('defaults the module to the existing global setting', () => {
    process.env.NIRVANA_KULTURE_ZOHO_CRM_REFRESH_TOKEN = 't';
    process.env.ZOHO_CRM_TRADESHOWS_MODULE = 'CustomModule1';
    expect(getBrandCrmConfig('nirvana_kulture')!.module).toBe('CustomModule1');
  });

  it('never treats an unknown brand as configured', () => {
    process.env.ZOHO_CRM_REFRESH_TOKEN = 'shared-token';
    expect(getBrandCrmConfig('not_a_brand')).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && npx vitest run tests/services/badgeCrmConfig.test.ts`
Expected: FAIL — "Failed to resolve import ... badgeCrmConfig"

- [ ] **Step 3: Write the config module**

Create `backend/src/services/badge/badgeCrmConfig.ts`:

```typescript
/**
 * Per-brand Zoho CRM credentials.
 *
 * Each brand pushes leads into its own CRM org, so credentials are per brand:
 * HAUTE_BRANDS_ZOHO_CRM_REFRESH_TOKEN and friends, matching the existing
 * <BRAND>_ZOHO_COMPANY_ID convention. The single ZOHO_CRM_REFRESH_TOKEN is
 * kept as a fallback so the existing read-only lead sync keeps working
 * unchanged while brands are onboarded one at a time.
 */

const KNOWN_BRANDS = ['haute_brands', 'boomin_brands', 'nirvana_kulture'] as const;

export interface BrandCrmConfig {
  brand: string;
  refreshToken: string;
  clientId: string;
  clientSecret: string;
  module: string;
}

const envPrefix = (brand: string): string => brand.toUpperCase();

export function getBrandCrmConfig(brand: string): BrandCrmConfig | null {
  if (!(KNOWN_BRANDS as readonly string[]).includes(brand)) return null;

  const prefix = envPrefix(brand);
  const refreshToken =
    process.env[`${prefix}_ZOHO_CRM_REFRESH_TOKEN`] || process.env.ZOHO_CRM_REFRESH_TOKEN;
  const clientId =
    process.env[`${prefix}_ZOHO_CRM_CLIENT_ID`] ||
    process.env.ZOHO_CRM_CLIENT_ID ||
    process.env.ZOHO_CLIENT_ID;
  const clientSecret =
    process.env[`${prefix}_ZOHO_CRM_CLIENT_SECRET`] ||
    process.env.ZOHO_CRM_CLIENT_SECRET ||
    process.env.ZOHO_CLIENT_SECRET;

  if (!refreshToken || !clientId || !clientSecret) return null;

  return {
    brand,
    refreshToken,
    clientId,
    clientSecret,
    module:
      process.env[`${prefix}_ZOHO_CRM_MODULE`] ||
      process.env.ZOHO_CRM_TRADESHOWS_MODULE ||
      'CustomModule1',
  };
}

export function isBrandCrmConfigured(brand: string): boolean {
  return getBrandCrmConfig(brand) !== null;
}

export function configuredBrands(): string[] {
  return KNOWN_BRANDS.filter(isBrandCrmConfigured);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && npx vitest run tests/services/badgeCrmConfig.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Document the new env vars**

In `env.example`, below the existing Zoho block, add:

```
# Badge scan lead push — per-brand CRM tokens (ZohoCRM.modules.ALL scope).
# Falls back to ZOHO_CRM_REFRESH_TOKEN when a brand-specific one is absent.
HAUTE_BRANDS_ZOHO_CRM_REFRESH_TOKEN=
BOOMIN_BRANDS_ZOHO_CRM_REFRESH_TOKEN=
NIRVANA_KULTURE_ZOHO_CRM_REFRESH_TOKEN=
# Optional per-brand module override; defaults to ZOHO_CRM_TRADESHOWS_MODULE
HAUTE_BRANDS_ZOHO_CRM_MODULE=
```

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/badge/badgeCrmConfig.ts backend/tests/services/badgeCrmConfig.test.ts env.example
git commit -m "feat(badge-scans): per-brand CRM configuration"
```

---

### Task 8: CRM push worker

**Files:**
- Create: `backend/src/services/badge/BadgeCrmPushService.ts`
- Create: `backend/tests/services/BadgeCrmPushService.test.ts`
- Modify: `backend/src/server.ts` (start the worker beside `travelReminderService.start()` near line 220)

**Interfaces:**
- Consumes: `badgeScanRepository.claimPendingByBrand` / `markPushResult` (Task 3), `getBrandCrmConfig` / `configuredBrands` (Task 7)
- Produces:
  - `badgeCrmPushService.start(): void`
  - `badgeCrmPushService.pushOnce(): Promise<{ attempted: number; synced: number; failed: number; skippedBrands: string[] }>`

- [ ] **Step 1: Write the failing worker test**

Create `backend/tests/services/BadgeCrmPushService.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import axios from 'axios';

vi.mock('axios', () => ({ default: { post: vi.fn(), get: vi.fn() } }));
vi.mock('../../src/database/repositories/BadgeScanRepository', () => ({
  badgeScanRepository: { claimPendingByBrand: vi.fn(async () => []), markPushResult: vi.fn(async () => {}) },
}));

import { badgeCrmPushService } from '../../src/services/badge/BadgeCrmPushService';
import { badgeScanRepository } from '../../src/database/repositories/BadgeScanRepository';

const scan = (over = {}) => ({
  id: 'scan-1', brand: 'haute_brands', entity: 'Haute Brands',
  first_name: 'Shamsher', last_name: 'Jessani', email: 'sjessani@aol.com',
  company: 'Virginia Trade Association', crm_attempts: 0, ...over,
}) as any;

const tokenOk = () => ({ data: { access_token: 'at', expires_in: 3600 } });
const upsertOk = (id = 'crm-1') => ({ data: { data: [{ code: 'SUCCESS', details: { id } }] } });

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ZOHO_CLIENT_ID = 'cid';
  process.env.ZOHO_CLIENT_SECRET = 'csec';
  process.env.HAUTE_BRANDS_ZOHO_CRM_REFRESH_TOKEN = 'haute-rt';
  delete process.env.BOOMIN_BRANDS_ZOHO_CRM_REFRESH_TOKEN;
  delete process.env.ZOHO_CRM_REFRESH_TOKEN;
});

describe('BadgeCrmPushService.pushOnce', () => {
  it('pushes a claimed scan and records the CRM record id', async () => {
    vi.mocked(badgeScanRepository.claimPendingByBrand).mockResolvedValueOnce([scan()]);
    vi.mocked(axios.post).mockResolvedValueOnce(tokenOk() as any).mockResolvedValueOnce(upsertOk('crm-99') as any);

    const result = await badgeCrmPushService.pushOnce();

    expect(result.synced).toBe(1);
    expect(badgeScanRepository.markPushResult).toHaveBeenCalledWith('scan-1', {
      status: 'synced', crmRecordId: 'crm-99',
    });
  });

  it('upserts on email so a re-push never creates a CRM twin', async () => {
    vi.mocked(badgeScanRepository.claimPendingByBrand).mockResolvedValueOnce([scan()]);
    vi.mocked(axios.post).mockResolvedValueOnce(tokenOk() as any).mockResolvedValueOnce(upsertOk() as any);

    await badgeCrmPushService.pushOnce();

    const [url, body] = vi.mocked(axios.post).mock.calls[1];
    expect(url).toContain('/upsert');
    expect((body as any).duplicate_check_fields).toContain('Email');
  });

  it('leaves an unconfigured brand pending without consuming a retry attempt', async () => {
    // Boomin has no token. Burning 5 attempts against a CRM that does not
    // exist would strand those leads as permanently 'failed'.
    vi.mocked(badgeScanRepository.claimPendingByBrand).mockResolvedValueOnce([
      scan({ id: 'b-1', brand: 'boomin_brands', entity: 'Boomin Brands' }),
    ]);

    const result = await badgeCrmPushService.pushOnce();

    expect(result.skippedBrands).toContain('boomin_brands');
    expect(badgeScanRepository.markPushResult).not.toHaveBeenCalled();
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('uses each brand its own credentials when two brands have work', async () => {
    process.env.NIRVANA_KULTURE_ZOHO_CRM_REFRESH_TOKEN = 'nirvana-rt';
    vi.mocked(badgeScanRepository.claimPendingByBrand).mockResolvedValueOnce([
      scan({ id: 'h-1', brand: 'haute_brands' }),
      scan({ id: 'n-1', brand: 'nirvana_kulture', entity: 'Nirvana Kulture' }),
    ]);
    vi.mocked(axios.post).mockResolvedValue(tokenOk() as any);
    vi.mocked(axios.post)
      .mockResolvedValueOnce(tokenOk() as any).mockResolvedValueOnce(upsertOk() as any)
      .mockResolvedValueOnce(tokenOk() as any).mockResolvedValueOnce(upsertOk() as any);

    await badgeCrmPushService.pushOnce();

    const tokenBodies = vi.mocked(axios.post).mock.calls
      .filter(([url]) => String(url).includes('oauth'))
      .map(([, body]) => String(body));
    expect(tokenBodies.some((b) => b.includes('haute-rt'))).toBe(true);
    expect(tokenBodies.some((b) => b.includes('nirvana-rt'))).toBe(true);
  });

  it('records a failure with its reason instead of throwing', async () => {
    vi.mocked(badgeScanRepository.claimPendingByBrand).mockResolvedValueOnce([scan()]);
    vi.mocked(axios.post)
      .mockResolvedValueOnce(tokenOk() as any)
      .mockRejectedValueOnce(new Error('INVALID_MODULE'));

    const result = await badgeCrmPushService.pushOnce();

    expect(result.failed).toBe(1);
    expect(badgeScanRepository.markPushResult).toHaveBeenCalledWith('scan-1', {
      status: 'failed', error: expect.stringContaining('INVALID_MODULE'),
    });
  });

  it('marks a per-record CRM rejection as failed even when the HTTP call succeeded', async () => {
    // Zoho returns 200 with per-record error codes. Treating the 200 as
    // success would mark a rejected lead 'synced' and it would never retry.
    vi.mocked(badgeScanRepository.claimPendingByBrand).mockResolvedValueOnce([scan()]);
    vi.mocked(axios.post).mockResolvedValueOnce(tokenOk() as any).mockResolvedValueOnce({
      data: { data: [{ code: 'MANDATORY_NOT_FOUND', message: 'required field missing' }] },
    } as any);

    const result = await badgeCrmPushService.pushOnce();

    expect(result.failed).toBe(1);
    expect(badgeScanRepository.markPushResult).toHaveBeenCalledWith('scan-1', {
      status: 'failed', error: expect.stringContaining('MANDATORY_NOT_FOUND'),
    });
  });

  it('does nothing and claims nothing when no brand has a CRM at all', async () => {
    delete process.env.HAUTE_BRANDS_ZOHO_CRM_REFRESH_TOKEN;
    const result = await badgeCrmPushService.pushOnce();
    expect(result.attempted).toBe(0);
    expect(badgeScanRepository.claimPendingByBrand).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && npx vitest run tests/services/BadgeCrmPushService.test.ts`
Expected: FAIL — "Failed to resolve import ... BadgeCrmPushService"

- [ ] **Step 3: Write the worker**

Create `backend/src/services/badge/BadgeCrmPushService.ts`:

```typescript
/**
 * Badge Scan -> Zoho CRM push worker.
 *
 * Scanning never blocks on Zoho, so the push is a background pass: claim
 * eligible scans, group them by brand, and upsert each brand's batch with
 * that brand's own credentials. Failures are recorded on the row with their
 * reason and retried with backoff; they never crash the server.
 *
 * Pushed records are later pulled back by the existing nightly
 * ZohoCrmLeadsService sync into crm_leads, where LeadConversionService
 * attributes invoice revenue — so a scanned lead ends up in the same
 * reporting pipeline as any other.
 */

import axios from 'axios';
import { badgeScanRepository, BadgeScan } from '../../database/repositories/BadgeScanRepository';
import { getBrandCrmConfig, configuredBrands, BrandCrmConfig } from './badgeCrmConfig';

const ZOHO_ACCOUNTS_TOKEN_URL = 'https://accounts.zoho.com/oauth/v2/token';
const ZOHO_API_DOMAIN = 'https://www.zohoapis.com';

const PUSH_INTERVAL_MS = 5 * 60 * 1000;
const STARTUP_DELAY_MS = 45 * 1000; // after migrations settle
const CLAIM_LIMIT = 500;
const ZOHO_MAX_RECORDS_PER_CALL = 100;

export interface PushSummary {
  attempted: number;
  synced: number;
  failed: number;
  skippedBrands: string[];
}

export class BadgeCrmPushService {
  private timer: NodeJS.Timeout | null = null;

  start(): void {
    if (configuredBrands().length === 0) {
      console.log('[BadgeCrmPush] No brand has a CRM refresh token — lead push idle');
      return;
    }
    setTimeout(() => this.pushOnce().catch(() => undefined), STARTUP_DELAY_MS);
    this.timer = setInterval(() => this.pushOnce().catch(() => undefined), PUSH_INTERVAL_MS);
    console.log(`[BadgeCrmPush] Started for brands: ${configuredBrands().join(', ')}`);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async pushOnce(): Promise<PushSummary> {
    const summary: PushSummary = { attempted: 0, synced: 0, failed: 0, skippedBrands: [] };

    if (configuredBrands().length === 0) return summary;

    const scans = await badgeScanRepository.claimPendingByBrand(CLAIM_LIMIT);
    if (scans.length === 0) return summary;

    const byBrand = new Map<string, BadgeScan[]>();
    for (const scan of scans) {
      if (!scan.brand) continue; // defensive: the query already excludes these
      const list = byBrand.get(scan.brand) ?? [];
      list.push(scan);
      byBrand.set(scan.brand, list);
    }

    for (const [brand, brandScans] of byBrand) {
      const config = getBrandCrmConfig(brand);
      if (!config) {
        // Leave them pending. Consuming retry attempts against a CRM that does
        // not exist would strand these leads as permanently failed once the
        // brand is finally onboarded.
        summary.skippedBrands.push(brand);
        console.warn(
          `[BadgeCrmPush] ${brandScans.length} scan(s) waiting for ${brand} — no CRM refresh token configured`
        );
        continue;
      }

      for (let i = 0; i < brandScans.length; i += ZOHO_MAX_RECORDS_PER_CALL) {
        const batch = brandScans.slice(i, i + ZOHO_MAX_RECORDS_PER_CALL);
        summary.attempted += batch.length;
        await this.pushBatch(config, batch, summary);
      }
    }

    return summary;
  }

  private async pushBatch(config: BrandCrmConfig, batch: BadgeScan[], summary: PushSummary): Promise<void> {
    let accessToken: string;
    try {
      accessToken = await this.getAccessToken(config);
    } catch (error) {
      await this.failBatch(batch, `Token refresh failed: ${(error as Error).message}`, summary);
      return;
    }

    try {
      const response = await axios.post(
        `${ZOHO_API_DOMAIN}/crm/v2/${config.module}/upsert`,
        {
          data: batch.map((scan) => this.toCrmRecord(scan)),
          // Email is the only field reliably unique per attendee. Without
          // this, every retry would create a new CRM record.
          duplicate_check_fields: ['Email'],
        },
        { headers: { Authorization: `Zoho-oauthtoken ${accessToken}` } }
      );

      const results: any[] = response.data?.data ?? [];
      for (let i = 0; i < batch.length; i++) {
        const scan = batch[i];
        const result = results[i];
        // Zoho answers 200 with per-record codes; a rejected record inside a
        // successful response is still a failure and must retry.
        if (result?.code === 'SUCCESS') {
          await badgeScanRepository.markPushResult(scan.id, {
            status: 'synced',
            crmRecordId: result.details?.id,
          });
          summary.synced += 1;
        } else {
          await badgeScanRepository.markPushResult(scan.id, {
            status: 'failed',
            error: `${result?.code ?? 'NO_RESULT'}: ${result?.message ?? 'Zoho returned no result for this record'}`,
          });
          summary.failed += 1;
        }
      }
    } catch (error) {
      await this.failBatch(batch, (error as Error).message, summary);
    }
  }

  private async failBatch(batch: BadgeScan[], message: string, summary: PushSummary): Promise<void> {
    for (const scan of batch) {
      await badgeScanRepository.markPushResult(scan.id, { status: 'failed', error: message });
      summary.failed += 1;
    }
  }

  private async getAccessToken(config: BrandCrmConfig): Promise<string> {
    const params = new URLSearchParams({
      refresh_token: config.refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: 'refresh_token',
    });
    const response = await axios.post(ZOHO_ACCOUNTS_TOKEN_URL, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    const token = response.data?.access_token;
    if (!token) throw new Error('Zoho returned no access_token');
    return token;
  }

  /**
   * Field API names are the known weak point: the Tradeshows module is a
   * custom module and its field names are org-specific. These are the
   * standard names; a brand whose module differs will surface
   * MANDATORY_NOT_FOUND or INVALID_DATA on the row, visible in the UI, rather
   * than failing silently.
   */
  private toCrmRecord(scan: BadgeScan): Record<string, unknown> {
    return {
      Last_Name: scan.last_name || scan.company || 'Unknown',
      First_Name: scan.first_name ?? undefined,
      Email: scan.email ?? undefined,
      Phone: scan.phone ?? undefined,
      Company: scan.company ?? undefined,
      Title: scan.title ?? undefined,
      City: scan.city ?? undefined,
      State: scan.state ?? undefined,
      Zip_Code: scan.postal_code ?? undefined,
      Country: scan.country ?? undefined,
      Description: scan.notes ?? undefined,
      Lead_Source: 'Trade Show Badge Scan',
    };
  }
}

export const badgeCrmPushService = new BadgeCrmPushService();
```

- [ ] **Step 4: Start the worker**

In `backend/src/server.ts`, beside `travelReminderService.start();` (near line 220):

```typescript
import { badgeCrmPushService } from './services/badge/BadgeCrmPushService';
// ...
badgeCrmPushService.start();
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && npx vitest run tests/services/BadgeCrmPushService.test.ts && npm run check:zoho-boundary`
Expected: PASS (7 tests), boundary check clean.

- [ ] **Step 6: Run the whole backend suite**

Run: `cd backend && npm test -- --run`
Expected: All tests pass. If anything unrelated fails, note it and do not "fix" it here.

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/badge/BadgeCrmPushService.ts backend/src/server.ts backend/tests/services/BadgeCrmPushService.test.ts
git commit -m "feat(badge-scans): per-brand CRM push worker with backoff"
```

---

### Task 9: The badge payload parser

This is the feature's highest-risk unit — no real badge samples exist yet, so
it must degrade gracefully rather than guess confidently. Write the tests
first and take them seriously.

**Files:**
- Create: `src/utils/badge/tokenClassifiers.ts`
- Create: `src/utils/badge/parseBadgePayload.ts`
- Create: `src/utils/__tests__/parseBadgePayload.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `PARSER_VERSION: string` (`'v1'`)
  - `type BadgeField = 'badge_id' | 'salutation' | 'first_name' | 'last_name' | 'title' | 'company' | 'email' | 'phone' | 'city' | 'state' | 'postal_code' | 'country' | 'attendee_type'`
  - `interface ParsedToken { index: number; value: string; mappedTo: BadgeField | null }`
  - `interface ParsedBadge { fields: Partial<Record<BadgeField, string>>; tokens: ParsedToken[]; confidence: number; parserVersion: string }`
  - `parseBadgePayload(raw: string): ParsedBadge`
  - `REVIEW_CONFIDENCE_THRESHOLD: number` (`0.6`)

- [ ] **Step 1: Write the failing parser test**

Create `src/utils/__tests__/parseBadgePayload.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseBadgePayload, PARSER_VERSION } from '../badge/parseBadgePayload';

// Shaped after the one confirmed decode: badge id, name, organization,
// city/state/ZIP, country, a second id, title, salutation, email, and a
// classification code.
const PIPE = '124649-907|Shamsher|Jessani|Virginia Trade Association|Glen Allen|VA|23059-8006|United States|50542|President|Mr.|sjessani@aol.com|DP';

describe('parseBadgePayload — delimited payloads', () => {
  it('pulls the contact out of a pipe-delimited badge', () => {
    const { fields } = parseBadgePayload(PIPE);
    expect(fields.badge_id).toBe('124649-907');
    expect(fields.first_name).toBe('Shamsher');
    expect(fields.last_name).toBe('Jessani');
    expect(fields.company).toBe('Virginia Trade Association');
    expect(fields.city).toBe('Glen Allen');
    expect(fields.state).toBe('VA');
    expect(fields.postal_code).toBe('23059-8006');
    expect(fields.country).toBe('United States');
    expect(fields.title).toBe('President');
    expect(fields.salutation).toBe('Mr.');
    expect(fields.email).toBe('sjessani@aol.com');
  });

  it('handles caret and tab delimiters the same way', () => {
    expect(parseBadgePayload(PIPE.replace(/\|/g, '^')).fields.email).toBe('sjessani@aol.com');
    expect(parseBadgePayload(PIPE.replace(/\|/g, '\t')).fields.email).toBe('sjessani@aol.com');
  });

  it('reads key=value payloads without positional guessing', () => {
    const { fields } = parseBadgePayload(
      'FIRST=Shamsher|LAST=Jessani|EMAIL=sjessani@aol.com|COMPANY=Virginia Trade Association|STATE=VA'
    );
    expect(fields.first_name).toBe('Shamsher');
    expect(fields.last_name).toBe('Jessani');
    expect(fields.email).toBe('sjessani@aol.com');
    expect(fields.company).toBe('Virginia Trade Association');
  });
});

describe('parseBadgePayload — ambiguous tokens', () => {
  it('reads 23059-8006 as a ZIP and 124649-907 as a badge id', () => {
    // Both match a digits-dash-digits shape. Only the ZIP has a 5-digit head.
    const { fields } = parseBadgePayload('124649-907|23059-8006');
    expect(fields.postal_code).toBe('23059-8006');
    expect(fields.badge_id).toBe('124649-907');
  });

  it('does not mistake a 9-digit badge id for a phone number', () => {
    const { fields } = parseBadgePayload(PIPE);
    expect(fields.phone).toBeUndefined();
  });

  it('keeps a second 5-digit number unmapped rather than overwriting the ZIP', () => {
    // The confirmed sample carries both a ZIP and a second numeric id.
    // Silently overwriting the real ZIP would be worse than leaving the
    // extra number unmapped and visible.
    const { fields, tokens } = parseBadgePayload('23059-8006|50542');
    expect(fields.postal_code).toBe('23059-8006');
    expect(tokens.find((t) => t.value === '50542')!.mappedTo).toBeNull();
  });

  it('treats VA as a state but DP as a classification code', () => {
    const { fields } = parseBadgePayload('Glen Allen|VA|DP');
    expect(fields.state).toBe('VA');
    expect(fields.attendee_type).toBe('DP');
  });

  it('recognizes a real 10-digit phone', () => {
    expect(parseBadgePayload('Jessani|804-555-0134').fields.phone).toBe('804-555-0134');
  });
});

describe('parseBadgePayload — never loses data', () => {
  it('keeps every token, including ones it cannot map', () => {
    const { tokens } = parseBadgePayload('Shamsher|ZZTOP9|Jessani');
    expect(tokens).toHaveLength(3);
    expect(tokens.find((t) => t.value === 'ZZTOP9')!.mappedTo).toBeNull();
  });

  it('does not throw on binary garbage, and reports no confidence', () => {
    const result = parseBadgePayload('\u0000\u0001\uFFFD');
    expect(result.confidence).toBe(0);
    expect(result.fields.email).toBeUndefined();
  });

  it('does not throw on an empty payload', () => {
    const result = parseBadgePayload('');
    expect(result.confidence).toBe(0);
    expect(result.tokens).toEqual([]);
  });

  it('handles an undelimited blob without crashing', () => {
    const result = parseBadgePayload('sjessani@aol.com');
    expect(result.fields.email).toBe('sjessani@aol.com');
  });

  it('stamps the parser version so scans can be re-parsed later', () => {
    expect(parseBadgePayload(PIPE).parserVersion).toBe(PARSER_VERSION);
  });
});

describe('parseBadgePayload — confidence', () => {
  it('scores a full record high enough to auto-accept', () => {
    expect(parseBadgePayload(PIPE).confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('scores a name-only record low enough to force review', () => {
    // A lead with no email and no company is not usable as-is; the rep must
    // see it flagged while the person is still standing there.
    const result = parseBadgePayload('Shamsher|Jessani');
    expect(result.confidence).toBeLessThan(0.6);
  });

  it('never exceeds 1', () => {
    expect(parseBadgePayload(PIPE).confidence).toBeLessThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/utils/__tests__/parseBadgePayload.test.ts`
Expected: FAIL — "Failed to resolve import ... ../badge/parseBadgePayload"

- [ ] **Step 3: Write the classifiers**

Create `src/utils/badge/tokenClassifiers.ts`:

```typescript
/**
 * Content-based token classifiers for badge payloads.
 *
 * Badge formats are vendor-specific and we have no samples, so position tells
 * us nothing reliable. Each token is judged on its own content instead.
 * The order these are applied in lives in parseBadgePayload.
 */

const US_STATES = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC','PR','VI','GU','AS','MP',
]);

const COUNTRIES = new Set([
  'united states','usa','us','u.s.a.','canada','mexico','united kingdom','uk',
]);

const SALUTATIONS = new Set(['mr', 'mr.', 'mrs', 'mrs.', 'ms', 'ms.', 'dr', 'dr.', 'prof', 'prof.']);

const TITLE_KEYWORDS = [
  'president','ceo','cfo','coo','cto','owner','founder','partner','principal',
  'director','manager','supervisor','vp','vice president','executive','chief',
  'buyer','purchasing','sales','marketing','operations','general manager',
];

const COMPANY_KEYWORDS = [
  'inc','inc.','llc','l.l.c.','ltd','corp','corp.','corporation','co','co.',
  'company','association','group','holdings','partners','distributors',
  'distributing','brands','enterprises','industries','foods','labs',
];

export const isEmail = (t: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(t);

/** ZIP or ZIP+4. Checked before badge ids, which share the digits-dash shape. */
export const isPostalCode = (t: string): boolean => /^\d{5}(-\d{4})?$/.test(t);

/**
 * Registration ids look like 124649-907. Deliberately checked after ZIP and
 * before phone: 124649-907 carries nine digits and would otherwise read as a
 * phone number.
 */
export const isBadgeId = (t: string): boolean => /^\d{4,}-\d{2,4}$/.test(t);

/** Requires ten digits, which is what separates a phone from a badge id. */
export const isPhone = (t: string): boolean =>
  /^\+?[\d\s().-]{10,20}$/.test(t) && (t.match(/\d/g) || []).length >= 10;

export const isState = (t: string): boolean => t.length === 2 && US_STATES.has(t.toUpperCase());

export const isCountry = (t: string): boolean => COUNTRIES.has(t.toLowerCase());

export const isSalutation = (t: string): boolean => SALUTATIONS.has(t.toLowerCase());

export const isTitle = (t: string): boolean => {
  const lower = t.toLowerCase();
  return TITLE_KEYWORDS.some((k) => lower === k || lower.includes(k));
};

export const isCompany = (t: string): boolean => {
  const words = t.toLowerCase().replace(/[^a-z0-9. ]/g, '').split(/\s+/);
  return words.some((w) => COMPANY_KEYWORDS.includes(w));
};

/** A plausible person-name token: letters, hyphens, apostrophes only. */
export const isNameLike = (t: string): boolean => /^[A-Za-z][A-Za-z'-]{1,29}$/.test(t);

/**
 * A short uppercase code such as the "DP" classification on the confirmed
 * sample. Only consulted after state, so real states are never swallowed.
 */
export const isShortCode = (t: string): boolean => /^[A-Z0-9]{1,4}$/.test(t);

/** Anything with a space and no other signal is more likely a place or org. */
export const isMultiWord = (t: string): boolean => /\s/.test(t.trim());
```

- [ ] **Step 4: Write the parser**

Create `src/utils/badge/parseBadgePayload.ts`:

```typescript
/**
 * Badge payload parser.
 *
 * Single source of truth for turning a PDF417 payload into contact fields.
 * It runs on the client so a scan shows real data instantly and offline; the
 * backend stores what it produces but never re-derives it.
 *
 * Two rules the implementation must keep:
 *   1. Never throw. A badge that fails to parse still becomes a lead, with
 *      its raw payload intact and every token preserved.
 *   2. Never overwrite a confident assignment with a speculative one.
 */

import {
  isEmail, isPostalCode, isBadgeId, isPhone, isState, isCountry,
  isSalutation, isTitle, isCompany, isNameLike, isShortCode, isMultiWord,
} from './tokenClassifiers';

export const PARSER_VERSION = 'v1';

export type BadgeField =
  | 'badge_id' | 'salutation' | 'first_name' | 'last_name' | 'title'
  | 'company' | 'email' | 'phone' | 'city' | 'state' | 'postal_code'
  | 'country' | 'attendee_type';

export interface ParsedToken {
  index: number;
  value: string;
  mappedTo: BadgeField | null;
}

export interface ParsedBadge {
  fields: Partial<Record<BadgeField, string>>;
  tokens: ParsedToken[];
  confidence: number;
  parserVersion: string;
}

/**
 * Weights sum to 1.00. Email, company and name carry nearly all of it: a lead
 * missing those cannot be followed up at all, while a missing ZIP is a
 * cosmetic gap.
 */
const FIELD_WEIGHTS: Record<BadgeField, number> = {
  email: 0.30, company: 0.20, first_name: 0.15, last_name: 0.15,
  postal_code: 0.05, state: 0.05, city: 0.05, title: 0.03, badge_id: 0.02,
  phone: 0, country: 0, salutation: 0, attendee_type: 0,
};

const DELIMITERS = ['|', '^', '\t', '~', ';'];

const KEYED_PAIR = /^([A-Za-z_ ]{2,30})\s*[:=]\s*(.+)$/;

const KEY_ALIASES: Record<string, BadgeField> = {
  first: 'first_name', firstname: 'first_name', fname: 'first_name', given: 'first_name',
  last: 'last_name', lastname: 'last_name', lname: 'last_name', surname: 'last_name',
  email: 'email', mail: 'email', phone: 'phone', tel: 'phone', telephone: 'phone',
  company: 'company', org: 'company', organization: 'company', employer: 'company',
  title: 'title', jobtitle: 'title', city: 'city', state: 'state',
  zip: 'postal_code', postal: 'postal_code', postalcode: 'postal_code',
  country: 'country', badge: 'badge_id', badgeid: 'badge_id',
  registration: 'badge_id', regid: 'badge_id', salutation: 'salutation',
  prefix: 'salutation', type: 'attendee_type',
};

/**
 * Strip control bytes and the Unicode replacement character, but keep tab —
 * it is a candidate delimiter.
 */
function normalize(raw: string): string {
  return (raw ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uFFFD]/g, '')
    .trim();
}

function splitTokens(text: string): string[] {
  let best = '';
  let bestCount = 0;
  for (const d of DELIMITERS) {
    const count = text.split(d).length - 1;
    if (count > bestCount) { best = d; bestCount = count; }
  }
  const parts = bestCount > 0 ? text.split(best) : text.split(/\r?\n/);
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

function aliasFor(token: string): BadgeField | null {
  const match = token.match(KEYED_PAIR);
  if (!match) return null;
  return KEY_ALIASES[match[1].toLowerCase().replace(/[^a-z]/g, '')] ?? null;
}

function tryKeyed(tokens: string[]): Partial<Record<BadgeField, string>> | null {
  const pairs = tokens.map((t) => t.match(KEYED_PAIR)).filter(Boolean) as RegExpMatchArray[];
  if (pairs.length < 2) return null;

  const fields: Partial<Record<BadgeField, string>> = {};
  for (const [, rawKey, rawValue] of pairs) {
    const field = KEY_ALIASES[rawKey.toLowerCase().replace(/[^a-z]/g, '')];
    const value = rawValue.trim();
    if (field && value && !fields[field]) fields[field] = value;
  }
  return Object.keys(fields).length > 0 ? fields : null;
}

/**
 * Order matters. Each rule runs only while its field is still unset, so an
 * early confident match is never displaced by a later speculative one, and
 * the keyword passes run before the shape-of-the-token passes.
 */
function classifyPositional(tokens: string[]): {
  fields: Partial<Record<BadgeField, string>>;
  mapped: Array<BadgeField | null>;
} {
  const fields: Partial<Record<BadgeField, string>> = {};
  const mapped: Array<BadgeField | null> = tokens.map(() => null);

  const claim = (i: number, field: BadgeField, value: string) => {
    fields[field] = value;
    mapped[i] = field;
  };

  // Pass 1 — unambiguous shapes.
  tokens.forEach((t, i) => {
    if (mapped[i]) return;
    if (!fields.email && isEmail(t)) return claim(i, 'email', t);
    if (!fields.postal_code && isPostalCode(t)) return claim(i, 'postal_code', t);
    if (!fields.badge_id && isBadgeId(t)) return claim(i, 'badge_id', t);
    if (!fields.phone && isPhone(t)) return claim(i, 'phone', t);
    if (!fields.state && isState(t)) return claim(i, 'state', t);
    if (!fields.country && isCountry(t)) return claim(i, 'country', t);
    if (!fields.salutation && isSalutation(t)) return claim(i, 'salutation', t);
  });

  // Pass 2 — keyword signals. Runs before the multi-word fallback so
  // "Virginia Trade Association" claims company ahead of "Glen Allen".
  tokens.forEach((t, i) => {
    if (mapped[i]) return;
    if (!fields.company && isCompany(t)) return claim(i, 'company', t);
    if (!fields.title && isTitle(t)) return claim(i, 'title', t);
  });

  // Pass 3 — multi-word leftovers are places or organizations, not people.
  tokens.forEach((t, i) => {
    if (mapped[i] || !isMultiWord(t)) return;
    if (!fields.company) return claim(i, 'company', t);
    if (!fields.city) return claim(i, 'city', t);
  });

  // Pass 4 — single-word name-like tokens, in order.
  tokens.forEach((t, i) => {
    if (mapped[i] || !isNameLike(t)) return;
    if (!fields.first_name) return claim(i, 'first_name', t);
    if (!fields.last_name) return claim(i, 'last_name', t);
    if (!fields.city) return claim(i, 'city', t);
  });

  // Pass 5 — a leftover short uppercase code is the attendee classification.
  tokens.forEach((t, i) => {
    if (mapped[i] || fields.attendee_type) return;
    if (isShortCode(t)) claim(i, 'attendee_type', t);
  });

  return { fields, mapped };
}

function scoreConfidence(fields: Partial<Record<BadgeField, string>>): number {
  let score = 0;
  for (const [field, weight] of Object.entries(FIELD_WEIGHTS) as Array<[BadgeField, number]>) {
    if (fields[field]) score += weight;
  }
  return Math.min(1, Math.round(score * 100) / 100);
}

export function parseBadgePayload(raw: string): ParsedBadge {
  const empty: ParsedBadge = { fields: {}, tokens: [], confidence: 0, parserVersion: PARSER_VERSION };
  try {
    const text = normalize(raw);
    if (!text) return empty;

    const rawTokens = splitTokens(text);
    if (rawTokens.length === 0) return empty;

    const keyed = tryKeyed(rawTokens);
    if (keyed) {
      return {
        fields: keyed,
        tokens: rawTokens.map((value, index) => ({ index, value, mappedTo: aliasFor(value) })),
        confidence: scoreConfidence(keyed),
        parserVersion: PARSER_VERSION,
      };
    }

    const { fields, mapped } = classifyPositional(rawTokens);
    return {
      fields,
      tokens: rawTokens.map((value, index) => ({ index, value, mappedTo: mapped[index] })),
      confidence: scoreConfidence(fields),
      parserVersion: PARSER_VERSION,
    };
  } catch {
    // A parser bug must never cost a lead. The caller still holds raw_payload.
    return empty;
  }
}

/**
 * Below this, the review sheet presents fields as corrections to make rather
 * than facts to accept.
 */
export const REVIEW_CONFIDENCE_THRESHOLD = 0.6;
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/utils/__tests__/parseBadgePayload.test.ts`
Expected: PASS (16 tests)

If a test fails, fix the parser, not the test — each case encodes a real badge
ambiguity. Most likely culprit: if `'Glen Allen'` claims `company` before
`'Virginia Trade Association'` does, pass 3 is running ahead of pass 2 in
`classifyPositional`.

- [ ] **Step 6: Commit**

```bash
git add src/utils/badge/ src/utils/__tests__/parseBadgePayload.test.ts
git commit -m "feat(badge-scans): content-based PDF417 payload parser"
```

---

### Task 10: Frontend API client, offline queue, and sync entity

**Files:**
- Create: `src/utils/badgeApi.ts`
- Create: `src/utils/__tests__/badgeApi.test.ts`
- Modify: `src/utils/offlineDb.ts` (add the `PendingBadgeScan` interface, the table field, and a `version(5)` block)
- Modify: `src/utils/syncManager.ts` (add `'badgeScan'` to the `queueAction` entity union and a case in `syncItem`)
- Create: `src/utils/__tests__/syncManager.badge.test.ts`

**Interfaces:**
- Consumes: `apiClient` (existing), `POST/GET/PATCH /api/badge-scans` (Task 5)
- Produces:
  - `interface BadgeScanRecord` — the row as the frontend sees it (same field names as `BadgeScan` in Task 3)
  - `badgeApi.createScan(input): Promise<BadgeScanRecord>`
  - `badgeApi.listScans(params): Promise<BadgeScanRecord[]>`
  - `badgeApi.updateScan(id, patch): Promise<BadgeScanRecord>`
  - `badgeApi.exportUrl(eventId, format): string`
  - `offlineDb.pendingBadgeScans` table
  - `syncManager.queueAction('CREATE', 'badgeScan', data, localId)`

- [ ] **Step 1: Write the failing API client test**

Create `src/utils/__tests__/badgeApi.test.ts`. Read `src/utils/__tests__/boothApi.test.ts` first and copy its mocking style exactly:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../apiClient', () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));

import { badgeApi } from '../badgeApi';
import { apiClient } from '../apiClient';

describe('badgeApi', () => {
  beforeEach(() => vi.clearAllMocks());

  it('posts a scan with the company and the raw payload', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: { id: 'scan-1' } } as any);
    await badgeApi.createScan({
      eventId: 'ev-1', entity: 'Haute Brands', rawPayload: 'RAW',
      clientScanId: 'c-1', parserVersion: 'v1', parseConfidence: 0.9,
      fields: [], contact: { first_name: 'Shamsher' },
    });
    const [url, body] = vi.mocked(apiClient.post).mock.calls[0];
    expect(url).toBe('/badge-scans');
    expect(body).toMatchObject({ entity: 'Haute Brands', rawPayload: 'RAW', clientScanId: 'c-1' });
  });

  it('requires eventId when listing, matching the server contract', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { scans: [] } } as any);
    await badgeApi.listScans({ eventId: 'ev-1', entity: 'Haute Brands' });
    expect(vi.mocked(apiClient.get).mock.calls[0][0]).toContain('eventId=ev-1');
    expect(vi.mocked(apiClient.get).mock.calls[0][0]).toContain('entity=Haute+Brands');
  });

  it('unwraps the scans array rather than handing callers the envelope', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { scans: [{ id: 'a' }], count: 1 } } as any);
    await expect(badgeApi.listScans({ eventId: 'ev-1' })).resolves.toEqual([{ id: 'a' }]);
  });

  it('returns an empty list when the server sends no scans key', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: {} } as any);
    await expect(badgeApi.listScans({ eventId: 'ev-1' })).resolves.toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/utils/__tests__/badgeApi.test.ts`
Expected: FAIL — "Failed to resolve import ... ../badgeApi"

- [ ] **Step 3: Write the API client**

Create `src/utils/badgeApi.ts`:

```typescript
/**
 * Badge Scan API Client
 *
 * Feature-scoped, following boothApi.ts — src/utils/api.ts is already a large
 * object literal and this feature does not belong in it.
 */

import { apiClient } from './apiClient';

export interface BadgeScanRecord {
  id: string;
  event_id: string;
  scanned_by: string | null;
  entity: string;
  brand: string | null;
  raw_payload: string;
  parser_version: string | null;
  parse_confidence: string | null;
  badge_id: string | null;
  salutation: string | null;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  attendee_type: string | null;
  notes: string | null;
  crm_status: 'pending' | 'synced' | 'failed' | 'skipped';
  crm_error: string | null;
  scanned_at: string;
}

export interface CreateScanPayload {
  eventId: string;
  entity: string;
  rawPayload: string;
  clientScanId?: string;
  scannedAt?: string;
  parserVersion?: string;
  parseConfidence?: number;
  fields?: unknown;
  notes?: string;
  contact?: Record<string, string>;
}

export interface ListScansParams {
  eventId: string;
  entity?: string;
  crmStatus?: string;
  q?: string;
}

export const badgeApi = {
  async createScan(input: CreateScanPayload): Promise<BadgeScanRecord> {
    const response = await apiClient.post('/badge-scans', input);
    return (response as any).data as BadgeScanRecord;
  },

  async listScans(params: ListScansParams): Promise<BadgeScanRecord[]> {
    const query = new URLSearchParams({ eventId: params.eventId });
    if (params.entity) query.set('entity', params.entity);
    if (params.crmStatus) query.set('crmStatus', params.crmStatus);
    if (params.q) query.set('q', params.q);
    const response = await apiClient.get(`/badge-scans?${query.toString()}`);
    return ((response as any).data?.scans ?? []) as BadgeScanRecord[];
  },

  async updateScan(id: string, patch: Partial<BadgeScanRecord>): Promise<BadgeScanRecord> {
    const response = await apiClient.patch(`/badge-scans/${id}`, patch);
    return (response as any).data as BadgeScanRecord;
  },

  exportUrl(eventId: string, format: 'csv' | 'xlsx' = 'csv'): string {
    return `/badge-scans/export?eventId=${encodeURIComponent(eventId)}&format=${format}`;
  },
};
```

If `apiClient` does not expose `patch`, use whatever verb helper it does expose
(check `src/utils/apiClient.ts`) rather than adding one.

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/utils/__tests__/badgeApi.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Add the offline table**

In `src/utils/offlineDb.ts`, add the interface beside `PendingBoothPhoto`:

```typescript
export interface PendingBadgeScan {
  /** Client-generated id; also the server-side idempotency key on replay. */
  id: string;
  eventId: string;
  entity: string;
  rawPayload: string;
  parserVersion: string;
  parseConfidence: number;
  fields: unknown;
  contact: Record<string, string>;
  notes?: string;
  scannedAt: string;
  createdAt: number;
}
```

add the table field beside the others in the class:

```typescript
  pendingBadgeScans!: Table<PendingBadgeScan, string>;
```

and the version block after `version(4)`:

```typescript
    // v5 adds badge scans captured at the booth. Dexie carries v1-v4 tables
    // forward, so only the new store is declared here. payloadHash is indexed
    // to catch a re-scan of the same badge before it reaches the server.
    this.version(5).stores({
      pendingBadgeScans: 'id, eventId, entity, createdAt'
    });
```

- [ ] **Step 6: Write the failing sync test**

Create `src/utils/__tests__/syncManager.badge.test.ts`, modelled on the existing `syncManager.booth.test.ts` (read it and match its mocking of `offlineDb` and `networkMonitor`):

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../badgeApi', () => ({
  badgeApi: { createScan: vi.fn(async () => ({ id: 'server-1' })) },
}));

import { syncManager } from '../syncManager';
import { badgeApi } from '../badgeApi';

describe('syncManager — badgeScan entity', () => {
  beforeEach(() => vi.clearAllMocks());

  it('replays a queued scan through badgeApi and returns the server id', async () => {
    const remoteId = await (syncManager as any).syncBadgeScan({
      id: 'queue-1',
      localId: 'local-1',
      data: {
        eventId: 'ev-1', entity: 'Haute Brands', rawPayload: 'RAW',
        parserVersion: 'v1', parseConfidence: 0.9, fields: [], contact: {},
        scannedAt: '2026-09-16T14:00:00.000Z',
      },
      idempotencyKey: 'idem-1',
    });
    expect(remoteId).toBe('server-1');
  });

  it('sends the queue idempotency key as clientScanId so a replay is not a duplicate', async () => {
    // Without this, a flaky connection that retries the same queued item
    // creates a second lead for the same badge.
    await (syncManager as any).syncBadgeScan({
      id: 'queue-1', localId: 'local-1', idempotencyKey: 'idem-1',
      data: { eventId: 'ev-1', entity: 'Haute Brands', rawPayload: 'RAW' },
    });
    expect(badgeApi.createScan).toHaveBeenCalledWith(
      expect.objectContaining({ clientScanId: 'idem-1' })
    );
  });
});
```

- [ ] **Step 7: Wire the sync entity**

In `src/utils/syncManager.ts`:

Add the import:

```typescript
import { badgeApi } from './badgeApi';
```

Widen the `queueAction` entity union:

```typescript
    entity: 'expense' | 'user' | 'event' | 'booth_movement' | 'booth_photo' | 'badgeScan',
```

Add the case to the `syncItem` switch, beside `booth_photo`:

```typescript
        case 'badgeScan':
          remoteId = await this.syncBadgeScan(item);
          break;
```

And the method itself, beside the other `sync*` methods:

```typescript
  /**
   * Replay a badge scan captured at the booth. The queue's idempotencyKey
   * doubles as client_scan_id so a retried item returns the existing lead
   * instead of creating a second one.
   */
  private async syncBadgeScan(item: SyncQueueItem): Promise<string> {
    const scan = await badgeApi.createScan({
      ...item.data,
      clientScanId: item.idempotencyKey,
    });
    return scan.id;
  }
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run src/utils/__tests__/syncManager.badge.test.ts src/utils/__tests__/badgeApi.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 9: Commit**

```bash
git add src/utils/badgeApi.ts src/utils/offlineDb.ts src/utils/syncManager.ts src/utils/__tests__/badgeApi.test.ts src/utils/__tests__/syncManager.badge.test.ts
git commit -m "feat(badge-scans): frontend api client, offline queue, sync entity"
```

---

### Task 11: The decoder hook

**Files:**
- Modify: `package.json` (add the `zxing-wasm` dependency)
- Create: `src/components/leads/hooks/useBadgeDecoder.ts`
- Create: `src/components/leads/__tests__/useBadgeDecoder.test.tsx`

**Interfaces:**
- Consumes: `zxing-wasm` (new)
- Produces:
  - `type DecoderState = 'idle' | 'loading' | 'ready' | 'scanning' | 'denied' | 'unsupported' | 'error'`
  - `useBadgeDecoder({ onDecode }: { onDecode: (payload: string) => void }): { state, error, videoRef, start, stop, torchAvailable, torchOn, toggleTorch }`

- [ ] **Step 1: Install and verify the decoder API**

Run: `npm install zxing-wasm`

Then confirm the export shape before writing code against it:

```bash
node -e "import('zxing-wasm/reader').then(m => console.log(Object.keys(m)))"
```

Expected: a list including `readBarcodes`. If the export name or module path
differs in the installed version, use what this command prints — do not guess,
and adjust the import in Step 3 accordingly.

- [ ] **Step 2: Write the failing hook test**

Create `src/components/leads/__tests__/useBadgeDecoder.test.tsx`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const readBarcodes = vi.fn(async () => []);
vi.mock('zxing-wasm/reader', () => ({ readBarcodes }));

import { useBadgeDecoder } from '../hooks/useBadgeDecoder';

function mockCamera(overrides: Partial<MediaTrackCapabilities> = {}) {
  const track = {
    stop: vi.fn(),
    getCapabilities: () => ({ torch: true, ...overrides }),
    applyConstraints: vi.fn(async () => {}),
  };
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
  (navigator as any).mediaDevices = { getUserMedia: vi.fn(async () => stream) };
  return { track, stream };
}

describe('useBadgeDecoder', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reports denied — not a generic error — when the user refuses the camera', async () => {
    // These need different UI: denied tells the user how to re-grant
    // permission, error offers a retry.
    (navigator as any).mediaDevices = {
      getUserMedia: vi.fn(async () => {
        const err: any = new Error('Permission denied');
        err.name = 'NotAllowedError';
        throw err;
      }),
    };
    const { result } = renderHook(() => useBadgeDecoder({ onDecode: vi.fn() }));
    await act(async () => { await result.current.start(); });
    await waitFor(() => expect(result.current.state).toBe('denied'));
  });

  it('reports unsupported when the browser has no camera API at all', async () => {
    delete (navigator as any).mediaDevices;
    const { result } = renderHook(() => useBadgeDecoder({ onDecode: vi.fn() }));
    await act(async () => { await result.current.start(); });
    await waitFor(() => expect(result.current.state).toBe('unsupported'));
  });

  it('asks for the rear camera, because badges are scanned away from the user', async () => {
    mockCamera();
    const { result } = renderHook(() => useBadgeDecoder({ onDecode: vi.fn() }));
    await act(async () => { await result.current.start(); });
    const constraints = vi.mocked((navigator as any).mediaDevices.getUserMedia).mock.calls[0][0];
    expect(JSON.stringify(constraints)).toContain('environment');
  });

  it('only decodes PDF417, so a stray QR code on the badge cannot win', async () => {
    mockCamera();
    const { result } = renderHook(() => useBadgeDecoder({ onDecode: vi.fn() }));
    await act(async () => { await result.current.start(); });
    await waitFor(() => expect(readBarcodes).toHaveBeenCalled());
    expect(readBarcodes.mock.calls[0][1]).toMatchObject({ formats: ['PDF417'] });
  });

  it('hands the decoded payload to onDecode exactly once per lock', async () => {
    mockCamera();
    readBarcodes.mockResolvedValue([{ text: 'RAW|PAYLOAD', format: 'PDF417', isValid: true }] as any);
    const onDecode = vi.fn();
    const { result } = renderHook(() => useBadgeDecoder({ onDecode }));
    await act(async () => { await result.current.start(); });
    await waitFor(() => expect(onDecode).toHaveBeenCalledWith('RAW|PAYLOAD'));
    expect(onDecode).toHaveBeenCalledTimes(1);
  });

  it('releases the camera on stop so the phone LED goes out', async () => {
    const { track } = mockCamera();
    const { result } = renderHook(() => useBadgeDecoder({ onDecode: vi.fn() }));
    await act(async () => { await result.current.start(); });
    act(() => { result.current.stop(); });
    expect(track.stop).toHaveBeenCalled();
  });

  it('exposes torch only when the device actually supports it', async () => {
    mockCamera({ torch: undefined } as any);
    const { result } = renderHook(() => useBadgeDecoder({ onDecode: vi.fn() }));
    await act(async () => { await result.current.start(); });
    await waitFor(() => expect(result.current.torchAvailable).toBe(false));
  });
});
```

- [ ] **Step 3: Write the hook**

Create `src/components/leads/hooks/useBadgeDecoder.ts`:

```typescript
/**
 * Camera + PDF417 decode loop.
 *
 * Decoding happens on-device via zxing-wasm, so a scan needs no network and
 * costs nothing per badge. The loop is throttled rather than run per frame:
 * a phone held at a booth for an hour must not cook itself.
 *
 * Only PDF417 is requested. Badges often carry a second symbology, and
 * locking onto a QR code that encodes a URL would look like success while
 * producing no contact at all.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export type DecoderState =
  | 'idle' | 'loading' | 'ready' | 'scanning' | 'denied' | 'unsupported' | 'error';

const DECODE_INTERVAL_MS = 125; // ~8fps

interface UseBadgeDecoderArgs {
  onDecode: (payload: string) => void;
}

export function useBadgeDecoder({ onDecode }: UseBadgeDecoderArgs) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lockedRef = useRef(false);

  const [state, setState] = useState<DecoderState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  const stop = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    lockedRef.current = false;
    setTorchOn(false);
    setState('idle');
  }, []);

  const tick = useCallback(async () => {
    if (lockedRef.current) return;
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;

    if (!canvasRef.current) canvasRef.current = document.createElement('canvas');
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    try {
      const { readBarcodes } = await import('zxing-wasm/reader');
      const results = await readBarcodes(
        ctx.getImageData(0, 0, canvas.width, canvas.height),
        { formats: ['PDF417'], tryHarder: true }
      );
      const hit = results.find((r: any) => r?.text);
      if (hit && !lockedRef.current) {
        // Latch immediately: the interval can fire again while this await
        // resolves, and a double-fire would create two leads for one badge.
        lockedRef.current = true;
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        onDecode(hit.text);
      }
    } catch {
      // A single bad frame is not a failure; the next tick tries again.
    }
  }, [onDecode]);

  const start = useCallback(async () => {
    setError(null);
    lockedRef.current = false;

    if (!navigator.mediaDevices?.getUserMedia) {
      setState('unsupported');
      setError('This browser cannot open the camera. Use manual entry.');
      return;
    }

    setState('loading');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }

      const track = stream.getVideoTracks()[0];
      const capabilities = track?.getCapabilities?.() as MediaTrackCapabilities | undefined;
      setTorchAvailable(Boolean(capabilities && 'torch' in capabilities && (capabilities as any).torch));

      setState('scanning');
      timerRef.current = setInterval(() => { void tick(); }, DECODE_INTERVAL_MS);
      void tick();
    } catch (err) {
      const name = (err as Error & { name?: string }).name;
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setState('denied');
        setError('Camera access was blocked. Allow it in your browser settings, or use manual entry.');
      } else {
        setState('error');
        setError((err as Error).message || 'Could not start the camera');
      }
    }
  }, [tick]);

  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next }] } as any);
      setTorchOn(next);
    } catch {
      setTorchAvailable(false); // the device lied about supporting it
    }
  }, [torchOn]);

  // Releasing the camera on unmount is not optional: the phone's camera LED
  // stays lit otherwise, and users read that as the app spying on them.
  useEffect(() => stop, [stop]);

  return { state, error, videoRef, start, stop, torchAvailable, torchOn, toggleTorch };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/leads/__tests__/useBadgeDecoder.test.tsx`
Expected: PASS (7 tests)

If `renderHook` is not available, check which testing-library packages the repo
already has (`src/test/setup.ts` and existing component tests) and follow those
rather than installing a new one.

- [ ] **Step 5: Keep the WASM out of the main bundle**

In `vite.config.ts`, add `zxing-wasm` to the `manualChunks` map beside the
existing entries, so it caches independently of app releases:

```javascript
          barcode: ['zxing-wasm'],
```

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vite.config.ts src/components/leads/hooks/useBadgeDecoder.ts src/components/leads/__tests__/useBadgeDecoder.test.tsx
git commit -m "feat(badge-scans): on-device PDF417 decoder hook"
```

---

### Task 12: The scanner modal

**Files:**
- Create: `src/components/leads/BadgeScanner.tsx`
- Create: `src/components/leads/__tests__/BadgeScanner.test.tsx`

**Interfaces:**
- Consumes: `useBadgeDecoder` (Task 11), `parseBadgePayload` (Task 9), `haptics` (existing `src/utils/haptics`)
- Produces:
  - `interface ScannedBadge { rawPayload: string; parsed: ParsedBadge }`
  - `<BadgeScanner entity={string} onCaptured={(b: ScannedBadge) => void} onManualEntry={() => void} onClose={() => void} />`

- [ ] **Step 1: Write the failing component test**

Create `src/components/leads/__tests__/BadgeScanner.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const decoder = {
  state: 'scanning' as string,
  error: null as string | null,
  videoRef: { current: null },
  start: vi.fn(async () => {}),
  stop: vi.fn(),
  torchAvailable: true,
  torchOn: false,
  toggleTorch: vi.fn(),
};
let capturedOnDecode: ((p: string) => void) | null = null;

vi.mock('../hooks/useBadgeDecoder', () => ({
  useBadgeDecoder: ({ onDecode }: any) => { capturedOnDecode = onDecode; return decoder; },
}));

import { BadgeScanner } from '../BadgeScanner';

const setup = (props: any = {}) =>
  render(
    <BadgeScanner
      entity="Haute Brands"
      onCaptured={props.onCaptured ?? vi.fn()}
      onManualEntry={props.onManualEntry ?? vi.fn()}
      onClose={props.onClose ?? vi.fn()}
    />
  );

describe('BadgeScanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    decoder.state = 'scanning';
    decoder.error = null;
    decoder.torchAvailable = true;
  });

  it('keeps the active company visible so a rep never guesses where leads went', () => {
    setup();
    expect(screen.getByText(/Haute Brands/)).toBeInTheDocument();
  });

  it('passes the decoded payload up, already parsed', () => {
    const onCaptured = vi.fn();
    setup({ onCaptured });
    capturedOnDecode!('124649-907|Shamsher|Jessani|sjessani@aol.com');
    expect(onCaptured).toHaveBeenCalledWith(
      expect.objectContaining({
        rawPayload: '124649-907|Shamsher|Jessani|sjessani@aol.com',
        parsed: expect.objectContaining({
          fields: expect.objectContaining({ email: 'sjessani@aol.com' }),
        }),
      })
    );
  });

  it('offers manual entry when the camera is denied instead of dead-ending', () => {
    decoder.state = 'denied';
    decoder.error = 'Camera access was blocked.';
    const onManualEntry = vi.fn();
    setup({ onManualEntry });
    fireEvent.click(screen.getByRole('button', { name: /enter manually/i }));
    expect(onManualEntry).toHaveBeenCalled();
  });

  it('shows the camera error text rather than a blank frame', () => {
    decoder.state = 'denied';
    decoder.error = 'Camera access was blocked.';
    setup();
    expect(screen.getByRole('alert')).toHaveTextContent('Camera access was blocked.');
  });

  it('hides the torch control on devices that do not support it', () => {
    decoder.torchAvailable = false;
    setup();
    expect(screen.queryByRole('button', { name: /torch/i })).not.toBeInTheDocument();
  });

  it('stops the camera when closed', () => {
    const onClose = vi.fn();
    setup({ onClose });
    fireEvent.click(screen.getByRole('button', { name: /close scanner/i }));
    expect(decoder.stop).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/leads/__tests__/BadgeScanner.test.tsx`
Expected: FAIL — "Failed to resolve import ... ../BadgeScanner"

- [ ] **Step 3: Write the component**

Create `src/components/leads/BadgeScanner.tsx`:

```typescript
/**
 * Fullscreen badge viewfinder.
 *
 * The active company is pinned to the top of the frame on purpose: a rep
 * working two brands at one booth must never have to wonder which CRM the
 * last twenty leads went to.
 */

import React, { useEffect } from 'react';
import { X, Zap, ZapOff, Keyboard } from 'lucide-react';
import { useBadgeDecoder } from './hooks/useBadgeDecoder';
import { parseBadgePayload, ParsedBadge } from '../../utils/badge/parseBadgePayload';
import { haptics } from '../../utils/haptics';

export interface ScannedBadge {
  rawPayload: string;
  parsed: ParsedBadge;
}

interface BadgeScannerProps {
  entity: string;
  onCaptured: (badge: ScannedBadge) => void;
  onManualEntry: () => void;
  onClose: () => void;
}

export const BadgeScanner: React.FC<BadgeScannerProps> = ({
  entity, onCaptured, onManualEntry, onClose,
}) => {
  const { state, error, videoRef, start, stop, torchAvailable, torchOn, toggleTorch } =
    useBadgeDecoder({
      onDecode: (rawPayload) => {
        haptics.action();
        onCaptured({ rawPayload, parsed: parseBadgePayload(rawPayload) });
      },
    });

  useEffect(() => { void start(); }, [start]);

  const handleClose = () => { stop(); onClose(); };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between gap-2 p-4 text-white">
        <span className="rounded-full bg-white/15 px-3 py-1 text-sm">
          Scanning for - <strong>{entity}</strong>
        </span>
        <button
          onClick={handleClose}
          aria-label="Close scanner"
          className="rounded-full bg-white/15 p-2 focus-visible:ring-2 focus-visible:ring-white"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
        {/* A visible target box: PDF417 is wide and short, and users otherwise
            frame it like a QR code and never get a lock. */}
        <div className="pointer-events-none absolute inset-x-8 top-1/2 h-32 -translate-y-1/2 rounded-lg border-2 border-white/70" />
      </div>

      {(state === 'denied' || state === 'unsupported' || state === 'error') && (
        <div className="bg-red-900/90 p-4 text-sm text-white" role="alert">
          {error}
        </div>
      )}

      <div className="flex items-center justify-center gap-3 p-6">
        {torchAvailable && (
          <button
            onClick={toggleTorch}
            aria-label={torchOn ? 'Turn torch off' : 'Turn torch on'}
            className="flex items-center gap-2 rounded-full bg-white/15 px-4 py-3 text-white"
          >
            {torchOn ? <ZapOff className="h-5 w-5" /> : <Zap className="h-5 w-5" />}
            Torch
          </button>
        )}
        <button
          onClick={() => { stop(); onManualEntry(); }}
          className="flex items-center gap-2 rounded-full bg-white/15 px-4 py-3 text-white"
        >
          <Keyboard className="h-5 w-5" />
          Enter manually
        </button>
      </div>
    </div>
  );
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/leads/__tests__/BadgeScanner.test.tsx`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/leads/BadgeScanner.tsx src/components/leads/__tests__/BadgeScanner.test.tsx
git commit -m "feat(badge-scans): fullscreen badge scanner"
```

---

### Task 13: The review sheet

**Files:**
- Create: `src/components/leads/ScanReviewSheet.tsx`
- Create: `src/components/leads/__tests__/ScanReviewSheet.test.tsx`

**Interfaces:**
- Consumes: `ScannedBadge` (Task 12), `REVIEW_CONFIDENCE_THRESHOLD` and `BadgeField` (Task 9), `BadgeScanRecord` (Task 10)
- Produces: `<ScanReviewSheet entity badge duplicateOf onSave={(contact, notes, andScanNext) => void} onCancel />`

- [ ] **Step 1: Write the failing component test**

Create `src/components/leads/__tests__/ScanReviewSheet.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ScanReviewSheet } from '../ScanReviewSheet';
import { parseBadgePayload } from '../../../utils/badge/parseBadgePayload';

const FULL = '124649-907|Shamsher|Jessani|Virginia Trade Association|Glen Allen|VA|23059-8006|United States|President|Mr.|sjessani@aol.com';
const badge = (raw: string) => ({ rawPayload: raw, parsed: parseBadgePayload(raw) });

const setup = (props: any = {}) =>
  render(
    <ScanReviewSheet
      entity="Haute Brands"
      badge={props.badge ?? badge(FULL)}
      duplicateOf={props.duplicateOf ?? null}
      onSave={props.onSave ?? vi.fn()}
      onCancel={props.onCancel ?? vi.fn()}
    />
  );

describe('ScanReviewSheet', () => {
  it('pre-fills the decoded contact so the rep confirms rather than types', () => {
    setup();
    expect(screen.getByLabelText('First name')).toHaveValue('Shamsher');
    expect(screen.getByLabelText('Email')).toHaveValue('sjessani@aol.com');
  });

  it('warns on a low-confidence decode instead of presenting a guess as fact', () => {
    setup({ badge: badge('Shamsher|Jessani') });
    expect(screen.getByText(/check these fields/i)).toBeInTheDocument();
  });

  it('stays quiet on a confident decode', () => {
    setup();
    expect(screen.queryByText(/check these fields/i)).not.toBeInTheDocument();
  });

  it('surfaces an already-scanned badge rather than silently making a twin', () => {
    setup({
      duplicateOf: {
        id: 'old', first_name: 'Shamsher', last_name: 'Jessani',
        scanned_at: '2026-09-16T13:40:00Z',
      },
    });
    expect(screen.getByText(/already scanned/i)).toBeInTheDocument();
  });

  it('saves the rep edits, not the original decode', () => {
    const onSave = vi.fn();
    setup({ onSave });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'fixed@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'fixed@example.com' }), '', false
    );
  });

  it('offers save-and-scan-next, which is the whole speed story at a booth', () => {
    const onSave = vi.fn();
    setup({ onSave });
    fireEvent.click(screen.getByRole('button', { name: /save & scan next/i }));
    expect(onSave).toHaveBeenCalledWith(expect.any(Object), '', true);
  });

  it('still saves a badge that parsed to nothing, because raw_payload is kept', () => {
    const onSave = vi.fn();
    setup({ badge: badge('   '), onSave });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/leads/__tests__/ScanReviewSheet.test.tsx`
Expected: FAIL — "Failed to resolve import ... ../ScanReviewSheet"

- [ ] **Step 3: Write the component**

Create `src/components/leads/ScanReviewSheet.tsx`:

```typescript
/**
 * Post-scan review.
 *
 * Below the confidence threshold the fields are presented as corrections to
 * make, not facts to accept. This is also where the badge-identity problem
 * gets handled: the one confirmed sample decoded to a different person than
 * the name printed on the badge, so the rep must always be able to fix the
 * record while that person is still standing in front of them.
 */

import React, { useState } from 'react';
import { AlertTriangle, Copy } from 'lucide-react';
import { ScannedBadge } from './BadgeScanner';
import { REVIEW_CONFIDENCE_THRESHOLD, BadgeField } from '../../utils/badge/parseBadgePayload';
import { BadgeScanRecord } from '../../utils/badgeApi';

const EDITABLE_FIELDS: Array<{ key: BadgeField; label: string }> = [
  { key: 'first_name', label: 'First name' },
  { key: 'last_name', label: 'Last name' },
  { key: 'company', label: 'Organization' },
  { key: 'title', label: 'Title' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'postal_code', label: 'ZIP' },
  { key: 'country', label: 'Country' },
  { key: 'badge_id', label: 'Badge ID' },
  { key: 'attendee_type', label: 'Attendee type' },
];

interface ScanReviewSheetProps {
  entity: string;
  badge: ScannedBadge | null;
  duplicateOf: BadgeScanRecord | null;
  onSave: (contact: Record<string, string>, notes: string, andScanNext: boolean) => void;
  onCancel: () => void;
}

export const ScanReviewSheet: React.FC<ScanReviewSheetProps> = ({
  entity, badge, duplicateOf, onSave, onCancel,
}) => {
  const [contact, setContact] = useState<Record<string, string>>(
    () => ({ ...(badge?.parsed.fields ?? {}) } as Record<string, string>)
  );
  const [notes, setNotes] = useState('');

  if (!badge) return null;

  const lowConfidence = badge.parsed.confidence < REVIEW_CONFIDENCE_THRESHOLD;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
      <div className="max-h-[90vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 sm:max-w-lg sm:rounded-2xl">
        <p className="text-sm text-stone-500">
          Lead for <strong>{entity}</strong>
        </p>

        {duplicateOf && (
          <div className="mt-3 flex gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            <Copy className="h-4 w-4 shrink-0" />
            <span>
              Already scanned - {duplicateOf.first_name} {duplicateOf.last_name}. Saving
              updates that lead instead of creating a second one.
            </span>
          </div>
        )}

        {lowConfidence && (
          <div className="mt-3 flex gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900" role="status">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>Low-confidence decode - check these fields before saving.</span>
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {EDITABLE_FIELDS.map(({ key, label }) => (
            <label key={key} className="text-sm">
              <span className="mb-1 block text-stone-600">{label}</span>
              <input
                aria-label={label}
                value={contact[key] ?? ''}
                onChange={(e) => setContact((c) => ({ ...c, [key]: e.target.value }))}
                className="w-full rounded-lg border border-stone-300 px-3 py-2"
              />
            </label>
          ))}
        </div>

        <label className="mt-3 block text-sm">
          <span className="mb-1 block text-stone-600">Notes</span>
          <textarea
            aria-label="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-stone-300 px-3 py-2"
          />
        </label>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            onClick={() => onSave(contact, notes, true)}
            className="flex-1 rounded-lg bg-brand-600 px-4 py-3 font-medium text-white"
          >
            Save &amp; scan next
          </button>
          <button
            onClick={() => onSave(contact, notes, false)}
            className="rounded-lg border border-stone-300 px-4 py-3"
          >
            Save
          </button>
          <button onClick={onCancel} className="rounded-lg px-4 py-3 text-stone-600">
            Discard
          </button>
        </div>
      </div>
    </div>
  );
};
```

If `bg-brand-600` is not defined in `tailwind.config.js`, use whichever brand
shade the rest of the app uses - check `Sidebar.tsx` for the real token.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/leads/__tests__/ScanReviewSheet.test.tsx`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/leads/ScanReviewSheet.tsx src/components/leads/__tests__/ScanReviewSheet.test.tsx
git commit -m "feat(badge-scans): post-scan review sheet"
```

---

### Task 14: The Leads page

**Files:**
- Create: `src/components/leads/hooks/useBadgeScans.ts`
- Create: `src/components/leads/LeadList.tsx`
- Create: `src/components/leads/LeadsPage.tsx`
- Create: `src/components/leads/__tests__/LeadsPage.test.tsx`

**Interfaces:**
- Consumes: `badgeApi` (Task 10), `BadgeScanner` + `ScannedBadge` (Task 12), `ScanReviewSheet` (Task 13), `usePicklists` (existing `src/contexts/PicklistContext`), `syncManager` (Task 10)
- Produces:
  - `useBadgeScans(eventId: string | null, entity: string | null): { scans, loading, error, reload, saveScan }`
  - `<LeadList scans={BadgeScanRecord[]} onSelect={(s) => void} />`
  - `<LeadsPage user={User} />` (default-exported shape matching the other lazy views in `App.tsx`)

- [ ] **Step 1: Write the failing page test**

Create `src/components/leads/__tests__/LeadsPage.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../../utils/badgeApi', () => ({
  badgeApi: {
    listScans: vi.fn(async () => []),
    createScan: vi.fn(async () => ({ id: 'scan-1' })),
    updateScan: vi.fn(async () => ({ id: 'scan-1' })),
    exportUrl: (eventId: string, format: string) => `/badge-scans/export?eventId=${eventId}&format=${format}`,
  },
}));
vi.mock('../../../contexts/PicklistContext', () => ({
  usePicklists: () => ({
    companies: [
      { name: 'Haute Brands', zohoEnabled: true, sortOrder: 1 },
      { name: 'Summitt Labs', zohoEnabled: false, sortOrder: 2 },
    ],
    isUnavailable: false,
  }),
}));
vi.mock('../../../utils/api', () => ({
  api: { getEvents: vi.fn(async () => [{ id: 'ev-1', name: 'NACS Show 2026', status: 'active' }]) },
}));
vi.mock('../BadgeScanner', () => ({
  BadgeScanner: ({ entity }: any) => <div data-testid="scanner">scanning for {entity}</div>,
}));

import { LeadsPage } from '../LeadsPage';

const user = { id: 'u1', name: 'Rep', username: 'rep', email: 'r@x.com', role: 'salesperson' } as any;

describe('LeadsPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('will not start a scan until a company is chosen', async () => {
    // An unnoticed default sends leads to the wrong CRM, which is a failure
    // you only discover after the show.
    render(<LeadsPage user={user} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /scan badge/i })).toBeDisabled());
  });

  it('enables scanning once an event and a company are selected', async () => {
    render(<LeadsPage user={user} />);
    await waitFor(() => screen.getByLabelText(/company/i));
    fireEvent.change(screen.getByLabelText(/event/i), { target: { value: 'ev-1' } });
    fireEvent.change(screen.getByLabelText(/company/i), { target: { value: 'Haute Brands' } });
    await waitFor(() => expect(screen.getByRole('button', { name: /scan badge/i })).toBeEnabled());
  });

  it('opens the scanner carrying the chosen company', async () => {
    render(<LeadsPage user={user} />);
    await waitFor(() => screen.getByLabelText(/company/i));
    fireEvent.change(screen.getByLabelText(/event/i), { target: { value: 'ev-1' } });
    fireEvent.change(screen.getByLabelText(/company/i), { target: { value: 'Haute Brands' } });
    fireEvent.click(screen.getByRole('button', { name: /scan badge/i }));
    expect(screen.getByTestId('scanner')).toHaveTextContent('Haute Brands');
  });

  it('warns that a non-Zoho company still captures leads but will not sync', async () => {
    render(<LeadsPage user={user} />);
    await waitFor(() => screen.getByLabelText(/company/i));
    fireEvent.change(screen.getByLabelText(/event/i), { target: { value: 'ev-1' } });
    fireEvent.change(screen.getByLabelText(/company/i), { target: { value: 'Summitt Labs' } });
    expect(screen.getByText(/will not sync to zoho crm/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/leads/__tests__/LeadsPage.test.tsx`
Expected: FAIL — "Failed to resolve import ... ../LeadsPage"

- [ ] **Step 3: Write the data hook**

Create `src/components/leads/hooks/useBadgeScans.ts`:

```typescript
/**
 * Lead list state for one event + company.
 *
 * Saves go through syncManager rather than badgeApi directly, so a scan taken
 * on dying booth wifi lands in the offline queue instead of erroring in the
 * rep's face. The optimistic row keeps the list honest in the meantime.
 */

import { useCallback, useEffect, useState } from 'react';
import { badgeApi, BadgeScanRecord, CreateScanPayload } from '../../../utils/badgeApi';
import { syncManager } from '../../../utils/syncManager';
import { networkMonitor } from '../../../utils/networkDetection';
import { generateUUID } from '../../../utils/uuid';

export function useBadgeScans(eventId: string | null, entity: string | null) {
  const [scans, setScans] = useState<BadgeScanRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!eventId) { setScans([]); return; }
    setLoading(true);
    setError(null);
    try {
      setScans(await badgeApi.listScans({ eventId, entity: entity || undefined }));
    } catch (err) {
      setError((err as Error).message || 'Could not load leads');
    } finally {
      setLoading(false);
    }
  }, [eventId, entity]);

  useEffect(() => { void reload(); }, [reload]);

  const saveScan = useCallback(async (input: Omit<CreateScanPayload, 'eventId' | 'entity'>) => {
    if (!eventId || !entity) return;
    const payload: CreateScanPayload = { ...input, eventId, entity };

    if (!networkMonitor.isOnline()) {
      await syncManager.queueAction('CREATE', 'badgeScan', payload, generateUUID());
      // Show it immediately; the real row arrives on the next reload after sync.
      setScans((prev) => [
        {
          id: `pending-${generateUUID()}`,
          event_id: eventId,
          entity,
          crm_status: 'pending',
          scanned_at: payload.scannedAt ?? new Date().toISOString(),
          ...(payload.contact ?? {}),
        } as BadgeScanRecord,
        ...prev,
      ]);
      return;
    }

    try {
      const saved = await badgeApi.createScan({ ...payload, clientScanId: generateUUID() });
      setScans((prev) => [saved, ...prev.filter((s) => s.id !== saved.id)]);
    } catch (err) {
      // A failed POST must never cost the lead — fall back to the queue.
      await syncManager.queueAction('CREATE', 'badgeScan', payload, generateUUID());
      setError('Saved offline — it will sync when the connection returns.');
    }
  }, [eventId, entity]);

  return { scans, loading, error, reload, saveScan };
}
```

Check the real export names in `src/utils/uuid.ts` and
`src/utils/networkDetection.ts` before writing the imports; use what is there.

- [ ] **Step 4: Write the list**

Create `src/components/leads/LeadList.tsx`:

```typescript
/**
 * The scanned-lead list. CRM status is shown per row because a 'failed' or
 * 'skipped' lead that looks identical to a synced one is how a show's leads
 * quietly go missing.
 */

import React from 'react';
import { BadgeScanRecord } from '../../utils/badgeApi';

const STATUS_STYLES: Record<BadgeScanRecord['crm_status'], string> = {
  synced: 'bg-green-100 text-green-800',
  pending: 'bg-stone-100 text-stone-700',
  failed: 'bg-red-100 text-red-800',
  skipped: 'bg-amber-100 text-amber-900',
};

const STATUS_LABELS: Record<BadgeScanRecord['crm_status'], string> = {
  synced: 'In CRM',
  pending: 'Queued',
  failed: 'CRM failed',
  skipped: 'Not synced',
};

interface LeadListProps {
  scans: BadgeScanRecord[];
  onSelect: (scan: BadgeScanRecord) => void;
}

export const LeadList: React.FC<LeadListProps> = ({ scans, onSelect }) => {
  if (scans.length === 0) {
    return <p className="py-10 text-center text-stone-500">No leads scanned yet.</p>;
  }

  return (
    <ul className="divide-y divide-stone-200">
      {scans.map((scan) => (
        <li key={scan.id}>
          <button
            onClick={() => onSelect(scan)}
            className="flex w-full items-center justify-between gap-3 py-3 text-left"
          >
            <span className="min-w-0">
              <span className="block truncate font-medium text-stone-900">
                {[scan.first_name, scan.last_name].filter(Boolean).join(' ') || 'Unnamed lead'}
              </span>
              <span className="block truncate text-sm text-stone-500">
                {scan.company || scan.email || 'No organization decoded'}
              </span>
              <span className="block text-xs text-stone-400">{scan.entity}</span>
            </span>
            <span className={`shrink-0 rounded-full px-2 py-1 text-xs ${STATUS_STYLES[scan.crm_status]}`}>
              {STATUS_LABELS[scan.crm_status]}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
};
```

- [ ] **Step 5: Write the page**

Create `src/components/leads/LeadsPage.tsx`:

```typescript
/**
 * Leads - badge scanning and the captured lead list for one show.
 *
 * The company selector is required before scanning and is never silently
 * defaulted: it decides which Zoho CRM receives every lead in the session,
 * and a wrong default is discovered only after the show.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { ScanLine, Download } from 'lucide-react';
import { User } from '../../App';
import { api } from '../../utils/api';
import { badgeApi, BadgeScanRecord } from '../../utils/badgeApi';
import { usePicklists } from '../../contexts/PicklistContext';
import { BadgeScanner, ScannedBadge } from './BadgeScanner';
import { ScanReviewSheet } from './ScanReviewSheet';
import { LeadList } from './LeadList';
import { useBadgeScans } from './hooks/useBadgeScans';

const LAST_COMPANY_KEY = 'argo.leads.lastCompany';

export const LeadsPage: React.FC<{ user: User }> = ({ user }) => {
  const { companies } = usePicklists();
  const [events, setEvents] = useState<Array<{ id: string; name: string }>>([]);
  const [eventId, setEventId] = useState('');
  const [entity, setEntity] = useState('');
  const [scanning, setScanning] = useState(false);
  const [pendingBadge, setPendingBadge] = useState<ScannedBadge | null>(null);
  const [selected, setSelected] = useState<BadgeScanRecord | null>(null);

  const { scans, error, reload, saveScan } = useBadgeScans(eventId || null, entity || null);

  useEffect(() => {
    void api.getEvents().then((list: any[]) => setEvents(list ?? []));
  }, []);

  // Pre-select the last company used, but only as a highlight in the dropdown
  // the rep still has to confirm - never as an applied default.
  const lastUsed = useMemo(() => {
    try { return localStorage.getItem(`${LAST_COMPANY_KEY}.${eventId}`) ?? ''; } catch { return ''; }
  }, [eventId]);

  const selectedCompany = companies.find((c) => c.name === entity);
  const canScan = Boolean(eventId && entity);

  const handleSave = async (contact: Record<string, string>, notes: string, andScanNext: boolean) => {
    if (!pendingBadge) return;
    await saveScan({
      rawPayload: pendingBadge.rawPayload,
      parserVersion: pendingBadge.parsed.parserVersion,
      parseConfidence: pendingBadge.parsed.confidence,
      fields: pendingBadge.parsed.tokens,
      contact,
      notes,
      scannedAt: new Date().toISOString(),
    });
    try { localStorage.setItem(`${LAST_COMPANY_KEY}.${eventId}`, entity); } catch { /* private mode */ }
    setPendingBadge(null);
    setScanning(andScanNext);
    if (!andScanNext) void reload();
  };

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold text-stone-900">Leads</h1>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block text-stone-600">Event</span>
          <select
            aria-label="Event"
            value={eventId}
            onChange={(e) => setEventId(e.target.value)}
            className="w-full rounded-lg border border-stone-300 px-3 py-2"
          >
            <option value="">Select an event</option>
            {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
          </select>
        </label>

        <label className="text-sm">
          <span className="mb-1 block text-stone-600">Company you are representing</span>
          <select
            aria-label="Company"
            value={entity}
            onChange={(e) => setEntity(e.target.value)}
            className="w-full rounded-lg border border-stone-300 px-3 py-2"
          >
            <option value="">Select a company</option>
            {companies.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}{c.name === lastUsed ? ' (last used)' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>

      {selectedCompany && !selectedCompany.zohoEnabled && (
        <p className="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          Leads for {selectedCompany.name} are captured and exportable, but will not sync to
          Zoho CRM - no CRM is configured for this company.
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <button
          onClick={() => setScanning(true)}
          disabled={!canScan}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-3 font-medium text-white disabled:opacity-40"
        >
          <ScanLine className="h-5 w-5" />
          Scan badge
        </button>
        <a
          href={eventId ? badgeApi.exportUrl(eventId, 'xlsx') : undefined}
          aria-disabled={!eventId}
          className="flex items-center gap-2 rounded-lg border border-stone-300 px-4 py-3"
        >
          <Download className="h-5 w-5" />
          Export
        </a>
      </div>

      {error && <p className="mt-3 text-sm text-amber-800">{error}</p>}

      <div className="mt-4">
        <LeadList scans={scans} onSelect={setSelected} />
      </div>

      {scanning && (
        <BadgeScanner
          entity={entity}
          onCaptured={(badge) => { setScanning(false); setPendingBadge(badge); }}
          onManualEntry={() => {
            setScanning(false);
            setPendingBadge({ rawPayload: '', parsed: { fields: {}, tokens: [], confidence: 0, parserVersion: 'manual' } });
          }}
          onClose={() => setScanning(false)}
        />
      )}

      {pendingBadge && (
        <ScanReviewSheet
          entity={entity}
          badge={pendingBadge}
          duplicateOf={null}
          onSave={handleSave}
          onCancel={() => setPendingBadge(null)}
        />
      )}
    </div>
  );
};
```

Note: manual entry passes an empty `rawPayload`. The backend rejects an empty
payload (Task 4), so before finishing this task, make manual entry send a
sentinel such as `MANUAL_ENTRY` as the raw payload and confirm a manually
entered lead saves end to end.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/components/leads/__tests__/LeadsPage.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 7: Commit**

```bash
git add src/components/leads/
git commit -m "feat(badge-scans): Leads page with required company selection"
```

---

### Task 15: Navigation

**Files:**
- Modify: `src/App.tsx` (lazy import + render branch)
- Modify: `src/components/layout/Sidebar.tsx` (nav item)
- Modify: `src/components/layout/MobileNav.tsx` (fourth tab for floor roles)
- Create: `src/components/layout/__tests__/MobileNav.leads.test.tsx`

**Interfaces:**
- Consumes: `LeadsPage` (Task 14)
- Produces: the `'leads'` page id, reachable from the sidebar and the mobile tab bar

- [ ] **Step 1: Write the failing nav test**

Create `src/components/layout/__tests__/MobileNav.leads.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MobileNav } from '../MobileNav';

const nav = (role: string) =>
  render(
    <MobileNav
      user={{ id: 'u1', name: 'X', username: 'x', email: 'x@y.com', role } as any}
      currentPage="dashboard"
      onNavigate={vi.fn()}
      onQuickAdd={vi.fn()}
      onOpenMenu={vi.fn()}
    />
  );

describe('MobileNav — Leads tab', () => {
  it('gives salespeople a Leads tab: it is what they do at the booth', () => {
    nav('salesperson');
    expect(screen.getByRole('button', { name: /leads/i })).toBeInTheDocument();
  });

  it('gives coordinators the same tab', () => {
    nav('coordinator');
    expect(screen.getByRole('button', { name: /leads/i })).toBeInTheDocument();
  });

  it('leaves accountants on Reports — they never scan badges', () => {
    nav('accountant');
    expect(screen.queryByRole('button', { name: /leads/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reports/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/layout/__tests__/MobileNav.leads.test.tsx`
Expected: FAIL — no button named "Leads"

- [ ] **Step 3: Add the mobile tab**

In `src/components/layout/MobileNav.tsx`, add `ScanLine` to the lucide import,
then add the constant beside `EXPENSE_ROLES` / `REPORT_ROLES`:

```typescript
const LEAD_ROLES = ['admin', 'coordinator', 'salesperson', 'developer'];
```

and change the `fourthTab` selection so floor roles get Leads. Replace the
existing `fourthTab` assignment with:

```typescript
  // Leads is what floor staff actually do all day, so it outranks Checklist
  // for the last tab; Checklist stays reachable from the drawer.
  const fourthTab: TabDef = REPORT_ROLES.includes(user.role)
    ? { id: 'reports', label: 'Reports', icon: BarChart3 }
    : LEAD_ROLES.includes(user.role)
      ? { id: 'leads', label: 'Leads', icon: ScanLine }
      : canSeeExpenses
        ? { id: 'checklist', label: 'Checklist', icon: CheckSquare }
        : { id: 'events', label: 'Events', icon: Calendar };
```

- [ ] **Step 4: Add the sidebar item**

In `src/components/layout/Sidebar.tsx`, add `ScanLine` to the lucide import, add
the nav item beside the others (near line 34):

```typescript
  { id: 'leads', label: 'Leads', icon: ScanLine, roles: ['admin', 'coordinator', 'salesperson', 'developer'] },
```

and add `'leads'` to the Workspace section's id list (near line 46):

```typescript
  { label: 'Workspace', ids: ['events', 'checklist', 'expenses', 'leads', 'booths'] },
```

- [ ] **Step 5: Render the page**

In `src/App.tsx`, add the lazy import beside the others (near line 16):

```typescript
const LeadsPage = lazy(() => import('./components/leads/LeadsPage').then(m => ({ default: m.LeadsPage })));
```

and the render branch beside the `booths` branch:

```typescript
              {currentPage === 'leads' && ['admin', 'coordinator', 'salesperson', 'developer'].includes(user.role) && (
                <LeadsPage user={user} />
              )}
```

Accountants are already redirected away from non-expense pages by
`handlePageChange`; add `'leads'` to its `blockedForAccountant` check so a
stale deep link cannot land them on an empty page:

```typescript
    const blockedForAccountant = page === 'events' || page === 'checklist' || page === 'booths' || page === 'leads';
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/components/layout/__tests__/MobileNav.leads.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx src/components/layout/
git commit -m "feat(badge-scans): Leads navigation"
```

---

### Task 16: Lead detail, manual CRM retry, and duplicate catch

Covers three spec requirements the earlier tasks left open: the `GET /:id` and
`POST /:id/push` endpoints, the lead detail modal, and the scan-time duplicate
warning that `ScanReviewSheet` already accepts a prop for but never receives.

**Files:**
- Modify: `backend/src/services/badge/BadgeScanService.ts` (add `getById`, `requeueForCrm`)
- Modify: `backend/src/database/repositories/BadgeScanRepository.ts` (add `requeue`)
- Modify: `backend/src/routes/badgeScans.ts` (add `handleGetScan`, `handleRetryPush`, routes)
- Modify: `backend/tests/routes/badgeScans.test.ts` (add the retry cases)
- Create: `src/components/leads/LeadDetailModal.tsx`
- Create: `src/components/leads/__tests__/LeadDetailModal.test.tsx`
- Modify: `src/utils/badgeApi.ts` (add `retryPush`)
- Modify: `src/components/leads/LeadsPage.tsx` (render the modal, pass `duplicateOf`)

**Interfaces:**
- Consumes: everything from Tasks 3-5, 10, 13, 14
- Produces:
  - `badgeScanRepository.requeue(id: string): Promise<BadgeScan>`
  - `badgeScanService.getById(id: string): Promise<BadgeScan | null>`
  - `badgeScanService.requeueForCrm(id: string): Promise<BadgeScan>`
  - `badgeApi.retryPush(id: string): Promise<BadgeScanRecord>`
  - `<LeadDetailModal scan onSave onRetry onClose />`

- [ ] **Step 1: Write the failing retry tests**

Append to `backend/tests/routes/badgeScans.test.ts`, and extend that file's
existing `badgeScanService` mock with `getById: vi.fn(async () => ({ id: 'scan-1' }))`
and `requeueForCrm: vi.fn(async (id: string) => ({ id, crm_status: 'pending' }))`:

```typescript
import { handleGetScan, handleRetryPush } from '../../src/routes/badgeScans';

describe('badge scan retry', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requeues a failed scan for another CRM attempt', async () => {
    const res = mockRes();
    await handleRetryPush({ user: { id: 'u1' }, params: { id: 'scan-1' } } as any, res);
    expect(badgeScanService.requeueForCrm).toHaveBeenCalledWith('scan-1');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ crm_status: 'pending' }));
  });

  it('404s on a scan that does not exist rather than returning an empty body', async () => {
    vi.mocked(badgeScanService.getById).mockResolvedValueOnce(null as any);
    const res = mockRes();
    await handleGetScan({ user: { id: 'u1' }, params: { id: 'gone' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && npx vitest run tests/routes/badgeScans.test.ts -t retry`
Expected: FAIL — `handleRetryPush` is not exported.

- [ ] **Step 3: Add the repository and service methods**

In `BadgeScanRepository.ts`, beside `markPushResult`:

```typescript
  /**
   * Hand a scan back to the push worker. Attempts reset to zero: a human
   * asking for a retry usually means the cause was fixed (a token minted, a
   * field mapping corrected), so the old backoff is no longer meaningful.
   */
  async requeue(id: string): Promise<BadgeScan> {
    const result = await this.executeQuery<BadgeScan>(
      `UPDATE badge_scans
          SET crm_status = 'pending', crm_error = NULL, crm_attempts = 0,
              crm_last_attempt_at = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *`,
      [id]
    );
    return result.rows[0];
  }
```

In `BadgeScanService.ts`, beside `update`:

```typescript
  async getById(id: string): Promise<BadgeScan | null> {
    return badgeScanRepository.findById(id);
  }

  /**
   * A 'skipped' scan is never requeued: it has no brand, so there is no CRM
   * to push it to and a retry would spin forever.
   */
  async requeueForCrm(id: string): Promise<BadgeScan> {
    const scan = await badgeScanRepository.findById(id);
    if (!scan) throw new NotFoundError(`Badge scan ${id} not found`);
    if (!scan.brand) {
      throw new ValidationError(
        `"${scan.entity}" has no Zoho CRM configured — this lead cannot be pushed, only exported`
      );
    }
    return badgeScanRepository.requeue(id);
  }
```

Add `NotFoundError` to the existing `utils/errors` import in that file.

- [ ] **Step 4: Add the routes**

In `backend/src/routes/badgeScans.ts`, add the handlers beside the others:

```typescript
export async function handleGetScan(req: AuthRequest, res: Response): Promise<void> {
  const scan = await badgeScanService.getById(req.params.id);
  if (!scan) {
    res.status(404).json({ error: 'Badge scan not found' });
    return;
  }
  res.json(scan);
}

export async function handleRetryPush(req: AuthRequest, res: Response): Promise<void> {
  res.json(await badgeScanService.requeueForCrm(req.params.id));
}
```

and register them — both **after** the `/export` route, so `export` is not
captured as an `:id`:

```typescript
router.get('/:id', authorize(...SCAN_ROLES), asyncHandler(handleGetScan as any));
router.post('/:id/push', authorize(...SCAN_ROLES), asyncHandler(handleRetryPush as any));
```

- [ ] **Step 5: Run the backend tests to verify they pass**

Run: `cd backend && npx vitest run tests/routes/badgeScans.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 6: Write the failing detail-modal test**

Create `src/components/leads/__tests__/LeadDetailModal.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LeadDetailModal } from '../LeadDetailModal';

const scan = (over = {}) => ({
  id: 'scan-1', entity: 'Haute Brands', brand: 'haute_brands',
  first_name: 'Shamsher', last_name: 'Jessani', email: 'sjessani@aol.com',
  company: 'Virginia Trade Association', crm_status: 'synced', crm_error: null,
  raw_payload: 'RAW', notes: null, scanned_at: '2026-09-16T14:00:00Z', ...over,
}) as any;

const setup = (props: any = {}) =>
  render(
    <LeadDetailModal
      scan={props.scan ?? scan()}
      onSave={props.onSave ?? vi.fn()}
      onRetry={props.onRetry ?? vi.fn()}
      onClose={props.onClose ?? vi.fn()}
    />
  );

describe('LeadDetailModal', () => {
  it('shows the CRM failure reason instead of a bare failed badge', () => {
    setup({ scan: scan({ crm_status: 'failed', crm_error: 'MANDATORY_NOT_FOUND: Last Name' }) });
    expect(screen.getByText(/MANDATORY_NOT_FOUND/)).toBeInTheDocument();
  });

  it('offers retry on a failed lead', () => {
    const onRetry = vi.fn();
    setup({ scan: scan({ crm_status: 'failed', crm_error: 'boom' }), onRetry });
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledWith('scan-1');
  });

  it('does not offer retry on a skipped lead, which has nowhere to go', () => {
    setup({ scan: scan({ crm_status: 'skipped', brand: null, crm_error: 'No Zoho CRM configured' }) });
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
  });

  it('saves corrected fields', () => {
    const onSave = vi.fn();
    setup({ onSave });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@x.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith('scan-1', expect.objectContaining({ email: 'new@x.com' }));
  });
});
```

- [ ] **Step 7: Write the modal**

Create `src/components/leads/LeadDetailModal.tsx`:

```typescript
/**
 * One captured lead, editable, with its CRM outcome.
 *
 * The CRM error is shown verbatim: "failed" alone tells a rep nothing they can
 * act on, while "MANDATORY_NOT_FOUND: Last Name" tells them exactly which
 * field to fill before retrying.
 */

import React, { useState } from 'react';
import { BadgeScanRecord } from '../../utils/badgeApi';

const FIELDS: Array<{ key: keyof BadgeScanRecord; label: string }> = [
  { key: 'first_name', label: 'First name' },
  { key: 'last_name', label: 'Last name' },
  { key: 'company', label: 'Organization' },
  { key: 'title', label: 'Title' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'notes', label: 'Notes' },
];

interface LeadDetailModalProps {
  scan: BadgeScanRecord;
  onSave: (id: string, patch: Record<string, string>) => void;
  onRetry: (id: string) => void;
  onClose: () => void;
}

export const LeadDetailModal: React.FC<LeadDetailModalProps> = ({ scan, onSave, onRetry, onClose }) => {
  const [patch, setPatch] = useState<Record<string, string>>({});
  const value = (key: keyof BadgeScanRecord) =>
    patch[key as string] ?? ((scan[key] as string | null) ?? '');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5">
        <p className="text-sm text-stone-500">Lead for <strong>{scan.entity}</strong></p>

        {scan.crm_error && (
          <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{scan.crm_error}</p>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {FIELDS.map(({ key, label }) => (
            <label key={String(key)} className="text-sm">
              <span className="mb-1 block text-stone-600">{label}</span>
              <input
                aria-label={label}
                value={value(key)}
                onChange={(e) => setPatch((p) => ({ ...p, [key as string]: e.target.value }))}
                className="w-full rounded-lg border border-stone-300 px-3 py-2"
              />
            </label>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            onClick={() => onSave(scan.id, patch)}
            className="flex-1 rounded-lg bg-brand-600 px-4 py-3 font-medium text-white"
          >
            Save
          </button>
          {/* A skipped lead has no brand, so there is no CRM to retry against. */}
          {scan.crm_status === 'failed' && (
            <button onClick={() => onRetry(scan.id)} className="rounded-lg border border-stone-300 px-4 py-3">
              Retry CRM push
            </button>
          )}
          <button onClick={onClose} className="rounded-lg px-4 py-3 text-stone-600">Close</button>
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 8: Wire the modal and the duplicate warning into the page**

In `src/utils/badgeApi.ts`, add:

```typescript
  async retryPush(id: string): Promise<BadgeScanRecord> {
    const response = await apiClient.post(`/badge-scans/${id}/push`, {});
    return (response as any).data as BadgeScanRecord;
  },
```

In `src/components/leads/LeadsPage.tsx`, import `LeadDetailModal`, and pass the
duplicate through to the review sheet — the list already carries `raw_payload`,
so no client-side hashing is needed:

```typescript
        <ScanReviewSheet
          entity={entity}
          badge={pendingBadge}
          duplicateOf={
            pendingBadge
              ? scans.find((s) => s.raw_payload === pendingBadge.rawPayload) ?? null
              : null
          }
          onSave={handleSave}
          onCancel={() => setPendingBadge(null)}
        />
```

and render the detail modal, which `selected` was already tracking:

```typescript
      {selected && (
        <LeadDetailModal
          scan={selected}
          onSave={async (id, patch) => {
            await badgeApi.updateScan(id, patch as any);
            setSelected(null);
            void reload();
          }}
          onRetry={async (id) => {
            await badgeApi.retryPush(id);
            setSelected(null);
            void reload();
          }}
          onClose={() => setSelected(null)}
        />
      )}
```

- [ ] **Step 9: Run the frontend tests to verify they pass**

Run: `npx vitest run src/components/leads/`
Expected: PASS across all the leads component tests.

- [ ] **Step 10: Commit**

```bash
git add backend/src/services/badge/BadgeScanService.ts backend/src/database/repositories/BadgeScanRepository.ts backend/src/routes/badgeScans.ts backend/tests/routes/badgeScans.test.ts src/components/leads/ src/utils/badgeApi.ts
git commit -m "feat(badge-scans): lead detail, manual CRM retry, duplicate warning"
```

---

### Task 17: CRM field-name discovery

The spec's second operational prerequisite. Task 8 ships hardcoded standard
field names, which will fail on any brand whose Tradeshows module uses custom
API names — and it fails per record with `INVALID_DATA`, which looks like a
data problem rather than a configuration one.

**Files:**
- Create: `backend/src/services/badge/badgeCrmFields.ts`
- Create: `backend/tests/services/badgeCrmFields.test.ts`
- Modify: `backend/src/services/badge/BadgeCrmPushService.ts` (use the mapping in `toCrmRecord`)

**Interfaces:**
- Consumes: `getBrandCrmConfig` (Task 7), `query` from `config/database`
- Produces:
  - `type FieldMap = Record<string, string>` — our field name to the module's API name
  - `getFieldMap(brand: string, accessToken: string): Promise<FieldMap>`

- [ ] **Step 1: Write the failing discovery test**

Create `backend/tests/services/badgeCrmFields.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import axios from 'axios';

vi.mock('axios', () => ({ default: { get: vi.fn() } }));
vi.mock('../../src/config/database', () => ({ query: vi.fn(async () => ({ rows: [] })) }));

import { getFieldMap, clearFieldMapCache } from '../../src/services/badge/badgeCrmFields';
import { query } from '../../src/config/database';

const fieldsResponse = (names: string[]) => ({
  data: { fields: names.map((api_name) => ({ api_name, field_label: api_name })) },
});

beforeEach(() => {
  vi.clearAllMocks();
  clearFieldMapCache();
  process.env.HAUTE_BRANDS_ZOHO_CRM_REFRESH_TOKEN = 't';
  process.env.ZOHO_CLIENT_ID = 'cid';
  process.env.ZOHO_CLIENT_SECRET = 'csec';
});

describe('getFieldMap', () => {
  it('maps our field names onto the module names the org actually has', async () => {
    vi.mocked(axios.get).mockResolvedValue(fieldsResponse(['Last_Name', 'Email', 'Account_Name']) as any);
    const map = await getFieldMap('haute_brands', 'at');
    expect(map.last_name).toBe('Last_Name');
    expect(map.email).toBe('Email');
    // Account_Name is this org's company field; the default would be 'Company'.
    expect(map.company).toBe('Account_Name');
  });

  it('falls back to the standard name when the module has no match', async () => {
    vi.mocked(axios.get).mockResolvedValue(fieldsResponse(['Last_Name']) as any);
    const map = await getFieldMap('haute_brands', 'at');
    expect(map.email).toBe('Email');
  });

  it('caches per brand so the push does not re-discover on every batch', async () => {
    vi.mocked(axios.get).mockResolvedValue(fieldsResponse(['Last_Name']) as any);
    await getFieldMap('haute_brands', 'at');
    await getFieldMap('haute_brands', 'at');
    expect(axios.get).toHaveBeenCalledTimes(1);
  });

  it('returns the defaults rather than throwing when discovery fails', async () => {
    // A discovery outage must not stop the push; the standard names are a
    // reasonable guess and any per-record rejection is visible in the UI.
    vi.mocked(axios.get).mockRejectedValue(new Error('403 OAUTH_SCOPE_MISMATCH'));
    const map = await getFieldMap('haute_brands', 'at');
    expect(map.last_name).toBe('Last_Name');
  });

  it('persists the discovered map to app_settings for the existing sync to read', async () => {
    vi.mocked(axios.get).mockResolvedValue(fieldsResponse(['Last_Name', 'Account_Name']) as any);
    await getFieldMap('haute_brands', 'at');
    const sql = vi.mocked(query).mock.calls.map(([s]) => String(s)).join(' ');
    expect(sql).toContain('app_settings');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && npx vitest run tests/services/badgeCrmFields.test.ts`
Expected: FAIL — "Failed to resolve import ... badgeCrmFields"

- [ ] **Step 3: Write the discovery module**

Create `backend/src/services/badge/badgeCrmFields.ts`:

```typescript
/**
 * Zoho CRM field API names, discovered per brand.
 *
 * The Tradeshows module is a custom module, so its field API names are
 * org-specific. ZohoCrmLeadsService has long carried a note that its field
 * names are "best-effort candidates until real field API names are known";
 * this is that lookup. The result is cached in memory and mirrored into
 * app_settings so the read-side sync can use the same mapping.
 */

import axios from 'axios';
import { query } from '../../config/database';
import { getBrandCrmConfig } from './badgeCrmConfig';

const ZOHO_API_DOMAIN = 'https://www.zohoapis.com';

export type FieldMap = Record<string, string>;

/** Standard names, used when discovery fails or the module has no match. */
const DEFAULTS: FieldMap = {
  last_name: 'Last_Name', first_name: 'First_Name', email: 'Email',
  phone: 'Phone', company: 'Company', title: 'Title', city: 'City',
  state: 'State', postal_code: 'Zip_Code', country: 'Country',
  notes: 'Description', lead_source: 'Lead_Source',
};

/** Acceptable API names per field, best first. */
const CANDIDATES: Record<string, string[]> = {
  last_name: ['Last_Name', 'LastName', 'Name'],
  first_name: ['First_Name', 'FirstName'],
  email: ['Email', 'Email_Address', 'Primary_Email'],
  phone: ['Phone', 'Mobile', 'Phone_Number'],
  company: ['Company', 'Account_Name', 'Organization', 'Organisation'],
  title: ['Title', 'Designation', 'Job_Title'],
  city: ['City', 'Mailing_City'],
  state: ['State', 'Mailing_State'],
  postal_code: ['Zip_Code', 'Zip', 'Mailing_Zip', 'Postal_Code'],
  country: ['Country', 'Mailing_Country'],
  notes: ['Description', 'Notes'],
  lead_source: ['Lead_Source', 'Source'],
};

const cache = new Map<string, FieldMap>();

export function clearFieldMapCache(): void {
  cache.clear();
}

export async function getFieldMap(brand: string, accessToken: string): Promise<FieldMap> {
  const cached = cache.get(brand);
  if (cached) return cached;

  const config = getBrandCrmConfig(brand);
  if (!config) return DEFAULTS;

  let available: Set<string>;
  try {
    const response = await axios.get(`${ZOHO_API_DOMAIN}/crm/v2/settings/fields`, {
      params: { module: config.module },
      headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
    });
    available = new Set((response.data?.fields ?? []).map((f: any) => f.api_name));
  } catch (error) {
    // Discovery failing must not stop the push. The standard names are a fair
    // guess, and any rejection surfaces per record in the UI.
    console.warn(`[BadgeCrmFields] Discovery failed for ${brand}: ${(error as Error).message}`);
    return DEFAULTS;
  }

  const map: FieldMap = {};
  for (const [field, candidates] of Object.entries(CANDIDATES)) {
    map[field] = candidates.find((name) => available.has(name)) ?? DEFAULTS[field];
  }

  cache.set(brand, map);

  try {
    await query(
      `INSERT INTO app_settings (key, value)
       VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [`crmFieldMap.${brand}`, JSON.stringify(map)]
    );
  } catch (error) {
    console.warn(`[BadgeCrmFields] Could not persist field map for ${brand}`);
  }

  return map;
}
```

Check `app_settings`' real column names and unique constraint in
`backend/src/database/schema.sql` before finalizing that upsert; match what is
there rather than assuming `(key, value)`.

- [ ] **Step 4: Use the mapping in the push**

In `BadgeCrmPushService.ts`, add `import { getFieldMap, FieldMap } from './badgeCrmFields';`
(the type is used in the new `toCrmRecord` signature), resolve the map once per batch
after the token, and change `toCrmRecord` to take the map:

```typescript
    const fieldMap = await getFieldMap(config.brand, accessToken);
```

```typescript
  private toCrmRecord(scan: BadgeScan, fields: FieldMap): Record<string, unknown> {
    const record: Record<string, unknown> = {};
    const set = (field: string, value: string | null | undefined) => {
      if (value) record[fields[field]] = value;
    };
    // Last name is mandatory in Zoho; fall back so a record is never rejected
    // purely for lacking one.
    record[fields.last_name] = scan.last_name || scan.company || 'Unknown';
    set('first_name', scan.first_name);
    set('email', scan.email);
    set('phone', scan.phone);
    set('company', scan.company);
    set('title', scan.title);
    set('city', scan.city);
    set('state', scan.state);
    set('postal_code', scan.postal_code);
    set('country', scan.country);
    set('notes', scan.notes);
    record[fields.lead_source] = 'Trade Show Badge Scan';
    return record;
  }
```

Update the call site to `this.toCrmRecord(scan, fieldMap)` and the
`duplicate_check_fields` to `[fieldMap.email]`, so dedupe uses the real field
name too.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && npx vitest run tests/services/badgeCrmFields.test.ts tests/services/BadgeCrmPushService.test.ts`
Expected: PASS. The Task 8 push tests assert on `duplicate_check_fields`
containing `'Email'`; with the default map that still holds, but if a test now
fails because the mock did not stub `axios.get`, add
`vi.mocked(axios.get).mockResolvedValue({ data: { fields: [] } } as any)` to
that file's `beforeEach` rather than weakening the assertion.

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/badge/badgeCrmFields.ts backend/src/services/badge/BadgeCrmPushService.ts backend/tests/services/badgeCrmFields.test.ts backend/tests/services/BadgeCrmPushService.test.ts
git commit -m "feat(badge-scans): discover CRM field API names per brand"
```

---

### Task 18: Verify, version, document

**Files:**
- Modify: `package.json` and `backend/package.json` (version 2.23.0)
- Modify: `CHANGELOG.md`
- Modify: `CLAUDE.md` (route count and the new feature area)
- Modify: `docs/ARCHITECTURE.md`

- [ ] **Step 1: Run the full backend suite**

Run: `cd backend && npm test -- --run`
Expected: all pass. Record the pass/fail counts; do not proceed past a new failure.

- [ ] **Step 2: Run the full frontend suite and lint**

Run: `npx vitest run && npm run lint`
Expected: the new tests pass and lint is clean.

Note: this repo had roughly 92 pre-existing frontend test failures unrelated to
this feature. Compare against the count on `main` before blaming this work, and
report the delta rather than the absolute number.

- [ ] **Step 3: Verify both builds compile**

Run: `npm run build && cd backend && npm run build`
Expected: both succeed. A TypeScript error in the new files is a real failure —
fix it rather than loosening types.

- [ ] **Step 4: Bump the version in both manifests**

Set `"version": "2.23.0"` in `package.json` and in `backend/package.json`. Both
must match, or the deploy scripts disagree about what is running.

- [ ] **Step 5: Update the changelog**

Add to `CHANGELOG.md`, matching the existing entry format:

```markdown
## [2.23.0] - 2026-09-16

### Added
- Badge scanning: PDF417 attendee badges decode on-device via zxing-wasm in a
  live camera viewfinder, no per-show scanner rental required
- New Leads page with per-event lead capture, search, and CSV/Excel export
- Every scan is attributed to the company the rep represents, which routes the
  lead to that brand's Zoho CRM
- Background push worker upserts scans into the Zoho CRM Tradeshows module per
  brand, with retry and exponential backoff
- New `badge_scans` table (migration 041)

### Notes
- Pushing to CRM requires a write-scoped (`ZohoCRM.modules.ALL`) refresh token
  per brand. Without one, leads are still captured and exportable and stay
  queued rather than failing.
- Companies with no Zoho destination (`zohoEnabled: false`) capture leads
  marked `skipped`, with the reason shown in the list and the export.
```

- [ ] **Step 6: Update the project docs**

In `CLAUDE.md`, under the backend section, the route-file count is stated as 20
and is now 21. Update it, and add to the key service boundaries list:

```markdown
- **`badge/`** — PDF417 badge scans. `BadgeScanService` owns validation and
  server-side brand resolution; `BadgeCrmPushService` owns the per-brand CRM
  push. The payload parser lives client-side in `src/utils/badge/` and is the
  single source of truth for field extraction.
```

Add the same feature summary to `docs/ARCHITECTURE.md` in the style of the
sections already there.

- [ ] **Step 7: Commit**

```bash
git add package.json backend/package.json CHANGELOG.md CLAUDE.md docs/ARCHITECTURE.md
git commit -m "chore(release): v2.23.0 badge scanning"
```

- [ ] **Step 8: Deploy to sandbox and verify the migration actually applied**

Deploy with `./deploy-sandbox-2600.sh` — **not** `deploy-sandbox.sh`, which
points at production containers.

Then confirm the table exists, because `migrate.ts` silently skips on a `42501`
permission error and a clean startup log proves nothing:

```bash
psql -c "\d badge_scans"
```

If it is missing, apply migration 041 as the `postgres` role.

- [ ] **Step 9: Verify on a real phone**

The decode path cannot be validated in a test environment. On an actual device,
against a real badge:

1. Open Leads, pick an event and a company, tap Scan badge
2. Confirm the camera opens rear-facing and the torch toggle appears
3. Scan a badge and confirm fields populate — **and check them against the
   printed badge**, since the confirmed sample decoded to a different person
   than the printed name
4. Save and confirm the lead appears in the list
5. Turn wifi off, scan again, confirm it saves and syncs when wifi returns
6. Confirm the export downloads and opens

Record the decode success rate. If it is poor, that is the signal to implement
the deferred server-side fallback in the spec — not to tune the parser.
