# Dev Dashboard Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the nine-tab developer dashboard with five tabs that load independently and show real data (Overview, API, Usage, Sessions, Audit Log), remove the dead model-training pipeline, and add real screen-view tracking and an automatic audit trail.

**Architecture:** One backend module per tab under `backend/src/services/devDashboard/`, one endpoint each, one frontend tab component each, fed by a small cached-resource hook. Response shapes are pinned by JSON fixtures that both backend and frontend tests read. New writes: a `page_views` table fed by a beacon from `App.tsx`, and an `auditTrail` middleware that logs every non-GET `/api` request.

**Tech Stack:** Express + TypeScript + raw `pg` (backend), React + Vite + Tailwind utility classes (frontend), Vitest on both sides, `@testing-library/react` with happy-dom.

**Spec:** `docs/superpowers/specs/2026-10-08-dev-dashboard-rework-design.md`

## Global Constraints

- Work in the worktree `../trade-show-app-dev-dashboard` on branch `feat/dev-dashboard`. Do not touch the main checkout (it holds `feat/theme-preview` with an uncommitted file).
- No new npm dependencies. No chart library; trends are inline SVG.
- Raw parameterized SQL only. `timeRange` is never interpolated into SQL; it is mapped through a fixed lookup and passed as a parameter cast with `::interval`.
- `timeRange` is one of `1h`, `24h`, `7d`, `30d`; anything else is treated as `24h`.
- Never modify an existing migration. The only new migration is `047_create_page_views.sql`.
- No tables are dropped. `POST /api/ocr/v2/corrections`, `UserCorrectionService.storeCorrection` and `ocr_corrections` stay.
- The audit trail never stores a request body, and an audit or page-view write can never fail or delay the request that triggered it.
- Dashboard API access stays `admin` or `developer`; the screen stays `developer` only.
- Every SQL statement in `services/devDashboard/` starts with a `/* devdash:<name> */` comment. Unit tests route mocked queries on that tag.
- Retention: `api_requests` 30 days, `page_views` 90 days, `audit_logs` 365 days, `user_sessions` until `expires_at`.
- Frontend styling: reuse the existing classes (`seg-track`, `seg-tab`, `seg-tab-active`, `seg-tab-idle`, `btn-primary`, `btn-secondary`) and the `stone-*` palette already used in this folder.
- The frontend test suite has about 90 pre-existing failures on `main`. Judge frontend work by the test files this plan names, not by the whole suite.
- Backend integration tests (`backend/tests/integration/`) run against the real local database from `backend/.env`. Run `cd backend && npm run migrate` before them.
- Commit messages end with: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

## Review Focus

1. **A client IP that is not a valid address** (`unknown`, a hostname, a list): `audit_logs.ip_address` is `INET`, so one bad value would make the insert fail and the row vanish. Expected: the row is written with a null IP. Pinned in Task 4.
2. **A very long request path** (over 100 characters once normalized): `audit_logs.action` is `VARCHAR(100)`. Expected: the action is truncated and the row is written. Pinned in Task 4.
3. **Changing the time range or tab while a request is in flight:** the slower, older response must not overwrite the newer one. Pinned in Task 10.
4. **Searching the audit log for text containing `%` or `_`:** expected to match those characters literally, not act as wildcards. Pinned in Task 8.
5. **A time range with quiet periods:** expected to show empty buckets as zero-height bars in order, not to silently close the gaps. Pinned in Task 6.

## File Map

Backend, created:

| File | Responsibility |
|---|---|
| `backend/src/database/migrations/047_create_page_views.sql` | `page_views` table |
| `backend/src/database/repositories/PageViewRepository.ts` | insert + retention delete |
| `backend/src/routes/pageViews.ts` | `POST /api/page-views` |
| `backend/src/middleware/auditTrail.ts` | automatic audit rows for writes |
| `backend/src/services/devDashboard/timeRange.ts` | range parsing, interval and bucket lookup |
| `backend/src/services/devDashboard/overview.ts` | Overview payload + health checks |
| `backend/src/services/devDashboard/apiAnalytics.ts` | API payload |
| `backend/src/services/devDashboard/usage.ts` | Usage payload |
| `backend/src/services/devDashboard/sessions.ts` | Sessions payload |
| `backend/src/services/devDashboard/auditLog.ts` | Audit Log query parsing + payload |
| `backend/src/services/devDashboard/RetentionJob.ts` | daily cleanup |
| `backend/tests/helpers/keyShape.ts`, `backend/tests/helpers/routeQueries.ts` | test helpers |

Backend, deleted: `services/DevDashboardService.ts`, `services/DevDashboardService.helpers.ts`, `services/DevDashboardService.expenseStats.ts`, `services/dashboard/` (4 files), `routes/modelRetraining.ts`, `routes/ocrTraining.ts`, `routes/learningAnalytics.ts`, `routes/trainingSync.ts`, `services/ocr/ModelRetrainingService.ts`, `services/ocr/PromptRefinementService.ts`, `services/ocr/CrossEnvironmentSyncService.ts`, `tests/services/DevDashboardService.test.ts`, `tests/services/DevDashboardService.helpers.test.ts`.

Frontend, created under `src/components/developer/DevDashboard/`: `types.ts`, `format.ts`, `userAgent.ts`, `useDashboardResource.ts`, `TrendBars.tsx`, `TabState.tsx`, `OverviewTab.tsx` (rewritten), `ApiTab.tsx`, `UsageTab.tsx`, `SessionsTab.tsx` (rewritten), `AuditLogTab.tsx`. Also `src/hooks/usePageViewTracking.ts` and five fixtures in `src/utils/__fixtures__/devDashboard/`.

Frontend, deleted: `components/dev/ModelTrainingDashboard.tsx`, and in `DevDashboard/`: `ModelTrainingTab.tsx`, `OcrTab.tsx`, `MetricsTab.tsx`, `AlertsTab.tsx`, `PageAnalyticsTab.tsx`, `ApiAnalyticsTab.tsx`, `AuditLogsTab.tsx`, `DashboardSummaryCards.tsx`, `DashboardTabNavigation.tsx`.

---

### Task 1: Remove the model-training pipeline

**Files:**
- Delete: `backend/src/routes/modelRetraining.ts`, `backend/src/routes/ocrTraining.ts`, `backend/src/routes/learningAnalytics.ts`, `backend/src/routes/trainingSync.ts`
- Delete: `backend/src/services/ocr/ModelRetrainingService.ts`, `backend/src/services/ocr/PromptRefinementService.ts`, `backend/src/services/ocr/CrossEnvironmentSyncService.ts`
- Delete: `src/components/dev/ModelTrainingDashboard.tsx`, `src/components/developer/DevDashboard/ModelTrainingTab.tsx`
- Modify: `backend/src/server.ts` (imports at lines 22-25, mounts at lines 116-119)
- Modify: `backend/src/routes/ocrV2.ts` (remove three routes)
- Modify: `backend/src/services/ocr/UserCorrectionService.ts` (remove two methods)
- Modify: `src/components/developer/DevDashboard.tsx`, `src/components/developer/DevDashboard/DashboardTabNavigation.tsx`
- Test: `backend/tests/routes/ocrV2.surface.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `ocrV2` router with exactly `POST /process`, `POST /corrections`, `GET /config`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/routes/ocrV2.surface.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/config/database', () => ({
  query: vi.fn(),
  pool: { query: vi.fn() },
}));

import router from '../../src/routes/ocrV2';

const surface = (router as any).stack
  .filter((layer: any) => layer.route)
  .map((layer: any) => `${Object.keys(layer.route.methods)[0].toUpperCase()} ${layer.route.path}`)
  .sort();

describe('ocr v2 route surface', () => {
  it('keeps receipt processing and correction capture', () => {
    expect(surface).toContain('POST /process');
    expect(surface).toContain('POST /corrections');
  });

  it('no longer exposes the training read endpoints', () => {
    expect(surface).toEqual(['GET /config', 'POST /corrections', 'POST /process']);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && npx vitest run tests/routes/ocrV2.surface.test.ts`
Expected: FAIL on the second test — the surface still lists `GET /accuracy`, `GET /corrections/export`, `GET /corrections/stats`. If instead the file fails to import (a module reading env or opening a connection at load), add the `vi.mock` for that module the way `backend/tests/routes/notifications.test.ts` does, and re-run until the failure is the assertion.

- [ ] **Step 3: Delete the pipeline files**

```bash
git rm backend/src/routes/modelRetraining.ts backend/src/routes/ocrTraining.ts \
       backend/src/routes/learningAnalytics.ts backend/src/routes/trainingSync.ts \
       backend/src/services/ocr/ModelRetrainingService.ts \
       backend/src/services/ocr/PromptRefinementService.ts \
       backend/src/services/ocr/CrossEnvironmentSyncService.ts \
       src/components/dev/ModelTrainingDashboard.tsx \
       src/components/developer/DevDashboard/ModelTrainingTab.tsx
```

- [ ] **Step 4: Unmount the routes in `backend/src/server.ts`**

Delete these four imports:

```ts
import ocrTrainingRoutes from './routes/ocrTraining';
import learningAnalyticsRoutes from './routes/learningAnalytics';
import modelRetrainingRoutes from './routes/modelRetraining';
import trainingSyncRoutes from './routes/trainingSync';
```

Delete these four mounts:

```ts
app.use('/api/training', authenticateToken, sessionTracker, ocrTrainingRoutes);
app.use('/api/learning', authenticateToken, sessionTracker, learningAnalyticsRoutes);
app.use('/api/retraining', authenticateToken, sessionTracker, modelRetrainingRoutes);
app.use('/api/training/sync', authenticateToken, sessionTracker, trainingSyncRoutes);
```

- [ ] **Step 5: Trim `backend/src/routes/ocrV2.ts`**

Delete the three route blocks, each with the doc comment directly above it: `router.get('/corrections/stats', …)`, `router.get('/corrections/export', …)` and `router.get('/accuracy', …)` (the last one runs to just above `export default router;`). Leave `POST /process`, `POST /corrections` and `GET /config` untouched. Then remove any import at the top of the file that is no longer referenced (the TypeScript check in Step 8 lists them).

- [ ] **Step 6: Trim `backend/src/services/ocr/UserCorrectionService.ts`**

Delete the methods `getCorrectionStats()` and `exportCorrectionsForTraining()` with their doc comments. Keep `storeCorrection`, `getCorrectionsByUser` and `getCorrectionsByExpense`.

- [ ] **Step 7: Remove the tab from the frontend**

In `src/components/developer/DevDashboard.tsx` delete the import line

```ts
import { ModelTrainingTab } from './DevDashboard/ModelTrainingTab';
```

and the render line

```tsx
          {activeTab === 'training' && <ModelTrainingTab user={user} />}
```

In `src/components/developer/DevDashboard/DashboardTabNavigation.tsx` delete the entry

```ts
  { id: 'training', label: 'Model Training', icon: Brain },
```

and remove `Brain` from the `lucide-react` import.

- [ ] **Step 8: Verify**

Run: `cd backend && npx vitest run tests/routes/ocrV2.surface.test.ts && npx tsc --noEmit`
Expected: 2 tests PASS, `tsc` prints nothing.

Run from the repo root: `grep -rnE "ocrTraining|learningAnalytics|modelRetraining|trainingSync|ModelRetrainingService|PromptRefinementService|CrossEnvironmentSyncService|ModelTrainingDashboard|ModelTrainingTab" backend/src src`
Expected: no output.

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor(ocr): remove the model-training pipeline; correction capture stays

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `page_views` table and `POST /api/page-views`

**Files:**
- Create: `backend/src/database/migrations/047_create_page_views.sql`
- Create: `backend/src/database/repositories/PageViewRepository.ts`
- Modify: `backend/src/database/repositories/index.ts` (append export)
- Create: `backend/src/routes/pageViews.ts`
- Modify: `backend/src/server.ts` (import + mount)
- Test: `backend/tests/routes/pageViews.test.ts`, `backend/tests/integration/page-views-schema.test.ts`

**Interfaces:**
- Produces:
  - `pageViewRepository.record(userId: string, page: string, device: 'mobile' | 'desktop'): Promise<void>`
  - `pageViewRepository.deleteOlderThan(days: number): Promise<number>`
  - `handleRecordPageView(req: AuthRequest, res: Response): Promise<void>` — body `{ page, device }`, responds `204`, or `400 { error }`.
  - Table `page_views(id, user_id, page, device, created_at)`.

- [ ] **Step 1: Write the migration**

Create `backend/src/database/migrations/047_create_page_views.sql`:

```sql
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
```

- [ ] **Step 2: Write the failing schema test**

Create `backend/tests/integration/page-views-schema.test.ts`:

```ts
import { describe, it, expect, afterAll } from 'vitest';
import { pool, query } from '../../src/config/database';

/** Verifies migration 047 applied (migrate.ts silently skips on 42501). */
describe('page_views schema (migration 047)', () => {
  afterAll(async () => { await pool.end(); });

  it('has the expected columns', async () => {
    const { rows } = await query(
      `SELECT column_name, data_type FROM information_schema.columns
        WHERE table_name = 'page_views' ORDER BY column_name`
    );
    expect(rows).toEqual([
      { column_name: 'created_at', data_type: 'timestamp with time zone' },
      { column_name: 'device', data_type: 'character varying' },
      { column_name: 'id', data_type: 'bigint' },
      { column_name: 'page', data_type: 'character varying' },
      { column_name: 'user_id', data_type: 'uuid' },
    ]);
  });

  it('rejects a device that is not mobile or desktop', async () => {
    const user = await query('SELECT id FROM users LIMIT 1');
    await expect(
      query(`INSERT INTO page_views (user_id, page, device) VALUES ($1, 'x', 'tablet')`, [user.rows[0].id])
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('has both indexes', async () => {
    const { rows } = await query(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'page_views' ORDER BY indexname`
    );
    expect(rows.map((r) => r.indexname)).toEqual([
      'idx_page_views_created_at',
      'idx_page_views_user_created',
      'page_views_pkey',
    ]);
  });
});
```

- [ ] **Step 3: Run it to verify it fails, then migrate**

Run: `cd backend && npx vitest run tests/integration/page-views-schema.test.ts`
Expected: FAIL — `relation "page_views" does not exist` / empty column list.

Run: `cd backend && npm run migrate && npx vitest run tests/integration/page-views-schema.test.ts`
Expected: migration 047 applied, 3 tests PASS.

- [ ] **Step 4: Write the failing route test**

Create `backend/tests/routes/pageViews.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const record = vi.fn();
vi.mock('../../src/database/repositories', () => ({
  pageViewRepository: { record: (...args: unknown[]) => record(...args) },
}));
vi.mock('../../src/config/database', () => ({ query: vi.fn(), pool: { query: vi.fn() } }));

import { handleRecordPageView } from '../../src/routes/pageViews';

const call = async (body: unknown) => {
  const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), end: vi.fn() };
  await handleRecordPageView({ user: { id: 'u1', username: 'a', role: 'salesperson' }, body } as any, res);
  return res;
};

describe('POST /api/page-views', () => {
  beforeEach(() => { record.mockReset(); record.mockResolvedValue(undefined); });

  it('records a valid view and answers 204', async () => {
    const res = await call({ page: 'expenses', device: 'mobile' });
    expect(record).toHaveBeenCalledWith('u1', 'expenses', 'mobile');
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.end).toHaveBeenCalled();
  });

  it.each([
    ['uppercase', { page: 'Expenses', device: 'mobile' }],
    ['a path', { page: 'a/b', device: 'mobile' }],
    ['empty', { page: '', device: 'mobile' }],
    ['65 characters', { page: 'a'.repeat(65), device: 'mobile' }],
    ['not a string', { page: 7, device: 'mobile' }],
    ['unknown device', { page: 'expenses', device: 'tablet' }],
    ['no body', undefined],
  ])('rejects %s with 400 and records nothing', async (_name, body) => {
    const res = await call(body);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(record).not.toHaveBeenCalled();
  });

  it('still answers 204 when the write fails', async () => {
    record.mockRejectedValue(new Error('db down'));
    const res = await call({ page: 'expenses', device: 'desktop' });
    expect(res.status).toHaveBeenCalledWith(204);
  });
});
```

- [ ] **Step 5: Run it to verify it fails**

Run: `cd backend && npx vitest run tests/routes/pageViews.test.ts`
Expected: FAIL — cannot find module `../../src/routes/pageViews`.

- [ ] **Step 6: Write the repository**

Create `backend/src/database/repositories/PageViewRepository.ts`:

```ts
/**
 * Screen opens by signed-in users. Written by POST /api/page-views, read by
 * the developer dashboard's Usage tab, pruned by RetentionJob.
 */
import { query } from '../../config/database';

export type PageViewDevice = 'mobile' | 'desktop';

export class PageViewRepository {
  async record(userId: string, page: string, device: PageViewDevice): Promise<void> {
    await query('INSERT INTO page_views (user_id, page, device) VALUES ($1, $2, $3)', [userId, page, device]);
  }

  async deleteOlderThan(days: number): Promise<number> {
    const result = await query('DELETE FROM page_views WHERE created_at < NOW() - make_interval(days => $1)', [days]);
    return result.rowCount || 0;
  }
}

export const pageViewRepository = new PageViewRepository();
```

Append to `backend/src/database/repositories/index.ts`:

```ts

export { pageViewRepository, PageViewRepository } from './PageViewRepository';
export type { PageViewDevice } from './PageViewRepository';
```

- [ ] **Step 7: Write the route**

Create `backend/src/routes/pageViews.ts`:

```ts
/**
 * Screen-view beacon — /api/page-views
 * The handler is exported by name so tests call it with a mock req/res.
 */
import express, { Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/errors';
import { pageViewRepository } from '../database/repositories';

const router = express.Router();
router.use(authenticateToken);

const PAGE_PATTERN = /^[a-z0-9-]{1,64}$/;

export async function handleRecordPageView(req: AuthRequest, res: Response): Promise<void> {
  const { page, device } = req.body ?? {};
  if (typeof page !== 'string' || !PAGE_PATTERN.test(page)) {
    res.status(400).json({ error: 'page must be a screen id of lowercase letters, digits and hyphens' });
    return;
  }
  if (device !== 'mobile' && device !== 'desktop') {
    res.status(400).json({ error: 'device must be mobile or desktop' });
    return;
  }

  // Bookkeeping: a failed write must never surface to the person using the app.
  pageViewRepository.record(req.user!.id, page, device).catch((error) => {
    console.error('[PageViews] Failed to record view:', error);
  });
  res.status(204).end();
}

router.post('/', asyncHandler(handleRecordPageView));

export default router;
```

- [ ] **Step 8: Mount it in `backend/src/server.ts`**

Add beside the other route imports:

```ts
import pageViewRoutes from './routes/pageViews';
```

Add directly after the `/api/sample-requests` mount:

```ts
app.use('/api/page-views', authenticateToken, sessionTracker, pageViewRoutes);
```

- [ ] **Step 9: Verify**

Run: `cd backend && npx vitest run tests/routes/pageViews.test.ts tests/integration/page-views-schema.test.ts && npx tsc --noEmit`
Expected: all PASS, `tsc` prints nothing.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(usage): page_views table and the screen-view beacon endpoint

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Send a screen view from the app

**Files:**
- Create: `src/hooks/usePageViewTracking.ts`
- Modify: `src/App.tsx` (import + one call beside `useNotifications()`)
- Test: `src/hooks/__tests__/usePageViewTracking.test.ts`

**Interfaces:**
- Consumes: `POST /api/page-views` with `{ page, device }` (Task 2).
- Produces: `usePageViewTracking(currentPage: string, userId: string | undefined): void`

- [ ] **Step 1: Write the failing test**

Create `src/hooks/__tests__/usePageViewTracking.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const post = vi.fn();
vi.mock('../../utils/apiClient', () => ({ apiClient: { post: (...args: unknown[]) => post(...args) } }));

import { usePageViewTracking } from '../usePageViewTracking';

const setWidth = (width: number) => {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
};

describe('usePageViewTracking', () => {
  beforeEach(() => { post.mockReset(); post.mockResolvedValue(undefined); setWidth(1280); });

  it('sends nothing while signed out', () => {
    renderHook(() => usePageViewTracking('dashboard', undefined));
    expect(post).not.toHaveBeenCalled();
  });

  it('sends the first screen once signed in', () => {
    renderHook(() => usePageViewTracking('dashboard', 'u1'));
    expect(post).toHaveBeenCalledWith('/page-views', { page: 'dashboard', device: 'desktop' });
  });

  it('sends each screen change once, and not on unrelated re-renders', () => {
    const { rerender } = renderHook(({ page }) => usePageViewTracking(page, 'u1'), {
      initialProps: { page: 'dashboard' },
    });
    rerender({ page: 'dashboard' });
    rerender({ page: 'expenses' });
    expect(post.mock.calls.map((c) => (c[1] as { page: string }).page)).toEqual(['dashboard', 'expenses']);
  });

  it('reports mobile under 768px', () => {
    setWidth(390);
    renderHook(() => usePageViewTracking('leads', 'u1'));
    expect(post).toHaveBeenCalledWith('/page-views', { page: 'leads', device: 'mobile' });
  });

  it('swallows a failed send', () => {
    post.mockRejectedValue(new Error('offline'));
    expect(() => renderHook(() => usePageViewTracking('dashboard', 'u1'))).not.toThrow();
  });

  it('sends the current screen again after signing out and back in', () => {
    const { rerender } = renderHook(({ id }: { id: string | undefined }) => usePageViewTracking('dashboard', id), {
      initialProps: { id: 'u1' as string | undefined },
    });
    rerender({ id: undefined });
    rerender({ id: 'u2' });
    expect(post).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/hooks/__tests__/usePageViewTracking.test.ts`
Expected: FAIL — cannot find module `../usePageViewTracking`.

- [ ] **Step 3: Write the hook**

Create `src/hooks/usePageViewTracking.ts`:

```ts
import { useEffect, useRef } from 'react';
import { apiClient } from '../utils/apiClient';

const MOBILE_MAX_WIDTH = 768;

/**
 * Reports each screen a signed-in user opens, for the developer dashboard's
 * Usage tab. Best effort: a failed send is dropped, never retried and never
 * queued for offline sync.
 */
export function usePageViewTracking(currentPage: string, userId: string | undefined): void {
  const lastSent = useRef<string | null>(null);

  useEffect(() => {
    if (!userId) {
      lastSent.current = null;
      return;
    }
    if (lastSent.current === currentPage) return;
    lastSent.current = currentPage;

    const device = window.innerWidth < MOBILE_MAX_WIDTH ? 'mobile' : 'desktop';
    apiClient.post('/page-views', { page: currentPage, device }).catch(() => {});
  }, [currentPage, userId]);
}
```

- [ ] **Step 4: Call it from `src/App.tsx`**

Add the import beside the other hook imports:

```ts
import { usePageViewTracking } from './hooks/usePageViewTracking';
```

Add directly below the line `const notifications = useNotifications();`:

```ts
  usePageViewTracking(currentPage, user?.id);
```

- [ ] **Step 5: Verify**

Run: `npx vitest run src/hooks/__tests__/usePageViewTracking.test.ts && npm run build`
Expected: 6 tests PASS, build succeeds.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(usage): report each screen a signed-in user opens

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Automatic audit trail, and quieter request logging

**Files:**
- Create: `backend/src/middleware/auditTrail.ts`
- Modify: `backend/src/middleware/apiRequestLogger.ts` (export `normalizeEndpoint`, skip probes)
- Modify: `backend/src/utils/auditLogger.ts` (drop `auditMiddleware`, drop `token_refresh`)
- Modify: `backend/src/routes/auth.ts` (remove the token-refresh audit call near line 457)
- Modify: `backend/src/routes/users.ts` (remove the explicit audit write near line 138)
- Modify: `backend/src/server.ts` (mount)
- Test: `backend/tests/middleware/auditTrail.test.ts`, `backend/tests/middleware/apiRequestLogger.probes.test.ts`

**Interfaces:**
- Consumes: `logAudit(entry: AuditLogEntry): Promise<void>` from `utils/auditLogger` (already swallows its own errors).
- Produces:
  - `auditTrail(req, res, next)` Express middleware
  - `shouldAudit(method: string, path: string): boolean`
  - `auditStatus(statusCode: number): 'success' | 'warning' | 'failure'`
  - `clientIp(req): string | undefined`
  - `normalizeEndpoint(path: string): string` exported from `apiRequestLogger`
  - `audit_logs` rows where `action` is `"<METHOD> <normalized path>"`, `request_method` is set, and `request_path` is the real path. Rows written by `logAuth` have `request_method` NULL.

- [ ] **Step 1: Write the failing middleware test**

Create `backend/tests/middleware/auditTrail.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

const logAudit = vi.fn();
vi.mock('../../src/utils/auditLogger', () => ({ logAudit: (...args: unknown[]) => logAudit(...args) }));
vi.mock('../../src/config/database', () => ({ query: vi.fn(), pool: { query: vi.fn() } }));

import { auditTrail, shouldAudit, auditStatus, clientIp } from '../../src/middleware/auditTrail';

const run = (overrides: Record<string, unknown> = {}, statusCode = 200, body?: unknown) => {
  const req: any = {
    method: 'PUT',
    originalUrl: '/api/events/0b5f1c7e-1111-2222-3333-444455556666?x=1',
    headers: { 'user-agent': 'vitest' },
    ip: '192.168.1.20',
    socket: {},
    user: { id: 'u1', username: 'sahil', role: 'developer' },
    body: { password: 'secret' },
    ...overrides,
  };
  const res: any = new EventEmitter();
  res.statusCode = statusCode;
  res.json = vi.fn((b: unknown) => b);
  const next = vi.fn();
  auditTrail(req, res, next);
  if (body !== undefined) res.json(body);
  res.emit('finish');
  return { next };
};

describe('shouldAudit', () => {
  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('audits %s under /api', (method) => {
    expect(shouldAudit(method, '/api/events')).toBe(true);
  });

  it.each([
    ['GET', '/api/events'],
    ['POST', '/health'],
    ['POST', '/api/auth/login'],
    ['POST', '/api/auth/refresh'],
    ['POST', '/api/page-views'],
    ['POST', '/api/page-views/'],
    ['POST', '/api/push/subscribe'],
    ['POST', '/api/midas/events-ping'],
  ])('skips %s %s', (method, path) => {
    expect(shouldAudit(method, path)).toBe(false);
  });
});

describe('auditStatus', () => {
  it.each([[200, 'success'], [204, 'success'], [400, 'warning'], [404, 'warning'], [500, 'failure'], [503, 'failure']])(
    'maps %i to %s',
    (code, expected) => expect(auditStatus(code)).toBe(expected)
  );
});

describe('clientIp', () => {
  it('prefers the first forwarded address', () => {
    expect(clientIp({ headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }, ip: '10.0.0.1', socket: {} } as any))
      .toBe('203.0.113.9');
  });

  it.each(['unknown', 'proxy.internal', ''])('returns undefined for %j', (value) => {
    expect(clientIp({ headers: {}, ip: value, socket: {} } as any)).toBeUndefined();
  });
});

describe('auditTrail', () => {
  beforeEach(() => { logAudit.mockReset(); logAudit.mockResolvedValue(undefined); });

  it('writes one row after the response finishes, with the real path and no body', () => {
    const { next } = run();
    expect(next).toHaveBeenCalled();
    expect(logAudit).toHaveBeenCalledTimes(1);
    const entry = logAudit.mock.calls[0][0];
    expect(entry).toMatchObject({
      userId: 'u1',
      userName: 'sahil',
      userRole: 'developer',
      action: 'PUT /api/events/:id',
      status: 'success',
      ipAddress: '192.168.1.20',
      userAgent: 'vitest',
      requestMethod: 'PUT',
      requestPath: '/api/events/0b5f1c7e-1111-2222-3333-444455556666',
    });
    expect(entry.changes).toBeUndefined();
    expect(JSON.stringify(entry)).not.toContain('secret');
  });

  it('writes nothing for a read', () => {
    run({ method: 'GET' });
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('records the error message of a failed write', () => {
    run({}, 500, { error: 'Database exploded' });
    expect(logAudit.mock.calls[0][0]).toMatchObject({ status: 'failure', errorMessage: 'Database exploded' });
  });

  it('writes the row with no user when the request was never authenticated', () => {
    run({ user: undefined }, 401, { error: 'Access token required' });
    expect(logAudit.mock.calls[0][0]).toMatchObject({ userId: undefined, status: 'warning' });
  });

  it('writes the row with no IP when the address is not a valid IP', () => {
    run({ ip: 'unknown' });
    expect(logAudit).toHaveBeenCalledTimes(1);
    expect(logAudit.mock.calls[0][0].ipAddress).toBeUndefined();
  });

  it('truncates an action longer than the column allows', () => {
    run({ originalUrl: `/api/${'segment/'.repeat(30)}end` });
    const entry = logAudit.mock.calls[0][0];
    expect(entry.action.length).toBeLessThanOrEqual(100);
    expect(entry.requestPath.length).toBeLessThanOrEqual(500);
  });

  it('never throws when the audit write rejects', () => {
    logAudit.mockRejectedValue(new Error('db down'));
    expect(() => run()).not.toThrow();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && npx vitest run tests/middleware/auditTrail.test.ts`
Expected: FAIL — cannot find module `../../src/middleware/auditTrail`.

- [ ] **Step 3: Export `normalizeEndpoint` and skip probes in `backend/src/middleware/apiRequestLogger.ts`**

Change `function normalizeEndpoint(path: string): string {` to `export function normalizeEndpoint(path: string): string {`.

Add above `export const apiRequestLogger`:

```ts
// Uptime monitors hit these every 30-60 seconds. Logging them buries real
// traffic in the developer dashboard and tells nobody anything.
const UNLOGGED_PATHS = new Set(['/health', '/api/health', '/api/meta/version']);
```

Add as the first statement inside `apiRequestLogger`:

```ts
  if (UNLOGGED_PATHS.has((req.originalUrl || '').split('?')[0])) {
    return next();
  }
```

- [ ] **Step 4: Write the middleware**

Create `backend/src/middleware/auditTrail.ts`:

```ts
/**
 * Automatic audit trail: one audit_logs row for every write under /api.
 *
 * Records who, what path, the outcome and where from. Never the request
 * body. The row is written after the response has gone out and its failure
 * is swallowed, so auditing can never fail or slow a request.
 *
 * Login, failed login and logout are written by logAuth (it knows why a
 * login failed), so /api/auth is skipped here to avoid double rows.
 */
import net from 'net';
import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { logAudit } from '../utils/auditLogger';
import { normalizeEndpoint } from './apiRequestLogger';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const SKIPPED_PREFIXES = ['/api/auth/', '/api/push/', '/api/midas/'];
const SKIPPED_PATHS = new Set(['/api/page-views']);

const ACTION_MAX = 100; // audit_logs.action VARCHAR(100)
const PATH_MAX = 500; // audit_logs.request_path VARCHAR(500)

export function shouldAudit(method: string, path: string): boolean {
  if (!WRITE_METHODS.has(method)) return false;
  const clean = path.length > 1 ? path.replace(/\/+$/, '') : path;
  if (!clean.startsWith('/api/')) return false;
  if (SKIPPED_PATHS.has(clean)) return false;
  return !SKIPPED_PREFIXES.some((prefix) => `${clean}/`.startsWith(prefix));
}

export function auditStatus(statusCode: number): 'success' | 'warning' | 'failure' {
  if (statusCode >= 500) return 'failure';
  if (statusCode >= 400) return 'warning';
  return 'success';
}

/** audit_logs.ip_address is INET: anything that is not an IP must become null. */
export function clientIp(req: AuthRequest): string | undefined {
  const forwarded = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim();
  const candidate = forwarded || req.ip || req.socket?.remoteAddress || '';
  return net.isIP(candidate) ? candidate : undefined;
}

export const auditTrail = (req: AuthRequest, res: Response, next: NextFunction) => {
  const path = (req.originalUrl || '').split('?')[0];
  if (!shouldAudit(req.method, path)) return next();

  let errorMessage: string | undefined;
  const originalJson = res.json.bind(res);
  res.json = function (body: any): Response {
    if (res.statusCode >= 400 && body && body.error) {
      errorMessage = typeof body.error === 'string' ? body.error : JSON.stringify(body.error);
    }
    return originalJson(body);
  };

  res.on('finish', () => {
    // req.user is set by the route's own authenticateToken, which has run by now.
    logAudit({
      userId: req.user?.id,
      userName: req.user?.username,
      userRole: req.user?.role,
      action: `${req.method} ${normalizeEndpoint(path)}`.slice(0, ACTION_MAX),
      status: auditStatus(res.statusCode),
      ipAddress: clientIp(req),
      userAgent: req.headers['user-agent'],
      requestMethod: req.method,
      requestPath: path.slice(0, PATH_MAX),
      errorMessage,
    }).catch(() => {});
  });

  next();
};
```

- [ ] **Step 5: Mount it in `backend/src/server.ts`**

Add the import beside `apiRequestLogger`'s:

```ts
import { auditTrail } from './middleware/auditTrail';
```

Add directly after `app.use(apiRequestLogger); // Log all API requests for analytics`:

```ts
app.use(auditTrail); // One audit_logs row per write under /api
```

- [ ] **Step 6: Remove the writers the middleware replaces**

In `backend/src/utils/auditLogger.ts`: delete the whole `auditMiddleware` function and its doc comment (it has no callers), and change `logAuth`'s first parameter type to:

```ts
  action: 'login_success' | 'login_failed' | 'logout' | 'unauthorized_access',
```

In `backend/src/routes/auth.ts` delete this block from the refresh handler:

```ts
      // Log token refresh
      await logAuth('token_refresh', {
        id: user.id,
        username: user.username,
        role: user.role
      }, req.ip);

```

In `backend/src/routes/users.ts` delete the whole `await auditLogRepository.create({ … }).catch((error) => { … });` statement that follows `const user = await userRepository.setActive(id, isActive);`, and change the import to:

```ts
import { userRepository } from '../database/repositories';
```

- [ ] **Step 7: Write the probe-skip test**

Create `backend/tests/middleware/apiRequestLogger.probes.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();
vi.mock('../../src/config/database', () => ({ query: (...args: unknown[]) => query(...args) }));

import { apiRequestLogger } from '../../src/middleware/apiRequestLogger';

const hit = async (originalUrl: string) => {
  const req: any = { originalUrl, path: originalUrl.split('?')[0], method: 'GET', get: () => null, connection: {} };
  const res: any = { statusCode: 200, end: vi.fn(), json: vi.fn(), getHeader: () => undefined };
  apiRequestLogger(req, res, vi.fn());
  res.end();
  await new Promise((resolve) => setImmediate(resolve));
};

describe('apiRequestLogger probes', () => {
  beforeEach(() => { query.mockReset(); query.mockResolvedValue({ rows: [] }); });

  it.each(['/health', '/api/health', '/api/meta/version', '/api/health?probe=1'])('does not log %s', async (url) => {
    await hit(url);
    expect(query).not.toHaveBeenCalled();
  });

  it('still logs ordinary requests', async () => {
    await hit('/api/events');
    expect(query).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 8: Verify**

Run: `cd backend && npx vitest run tests/middleware/auditTrail.test.ts tests/middleware/apiRequestLogger.probes.test.ts tests/routes/userActivation.test.ts tests/integration/login-audit.test.ts && npx tsc --noEmit`
Expected: the two new files PASS and `tsc` prints nothing. If `userActivation.test.ts` or `login-audit.test.ts` asserts on the removed `auditLogRepository.create` call or on a `token_refresh` row, delete only those assertions: the behavior they pinned is intentionally gone.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(audit): log every write automatically; stop logging monitoring probes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Contract fixtures, time ranges, and the Overview module

**Files:**
- Create: `src/utils/__fixtures__/devDashboard/overview.json`, `apiAnalytics.json`, `usage.json`, `sessions.json`, `auditLogs.json`
- Create: `backend/tests/helpers/keyShape.ts`, `backend/tests/helpers/routeQueries.ts`
- Create: `backend/src/services/devDashboard/timeRange.ts`
- Create: `backend/src/services/devDashboard/overview.ts`
- Test: `backend/tests/services/devDashboard/timeRange.test.ts`, `backend/tests/services/devDashboard/overview.test.ts`

**Interfaces:**
- Produces:
  - `type TimeRange = '1h' | '24h' | '7d' | '30d'`
  - `parseTimeRange(raw: unknown): TimeRange`
  - `intervalFor(range: TimeRange): string` — `'1 hour' | '24 hours' | '7 days' | '30 days'`
  - `rangeSeconds(range: TimeRange): number`, `bucketSeconds(range: TimeRange): number` (300, 3600, 86400, 86400)
  - `getOverview(): Promise<Overview>` and `getHealthChecks(): Promise<HealthCheck[]>`
  - Test helpers `keyShape(value: unknown): unknown` and `routeQueries(mock, routes: Array<[string, any[] | Error]>)`
  - The five fixture files, which are the response contract for Tasks 6-8 and 11-13.

- [ ] **Step 1: Write the five contract fixtures**

Create `src/utils/__fixtures__/devDashboard/overview.json`:

```json
{
  "version": {
    "frontend": "2.34.0",
    "backend": "2.34.0",
    "node": "v20.11.0",
    "environment": "production",
    "uptimeSeconds": 93784
  },
  "system": {
    "memory": { "usedBytes": 1288490188, "totalBytes": 4294967296 },
    "cpu": { "load1": 0.42, "cores": 4 },
    "disk": { "usedBytes": 21474836480, "totalBytes": 53687091200 }
  },
  "database": {
    "sizeBytes": 187432960,
    "connections": 7,
    "maxConnections": 100,
    "tables": [
      { "name": "api_requests", "sizeBytes": 98566144 },
      { "name": "audit_logs", "sizeBytes": 12582912 }
    ]
  },
  "checks": [
    { "id": "error-rate", "label": "API error rate", "status": "pass", "value": "0.4% of 512 requests", "threshold": "under 10% in the last hour" },
    { "id": "slow-endpoints", "label": "Slow endpoints", "status": "warn", "value": "1 endpoint, slowest /api/expenses at 2400ms", "threshold": "none averaging over 2000ms" },
    { "id": "endpoint-failures", "label": "Repeated server errors", "status": "fail", "value": "POST /api/events failed 6 times", "threshold": "no endpoint with 5 or more 500s in the last hour" }
  ]
}
```

Create `src/utils/__fixtures__/devDashboard/apiAnalytics.json`:

```json
{
  "totals": { "requests": 4210, "errors": 34, "errorRate": 0.81, "p50Ms": 24, "p95Ms": 180 },
  "buckets": [
    { "start": "2026-10-08T12:00:00.000Z", "requests": 310, "errors": 2 },
    { "start": "2026-10-08T13:00:00.000Z", "requests": 0, "errors": 0 },
    { "start": "2026-10-08T14:00:00.000Z", "requests": 402, "errors": 5 }
  ],
  "endpoints": [
    { "method": "GET", "endpoint": "/api/expense-messages/unread", "calls": 748, "avgMs": 28, "p95Ms": 61, "maxMs": 160, "errors": 8 },
    { "method": "GET", "endpoint": "/api/expenses", "calls": 47, "avgMs": 137, "p95Ms": 301, "maxMs": 349, "errors": 2 }
  ],
  "slowest": [
    { "method": "GET", "endpoint": "/api/expenses", "calls": 47, "avgMs": 137, "maxMs": 349 }
  ],
  "recentErrors": [
    { "id": "7d1f0c52-0000-4000-8000-000000000001", "createdAt": "2026-10-08T14:41:07.000Z", "method": "GET", "endpoint": "/api/session/properties", "statusCode": 404, "userName": "Sahil Khatri", "errorMessage": "Not found" },
    { "id": "7d1f0c52-0000-4000-8000-000000000002", "createdAt": "2026-10-08T14:02:55.000Z", "method": "POST", "endpoint": "/api/events", "statusCode": 500, "userName": null, "errorMessage": null }
  ]
}
```

Create `src/utils/__fixtures__/devDashboard/usage.json`:

```json
{
  "totals": { "views": 186, "uniqueUsers": 5 },
  "screens": [
    {
      "page": "expenses",
      "views": 92,
      "uniqueUsers": 5,
      "daily": [
        { "day": "2026-10-07", "views": 40 },
        { "day": "2026-10-08", "views": 52 }
      ]
    },
    {
      "page": "leads",
      "views": 31,
      "uniqueUsers": 2,
      "daily": [{ "day": "2026-10-08", "views": 31 }]
    }
  ],
  "users": [
    {
      "userId": "11111111-1111-4111-8111-111111111111",
      "name": "Seri Vira",
      "role": "salesperson",
      "lastSeen": "2026-10-08T15:20:00.000Z",
      "views": 64,
      "mobileViews": 60,
      "desktopViews": 4,
      "topPages": [
        { "page": "expenses", "views": 41 },
        { "page": "leads", "views": 23 }
      ]
    },
    {
      "userId": "22222222-2222-4222-8222-222222222222",
      "name": "Rita Example",
      "role": "coordinator",
      "lastSeen": null,
      "views": 0,
      "mobileViews": 0,
      "desktopViews": 0,
      "topPages": []
    }
  ]
}
```

Create `src/utils/__fixtures__/devDashboard/sessions.json`:

```json
{
  "users": [
    {
      "userId": "11111111-1111-4111-8111-111111111111",
      "name": "Digi",
      "role": "salesperson",
      "status": "active",
      "lastActivity": "2026-10-08T15:58:00.000Z",
      "sessionCount": 2,
      "sessions": [
        {
          "id": "aaaaaaaa-0000-4000-8000-000000000001",
          "ipAddress": "203.0.113.9",
          "userAgent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
          "createdAt": "2026-10-08T13:10:00.000Z",
          "lastActivity": "2026-10-08T15:58:00.000Z",
          "expiresAt": "2026-10-09T01:10:00.000Z"
        },
        {
          "id": "aaaaaaaa-0000-4000-8000-000000000002",
          "ipAddress": null,
          "userAgent": null,
          "createdAt": "2026-10-05T09:00:00.000Z",
          "lastActivity": "2026-10-05T09:30:00.000Z",
          "expiresAt": "2026-11-04T09:00:00.000Z"
        }
      ]
    }
  ]
}
```

Create `src/utils/__fixtures__/devDashboard/auditLogs.json`:

```json
{
  "logs": [
    {
      "id": "bbbbbbbb-0000-4000-8000-000000000001",
      "createdAt": "2026-10-08T15:40:00.000Z",
      "userName": "sahil",
      "userRole": "developer",
      "action": "PUT /api/events/:id",
      "method": "PUT",
      "path": "/api/events/0b5f1c7e-1111-2222-3333-444455556666",
      "status": "success",
      "ipAddress": "203.0.113.9",
      "errorMessage": null
    },
    {
      "id": "bbbbbbbb-0000-4000-8000-000000000002",
      "createdAt": "2026-10-08T15:12:00.000Z",
      "userName": "digi",
      "userRole": null,
      "action": "login_failed",
      "method": null,
      "path": null,
      "status": "failure",
      "ipAddress": null,
      "errorMessage": "Invalid password"
    }
  ],
  "total": 37
}
```

- [ ] **Step 2: Write the two test helpers**

Create `backend/tests/helpers/keyShape.ts`:

```ts
/**
 * Reduces a value to its key structure so a service's output can be compared
 * with a contract fixture: objects keep their (sorted) keys, arrays keep the
 * shape of their first element, every leaf becomes '*'. Values and nullness
 * are ignored on purpose; only names and nesting are the contract.
 */
export function keyShape(value: unknown): unknown {
  if (Array.isArray(value)) return value.length ? [keyShape(value[0])] : [];
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.keys(value as object).sort().map((key) => [key, keyShape((value as Record<string, unknown>)[key])])
    );
  }
  return '*';
}
```

Create `backend/tests/helpers/routeQueries.ts`:

```ts
import type { Mock } from 'vitest';

/**
 * Answers a mocked `query` by the `devdash:<name>` tag at the start of each
 * SQL statement, so tests do not depend on the order queries run in.
 * A route whose answer is an Error makes that query reject.
 */
export function routeQueries(mock: Mock, routes: Array<[string, any[] | Error]>): void {
  mock.mockImplementation(async (sql: string) => {
    const tag = /devdash:([a-z0-9-]+)/.exec(sql)?.[1];
    const hit = routes.find(([name]) => name === tag);
    if (!hit) throw new Error(`No mocked rows for query tagged "${tag}"`);
    if (hit[1] instanceof Error) throw hit[1];
    return { rows: hit[1], rowCount: hit[1].length };
  });
}
```

- [ ] **Step 3: Write the failing time-range test**

Create `backend/tests/services/devDashboard/timeRange.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseTimeRange, intervalFor, rangeSeconds, bucketSeconds } from '../../../src/services/devDashboard/timeRange';

describe('timeRange', () => {
  it.each(['1h', '24h', '7d', '30d'])('accepts %s', (value) => {
    expect(parseTimeRange(value)).toBe(value);
  });

  it.each([undefined, null, '', '90d', "1h'; DROP TABLE users;--", 24, ['1h']])('treats %j as 24h', (value) => {
    expect(parseTimeRange(value)).toBe('24h');
  });

  it('maps each range to a Postgres interval', () => {
    expect(['1h', '24h', '7d', '30d'].map((r) => intervalFor(r as any))).toEqual(['1 hour', '24 hours', '7 days', '30 days']);
  });

  it('buckets by 5 minutes, an hour, then a day', () => {
    expect(['1h', '24h', '7d', '30d'].map((r) => bucketSeconds(r as any))).toEqual([300, 3600, 86400, 86400]);
  });

  it('knows each range in seconds', () => {
    expect(['1h', '24h', '7d', '30d'].map((r) => rangeSeconds(r as any))).toEqual([3600, 86400, 604800, 2592000]);
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `cd backend && npx vitest run tests/services/devDashboard/timeRange.test.ts`
Expected: FAIL — cannot find module `timeRange`.

- [ ] **Step 5: Write `timeRange.ts`**

Create `backend/src/services/devDashboard/timeRange.ts`:

```ts
/**
 * The dashboard's time ranges. A range from the query string is only ever
 * used as a key into these tables; the SQL receives the looked-up value as a
 * parameter, so nothing a client sends reaches a statement as text.
 */
export type TimeRange = '1h' | '24h' | '7d' | '30d';

const RANGES: Record<TimeRange, { interval: string; seconds: number; bucketSeconds: number }> = {
  '1h': { interval: '1 hour', seconds: 3600, bucketSeconds: 300 },
  '24h': { interval: '24 hours', seconds: 86400, bucketSeconds: 3600 },
  '7d': { interval: '7 days', seconds: 604800, bucketSeconds: 86400 },
  '30d': { interval: '30 days', seconds: 2592000, bucketSeconds: 86400 },
};

export function parseTimeRange(raw: unknown): TimeRange {
  return typeof raw === 'string' && Object.prototype.hasOwnProperty.call(RANGES, raw) ? (raw as TimeRange) : '24h';
}

export const intervalFor = (range: TimeRange): string => RANGES[range].interval;
export const rangeSeconds = (range: TimeRange): number => RANGES[range].seconds;
export const bucketSeconds = (range: TimeRange): number => RANGES[range].bucketSeconds;
```

- [ ] **Step 6: Write the failing Overview test**

Create `backend/tests/services/devDashboard/overview.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

const query = vi.fn();
vi.mock('../../../src/config/database', () => ({ query: (...args: unknown[]) => query(...args) }));

import { getOverview, getHealthChecks } from '../../../src/services/devDashboard/overview';
import { keyShape } from '../../helpers/keyShape';
import { routeQueries } from '../../helpers/routeQueries';

const fixture = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../../../src/utils/__fixtures__/devDashboard/overview.json'), 'utf8')
);

const HEALTHY: Array<[string, any[] | Error]> = [
  ['db-stats', [{ size_bytes: '187432960', connections: 7, max_connections: 100 }]],
  ['db-tables', [{ name: 'api_requests', size_bytes: '98566144' }]],
  ['check-error-rate', [{ total: 100, errors: 1 }]],
  ['check-slow-endpoints', []],
  ['check-stale-sessions', [{ count: 0 }]],
  ['check-endpoint-failures', []],
  ['check-traffic-spike', [{ recent: 40, previous: 38 }]],
  ['check-auth-failures', [{ count: 2 }]],
];

const withRoute = (name: string, answer: any[] | Error) =>
  HEALTHY.map(([n, a]) => (n === name ? [n, answer] : [n, a])) as Array<[string, any[] | Error]>;

describe('getOverview', () => {
  beforeEach(() => {
    query.mockReset();
    vi.spyOn(fs.promises, 'statfs').mockResolvedValue({ blocks: 1000, bfree: 600, bsize: 4096 } as any);
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('returns exactly the contract shape', async () => {
    routeQueries(query, HEALTHY);
    expect(keyShape(await getOverview())).toEqual(keyShape(fixture));
  });

  it('reports numbers, not the strings pg returns for bigint', async () => {
    routeQueries(query, HEALTHY);
    const overview = await getOverview();
    expect(overview.database.sizeBytes).toBe(187432960);
    expect(overview.database.tables[0].sizeBytes).toBe(98566144);
    expect(overview.system.disk).toEqual({ usedBytes: 400 * 4096, totalBytes: 1000 * 4096 });
  });

  it('reports disk as null when the volume cannot be read', async () => {
    routeQueries(query, HEALTHY);
    vi.spyOn(fs.promises, 'statfs').mockRejectedValue(new Error('ENOENT'));
    expect((await getOverview()).system.disk).toBeNull();
  });
});

describe('getHealthChecks', () => {
  beforeEach(() => { query.mockReset(); });

  const statusOf = async (id: string) => (await getHealthChecks()).find((c) => c.id === id)!;

  it('returns all six checks, passing, when the app is healthy', async () => {
    routeQueries(query, HEALTHY);
    const checks = await getHealthChecks();
    expect(checks.map((c) => c.id)).toEqual([
      'error-rate', 'slow-endpoints', 'endpoint-failures', 'auth-failures', 'traffic-spike', 'stale-sessions',
    ]);
    expect(checks.every((c) => c.status === 'pass')).toBe(true);
  });

  it('warns on an error rate over 10% once there are more than 20 requests', async () => {
    routeQueries(query, withRoute('check-error-rate', [{ total: 100, errors: 15 }]));
    expect(await statusOf('error-rate')).toMatchObject({ status: 'warn', value: '15.0% of 100 requests' });
  });

  it('does not warn on a high error rate from a handful of requests', async () => {
    routeQueries(query, withRoute('check-error-rate', [{ total: 15, errors: 9 }]));
    expect((await statusOf('error-rate')).status).toBe('pass');
  });

  it('passes with zero requests instead of dividing by zero', async () => {
    routeQueries(query, withRoute('check-error-rate', [{ total: 0, errors: 0 }]));
    expect(await statusOf('error-rate')).toMatchObject({ status: 'pass', value: '0.0% of 0 requests' });
  });

  it('warns and names the slowest endpoint', async () => {
    routeQueries(query, withRoute('check-slow-endpoints', [
      { endpoint: '/api/expenses', avg_ms: 2400.4 },
      { endpoint: '/api/events', avg_ms: 2100 },
    ]));
    expect(await statusOf('slow-endpoints')).toMatchObject({
      status: 'warn',
      value: '2 endpoints, slowest /api/expenses at 2400ms',
    });
  });

  it('fails on repeated server errors and names the endpoint', async () => {
    routeQueries(query, withRoute('check-endpoint-failures', [{ method: 'POST', endpoint: '/api/events', failures: 6 }]));
    expect(await statusOf('endpoint-failures')).toMatchObject({ status: 'fail', value: 'POST /api/events failed 6 times' });
  });

  it('warns on more than 50 rejected logins in an hour', async () => {
    routeQueries(query, withRoute('check-auth-failures', [{ count: 51 }]));
    expect((await statusOf('auth-failures')).status).toBe('warn');
  });

  it('warns when traffic more than triples over a busy hour', async () => {
    routeQueries(query, withRoute('check-traffic-spike', [{ recent: 400, previous: 100 }]));
    expect((await statusOf('traffic-spike')).status).toBe('warn');
  });

  it('does not call a quiet hour following an empty one a spike', async () => {
    routeQueries(query, withRoute('check-traffic-spike', [{ recent: 60, previous: 0 }]));
    expect((await statusOf('traffic-spike')).status).toBe('pass');
  });

  it('warns on more than 10 valid sessions idle for a day', async () => {
    routeQueries(query, withRoute('check-stale-sessions', [{ count: 11 }]));
    expect((await statusOf('stale-sessions')).status).toBe('warn');
  });

  it('reports a check whose query fails as failed, and still runs the rest', async () => {
    routeQueries(query, withRoute('check-auth-failures', new Error('relation "api_requests" does not exist')));
    const checks = await getHealthChecks();
    expect(checks).toHaveLength(6);
    expect(checks.find((c) => c.id === 'auth-failures')).toMatchObject({
      status: 'fail',
      value: 'Check failed: relation "api_requests" does not exist',
    });
    expect(checks.filter((c) => c.status === 'pass')).toHaveLength(5);
  });
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `cd backend && npx vitest run tests/services/devDashboard/overview.test.ts`
Expected: FAIL — cannot find module `overview`.

- [ ] **Step 8: Write `overview.ts`**

Create `backend/src/services/devDashboard/overview.ts`:

```ts
/**
 * Developer dashboard — Overview tab.
 * What is running, what it is running on, and whether anything is wrong
 * right now. Health checks are computed on every call and never stored.
 */
import os from 'os';
import fs from 'fs';
import { query } from '../../config/database';
import backendPkg from '../../../package.json';
import { FRONTEND_VERSION } from '../../config/version';

export interface HealthCheck {
  id: string;
  label: string;
  status: 'pass' | 'warn' | 'fail';
  value: string;
  threshold: string;
}

export interface Overview {
  version: { frontend: string; backend: string; node: string; environment: string; uptimeSeconds: number };
  system: {
    memory: { usedBytes: number; totalBytes: number };
    cpu: { load1: number; cores: number };
    disk: { usedBytes: number; totalBytes: number } | null;
  };
  database: {
    sizeBytes: number;
    connections: number;
    maxConnections: number;
    tables: Array<{ name: string; sizeBytes: number }>;
  };
  checks: HealthCheck[];
}

type CheckResult = Pick<HealthCheck, 'status' | 'value'>;
type CheckDefinition = Pick<HealthCheck, 'id' | 'label' | 'threshold'> & { run: () => Promise<CheckResult> };

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

const CHECKS: CheckDefinition[] = [
  {
    id: 'error-rate',
    label: 'API error rate',
    threshold: 'under 10% in the last hour',
    run: async () => {
      const { rows } = await query(`/* devdash:check-error-rate */
        SELECT COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE status_code >= 400)::int AS errors
          FROM api_requests
         WHERE created_at > NOW() - INTERVAL '1 hour'`);
      const total = rows[0].total;
      const rate = total > 0 ? (rows[0].errors / total) * 100 : 0;
      return {
        status: rate > 10 && total > 20 ? 'warn' : 'pass',
        value: `${rate.toFixed(1)}% of ${plural(total, 'request')}`,
      };
    },
  },
  {
    id: 'slow-endpoints',
    label: 'Slow endpoints',
    threshold: 'none averaging over 2000ms',
    run: async () => {
      const { rows } = await query(`/* devdash:check-slow-endpoints */
        SELECT endpoint, AVG(response_time_ms)::float AS avg_ms
          FROM api_requests
         WHERE created_at > NOW() - INTERVAL '1 hour'
           AND endpoint NOT LIKE '/api/dev-dashboard%'
         GROUP BY endpoint
        HAVING AVG(response_time_ms) > 2000 AND COUNT(*) >= 5
         ORDER BY avg_ms DESC`);
      if (rows.length === 0) return { status: 'pass', value: 'none' };
      return {
        status: 'warn',
        value: `${plural(rows.length, 'endpoint')}, slowest ${rows[0].endpoint} at ${Math.round(rows[0].avg_ms)}ms`,
      };
    },
  },
  {
    id: 'endpoint-failures',
    label: 'Repeated server errors',
    threshold: 'no endpoint with 5 or more 500s in the last hour',
    run: async () => {
      const { rows } = await query(`/* devdash:check-endpoint-failures */
        SELECT method, endpoint, COUNT(*)::int AS failures
          FROM api_requests
         WHERE created_at > NOW() - INTERVAL '1 hour'
           AND status_code >= 500
         GROUP BY method, endpoint
        HAVING COUNT(*) >= 5
         ORDER BY failures DESC`);
      if (rows.length === 0) return { status: 'pass', value: 'none' };
      const worst = rows[0];
      const more = rows.length > 1 ? ` (and ${plural(rows.length - 1, 'other')})` : '';
      return { status: 'fail', value: `${worst.method} ${worst.endpoint} failed ${plural(worst.failures, 'time')}${more}` };
    },
  },
  {
    id: 'auth-failures',
    label: 'Rejected requests (401)',
    threshold: '50 or fewer in the last hour',
    run: async () => {
      const { rows } = await query(`/* devdash:check-auth-failures */
        SELECT COUNT(*)::int AS count
          FROM api_requests
         WHERE created_at > NOW() - INTERVAL '1 hour'
           AND status_code = 401`);
      return { status: rows[0].count > 50 ? 'warn' : 'pass', value: String(rows[0].count) };
    },
  },
  {
    id: 'traffic-spike',
    label: 'Traffic against the previous hour',
    threshold: 'under triple, once past 100 requests',
    run: async () => {
      const { rows } = await query(`/* devdash:check-traffic-spike */
        SELECT COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour')::int AS recent,
               COUNT(*) FILTER (WHERE created_at <= NOW() - INTERVAL '1 hour')::int AS previous
          FROM api_requests
         WHERE created_at > NOW() - INTERVAL '2 hours'`);
      const { recent, previous } = rows[0];
      const spiking = previous > 0 && recent > 100 && recent > previous * 3;
      return { status: spiking ? 'warn' : 'pass', value: `${recent} this hour, ${previous} the hour before` };
    },
  },
  {
    id: 'stale-sessions',
    label: 'Valid sessions idle over a day',
    threshold: '10 or fewer',
    run: async () => {
      const { rows } = await query(`/* devdash:check-stale-sessions */
        SELECT COUNT(*)::int AS count
          FROM user_sessions
         WHERE expires_at > NOW()
           AND last_activity < NOW() - INTERVAL '24 hours'`);
      return { status: rows[0].count > 10 ? 'warn' : 'pass', value: String(rows[0].count) };
    },
  },
];

/** Every check, every time. One failing query fails that check only. */
export async function getHealthChecks(): Promise<HealthCheck[]> {
  return Promise.all(
    CHECKS.map(async ({ run, ...meta }) => {
      try {
        return { ...meta, ...(await run()) };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { ...meta, status: 'fail' as const, value: `Check failed: ${message}` };
      }
    })
  );
}

async function diskUsage(): Promise<Overview['system']['disk']> {
  try {
    const stats = await fs.promises.statfs(process.env.UPLOAD_DIR || 'uploads');
    return { usedBytes: (stats.blocks - stats.bfree) * stats.bsize, totalBytes: stats.blocks * stats.bsize };
  } catch {
    return null;
  }
}

export async function getOverview(): Promise<Overview> {
  const [stats, tables, checks, disk] = await Promise.all([
    query(`/* devdash:db-stats */
      SELECT pg_database_size(current_database())::bigint AS size_bytes,
             (SELECT COUNT(*)::int FROM pg_stat_activity WHERE datname = current_database()) AS connections,
             current_setting('max_connections')::int AS max_connections`),
    query(`/* devdash:db-tables */
      SELECT c.relname AS name, pg_total_relation_size(c.oid)::bigint AS size_bytes
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r'
       ORDER BY pg_total_relation_size(c.oid) DESC
       LIMIT 10`),
    getHealthChecks(),
    diskUsage(),
  ]);

  const totalMemory = os.totalmem();

  return {
    version: {
      frontend: FRONTEND_VERSION,
      backend: backendPkg.version,
      node: process.version,
      environment: process.env.NODE_ENV || 'development',
      uptimeSeconds: Math.floor(process.uptime()),
    },
    system: {
      memory: { usedBytes: totalMemory - os.freemem(), totalBytes: totalMemory },
      cpu: { load1: os.loadavg()[0], cores: os.cpus().length },
      disk,
    },
    database: {
      sizeBytes: Number(stats.rows[0].size_bytes),
      connections: stats.rows[0].connections,
      maxConnections: stats.rows[0].max_connections,
      tables: tables.rows.map((row) => ({ name: row.name, sizeBytes: Number(row.size_bytes) })),
    },
    checks,
  };
}
```

- [ ] **Step 9: Verify**

Run: `cd backend && npx vitest run tests/services/devDashboard && npx tsc --noEmit`
Expected: all PASS, `tsc` prints nothing. If `tsc` reports that `statfs` does not exist on `fs.promises`, the installed `@types/node` predates it (the runtime is Node 20, which has it): change the call to `(fs.promises as any).statfs(...)` with a one-line comment saying why, rather than upgrading the types package.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(dev-dashboard): response contract fixtures and the Overview module

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: API analytics module

**Files:**
- Create: `backend/src/services/devDashboard/apiAnalytics.ts`
- Test: `backend/tests/services/devDashboard/apiAnalytics.test.ts`, `backend/tests/integration/dev-dashboard-api.test.ts`

**Interfaces:**
- Consumes: `TimeRange`, `intervalFor`, `rangeSeconds`, `bucketSeconds` from `./timeRange`; fixture `apiAnalytics.json`; helpers `keyShape`, `routeQueries`.
- Produces:
  - `getApiAnalytics(range: TimeRange, now?: Date): Promise<ApiAnalytics>`
  - `fillBuckets(rows: Array<{ start: Date | string; requests: number; errors: number }>, range: TimeRange, now: Date): ApiAnalytics['buckets']`

- [ ] **Step 1: Write the failing unit test**

Create `backend/tests/services/devDashboard/apiAnalytics.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

const query = vi.fn();
vi.mock('../../../src/config/database', () => ({ query: (...args: unknown[]) => query(...args) }));

import { getApiAnalytics, fillBuckets } from '../../../src/services/devDashboard/apiAnalytics';
import { keyShape } from '../../helpers/keyShape';
import { routeQueries } from '../../helpers/routeQueries';

const fixture = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../../../src/utils/__fixtures__/devDashboard/apiAnalytics.json'), 'utf8')
);

const NOW = new Date('2026-10-08T14:20:00.000Z');

const ROWS: Array<[string, any[]]> = [
  ['api-totals', [{ requests: 200, errors: 3, p50: 24.4, p95: 180.6 }]],
  ['api-buckets', [{ start: new Date('2026-10-08T13:00:00.000Z'), requests: 12, errors: 1 }]],
  ['api-endpoints', [{ method: 'GET', endpoint: '/api/expenses', calls: 47, avg_ms: 137.2, p95_ms: 300.9, max_ms: 349, errors: 2 }]],
  ['api-slowest', [{ method: 'GET', endpoint: '/api/expenses', calls: 47, avg_ms: 137.2, max_ms: 349 }]],
  ['api-recent-errors', [{
    id: 'e1', created_at: new Date('2026-10-08T14:02:55.000Z'), method: 'POST', endpoint: '/api/events',
    status_code: 500, user_name: null, error_message: null,
  }]],
];

describe('getApiAnalytics', () => {
  beforeEach(() => { query.mockReset(); routeQueries(query, ROWS); });

  it('returns exactly the contract shape', async () => {
    expect(keyShape(await getApiAnalytics('24h', NOW))).toEqual(keyShape(fixture));
  });

  it('rounds timings and computes the error rate to two places', async () => {
    const result = await getApiAnalytics('24h', NOW);
    expect(result.totals).toEqual({ requests: 200, errors: 3, errorRate: 1.5, p50Ms: 24, p95Ms: 181 });
    expect(result.endpoints[0]).toMatchObject({ avgMs: 137, p95Ms: 301, maxMs: 349 });
  });

  it('reports a zero error rate when there were no requests', async () => {
    routeQueries(query, ROWS.map(([n, r]) => (n === 'api-totals' ? [n, [{ requests: 0, errors: 0, p50: 0, p95: 0 }]] : [n, r])) as any);
    expect((await getApiAnalytics('24h', NOW)).totals.errorRate).toBe(0);
  });

  it('passes the range as a parameter and never as SQL text', async () => {
    await getApiAnalytics('7d', NOW);
    for (const [sql, params] of query.mock.calls) {
      expect(sql).not.toContain('7 days');
      expect(params[0]).toBe('7 days');
    }
  });

  it('leaves the dashboard\'s own requests out of every query', async () => {
    await getApiAnalytics('24h', NOW);
    for (const [sql] of query.mock.calls) expect(sql).toContain("NOT LIKE '/api/dev-dashboard%'");
  });
});

describe('fillBuckets', () => {
  it('returns every bucket in the range in order, with zeros where nothing happened', () => {
    const buckets = fillBuckets(
      [
        { start: new Date('2026-10-08T14:00:00.000Z'), requests: 9, errors: 1 },
        { start: new Date('2026-10-08T11:00:00.000Z'), requests: 4, errors: 0 },
      ],
      '24h',
      NOW
    );
    expect(buckets).toHaveLength(24);
    expect(buckets[0].start).toBe('2026-10-07T15:00:00.000Z');
    expect(buckets[23]).toEqual({ start: '2026-10-08T14:00:00.000Z', requests: 9, errors: 1 });
    expect(buckets[20]).toEqual({ start: '2026-10-08T11:00:00.000Z', requests: 4, errors: 0 });
    expect(buckets.filter((b) => b.requests === 0)).toHaveLength(22);
  });

  it('uses 12 five-minute buckets for the last hour', () => {
    const buckets = fillBuckets([], '1h', NOW);
    expect(buckets).toHaveLength(12);
    expect(buckets[11].start).toBe('2026-10-08T14:20:00.000Z');
    expect(buckets[0].start).toBe('2026-10-08T13:25:00.000Z');
  });

  it('accepts bucket starts that arrive as strings', () => {
    const buckets = fillBuckets([{ start: '2026-10-08T14:00:00.000Z', requests: 2, errors: 0 }], '24h', NOW);
    expect(buckets[23].requests).toBe(2);
  });

  it.each([['7d', 7], ['30d', 30]] as const)('uses %s daily buckets', (range, count) => {
    expect(fillBuckets([], range, NOW)).toHaveLength(count);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && npx vitest run tests/services/devDashboard/apiAnalytics.test.ts`
Expected: FAIL — cannot find module `apiAnalytics`.

- [ ] **Step 3: Write `apiAnalytics.ts`**

Create `backend/src/services/devDashboard/apiAnalytics.ts`:

```ts
/**
 * Developer dashboard — API tab.
 * Request volume, speed and failures from api_requests. The dashboard's own
 * requests are excluded so looking at it does not change what it shows.
 */
import { query } from '../../config/database';
import { TimeRange, intervalFor, rangeSeconds, bucketSeconds } from './timeRange';

export interface ApiAnalytics {
  totals: { requests: number; errors: number; errorRate: number; p50Ms: number; p95Ms: number };
  buckets: Array<{ start: string; requests: number; errors: number }>;
  endpoints: Array<{
    method: string; endpoint: string; calls: number; avgMs: number; p95Ms: number; maxMs: number; errors: number;
  }>;
  slowest: Array<{ method: string; endpoint: string; calls: number; avgMs: number; maxMs: number }>;
  recentErrors: Array<{
    id: string; createdAt: string; method: string; endpoint: string; statusCode: number;
    userName: string | null; errorMessage: string | null;
  }>;
}

const IN_RANGE = `created_at > NOW() - $1::interval AND endpoint NOT LIKE '/api/dev-dashboard%'`;

/**
 * The query only returns buckets that had traffic. A chart drawn from that
 * would close up the quiet hours, so every bucket in the range is emitted,
 * oldest first, ending with the bucket that contains `now`.
 */
export function fillBuckets(
  rows: Array<{ start: Date | string; requests: number; errors: number }>,
  range: TimeRange,
  now: Date
): ApiAnalytics['buckets'] {
  const stepMs = bucketSeconds(range) * 1000;
  const count = rangeSeconds(range) / bucketSeconds(range);
  const lastStart = Math.floor(now.getTime() / stepMs) * stepMs;
  const byStart = new Map(rows.map((row) => [new Date(row.start).getTime(), row]));

  return Array.from({ length: count }, (_, index) => {
    const start = lastStart - (count - 1 - index) * stepMs;
    const row = byStart.get(start);
    return { start: new Date(start).toISOString(), requests: row?.requests ?? 0, errors: row?.errors ?? 0 };
  });
}

export async function getApiAnalytics(range: TimeRange, now: Date = new Date()): Promise<ApiAnalytics> {
  const interval = intervalFor(range);

  const [totals, buckets, endpoints, slowest, recentErrors] = await Promise.all([
    query(`/* devdash:api-totals */
      SELECT COUNT(*)::int AS requests,
             COUNT(*) FILTER (WHERE status_code >= 400)::int AS errors,
             COALESCE(percentile_cont(0.5) WITHIN GROUP (ORDER BY response_time_ms), 0)::float AS p50,
             COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY response_time_ms), 0)::float AS p95
        FROM api_requests
       WHERE ${IN_RANGE}`, [interval]),
    query(`/* devdash:api-buckets */
      SELECT to_timestamp(floor(extract(epoch FROM created_at) / $2::int) * $2::int) AS start,
             COUNT(*)::int AS requests,
             COUNT(*) FILTER (WHERE status_code >= 400)::int AS errors
        FROM api_requests
       WHERE ${IN_RANGE}
       GROUP BY 1
       ORDER BY 1`, [interval, bucketSeconds(range)]),
    query(`/* devdash:api-endpoints */
      SELECT method, endpoint,
             COUNT(*)::int AS calls,
             AVG(response_time_ms)::float AS avg_ms,
             percentile_cont(0.95) WITHIN GROUP (ORDER BY response_time_ms)::float AS p95_ms,
             MAX(response_time_ms)::int AS max_ms,
             COUNT(*) FILTER (WHERE status_code >= 400)::int AS errors
        FROM api_requests
       WHERE ${IN_RANGE}
       GROUP BY method, endpoint
       ORDER BY calls DESC
       LIMIT 50`, [interval]),
    query(`/* devdash:api-slowest */
      SELECT method, endpoint,
             COUNT(*)::int AS calls,
             AVG(response_time_ms)::float AS avg_ms,
             MAX(response_time_ms)::int AS max_ms
        FROM api_requests
       WHERE ${IN_RANGE}
       GROUP BY method, endpoint
      HAVING COUNT(*) >= 5
       ORDER BY avg_ms DESC
       LIMIT 10`, [interval]),
    query(`/* devdash:api-recent-errors */
      SELECT a.id, a.created_at, a.method, a.endpoint, a.status_code, u.name AS user_name, a.error_message
        FROM api_requests a
        LEFT JOIN users u ON u.id = a.user_id
       WHERE a.created_at > NOW() - $1::interval
         AND a.endpoint NOT LIKE '/api/dev-dashboard%'
         AND a.status_code >= 400
       ORDER BY a.created_at DESC
       LIMIT 50`, [interval]),
  ]);

  const { requests, errors, p50, p95 } = totals.rows[0];

  return {
    totals: {
      requests,
      errors,
      errorRate: requests > 0 ? Math.round((errors / requests) * 10000) / 100 : 0,
      p50Ms: Math.round(p50),
      p95Ms: Math.round(p95),
    },
    buckets: fillBuckets(buckets.rows, range, now),
    endpoints: endpoints.rows.map((row) => ({
      method: row.method,
      endpoint: row.endpoint,
      calls: row.calls,
      avgMs: Math.round(row.avg_ms),
      p95Ms: Math.round(row.p95_ms),
      maxMs: row.max_ms,
      errors: row.errors,
    })),
    slowest: slowest.rows.map((row) => ({
      method: row.method,
      endpoint: row.endpoint,
      calls: row.calls,
      avgMs: Math.round(row.avg_ms),
      maxMs: row.max_ms,
    })),
    recentErrors: recentErrors.rows.map((row) => ({
      id: row.id,
      createdAt: new Date(row.created_at).toISOString(),
      method: row.method,
      endpoint: row.endpoint,
      statusCode: row.status_code,
      userName: row.user_name ?? null,
      errorMessage: row.error_message ?? null,
    })),
  };
}
```

- [ ] **Step 4: Run the unit test**

Run: `cd backend && npx vitest run tests/services/devDashboard/apiAnalytics.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the real-database test**

Mocked `pg` cannot tell whether the SQL is valid. Create `backend/tests/integration/dev-dashboard-api.test.ts`:

```ts
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { pool, query } from '../../src/config/database';
import { getApiAnalytics } from '../../src/services/devDashboard/apiAnalytics';
import { getOverview } from '../../src/services/devDashboard/overview';

const MARKER = '/api/__devdash_integration__';

describe('dev dashboard queries against a real database', () => {
  beforeAll(async () => {
    await query('DELETE FROM api_requests WHERE endpoint = $1', [MARKER]);
    await query(
      `INSERT INTO api_requests (method, endpoint, status_code, response_time_ms, error_message, created_at)
       VALUES ('POST', $1, 500, 300, 'integration marker', NOW()),
              ('POST', $1, 200, 100, NULL, NOW() - INTERVAL '2 minutes'),
              ('POST', $1, 200, 200, NULL, NOW() - INTERVAL '3 days')`,
      [MARKER]
    );
  });

  afterAll(async () => {
    await query('DELETE FROM api_requests WHERE endpoint = $1', [MARKER]);
    await pool.end();
  });

  it.each(['1h', '24h', '7d', '30d'] as const)('runs every API query for %s', async (range) => {
    const result = await getApiAnalytics(range);
    expect(result.totals.requests).toBeGreaterThanOrEqual(2);
    expect(result.totals.p95Ms).toBeGreaterThanOrEqual(result.totals.p50Ms);
    expect(result.buckets.reduce((sum, b) => sum + b.requests, 0)).toBeGreaterThanOrEqual(2);
  });

  it('puts the newest failure first, with its message', async () => {
    const { recentErrors } = await getApiAnalytics('1h');
    expect(recentErrors[0]).toMatchObject({ endpoint: MARKER, statusCode: 500, errorMessage: 'integration marker' });
  });

  it('counts the three-day-old request in 7d but not in 24h', async () => {
    const day = (await getApiAnalytics('24h')).endpoints.find((e) => e.endpoint === MARKER);
    const week = (await getApiAnalytics('7d')).endpoints.find((e) => e.endpoint === MARKER);
    if (day) expect(day.calls).toBe(2);
    if (week) expect(week.calls).toBe(3);
    expect(Boolean(day) || Boolean(week)).toBe(true);
  });

  it('runs the Overview queries and all six checks', async () => {
    const overview = await getOverview();
    expect(overview.database.sizeBytes).toBeGreaterThan(0);
    expect(overview.database.maxConnections).toBeGreaterThan(0);
    expect(overview.database.tables.length).toBeGreaterThan(0);
    expect(overview.checks).toHaveLength(6);
    expect(overview.checks.filter((c) => c.value.startsWith('Check failed'))).toEqual([]);
  });
});
```

- [ ] **Step 6: Verify**

Run: `cd backend && npx vitest run tests/integration/dev-dashboard-api.test.ts tests/services/devDashboard && npx tsc --noEmit`
Expected: all PASS, `tsc` prints nothing.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(dev-dashboard): API analytics module with percentiles, time buckets and recent errors

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Usage module

**Files:**
- Create: `backend/src/services/devDashboard/usage.ts`
- Test: `backend/tests/services/devDashboard/usage.test.ts`, `backend/tests/integration/dev-dashboard-usage.test.ts`

**Interfaces:**
- Consumes: `TimeRange`, `intervalFor`; table `page_views` (Task 2); fixture `usage.json`.
- Produces: `getUsage(range: TimeRange): Promise<Usage>`

- [ ] **Step 1: Write the failing unit test**

Create `backend/tests/services/devDashboard/usage.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

const query = vi.fn();
vi.mock('../../../src/config/database', () => ({ query: (...args: unknown[]) => query(...args) }));

import { getUsage } from '../../../src/services/devDashboard/usage';
import { keyShape } from '../../helpers/keyShape';
import { routeQueries } from '../../helpers/routeQueries';

const fixture = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../../../src/utils/__fixtures__/devDashboard/usage.json'), 'utf8')
);

const ROWS: Array<[string, any[]]> = [
  ['usage-totals', [{ views: 7, unique_users: 2 }]],
  ['usage-screens', [
    { page: 'expenses', views: 5, unique_users: 2 },
    { page: 'leads', views: 2, unique_users: 1 },
  ]],
  ['usage-daily', [
    { page: 'expenses', day: '2026-10-07', views: 2 },
    { page: 'expenses', day: '2026-10-08', views: 3 },
    { page: 'leads', day: '2026-10-08', views: 2 },
  ]],
  ['usage-users', [
    { id: 'u1', name: 'Seri Vira', role: 'salesperson', last_seen: new Date('2026-10-08T15:20:00.000Z'), views: 6, mobile_views: 5, desktop_views: 1 },
    { id: 'u2', name: 'Rita Example', role: 'coordinator', last_seen: null, views: 0, mobile_views: 0, desktop_views: 0 },
  ]],
  ['usage-user-pages', [
    { user_id: 'u1', page: 'expenses', views: 3 },
    { user_id: 'u1', page: 'leads', views: 2 },
    { user_id: 'u1', page: 'dashboard', views: 1 },
    { user_id: 'u1', page: 'events', views: 1 },
  ]],
];

describe('getUsage', () => {
  beforeEach(() => { query.mockReset(); routeQueries(query, ROWS); });

  it('returns exactly the contract shape', async () => {
    expect(keyShape(await getUsage('7d'))).toEqual(keyShape(fixture));
  });

  it('attaches each screen\'s daily counts', async () => {
    const { screens } = await getUsage('7d');
    expect(screens[0]).toEqual({
      page: 'expenses', views: 5, uniqueUsers: 2,
      daily: [{ day: '2026-10-07', views: 2 }, { day: '2026-10-08', views: 3 }],
    });
    expect(screens[1].daily).toEqual([{ day: '2026-10-08', views: 2 }]);
  });

  it('keeps each person\'s three most-used screens', async () => {
    const { users } = await getUsage('7d');
    expect(users[0].topPages).toEqual([
      { page: 'expenses', views: 3 },
      { page: 'leads', views: 2 },
      { page: 'dashboard', views: 1 },
    ]);
  });

  it('lists someone with no views, with an empty row', async () => {
    const { users } = await getUsage('7d');
    expect(users[1]).toEqual({
      userId: 'u2', name: 'Rita Example', role: 'coordinator', lastSeen: null,
      views: 0, mobileViews: 0, desktopViews: 0, topPages: [],
    });
  });

  it('returns empty lists, not an error, when nothing was viewed', async () => {
    routeQueries(query, [
      ['usage-totals', [{ views: 0, unique_users: 0 }]],
      ['usage-screens', []], ['usage-daily', []], ['usage-users', []], ['usage-user-pages', []],
    ]);
    expect(await getUsage('1h')).toEqual({ totals: { views: 0, uniqueUsers: 0 }, screens: [], users: [] });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && npx vitest run tests/services/devDashboard/usage.test.ts`
Expected: FAIL — cannot find module `usage`.

- [ ] **Step 3: Write `usage.ts`**

Create `backend/src/services/devDashboard/usage.ts`:

```ts
/**
 * Developer dashboard — Usage tab.
 * Which screens are opened and by whom, from page_views. Every active user
 * is listed, including those with no views, so "has not used the app" shows.
 */
import { query } from '../../config/database';
import { TimeRange, intervalFor } from './timeRange';

export interface Usage {
  totals: { views: number; uniqueUsers: number };
  screens: Array<{ page: string; views: number; uniqueUsers: number; daily: Array<{ day: string; views: number }> }>;
  users: Array<{
    userId: string; name: string; role: string; lastSeen: string | null;
    views: number; mobileViews: number; desktopViews: number;
    topPages: Array<{ page: string; views: number }>;
  }>;
}

const TOP_PAGES_PER_USER = 3;

export async function getUsage(range: TimeRange): Promise<Usage> {
  const interval = intervalFor(range);

  const [totals, screens, daily, users, userPages] = await Promise.all([
    query(`/* devdash:usage-totals */
      SELECT COUNT(*)::int AS views, COUNT(DISTINCT user_id)::int AS unique_users
        FROM page_views
       WHERE created_at > NOW() - $1::interval`, [interval]),
    query(`/* devdash:usage-screens */
      SELECT page, COUNT(*)::int AS views, COUNT(DISTINCT user_id)::int AS unique_users
        FROM page_views
       WHERE created_at > NOW() - $1::interval
       GROUP BY page
       ORDER BY views DESC, page`, [interval]),
    query(`/* devdash:usage-daily */
      SELECT page, to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day, COUNT(*)::int AS views
        FROM page_views
       WHERE created_at > NOW() - $1::interval
       GROUP BY page, date_trunc('day', created_at)
       ORDER BY date_trunc('day', created_at)`, [interval]),
    query(`/* devdash:usage-users */
      SELECT u.id, u.name, u.role,
             (SELECT MAX(seen.created_at) FROM page_views seen WHERE seen.user_id = u.id) AS last_seen,
             COUNT(pv.id)::int AS views,
             COUNT(pv.id) FILTER (WHERE pv.device = 'mobile')::int AS mobile_views,
             COUNT(pv.id) FILTER (WHERE pv.device = 'desktop')::int AS desktop_views
        FROM users u
        LEFT JOIN page_views pv ON pv.user_id = u.id AND pv.created_at > NOW() - $1::interval
       WHERE u.is_active
       GROUP BY u.id, u.name, u.role
       ORDER BY views DESC, u.name`, [interval]),
    query(`/* devdash:usage-user-pages */
      SELECT user_id, page, COUNT(*)::int AS views
        FROM page_views
       WHERE created_at > NOW() - $1::interval
       GROUP BY user_id, page
       ORDER BY views DESC, page`, [interval]),
  ]);

  const dailyByPage = new Map<string, Array<{ day: string; views: number }>>();
  for (const row of daily.rows) {
    const list = dailyByPage.get(row.page) ?? [];
    list.push({ day: row.day, views: row.views });
    dailyByPage.set(row.page, list);
  }

  const pagesByUser = new Map<string, Array<{ page: string; views: number }>>();
  for (const row of userPages.rows) {
    const list = pagesByUser.get(row.user_id) ?? [];
    if (list.length < TOP_PAGES_PER_USER) list.push({ page: row.page, views: row.views });
    pagesByUser.set(row.user_id, list);
  }

  return {
    totals: { views: totals.rows[0].views, uniqueUsers: totals.rows[0].unique_users },
    screens: screens.rows.map((row) => ({
      page: row.page,
      views: row.views,
      uniqueUsers: row.unique_users,
      daily: dailyByPage.get(row.page) ?? [],
    })),
    users: users.rows.map((row) => ({
      userId: row.id,
      name: row.name,
      role: row.role,
      lastSeen: row.last_seen ? new Date(row.last_seen).toISOString() : null,
      views: row.views,
      mobileViews: row.mobile_views,
      desktopViews: row.desktop_views,
      topPages: pagesByUser.get(row.id) ?? [],
    })),
  };
}
```

- [ ] **Step 4: Write the real-database test**

Create `backend/tests/integration/dev-dashboard-usage.test.ts`:

```ts
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { pool, query } from '../../src/config/database';
import { getUsage } from '../../src/services/devDashboard/usage';

const PAGE = 'devdash-integration';
let userId: string;

describe('usage queries against a real database', () => {
  beforeAll(async () => {
    userId = (await query('SELECT id FROM users WHERE is_active ORDER BY created_at LIMIT 1')).rows[0].id;
    await query('DELETE FROM page_views WHERE page = $1', [PAGE]);
    await query(
      `INSERT INTO page_views (user_id, page, device, created_at)
       VALUES ($1, $2, 'mobile', NOW()),
              ($1, $2, 'desktop', NOW() - INTERVAL '10 minutes'),
              ($1, $2, 'mobile', NOW() - INTERVAL '3 days')`,
      [userId, PAGE]
    );
  });

  afterAll(async () => {
    await query('DELETE FROM page_views WHERE page = $1', [PAGE]);
    await pool.end();
  });

  it('counts the screen within the range only', async () => {
    const day = (await getUsage('24h')).screens.find((s) => s.page === PAGE)!;
    const week = (await getUsage('7d')).screens.find((s) => s.page === PAGE)!;
    expect(day).toMatchObject({ views: 2, uniqueUsers: 1 });
    expect(week).toMatchObject({ views: 3, uniqueUsers: 1 });
    expect(week.daily.reduce((sum, d) => sum + d.views, 0)).toBe(3);
    expect(week.daily.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.day))).toBe(true);
  });

  it('splits the person\'s views by device and lists the screen', async () => {
    const person = (await getUsage('24h')).users.find((u) => u.userId === userId)!;
    expect(person.mobileViews).toBeGreaterThanOrEqual(1);
    expect(person.desktopViews).toBeGreaterThanOrEqual(1);
    expect(person.views).toBe(person.mobileViews + person.desktopViews);
    expect(person.lastSeen).not.toBeNull();
  });

  it('lists every active user, including those with no views', async () => {
    const active = (await query('SELECT COUNT(*)::int AS n FROM users WHERE is_active')).rows[0].n;
    expect((await getUsage('1h')).users).toHaveLength(active);
  });
});
```

- [ ] **Step 5: Verify**

Run: `cd backend && npx vitest run tests/services/devDashboard/usage.test.ts tests/integration/dev-dashboard-usage.test.ts && npx tsc --noEmit`
Expected: all PASS, `tsc` prints nothing.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(dev-dashboard): Usage module over page_views

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Sessions and Audit Log modules

**Files:**
- Create: `backend/src/services/devDashboard/sessions.ts`
- Create: `backend/src/services/devDashboard/auditLog.ts`
- Test: `backend/tests/services/devDashboard/sessions.test.ts`, `backend/tests/services/devDashboard/auditLog.test.ts`, `backend/tests/integration/dev-dashboard-audit.test.ts`

**Interfaces:**
- Consumes: `TimeRange`, `parseTimeRange`, `intervalFor`; fixtures `sessions.json`, `auditLogs.json`; `audit_logs` rows as written in Task 4 (`request_method` NULL for login events).
- Produces:
  - `getSessions(now?: Date): Promise<SessionsPayload>`
  - `groupSessions(rows: SessionRow[], now: Date): SessionsPayload['users']`
  - `parseAuditQuery(raw: Record<string, unknown>): AuditQuery`
  - `getAuditLogs(q: AuditQuery): Promise<AuditLogPage>`
  - `AuditQuery = { user?: string; method?: 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'auth'; status?: 'success' | 'warning' | 'failure'; search?: string; timeRange: TimeRange; limit: number; offset: number }`

- [ ] **Step 1: Write the failing sessions test**

Create `backend/tests/services/devDashboard/sessions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

const query = vi.fn();
vi.mock('../../../src/config/database', () => ({ query: (...args: unknown[]) => query(...args) }));

import { getSessions, groupSessions } from '../../../src/services/devDashboard/sessions';
import { keyShape } from '../../helpers/keyShape';
import { routeQueries } from '../../helpers/routeQueries';

const fixture = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../../../src/utils/__fixtures__/devDashboard/sessions.json'), 'utf8')
);

const NOW = new Date('2026-10-08T16:00:00.000Z');
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);

const row = (over: Record<string, unknown>) => ({
  id: 's1', user_id: 'u1', name: 'Digi', role: 'salesperson', ip_address: '203.0.113.9', user_agent: 'UA',
  created_at: minutesAgo(600), last_activity: minutesAgo(2), expires_at: new Date(NOW.getTime() + 3_600_000),
  ...over,
});

describe('groupSessions', () => {
  it('collapses a person\'s sessions into one row, newest first', () => {
    const users = groupSessions(
      [
        row({ id: 's1', last_activity: minutesAgo(2) }),
        row({ id: 's2', last_activity: minutesAgo(4000) }),
        row({ id: 's3', user_id: 'u2', name: 'Sasha', last_activity: minutesAgo(90) }),
      ],
      NOW
    );
    expect(users.map((u) => [u.name, u.sessionCount])).toEqual([['Digi', 2], ['Sasha', 1]]);
    expect(users[0].sessions.map((s) => s.id)).toEqual(['s1', 's2']);
    expect(users[0].lastActivity).toBe(minutesAgo(2).toISOString());
  });

  it.each([[2, 'active'], [5, 'idle'], [29, 'idle'], [30, 'away'], [5000, 'away']])(
    'calls someone last seen %i minutes ago %s',
    (minutes, status) => {
      expect(groupSessions([row({ last_activity: minutesAgo(minutes) })], NOW)[0].status).toBe(status);
    }
  );

  it('uses nulls for a session with no recorded address or browser', () => {
    const [user] = groupSessions([row({ ip_address: null, user_agent: null })], NOW);
    expect(user.sessions[0]).toMatchObject({ ipAddress: null, userAgent: null });
  });

  it('treats the placeholder address "unknown" as no address', () => {
    expect(groupSessions([row({ ip_address: 'unknown', user_agent: 'Unknown' })], NOW)[0].sessions[0])
      .toMatchObject({ ipAddress: null, userAgent: null });
  });

  it('returns an empty list for no sessions', () => {
    expect(groupSessions([], NOW)).toEqual([]);
  });
});

describe('getSessions', () => {
  beforeEach(() => { query.mockReset(); });

  it('returns exactly the contract shape', async () => {
    routeQueries(query, [['sessions', [row({}), row({ id: 's2', last_activity: minutesAgo(50) })]]]);
    expect(keyShape(await getSessions(NOW))).toEqual(keyShape(fixture));
  });

  it('asks only for sessions that have not expired', async () => {
    routeQueries(query, [['sessions', []]]);
    await getSessions(NOW);
    expect(query.mock.calls[0][0]).toContain('expires_at > NOW()');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && npx vitest run tests/services/devDashboard/sessions.test.ts`
Expected: FAIL — cannot find module `sessions`.

- [ ] **Step 3: Write `sessions.ts`**

Create `backend/src/services/devDashboard/sessions.ts`:

```ts
/**
 * Developer dashboard — Sessions tab.
 * Who is signed in right now. One row per person; their individual sessions
 * (one per device or browser) hang underneath.
 */
import { query } from '../../config/database';

export interface SessionsPayload {
  users: Array<{
    userId: string;
    name: string;
    role: string;
    status: 'active' | 'idle' | 'away';
    lastActivity: string;
    sessionCount: number;
    sessions: Array<{
      id: string; ipAddress: string | null; userAgent: string | null;
      createdAt: string; lastActivity: string; expiresAt: string;
    }>;
  }>;
}

export interface SessionRow {
  id: string;
  user_id: string;
  name: string;
  role: string;
  ip_address: string | null;
  user_agent: string | null;
  created_at: Date | string;
  last_activity: Date | string;
  expires_at: Date | string;
}

const ACTIVE_WITHIN_MS = 5 * 60_000;
const IDLE_WITHIN_MS = 30 * 60_000;

// createSession stores these placeholders when a header is missing.
const blankToNull = (value: string | null): string | null =>
  !value || value.toLowerCase() === 'unknown' ? null : value;

const iso = (value: Date | string): string => new Date(value).toISOString();

/** Rows must arrive ordered by last_activity DESC; the grouping keeps that order. */
export function groupSessions(rows: SessionRow[], now: Date): SessionsPayload['users'] {
  const byUser = new Map<string, SessionsPayload['users'][number]>();

  for (const row of rows) {
    let user = byUser.get(row.user_id);
    if (!user) {
      const idleMs = now.getTime() - new Date(row.last_activity).getTime();
      user = {
        userId: row.user_id,
        name: row.name,
        role: row.role,
        status: idleMs < ACTIVE_WITHIN_MS ? 'active' : idleMs < IDLE_WITHIN_MS ? 'idle' : 'away',
        lastActivity: iso(row.last_activity),
        sessionCount: 0,
        sessions: [],
      };
      byUser.set(row.user_id, user);
    }
    user.sessionCount += 1;
    user.sessions.push({
      id: row.id,
      ipAddress: blankToNull(row.ip_address),
      userAgent: blankToNull(row.user_agent),
      createdAt: iso(row.created_at),
      lastActivity: iso(row.last_activity),
      expiresAt: iso(row.expires_at),
    });
  }

  return [...byUser.values()];
}

export async function getSessions(now: Date = new Date()): Promise<SessionsPayload> {
  const { rows } = await query(`/* devdash:sessions */
    SELECT s.id, s.user_id, u.name, u.role, s.ip_address, s.user_agent,
           s.created_at, s.last_activity, s.expires_at
      FROM user_sessions s
      JOIN users u ON u.id = s.user_id
     WHERE s.expires_at > NOW()
     ORDER BY s.last_activity DESC`);
  return { users: groupSessions(rows as SessionRow[], now) };
}
```

- [ ] **Step 4: Write the failing audit-log test**

Create `backend/tests/services/devDashboard/auditLog.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

const query = vi.fn();
vi.mock('../../../src/config/database', () => ({ query: (...args: unknown[]) => query(...args) }));

import { getAuditLogs, parseAuditQuery } from '../../../src/services/devDashboard/auditLog';
import { keyShape } from '../../helpers/keyShape';
import { routeQueries } from '../../helpers/routeQueries';

const fixture = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../../../src/utils/__fixtures__/devDashboard/auditLogs.json'), 'utf8')
);

const ROW = {
  id: 'a1', created_at: new Date('2026-10-08T15:40:00.000Z'), user_name: 'sahil', user_role: 'developer',
  action: 'PUT /api/events/:id', request_method: 'PUT', request_path: '/api/events/abc',
  status: 'success', ip_address: '203.0.113.9', error_message: null,
};

describe('parseAuditQuery', () => {
  it('defaults to the last 24 hours, 50 rows, from the start', () => {
    expect(parseAuditQuery({})).toEqual({ timeRange: '24h', limit: 50, offset: 0 });
  });

  it('keeps recognised filters and trims text', () => {
    expect(parseAuditQuery({
      user: '  sahil ', method: 'delete', status: 'failure', search: ' events ', timeRange: '7d', limit: '25', offset: '50',
    })).toEqual({ user: 'sahil', method: 'DELETE', status: 'failure', search: 'events', timeRange: '7d', limit: 25, offset: 50 });
  });

  it('accepts "auth" as the method for login events', () => {
    expect(parseAuditQuery({ method: 'auth' }).method).toBe('auth');
  });

  it.each([
    ['an unknown method', { method: 'GET' }, 'method'],
    ['an unknown status', { status: 'pending' }, 'status'],
    ['blank search', { search: '   ' }, 'search'],
    ['a non-string user', { user: ['a', 'b'] }, 'user'],
  ])('drops %s', (_name, raw, key) => {
    expect(parseAuditQuery(raw)).not.toHaveProperty(key);
  });

  it.each([
    [{ limit: '1000' }, 200, 0],
    [{ limit: '0' }, 50, 0],
    [{ limit: 'abc' }, 50, 0],
    [{ limit: '-5' }, 50, 0],
    [{ offset: '-10' }, 50, 0],
    [{ offset: 'abc' }, 50, 0],
    [{ limit: '10.9', offset: '20.2' }, 10, 20],
  ])('clamps %j to limit %i offset %i', (raw, limit, offset) => {
    expect(parseAuditQuery(raw)).toMatchObject({ limit, offset });
  });
});

describe('getAuditLogs', () => {
  beforeEach(() => {
    query.mockReset();
    routeQueries(query, [['audit-count', [{ total: 37 }]], ['audit-rows', [ROW]]]);
  });

  const sqlFor = (tag: string) => query.mock.calls.find(([sql]) => sql.includes(`devdash:${tag}`))!;

  it('returns exactly the contract shape', async () => {
    expect(keyShape(await getAuditLogs(parseAuditQuery({})))).toEqual(keyShape(fixture));
  });

  it('returns the total across all pages, not the page length', async () => {
    expect((await getAuditLogs(parseAuditQuery({ limit: '1' }))).total).toBe(37);
  });

  it('applies every filter in SQL, to the count and the page alike', async () => {
    await getAuditLogs(parseAuditQuery({ user: 'sahil', method: 'PUT', status: 'success', search: 'events', timeRange: '7d' }));
    const [countSql, countParams] = sqlFor('audit-count');
    const [rowsSql, rowsParams] = sqlFor('audit-rows');
    expect(countParams).toEqual(['7 days', '%sahil%', 'PUT', 'success', '%events%']);
    expect(rowsParams).toEqual([...countParams, 50, 0]);
    for (const sql of [countSql, rowsSql]) {
      expect(sql).toContain('user_name ILIKE $2');
      expect(sql).toContain('request_method = $3');
      expect(sql).toContain('status = $4');
      expect(sql).toContain('ILIKE $5');
    }
  });

  it('finds login events by their missing method', async () => {
    await getAuditLogs(parseAuditQuery({ method: 'auth' }));
    const [sql, params] = sqlFor('audit-count');
    expect(sql).toContain('request_method IS NULL');
    expect(params).toEqual(['24 hours']);
  });

  it('matches % and _ in a search literally', async () => {
    await getAuditLogs(parseAuditQuery({ search: '50%_off' }));
    expect(sqlFor('audit-count')[1]).toEqual(['24 hours', '%50\\%\\_off%']);
  });

  it('never puts filter text into the SQL itself', async () => {
    await getAuditLogs(parseAuditQuery({ user: "x'; DROP TABLE users;--", search: 'needle' }));
    for (const [sql] of query.mock.calls) {
      expect(sql).not.toContain('DROP TABLE');
      expect(sql).not.toContain('needle');
    }
  });

  it('lets a query failure reach the caller instead of returning an empty list', async () => {
    routeQueries(query, [['audit-count', new Error('permission denied for table audit_logs')], ['audit-rows', []]]);
    await expect(getAuditLogs(parseAuditQuery({}))).rejects.toThrow('permission denied');
  });
});
```

- [ ] **Step 5: Run it to verify it fails**

Run: `cd backend && npx vitest run tests/services/devDashboard/auditLog.test.ts`
Expected: FAIL — cannot find module `auditLog`.

- [ ] **Step 6: Write `auditLog.ts`**

Create `backend/src/services/devDashboard/auditLog.ts`:

```ts
/**
 * Developer dashboard — Audit Log tab.
 * Reads audit_logs with every filter applied in SQL. There is no fallback:
 * if the table cannot be read the error reaches the caller, because an
 * empty list would hide exactly the failure this tab exists to show.
 */
import { query } from '../../config/database';
import { TimeRange, parseTimeRange, intervalFor } from './timeRange';

const METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'] as const;
const STATUSES = ['success', 'warning', 'failure'] as const;

export interface AuditQuery {
  user?: string;
  /** 'auth' selects login/logout events, which carry no HTTP method. */
  method?: (typeof METHODS)[number] | 'auth';
  status?: (typeof STATUSES)[number];
  search?: string;
  timeRange: TimeRange;
  limit: number;
  offset: number;
}

export interface AuditLogPage {
  logs: Array<{
    id: string; createdAt: string; userName: string | null; userRole: string | null; action: string;
    method: string | null; path: string | null; status: string; ipAddress: string | null; errorMessage: string | null;
  }>;
  total: number;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const text = (raw: unknown): string | undefined => {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed || undefined;
};

const wholeNumber = (raw: unknown): number | undefined => {
  const parsed = typeof raw === 'string' || typeof raw === 'number' ? Math.floor(Number(raw)) : NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
};

export function parseAuditQuery(raw: Record<string, unknown>): AuditQuery {
  const parsed: AuditQuery = { timeRange: parseTimeRange(raw.timeRange), limit: DEFAULT_LIMIT, offset: 0 };

  const user = text(raw.user);
  if (user) parsed.user = user;

  const search = text(raw.search);
  if (search) parsed.search = search;

  const method = text(raw.method);
  if (method?.toLowerCase() === 'auth') parsed.method = 'auth';
  else if (method && (METHODS as readonly string[]).includes(method.toUpperCase())) {
    parsed.method = method.toUpperCase() as AuditQuery['method'];
  }

  const status = text(raw.status);
  if (status && (STATUSES as readonly string[]).includes(status)) parsed.status = status as AuditQuery['status'];

  const limit = wholeNumber(raw.limit);
  if (limit !== undefined && limit >= 1) parsed.limit = Math.min(limit, MAX_LIMIT);

  const offset = wholeNumber(raw.offset);
  if (offset !== undefined && offset >= 0) parsed.offset = offset;

  return parsed;
}

/** % and _ are wildcards in ILIKE; someone searching for them means the characters. */
const likePattern = (value: string): string => `%${value.replace(/[\\%_]/g, '\\$&')}%`;

export async function getAuditLogs(q: AuditQuery): Promise<AuditLogPage> {
  const params: unknown[] = [intervalFor(q.timeRange)];
  const where = ['created_at > NOW() - $1::interval'];
  const add = (value: unknown): string => {
    params.push(value);
    return `$${params.length}`;
  };

  if (q.user) where.push(`user_name ILIKE ${add(likePattern(q.user))}`);
  if (q.method === 'auth') where.push('request_method IS NULL');
  else if (q.method) where.push(`request_method = ${add(q.method)}`);
  if (q.status) where.push(`status = ${add(q.status)}`);
  if (q.search) {
    const p = add(likePattern(q.search));
    where.push(`(action ILIKE ${p} OR request_path ILIKE ${p} OR user_name ILIKE ${p} OR error_message ILIKE ${p})`);
  }

  const whereSql = where.join(' AND ');

  const count = await query(`/* devdash:audit-count */
    SELECT COUNT(*)::int AS total FROM audit_logs WHERE ${whereSql}`, params);

  const page = await query(`/* devdash:audit-rows */
    SELECT id, created_at, user_name, user_role, action, request_method, request_path,
           status, host(ip_address::inet) AS ip_address, error_message
      FROM audit_logs
     WHERE ${whereSql}
     ORDER BY created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, q.limit, q.offset]);

  return {
    logs: page.rows.map((row) => ({
      id: row.id,
      createdAt: new Date(row.created_at).toISOString(),
      userName: row.user_name ?? null,
      userRole: row.user_role ?? null,
      action: row.action,
      method: row.request_method ?? null,
      path: row.request_path ?? null,
      status: row.status,
      ipAddress: row.ip_address ?? null,
      errorMessage: row.error_message ?? null,
    })),
    total: count.rows[0].total,
  };
}
```

Note on `host(ip_address::inet)`: `ip_address` is `INET` on databases built from migration 004 and may be `VARCHAR` where migration 023's conversion did not apply. The cast works for both, and `host()` drops the `/32` suffix `INET` otherwise prints.

- [ ] **Step 7: Write the real-database test**

Create `backend/tests/integration/dev-dashboard-audit.test.ts`:

```ts
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { pool, query } from '../../src/config/database';
import { getAuditLogs, parseAuditQuery } from '../../src/services/devDashboard/auditLog';
import { getSessions } from '../../src/services/devDashboard/sessions';
import { logAudit } from '../../src/utils/auditLogger';

const MARK = 'devdash_integration';

describe('audit log and sessions against a real database', () => {
  beforeAll(async () => {
    await query('DELETE FROM audit_logs WHERE user_name = $1', [MARK]);
    await logAudit({ userName: MARK, action: 'PUT /api/events/:id', status: 'success', ipAddress: '203.0.113.9',
      requestMethod: 'PUT', requestPath: '/api/events/100%_done' });
    await logAudit({ userName: MARK, action: 'DELETE /api/booths/:id', status: 'failure', requestMethod: 'DELETE',
      requestPath: '/api/booths/7', errorMessage: 'boom' });
    await logAudit({ userName: MARK, action: 'login_failed', status: 'failure', errorMessage: 'Invalid password' });
  });

  afterAll(async () => {
    await query('DELETE FROM audit_logs WHERE user_name = $1', [MARK]);
    await pool.end();
  });

  const find = (raw: Record<string, unknown>) => getAuditLogs(parseAuditQuery({ user: MARK, ...raw }));

  it('writes all three rows and reads them back newest first', async () => {
    const { logs, total } = await find({});
    expect(total).toBe(3);
    expect(logs.map((l) => l.action).sort()).toEqual(['DELETE /api/booths/:id', 'PUT /api/events/:id', 'login_failed']);
  });

  it('prints the address without a network suffix', async () => {
    const { logs } = await find({ method: 'PUT' });
    expect(logs[0].ipAddress).toBe('203.0.113.9');
  });

  it('filters by method, by status, and login events by "auth"', async () => {
    expect((await find({ method: 'DELETE' })).total).toBe(1);
    expect((await find({ status: 'failure' })).total).toBe(2);
    expect((await find({ method: 'auth' })).logs[0]).toMatchObject({ action: 'login_failed', method: null, path: null });
  });

  it('matches a literal % and _ in the path', async () => {
    expect((await find({ search: '100%_done' })).total).toBe(1);
    expect((await find({ search: '1%e' })).total).toBe(0);
  });

  it('pages with a stable total', async () => {
    const first = await find({ limit: '2' });
    const second = await find({ limit: '2', offset: '2' });
    expect([first.logs.length, second.logs.length]).toEqual([2, 1]);
    expect([first.total, second.total]).toEqual([3, 3]);
  });

  it('runs the sessions query', async () => {
    const { users } = await getSessions();
    expect(Array.isArray(users)).toBe(true);
    for (const user of users) expect(user.sessionCount).toBe(user.sessions.length);
  });
});
```

- [ ] **Step 8: Verify**

Run: `cd backend && npx vitest run tests/services/devDashboard tests/integration/dev-dashboard-audit.test.ts && npx tsc --noEmit`
Expected: all PASS, `tsc` prints nothing.

If "writes all three rows" finds 0, the local `audit_logs` table is rejecting inserts (the same fault suspected in production). Run `cd backend && psql "$DATABASE_URL" -c "\d audit_logs"` or the equivalent with the `DB_*` values from `backend/.env`, report what differs from migration 004, and stop: do not weaken the test.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(dev-dashboard): Sessions grouped by person, and a filtered, paged Audit Log

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: New routes, retention job, and removal of the old service

**Files:**
- Rewrite: `backend/src/routes/devDashboard.ts`
- Create: `backend/src/services/devDashboard/RetentionJob.ts`
- Modify: `backend/src/server.ts` (import + start)
- Delete: `backend/src/services/DevDashboardService.ts`, `backend/src/services/DevDashboardService.helpers.ts`, `backend/src/services/DevDashboardService.expenseStats.ts`, `backend/src/services/dashboard/` (all four files), `backend/tests/services/DevDashboardService.test.ts`, `backend/tests/services/DevDashboardService.helpers.test.ts`
- Test: `backend/tests/routes/devDashboard.test.ts`, `backend/tests/services/devDashboard/RetentionJob.test.ts`, `backend/tests/integration/dev-dashboard-retention.test.ts`

**Interfaces:**
- Consumes: `getOverview`, `getApiAnalytics`, `getUsage`, `getSessions`, `getAuditLogs`, `parseAuditQuery`, `parseTimeRange` (Tasks 5-8); `pageViewRepository.deleteOlderThan`, `apiRequestRepository.deleteOlderThan`, `auditLogRepository.deleteOlderThan` (each `(days: number) => Promise<number>`); `cleanupExpiredSessions(): Promise<number>` from `middleware/sessionTracker`.
- Produces:
  - `GET /api/dev-dashboard/overview`, `/api-analytics`, `/usage`, `/sessions`, `/audit-logs`
  - `retentionJob.start(): void`, `retentionJob.stop(): void`, `retentionJob.run(): Promise<void>`

- [ ] **Step 1: Write the failing route test**

Create `backend/tests/routes/devDashboard.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/config/database', () => ({ query: vi.fn(), pool: { query: vi.fn() } }));

const getOverview = vi.fn();
const getApiAnalytics = vi.fn();
const getUsage = vi.fn();
const getSessions = vi.fn();
const getAuditLogs = vi.fn();

vi.mock('../../src/services/devDashboard/overview', () => ({ getOverview: () => getOverview() }));
vi.mock('../../src/services/devDashboard/apiAnalytics', () => ({ getApiAnalytics: (r: string) => getApiAnalytics(r) }));
vi.mock('../../src/services/devDashboard/usage', () => ({ getUsage: (r: string) => getUsage(r) }));
vi.mock('../../src/services/devDashboard/sessions', () => ({ getSessions: () => getSessions() }));
vi.mock('../../src/services/devDashboard/auditLog', async (original) => ({
  ...(await original<typeof import('../../src/services/devDashboard/auditLog')>()),
  getAuditLogs: (q: unknown) => getAuditLogs(q),
}));

import router, { requireDashboardRole } from '../../src/routes/devDashboard';
import { routeHandler } from '../helpers/routeHandler';

const mockRes = () => {
  const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
  return res;
};

// asyncHandler returns before the handler's promise settles, so let it finish.
const call = async (path: string, req: unknown, res: unknown, next = vi.fn()) => {
  routeHandler(router, 'get', path)(req, res, next);
  await new Promise((resolve) => setImmediate(resolve));
  return next;
};

describe('dev dashboard routes', () => {
  beforeEach(() => { [getOverview, getApiAnalytics, getUsage, getSessions, getAuditLogs].forEach((m) => m.mockReset()); });

  it('exposes exactly the five read endpoints', () => {
    const surface = (router as any).stack
      .filter((layer: any) => layer.route)
      .map((layer: any) => `${Object.keys(layer.route.methods)[0].toUpperCase()} ${layer.route.path}`)
      .sort();
    expect(surface).toEqual([
      'GET /api-analytics', 'GET /audit-logs', 'GET /overview', 'GET /sessions', 'GET /usage',
    ]);
  });

  it.each(['admin', 'developer'])('lets %s in', (role) => {
    const next = vi.fn();
    requireDashboardRole({ user: { id: 'u', username: 'u', role } } as any, mockRes(), next);
    expect(next).toHaveBeenCalled();
  });

  it.each(['salesperson', 'coordinator', 'accountant', 'temporary', 'pending'])('refuses %s with 403', (role) => {
    const next = vi.fn();
    const res = mockRes();
    requireDashboardRole({ user: { id: 'u', username: 'u', role } } as any, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('refuses a request with no user', () => {
    const res = mockRes();
    requireDashboardRole({} as any, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('passes a valid range through and replaces a bad one with 24h', async () => {
    getApiAnalytics.mockResolvedValue({ ok: true });
    getUsage.mockResolvedValue({ ok: true });
    await call('/api-analytics', { query: { timeRange: '7d' } }, mockRes());
    await call('/usage', { query: { timeRange: 'forever' } }, mockRes());
    expect(getApiAnalytics).toHaveBeenCalledWith('7d');
    expect(getUsage).toHaveBeenCalledWith('24h');
  });

  it('parses the audit filters before querying', async () => {
    getAuditLogs.mockResolvedValue({ logs: [], total: 0 });
    const res = mockRes();
    await call('/audit-logs', { query: { limit: '9999', method: 'delete' } }, res);
    expect(getAuditLogs).toHaveBeenCalledWith({ timeRange: '24h', limit: 200, offset: 0, method: 'DELETE' });
    expect(res.json).toHaveBeenCalledWith({ logs: [], total: 0 });
  });

  it('hands a service failure to the error handler rather than answering with empty data', async () => {
    getSessions.mockRejectedValue(new Error('db down'));
    const res = mockRes();
    const next = await call('/sessions', { query: {} }, res);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'db down' }));
    expect(res.json).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && npx vitest run tests/routes/devDashboard.test.ts`
Expected: FAIL — `requireDashboardRole` is not exported, and the surface lists the old endpoints.

- [ ] **Step 3: Rewrite `backend/src/routes/devDashboard.ts`**

Replace the whole file with:

```ts
/**
 * Developer dashboard — /api/dev-dashboard
 * One read endpoint per tab. Each fails on its own: an error goes to the
 * error handler as a 500 and the other tabs keep working.
 */
import express, { Response, NextFunction } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/errors';
import { parseTimeRange } from '../services/devDashboard/timeRange';
import { getOverview } from '../services/devDashboard/overview';
import { getApiAnalytics } from '../services/devDashboard/apiAnalytics';
import { getUsage } from '../services/devDashboard/usage';
import { getSessions } from '../services/devDashboard/sessions';
import { getAuditLogs, parseAuditQuery } from '../services/devDashboard/auditLog';

const router = express.Router();

export function requireDashboardRole(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'developer')) {
    res.status(403).json({ error: 'Admin or developer access required' });
    return;
  }
  next();
}

router.use(authenticateToken);
router.use(requireDashboardRole);

router.get('/overview', asyncHandler(async (_req: AuthRequest, res: Response) => {
  res.json(await getOverview());
}));

router.get('/api-analytics', asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json(await getApiAnalytics(parseTimeRange(req.query.timeRange)));
}));

router.get('/usage', asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json(await getUsage(parseTimeRange(req.query.timeRange)));
}));

router.get('/sessions', asyncHandler(async (_req: AuthRequest, res: Response) => {
  res.json(await getSessions());
}));

router.get('/audit-logs', asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json(await getAuditLogs(parseAuditQuery(req.query as Record<string, unknown>)));
}));

export default router;
```

- [ ] **Step 4: Delete the old service and its tests**

```bash
git rm backend/src/services/DevDashboardService.ts \
       backend/src/services/DevDashboardService.helpers.ts \
       backend/src/services/DevDashboardService.expenseStats.ts \
       backend/tests/services/DevDashboardService.test.ts \
       backend/tests/services/DevDashboardService.helpers.test.ts
git rm -r backend/src/services/dashboard
```

Run: `grep -rnE "DevDashboardService|services/dashboard'|services/dashboard\"|expenseStats" backend/src backend/tests`
Expected: no output. If a test file still imports one of the deleted modules, delete that test file too.

- [ ] **Step 5: Write the failing retention tests**

Create `backend/tests/services/devDashboard/RetentionJob.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const apiRequests = vi.fn();
const pageViews = vi.fn();
const auditLogs = vi.fn();
const sessions = vi.fn();

vi.mock('../../../src/config/database', () => ({ query: vi.fn(), pool: { query: vi.fn() } }));
vi.mock('../../../src/database/repositories', () => ({
  apiRequestRepository: { deleteOlderThan: (d: number) => apiRequests(d) },
  pageViewRepository: { deleteOlderThan: (d: number) => pageViews(d) },
  auditLogRepository: { deleteOlderThan: (d: number) => auditLogs(d) },
}));
vi.mock('../../../src/middleware/sessionTracker', () => ({ cleanupExpiredSessions: () => sessions() }));

import { RetentionJob } from '../../../src/services/devDashboard/RetentionJob';

describe('RetentionJob', () => {
  beforeEach(() => {
    [apiRequests, pageViews, auditLogs, sessions].forEach((m) => { m.mockReset(); m.mockResolvedValue(0); });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

  it('prunes each table to its retention period', async () => {
    await new RetentionJob().run();
    expect(apiRequests).toHaveBeenCalledWith(30);
    expect(pageViews).toHaveBeenCalledWith(90);
    expect(auditLogs).toHaveBeenCalledWith(365);
    expect(sessions).toHaveBeenCalledTimes(1);
  });

  it('carries on when one table fails', async () => {
    apiRequests.mockRejectedValue(new Error('permission denied'));
    await expect(new RetentionJob().run()).resolves.toBeUndefined();
    expect(pageViews).toHaveBeenCalled();
    expect(auditLogs).toHaveBeenCalled();
    expect(sessions).toHaveBeenCalled();
  });

  it('runs once shortly after start and then every 24 hours', async () => {
    vi.useFakeTimers();
    const job = new RetentionJob();
    job.start();
    expect(sessions).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sessions).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
    expect(sessions).toHaveBeenCalledTimes(2);
    job.stop();
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
    expect(sessions).toHaveBeenCalledTimes(2);
  });

  it('does not start twice', async () => {
    vi.useFakeTimers();
    const job = new RetentionJob();
    job.start();
    job.start();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sessions).toHaveBeenCalledTimes(1);
    job.stop();
  });
});
```

Create `backend/tests/integration/dev-dashboard-retention.test.ts`:

```ts
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { pool, query } from '../../src/config/database';
import { pageViewRepository } from '../../src/database/repositories';

const PAGE = 'devdash-retention';

describe('page view retention against a real database', () => {
  beforeAll(async () => {
    const userId = (await query('SELECT id FROM users LIMIT 1')).rows[0].id;
    await query('DELETE FROM page_views WHERE page = $1', [PAGE]);
    await query(
      `INSERT INTO page_views (user_id, page, device, created_at)
       VALUES ($1, $2, 'mobile', NOW() - INTERVAL '91 days'),
              ($1, $2, 'mobile', NOW() - INTERVAL '89 days')`,
      [userId, PAGE]
    );
  });

  afterAll(async () => {
    await query('DELETE FROM page_views WHERE page = $1', [PAGE]);
    await pool.end();
  });

  it('deletes rows older than 90 days and keeps newer ones', async () => {
    const deleted = await pageViewRepository.deleteOlderThan(90);
    expect(deleted).toBeGreaterThanOrEqual(1);
    const left = await query('SELECT COUNT(*)::int AS n FROM page_views WHERE page = $1', [PAGE]);
    expect(left.rows[0].n).toBe(1);
  });
});
```

- [ ] **Step 6: Run them to verify they fail**

Run: `cd backend && npx vitest run tests/services/devDashboard/RetentionJob.test.ts`
Expected: FAIL — cannot find module `RetentionJob`.

- [ ] **Step 7: Write `RetentionJob.ts`**

Create `backend/src/services/devDashboard/RetentionJob.ts`:

```ts
/**
 * Daily cleanup of the dashboard's log tables. The cleanup functions existed
 * for years with nothing calling them, so every table grew without limit.
 * Each step is independent: one failing is logged and the rest still run.
 */
import { apiRequestRepository, pageViewRepository, auditLogRepository } from '../../database/repositories';
import { cleanupExpiredSessions } from '../../middleware/sessionTracker';

const RUN_INTERVAL_MS = 24 * 60 * 60 * 1000;
const STARTUP_DELAY_MS = 60 * 1000; // let DB/migrations settle

const STEPS: Array<{ table: string; run: () => Promise<number> }> = [
  { table: 'api_requests', run: () => apiRequestRepository.deleteOlderThan(30) },
  { table: 'page_views', run: () => pageViewRepository.deleteOlderThan(90) },
  { table: 'audit_logs', run: () => auditLogRepository.deleteOlderThan(365) },
  { table: 'user_sessions', run: () => cleanupExpiredSessions() },
];

export class RetentionJob {
  private timer: NodeJS.Timeout | null = null;
  private startupTimer: NodeJS.Timeout | null = null;

  start(): void {
    if (this.timer) return;
    this.startupTimer = setTimeout(() => void this.run(), STARTUP_DELAY_MS);
    this.timer = setInterval(() => void this.run(), RUN_INTERVAL_MS);
    console.log('[Retention] Scheduler started (daily: api_requests 30d, page_views 90d, audit_logs 365d, expired sessions)');
  }

  stop(): void {
    if (this.startupTimer) clearTimeout(this.startupTimer);
    if (this.timer) clearInterval(this.timer);
    this.startupTimer = null;
    this.timer = null;
  }

  /** One pass over every table. Never throws. */
  async run(): Promise<void> {
    for (const step of STEPS) {
      try {
        const deleted = await step.run();
        if (deleted > 0) console.log(`[Retention] Deleted ${deleted} rows from ${step.table}`);
      } catch (error) {
        console.error(`[Retention] Cleanup failed for ${step.table}:`, error);
      }
    }
  }
}

export const retentionJob = new RetentionJob();
```

- [ ] **Step 8: Start it in `backend/src/server.ts`**

Add beside the other service imports:

```ts
import { retentionJob } from './services/devDashboard/RetentionJob';
```

Add inside the `app.listen` callback, after `badgeWebhookService.start();`:

```ts

    // Daily cleanup of api_requests, page_views, audit_logs and expired sessions
    retentionJob.start();
```

- [ ] **Step 9: Verify**

Run: `cd backend && npx vitest run tests/routes/devDashboard.test.ts tests/services/devDashboard tests/integration/dev-dashboard-retention.test.ts && npx tsc --noEmit`
Expected: all PASS, `tsc` prints nothing.

Run: `cd backend && npx vitest run`
Expected: no failures in files this plan created or modified. Note any other failure with its file name in the task report; do not fix unrelated tests.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(dev-dashboard): one endpoint per tab, daily retention job; remove the old service

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Frontend foundations — types, API bindings, cached resource hook, small helpers

**Files:**
- Create: `src/components/developer/DevDashboard/types.ts`, `format.ts`, `userAgent.ts`, `useDashboardResource.ts`, `TrendBars.tsx`, `TabState.tsx`
- Modify: `src/utils/api.ts` (add five bindings to the `devDashboard` block; the old ones stay until Task 13)
- Test: `src/components/developer/DevDashboard/__tests__/useDashboardResource.test.ts`, `userAgent.test.ts`, `format.test.ts`, `TrendBars.test.tsx`

**Interfaces:**
- Consumes: the five endpoints from Task 9 and the fixture shapes from Task 5.
- Produces:
  - Types `TimeRange`, `Overview`, `HealthCheck`, `ApiAnalytics`, `Usage`, `SessionsPayload`, `AuditLogPage`, `AuditFilters`
  - `api.devDashboard.getOverview()`, `.getApiAnalyticsV2(timeRange)`, `.getUsage(timeRange)`, `.getSessionsV2()`, `.getAuditLogPage(filters)` (renamed to their final names in Task 13)
  - `useDashboardResource<T>(key: string, fetcher: () => Promise<T>, options?: { pollMs?: number }): { data: T | undefined; loading: boolean; refreshing: boolean; error: string | null; refresh: () => void }`
  - `refreshOpenResources(): void`, `clearDashboardCache(): void`
  - `formatBytes(bytes: number): string`, `formatUptime(seconds: number): string`, `timeAgo(iso: string | null, now?: Date): string`, `formatDateTime(iso: string): string`
  - `describeUserAgent(ua: string | null): { browser: string; os: string; device: 'mobile' | 'desktop'; label: string }`
  - `<TrendBars values labels ariaLabel highlights? height? />`
  - `<TabState resource skeletonRows?>{(data) => …}</TabState>`

- [ ] **Step 1: Write the types**

Create `src/components/developer/DevDashboard/types.ts`:

```ts
/**
 * Response shapes of /api/dev-dashboard/*. The JSON files in
 * src/utils/__fixtures__/devDashboard/ are the contract: backend tests assert
 * each service returns exactly those keys, and the tab tests render from them.
 */
export type TimeRange = '1h' | '24h' | '7d' | '30d';

export interface HealthCheck {
  id: string;
  label: string;
  status: 'pass' | 'warn' | 'fail';
  value: string;
  threshold: string;
}

export interface Overview {
  version: { frontend: string; backend: string; node: string; environment: string; uptimeSeconds: number };
  system: {
    memory: { usedBytes: number; totalBytes: number };
    cpu: { load1: number; cores: number };
    disk: { usedBytes: number; totalBytes: number } | null;
  };
  database: {
    sizeBytes: number;
    connections: number;
    maxConnections: number;
    tables: Array<{ name: string; sizeBytes: number }>;
  };
  checks: HealthCheck[];
}

export interface ApiAnalytics {
  totals: { requests: number; errors: number; errorRate: number; p50Ms: number; p95Ms: number };
  buckets: Array<{ start: string; requests: number; errors: number }>;
  endpoints: Array<{
    method: string; endpoint: string; calls: number; avgMs: number; p95Ms: number; maxMs: number; errors: number;
  }>;
  slowest: Array<{ method: string; endpoint: string; calls: number; avgMs: number; maxMs: number }>;
  recentErrors: Array<{
    id: string; createdAt: string; method: string; endpoint: string; statusCode: number;
    userName: string | null; errorMessage: string | null;
  }>;
}

export interface Usage {
  totals: { views: number; uniqueUsers: number };
  screens: Array<{ page: string; views: number; uniqueUsers: number; daily: Array<{ day: string; views: number }> }>;
  users: Array<{
    userId: string; name: string; role: string; lastSeen: string | null;
    views: number; mobileViews: number; desktopViews: number;
    topPages: Array<{ page: string; views: number }>;
  }>;
}

export interface SessionsPayload {
  users: Array<{
    userId: string;
    name: string;
    role: string;
    status: 'active' | 'idle' | 'away';
    lastActivity: string;
    sessionCount: number;
    sessions: Array<{
      id: string; ipAddress: string | null; userAgent: string | null;
      createdAt: string; lastActivity: string; expiresAt: string;
    }>;
  }>;
}

export interface AuditLogPage {
  logs: Array<{
    id: string; createdAt: string; userName: string | null; userRole: string | null; action: string;
    method: string | null; path: string | null; status: string; ipAddress: string | null; errorMessage: string | null;
  }>;
  total: number;
}

export interface AuditFilters {
  user: string;
  method: '' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'auth';
  status: '' | 'success' | 'warning' | 'failure';
  search: string;
  timeRange: TimeRange;
  limit: number;
  offset: number;
}
```

- [ ] **Step 2: Add the API bindings**

In `src/utils/api.ts`, add this import near the top:

```ts
import type {
  Overview, ApiAnalytics, Usage, SessionsPayload, AuditLogPage, AuditFilters, TimeRange,
} from '../components/developer/DevDashboard/types';
```

Inside the existing `devDashboard: { … }` block, add these five entries after `getOcrMetrics`:

```ts
    getOverview: () => apiClient.get<Overview>('/dev-dashboard/overview'),
    getApiAnalyticsV2: (timeRange: TimeRange) =>
      apiClient.get<ApiAnalytics>('/dev-dashboard/api-analytics', { params: { timeRange } }),
    getUsage: (timeRange: TimeRange) => apiClient.get<Usage>('/dev-dashboard/usage', { params: { timeRange } }),
    getSessionsV2: () => apiClient.get<SessionsPayload>('/dev-dashboard/sessions'),
    getAuditLogPage: (filters: AuditFilters) => {
      // Empty filters are left off the query string rather than sent as "".
      const params: Record<string, string | number> = {
        timeRange: filters.timeRange, limit: filters.limit, offset: filters.offset,
      };
      if (filters.user) params.user = filters.user;
      if (filters.method) params.method = filters.method;
      if (filters.status) params.status = filters.status;
      if (filters.search) params.search = filters.search;
      return apiClient.get<AuditLogPage>('/dev-dashboard/audit-logs', { params });
    },
```

- [ ] **Step 3: Write the failing hook test**

Create `src/components/developer/DevDashboard/__tests__/useDashboardResource.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useDashboardResource, clearDashboardCache, refreshOpenResources } from '../useDashboardResource';

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

const setVisibility = (state: 'visible' | 'hidden') => {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
};

describe('useDashboardResource', () => {
  beforeEach(() => { clearDashboardCache(); setVisibility('visible'); });
  afterEach(() => { vi.useRealTimers(); });

  it('reports loading, then the data', async () => {
    const { result } = renderHook(() => useDashboardResource('k1', () => Promise.resolve('first')));
    expect(result.current).toMatchObject({ data: undefined, loading: true, error: null });
    await waitFor(() => expect(result.current.data).toBe('first'));
    expect(result.current.loading).toBe(false);
  });

  it('shows the cached value at once on a second mount and refreshes behind it', async () => {
    const first = renderHook(() => useDashboardResource('k2', () => Promise.resolve('old')));
    await waitFor(() => expect(first.result.current.data).toBe('old'));
    first.unmount();

    const next = deferred<string>();
    const second = renderHook(() => useDashboardResource('k2', () => next.promise));
    expect(second.result.current).toMatchObject({ data: 'old', loading: false, refreshing: true });
    await act(async () => { next.resolve('new'); });
    expect(second.result.current).toMatchObject({ data: 'new', refreshing: false });
  });

  it('reports a failure and recovers on refresh', async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new Error('db down')).mockResolvedValueOnce('ok');
    const { result } = renderHook(() => useDashboardResource('k3', fetcher));
    await waitFor(() => expect(result.current.error).toBe('db down'));
    expect(result.current.loading).toBe(false);
    await act(async () => { result.current.refresh(); });
    await waitFor(() => expect(result.current.data).toBe('ok'));
    expect(result.current.error).toBeNull();
  });

  it('keeps showing the last good data when a background refresh fails', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce('good').mockRejectedValueOnce(new Error('blip'));
    const { result } = renderHook(() => useDashboardResource('k4', fetcher));
    await waitFor(() => expect(result.current.data).toBe('good'));
    await act(async () => { result.current.refresh(); });
    await waitFor(() => expect(result.current.error).toBe('blip'));
    expect(result.current.data).toBe('good');
  });

  it('ignores a slow answer for a key that is no longer shown', async () => {
    const slow = deferred<string>();
    const fast = deferred<string>();
    const fetchers: Record<string, () => Promise<string>> = { a: () => slow.promise, b: () => fast.promise };
    const { result, rerender } = renderHook(({ k }) => useDashboardResource(k, fetchers[k]), {
      initialProps: { k: 'a' },
    });
    rerender({ k: 'b' });
    await act(async () => { fast.resolve('B'); });
    await act(async () => { slow.resolve('A'); });
    expect(result.current.data).toBe('B');
  });

  it('polls while the page is visible and pauses while it is hidden', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValue('x');
    renderHook(() => useDashboardResource('k5', fetcher, { pollMs: 30_000 }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(fetcher).toHaveBeenCalledTimes(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(fetcher).toHaveBeenCalledTimes(2);

    setVisibility('hidden');
    await act(async () => { await vi.advanceTimersByTimeAsync(90_000); });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('does not poll unless asked to', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValue('x');
    renderHook(() => useDashboardResource('k6', fetcher));
    await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('refetches every mounted resource when the header asks', async () => {
    const fetcher = vi.fn().mockResolvedValue('x');
    const { result } = renderHook(() => useDashboardResource('k7', fetcher));
    await waitFor(() => expect(result.current.data).toBe('x'));
    await act(async () => { refreshOpenResources(); });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('stops listening after unmount', async () => {
    const fetcher = vi.fn().mockResolvedValue('x');
    const { result, unmount } = renderHook(() => useDashboardResource('k8', fetcher));
    await waitFor(() => expect(result.current.data).toBe('x'));
    unmount();
    refreshOpenResources();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npx vitest run src/components/developer/DevDashboard/__tests__/useDashboardResource.test.ts`
Expected: FAIL — cannot find module `../useDashboardResource`.

- [ ] **Step 5: Write the hook**

Create `src/components/developer/DevDashboard/useDashboardResource.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Data for one dashboard tab.
 *
 * The cache is module-level and keyed by tab + parameters, so switching back
 * to a tab shows its last result immediately and refreshes behind it. Only a
 * tab with nothing cached shows a loading state.
 */
const cache = new Map<string, unknown>();
const openResources = new Set<() => void>();

export function clearDashboardCache(): void {
  cache.clear();
}

/** Refetch whatever is on screen. Used by the header's Refresh button. */
export function refreshOpenResources(): void {
  openResources.forEach((load) => load());
}

export interface DashboardResource<T> {
  data: T | undefined;
  /** True only when there is nothing to show yet. */
  loading: boolean;
  /** True while any request for the current key is in flight. */
  refreshing: boolean;
  error: string | null;
  refresh: () => void;
}

export function useDashboardResource<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: { pollMs?: number } = {}
): DashboardResource<T> {
  const [data, setData] = useState<T | undefined>(() => cache.get(key) as T | undefined);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // The newest fetcher and key, readable from a request that started earlier.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const currentKey = useRef(key);
  currentKey.current = key;

  const load = useCallback(async () => {
    const requestKey = key;
    setRefreshing(true);
    try {
      const result = await fetcherRef.current();
      cache.set(requestKey, result);
      // A response for a range or tab the user has already left must not win.
      if (currentKey.current !== requestKey) return;
      setData(result);
      setError(null);
    } catch (caught) {
      if (currentKey.current !== requestKey) return;
      setError(caught instanceof Error ? caught.message : 'Failed to load');
    } finally {
      if (currentKey.current === requestKey) setRefreshing(false);
    }
  }, [key]);

  useEffect(() => {
    setData(cache.get(key) as T | undefined);
    setError(null);
    void load();
    openResources.add(load);
    return () => {
      openResources.delete(load);
    };
  }, [key, load]);

  const { pollMs } = options;
  useEffect(() => {
    if (!pollMs) return;
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, pollMs);
    return () => clearInterval(id);
  }, [load, pollMs]);

  return { data, loading: data === undefined && error === null, refreshing, error, refresh: load };
}
```

- [ ] **Step 6: Write the failing helper tests**

Create `src/components/developer/DevDashboard/__tests__/format.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { formatBytes, formatUptime, timeAgo } from '../format';

describe('formatBytes', () => {
  it.each([
    [0, '0 B'], [512, '512 B'], [1024, '1 KB'], [1536, '1.5 KB'],
    [187432960, '178.8 MB'], [4294967296, '4 GB'], [-5, '0 B'], [Number.NaN, '0 B'],
  ])('formats %d as %s', (bytes, expected) => expect(formatBytes(bytes)).toBe(expected));
});

describe('formatUptime', () => {
  it.each([[42, '0m'], [3600, '1h 0m'], [93784, '1d 2h 3m'], [0, '0m']])('formats %d as %s', (seconds, expected) =>
    expect(formatUptime(seconds)).toBe(expected));
});

describe('timeAgo', () => {
  const now = new Date('2026-10-08T16:00:00.000Z');
  it.each([
    ['2026-10-08T15:59:40.000Z', 'just now'],
    ['2026-10-08T15:53:00.000Z', '7m ago'],
    ['2026-10-08T13:00:00.000Z', '3h ago'],
    ['2026-10-05T16:00:00.000Z', '3d ago'],
    ['2026-10-08T16:05:00.000Z', 'just now'],
  ])('formats %s as %s', (iso, expected) => expect(timeAgo(iso, now)).toBe(expected));

  it('says never for no date', () => expect(timeAgo(null, now)).toBe('never'));
});
```

Create `src/components/developer/DevDashboard/__tests__/userAgent.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { describeUserAgent } from '../userAgent';

const UA = {
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1',
  macChrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  winEdge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0',
  winFirefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
  androidChrome: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  ipad: 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
};

describe('describeUserAgent', () => {
  it.each([
    [UA.iphoneSafari, 'Safari · iOS', 'mobile'],
    [UA.iphoneChrome, 'Chrome · iOS', 'mobile'],
    [UA.macChrome, 'Chrome · macOS', 'desktop'],
    [UA.macSafari, 'Safari · macOS', 'desktop'],
    [UA.winEdge, 'Edge · Windows', 'desktop'],
    [UA.winFirefox, 'Firefox · Windows', 'desktop'],
    [UA.androidChrome, 'Chrome · Android', 'mobile'],
    [UA.ipad, 'Safari · iOS', 'mobile'],
  ])('reads %s', (ua, label, device) => {
    expect(describeUserAgent(ua)).toMatchObject({ label, device });
  });

  it.each([null, '', 'curl/8.4.0'])('calls %j unknown', (ua) => {
    expect(describeUserAgent(ua).label).toBe(ua === 'curl/8.4.0' ? 'Other' : 'Unknown');
  });
});
```

Create `src/components/developer/DevDashboard/__tests__/TrendBars.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TrendBars } from '../TrendBars';

describe('TrendBars', () => {
  it('draws one bar per value, scaled to the largest', () => {
    render(<TrendBars values={[0, 5, 10]} labels={['a', 'b', 'c']} ariaLabel="Requests" height={40} />);
    const bars = screen.getByRole('img', { name: 'Requests' }).querySelectorAll('rect[data-bar]');
    expect(bars).toHaveLength(3);
    expect(bars[0].getAttribute('height')).toBe('0');
    expect(bars[1].getAttribute('height')).toBe('20');
    expect(bars[2].getAttribute('height')).toBe('40');
  });

  it('names each bar for hover', () => {
    render(<TrendBars values={[3]} labels={['2pm']} ariaLabel="Requests" />);
    expect(screen.getByText('2pm: 3')).toBeInTheDocument();
  });

  it('draws flat bars rather than dividing by zero when every value is 0', () => {
    render(<TrendBars values={[0, 0]} labels={['a', 'b']} ariaLabel="Requests" />);
    const bars = screen.getByRole('img').querySelectorAll('rect[data-bar]');
    expect([...bars].map((b) => b.getAttribute('height'))).toEqual(['0', '0']);
  });

  it('overlays a highlight series on the same scale', () => {
    render(<TrendBars values={[10, 10]} highlights={[5, 0]} labels={['a', 'b']} ariaLabel="Requests" height={40} />);
    const marks = screen.getByRole('img').querySelectorAll('rect[data-highlight]');
    expect([...marks].map((m) => m.getAttribute('height'))).toEqual(['20', '0']);
  });

  it('says so when there is nothing to draw', () => {
    render(<TrendBars values={[]} labels={[]} ariaLabel="Requests" />);
    expect(screen.getByText('No data')).toBeInTheDocument();
  });
});
```

- [ ] **Step 7: Run them to verify they fail**

Run: `npx vitest run src/components/developer/DevDashboard/__tests__/format.test.ts src/components/developer/DevDashboard/__tests__/userAgent.test.ts src/components/developer/DevDashboard/__tests__/TrendBars.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 8: Write the helpers**

Create `src/components/developer/DevDashboard/format.ts`:

```ts
const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), UNITS.length - 1);
  return `${parseFloat((bytes / 1024 ** index).toFixed(1))} ${UNITS[index]}`;
}

export function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function timeAgo(iso: string | null, now: Date = new Date()): string {
  if (!iso) return 'never';
  const minutes = Math.floor((now.getTime() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit',
  });
}
```

Create `src/components/developer/DevDashboard/userAgent.ts`:

```ts
export interface UserAgentInfo {
  browser: string;
  os: string;
  device: 'mobile' | 'desktop';
  label: string;
}

// Order matters: Edge and Chrome on iOS both also say "Safari", and Edge says "Chrome".
const BROWSERS: Array<[RegExp, string]> = [
  [/Edg\//, 'Edge'],
  [/OPR\//, 'Opera'],
  [/CriOS\/|Chrome\//, 'Chrome'],
  [/FxiOS\/|Firefox\//, 'Firefox'],
  [/Safari\//, 'Safari'],
];

// iOS before macOS: iPhone and iPad agents contain "like Mac OS X".
const SYSTEMS: Array<[RegExp, string]> = [
  [/iPhone|iPad|iPod/, 'iOS'],
  [/Android/, 'Android'],
  [/Mac OS X/, 'macOS'],
  [/Windows/, 'Windows'],
  [/Linux/, 'Linux'],
];

/** Enough to tell "Chrome on a Mac" from "Safari on a phone"; not a full parser. */
export function describeUserAgent(ua: string | null): UserAgentInfo {
  if (!ua) return { browser: 'Unknown', os: 'Unknown', device: 'desktop', label: 'Unknown' };

  const browser = BROWSERS.find(([pattern]) => pattern.test(ua))?.[1];
  const os = SYSTEMS.find(([pattern]) => pattern.test(ua))?.[1];
  const device = /iPhone|iPad|iPod|Android|Mobile/.test(ua) ? 'mobile' : 'desktop';

  if (!browser || !os) return { browser: browser ?? 'Other', os: os ?? 'Other', device, label: 'Other' };
  return { browser, os, device, label: `${browser} · ${os}` };
}
```

Create `src/components/developer/DevDashboard/TrendBars.tsx`:

```tsx
import React from 'react';

interface TrendBarsProps {
  values: number[];
  /** One per value; shown on hover as "label: value". */
  labels: string[];
  ariaLabel: string;
  /** A second series drawn over the first on the same scale (e.g. errors). */
  highlights?: number[];
  height?: number;
}

const BAR_WIDTH = 10;
const GAP = 2;

/** A small bar strip. Inline SVG so the dashboard needs no chart library. */
export const TrendBars: React.FC<TrendBarsProps> = ({ values, labels, ariaLabel, highlights, height = 48 }) => {
  if (values.length === 0) return <p className="text-sm text-stone-500">No data</p>;

  const max = Math.max(...values, 0);
  const scale = (value: number) => (max > 0 ? Math.round((value / max) * height) : 0);
  const width = values.length * (BAR_WIDTH + GAP) - GAP;

  return (
    <svg
      role="img"
      aria-label={ariaLabel}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="w-full"
      style={{ height }}
    >
      {values.map((value, index) => {
        const barHeight = scale(value);
        const markHeight = highlights ? scale(highlights[index] ?? 0) : 0;
        const x = index * (BAR_WIDTH + GAP);
        return (
          <g key={index}>
            <title>{`${labels[index] ?? ''}: ${value}`}</title>
            {/* Full-height transparent target so short and empty bars still show their title on hover. */}
            <rect x={x} y={0} width={BAR_WIDTH} height={height} fill="transparent" />
            <rect data-bar x={x} y={height - barHeight} width={BAR_WIDTH} height={barHeight} rx={1} className="fill-blue-500" />
            {highlights && (
              <rect data-highlight x={x} y={height - markHeight} width={BAR_WIDTH} height={markHeight} rx={1} className="fill-red-500" />
            )}
          </g>
        );
      })}
    </svg>
  );
};
```

Create `src/components/developer/DevDashboard/TabState.tsx`:

```tsx
import React from 'react';
import { AlertTriangle } from 'lucide-react';
import type { DashboardResource } from './useDashboardResource';

interface TabStateProps<T> {
  resource: DashboardResource<T>;
  skeletonRows?: number;
  children: (data: T) => React.ReactNode;
}

/**
 * The three states every tab shares: nothing yet (skeleton), failed with
 * nothing to show (error + retry), or data — with a quiet notice above it if
 * the latest refresh failed and what is on screen is the previous result.
 */
export function TabState<T>({ resource, skeletonRows = 4, children }: TabStateProps<T>) {
  const { data, loading, error, refresh } = resource;

  if (loading) {
    return (
      <div className="space-y-3" role="status" aria-label="Loading">
        {Array.from({ length: skeletonRows }, (_, index) => (
          <div key={index} className="h-16 rounded-lg bg-stone-100 animate-pulse" />
        ))}
      </div>
    );
  }

  if (data === undefined) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-5" role="alert">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-semibold text-red-900">Couldn't load this tab</p>
            <p className="mt-1 text-sm text-red-700 break-words">{error}</p>
            <button onClick={refresh} className="btn-secondary mt-3">Try again</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {error && (
        <p className="mb-3 text-sm text-amber-700" role="status">
          Couldn't refresh ({error}). Showing the last result.
        </p>
      )}
      {children(data)}
    </>
  );
}
```

- [ ] **Step 9: Verify**

Run: `npx vitest run src/components/developer/DevDashboard/__tests__ && npm run build`
Expected: all PASS, build succeeds.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(dev-dashboard): frontend types, API bindings, cached resource hook and helpers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Overview and Sessions tabs

**Files:**
- Rewrite: `src/components/developer/DevDashboard/OverviewTab.tsx`
- Rewrite: `src/components/developer/DevDashboard/SessionsTab.tsx`
- Test: `src/components/developer/DevDashboard/__tests__/OverviewTab.test.tsx`, `SessionsTab.test.tsx`

**Interfaces:**
- Consumes: `Overview`, `SessionsPayload` (types.ts); `formatBytes`, `formatUptime`, `timeAgo`, `formatDateTime` (format.ts); `describeUserAgent` (userAgent.ts); fixtures `overview.json`, `sessions.json`.
- Produces: `<OverviewTab data={Overview} />`, `<SessionsTab data={SessionsPayload} />`. Both are pure: they take data as a prop and fetch nothing. Until Task 13 rewires the shell, the old `DevDashboard.tsx` passes different props to these two components; Step 5 keeps the build green in the meantime.

- [ ] **Step 1: Write the failing tests**

Create `src/components/developer/DevDashboard/__tests__/OverviewTab.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import fixture from '../../../../utils/__fixtures__/devDashboard/overview.json';
import { OverviewTab } from '../OverviewTab';
import type { Overview } from '../types';

const data = fixture as Overview;

describe('OverviewTab', () => {
  it('shows what is running', () => {
    render(<OverviewTab data={data} />);
    const version = screen.getByRole('region', { name: 'Version' });
    expect(within(version).getAllByText('2.34.0')).toHaveLength(2);
    expect(within(version).getByText('production')).toBeInTheDocument();
    expect(within(version).getByText('1d 2h 3m')).toBeInTheDocument();
  });

  it('shows memory, load and disk with real numbers', () => {
    render(<OverviewTab data={data} />);
    const system = screen.getByRole('region', { name: 'System' });
    expect(within(system).getByText('30%')).toBeInTheDocument();
    expect(within(system).getByText('1.2 GB of 4 GB')).toBeInTheDocument();
    expect(within(system).getByText('0.42')).toBeInTheDocument();
    expect(within(system).getByText('4 cores')).toBeInTheDocument();
    expect(within(system).getByText('40%')).toBeInTheDocument();
    expect(within(system).getByText('20 GB of 50 GB')).toBeInTheDocument();
  });

  it('says disk is unavailable instead of showing 0%', () => {
    render(<OverviewTab data={{ ...data, system: { ...data.system, disk: null } }} />);
    expect(within(screen.getByRole('region', { name: 'System' })).getByText('Unavailable')).toBeInTheDocument();
  });

  it('shows database size, connections and the largest tables', () => {
    render(<OverviewTab data={data} />);
    const database = screen.getByRole('region', { name: 'Database' });
    expect(within(database).getByText('178.8 MB')).toBeInTheDocument();
    expect(within(database).getByText('7 of 100')).toBeInTheDocument();
    expect(within(database).getByText('api_requests')).toBeInTheDocument();
    expect(within(database).getByText('94 MB')).toBeInTheDocument();
  });

  it('lists every check with its state, measured value and threshold', () => {
    render(<OverviewTab data={data} />);
    const checks = screen.getByRole('region', { name: 'Health checks' });
    const rows = within(checks).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('Repeated server errors');
    expect(rows[0]).toHaveTextContent('Failing');
    expect(rows[0]).toHaveTextContent('POST /api/events failed 6 times');
    expect(rows[1]).toHaveTextContent('Warning');
    expect(rows[2]).toHaveTextContent('OK');
    expect(rows[2]).toHaveTextContent('under 10% in the last hour');
  });

  it('summarises the checks in one line', () => {
    render(<OverviewTab data={data} />);
    expect(screen.getByText('1 failing, 1 warning, 1 passing')).toBeInTheDocument();
  });

  it('says all clear when every check passes', () => {
    const passing = data.checks.map((c) => ({ ...c, status: 'pass' as const }));
    render(<OverviewTab data={{ ...data, checks: passing }} />);
    expect(screen.getByText('All 3 checks passing')).toBeInTheDocument();
  });
});
```

Create `src/components/developer/DevDashboard/__tests__/SessionsTab.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import fixture from '../../../../utils/__fixtures__/devDashboard/sessions.json';
import { SessionsTab } from '../SessionsTab';
import type { SessionsPayload } from '../types';

const data = fixture as SessionsPayload;

describe('SessionsTab', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-08T16:00:00.000Z')); });
  afterEach(() => { vi.useRealTimers(); });

  it('shows one row per person, not one per session', () => {
    render(<SessionsTab data={data} />);
    expect(screen.getAllByRole('row')).toHaveLength(2); // header + Digi
    const row = screen.getByRole('row', { name: /Digi/ });
    expect(row).toHaveTextContent('Active');
    expect(row).toHaveTextContent('2m ago');
    expect(row).toHaveTextContent('Safari · iOS');
    expect(row).toHaveTextContent('203.0.113.9');
    expect(row).toHaveTextContent('2 sessions');
  });

  it('expands to the individual sessions and collapses again', () => {
    render(<SessionsTab data={data} />);
    const toggle = screen.getByRole('button', { name: 'Show sessions for Digi' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const detail = screen.getByRole('list', { name: 'Sessions for Digi' });
    expect(within(detail).getAllByRole('listitem')).toHaveLength(2);
    expect(within(detail).getByText(/Unknown browser/)).toBeInTheDocument();
    expect(within(detail).getByText(/No address recorded/)).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.queryByRole('list', { name: 'Sessions for Digi' })).not.toBeInTheDocument();
  });

  it('has no expand control for someone with a single session', () => {
    const single = { users: [{ ...data.users[0], sessionCount: 1, sessions: [data.users[0].sessions[0]] }] };
    render(<SessionsTab data={single} />);
    expect(screen.queryByRole('button', { name: /Show sessions/ })).not.toBeInTheDocument();
    expect(screen.getByRole('row', { name: /Digi/ })).toHaveTextContent('1 session');
  });

  it('counts people by state above the table', () => {
    const users = [
      data.users[0],
      { ...data.users[0], userId: 'u2', name: 'Sasha', status: 'away' as const },
      { ...data.users[0], userId: 'u3', name: 'Seri', status: 'idle' as const },
    ];
    render(<SessionsTab data={{ users }} />);
    expect(screen.getByText('3 people signed in: 1 active, 1 idle, 1 away')).toBeInTheDocument();
  });

  it('says so when nobody is signed in', () => {
    render(<SessionsTab data={{ users: [] }} />);
    expect(screen.getByText('Nobody is signed in.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/components/developer/DevDashboard/__tests__/OverviewTab.test.tsx src/components/developer/DevDashboard/__tests__/SessionsTab.test.tsx`
Expected: FAIL — the existing components take different props and render none of this.

- [ ] **Step 3: Rewrite `OverviewTab.tsx`**

Replace the whole file `src/components/developer/DevDashboard/OverviewTab.tsx` with:

```tsx
import React from 'react';
import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import type { Overview, HealthCheck } from './types';
import { formatBytes, formatUptime } from './format';

const SECTION = 'rounded-lg border border-stone-200 bg-white p-4 md:p-5';
const HEADING = 'text-sm font-semibold text-stone-900 mb-3';

const CHECK_STATE: Record<HealthCheck['status'], { label: string; icon: typeof CheckCircle2; tone: string }> = {
  fail: { label: 'Failing', icon: XCircle, tone: 'text-red-600' },
  warn: { label: 'Warning', icon: AlertTriangle, tone: 'text-amber-600' },
  pass: { label: 'OK', icon: CheckCircle2, tone: 'text-emerald-600' },
};
const SEVERITY: HealthCheck['status'][] = ['fail', 'warn', 'pass'];

function checkSummary(checks: HealthCheck[]): string {
  const count = (status: HealthCheck['status']) => checks.filter((c) => c.status === status).length;
  const [failing, warning, passing] = SEVERITY.map(count);
  if (failing === 0 && warning === 0) return `All ${passing} checks passing`;
  return [
    failing > 0 && `${failing} failing`,
    warning > 0 && `${warning} warning`,
    `${passing} passing`,
  ].filter(Boolean).join(', ');
}

const Meter: React.FC<{ label: string; used: number; total: number }> = ({ label, used, total }) => {
  const percent = total > 0 ? Math.round((used / total) * 100) : 0;
  const tone = percent > 85 ? 'bg-red-500' : percent > 70 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-stone-600">{label}</span>
        <span className="text-lg font-semibold text-stone-900 tabular-nums">{percent}%</span>
      </div>
      <div className="mt-2 h-2 w-full rounded-full bg-stone-200" aria-hidden="true">
        <div className={`h-2 rounded-full ${tone}`} style={{ width: `${Math.min(percent, 100)}%` }} />
      </div>
      <p className="mt-1 text-xs text-stone-500">{`${formatBytes(used)} of ${formatBytes(total)}`}</p>
    </div>
  );
};

const Fact: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-baseline justify-between gap-4 py-1.5">
    <dt className="text-sm text-stone-600">{label}</dt>
    <dd className="text-sm font-medium text-stone-900 tabular-nums text-right">{children}</dd>
  </div>
);

export const OverviewTab: React.FC<{ data: Overview }> = ({ data }) => {
  const { version, system, database } = data;
  const checks = [...data.checks].sort((a, b) => SEVERITY.indexOf(a.status) - SEVERITY.indexOf(b.status));

  return (
    <div className="space-y-4">
      <section className={SECTION} aria-labelledby="devdash-checks">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
          <h3 id="devdash-checks" className="text-sm font-semibold text-stone-900">Health checks</h3>
          <p className="text-sm text-stone-600">{checkSummary(data.checks)}</p>
        </div>
        <ul className="divide-y divide-stone-100">
          {checks.map((check) => {
            const state = CHECK_STATE[check.status];
            const Icon = state.icon;
            return (
              <li key={check.id} className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-center sm:gap-4">
                <span className={`flex items-center gap-1.5 text-sm font-medium sm:w-24 ${state.tone}`}>
                  <Icon className="w-4 h-4" aria-hidden="true" />
                  {state.label}
                </span>
                <span className="text-sm font-medium text-stone-900 sm:w-64">{check.label}</span>
                <span className="text-sm text-stone-700 flex-1 break-words">{check.value}</span>
                <span className="text-xs text-stone-500 sm:text-right">{check.threshold}</span>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <section className={SECTION} aria-labelledby="devdash-version">
          <h3 id="devdash-version" className={HEADING}>Version</h3>
          <dl className="divide-y divide-stone-100">
            <Fact label="Frontend">{version.frontend}</Fact>
            <Fact label="Backend">{version.backend}</Fact>
            <Fact label="Node">{version.node}</Fact>
            <Fact label="Environment">{version.environment}</Fact>
            <Fact label="Backend uptime">{formatUptime(version.uptimeSeconds)}</Fact>
          </dl>
        </section>

        <section className={SECTION} aria-labelledby="devdash-system">
          <h3 id="devdash-system" className={HEADING}>System</h3>
          <div className="space-y-4">
            <Meter label="Memory" used={system.memory.usedBytes} total={system.memory.totalBytes} />
            {system.disk ? (
              <Meter label="Disk (uploads volume)" used={system.disk.usedBytes} total={system.disk.totalBytes} />
            ) : (
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-stone-600">Disk (uploads volume)</span>
                <span className="text-sm text-stone-500">Unavailable</span>
              </div>
            )}
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-stone-600">CPU load (1 min)</span>
              <span>
                <span className="text-lg font-semibold text-stone-900 tabular-nums">{system.cpu.load1.toFixed(2)}</span>
                <span className="ml-2 text-xs text-stone-500">{`${system.cpu.cores} cores`}</span>
              </span>
            </div>
          </div>
        </section>

        <section className={SECTION} aria-labelledby="devdash-database">
          <h3 id="devdash-database" className={HEADING}>Database</h3>
          <dl className="divide-y divide-stone-100">
            <Fact label="Size">{formatBytes(database.sizeBytes)}</Fact>
            <Fact label="Connections">{`${database.connections} of ${database.maxConnections}`}</Fact>
          </dl>
          <h4 className="mt-4 mb-1 text-xs font-medium uppercase tracking-wide text-stone-500">Largest tables</h4>
          <dl className="divide-y divide-stone-100">
            {database.tables.map((table) => (
              <div key={table.name} className="flex items-baseline justify-between gap-4 py-1.5">
                <dt className="text-sm font-mono text-stone-700 truncate">{table.name}</dt>
                <dd className="text-sm text-stone-900 tabular-nums">{formatBytes(table.sizeBytes)}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </div>
  );
};
```

A `<section>` with `aria-labelledby` is exposed as `role="region"` with that name, which is what the tests query.

- [ ] **Step 4: Rewrite `SessionsTab.tsx`**

Replace the whole file `src/components/developer/DevDashboard/SessionsTab.tsx` with:

```tsx
import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { SessionsPayload } from './types';
import { timeAgo } from './format';
import { describeUserAgent } from './userAgent';

type SessionUser = SessionsPayload['users'][number];

const STATUS: Record<SessionUser['status'], { label: string; dot: string }> = {
  active: { label: 'Active', dot: 'bg-emerald-500' },
  idle: { label: 'Idle', dot: 'bg-amber-500' },
  away: { label: 'Away', dot: 'bg-stone-400' },
};

const TH = 'px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-stone-500';
const TD = 'px-4 py-3 text-sm';

function summary(users: SessionUser[]): string {
  const count = (status: SessionUser['status']) => users.filter((u) => u.status === status).length;
  const people = users.length === 1 ? '1 person' : `${users.length} people`;
  return `${people} signed in: ${count('active')} active, ${count('idle')} idle, ${count('away')} away`;
}

export const SessionsTab: React.FC<{ data: SessionsPayload }> = ({ data }) => {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (data.users.length === 0) {
    return <p className="py-8 text-center text-sm text-stone-500">Nobody is signed in.</p>;
  }

  const toggle = (userId: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(userId)) next.add(userId);
      return next;
    });

  return (
    <div className="space-y-3">
      <p className="text-sm text-stone-600">{summary(data.users)}</p>
      <div className="overflow-x-auto rounded-lg border border-stone-200">
        <table className="w-full">
          <thead className="bg-stone-50">
            <tr>
              <th className={TH}>Person</th>
              <th className={TH}>Status</th>
              <th className={TH}>Last active</th>
              <th className={TH}>Device</th>
              <th className={TH}>Address</th>
              <th className={TH}>Sessions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {data.users.map((user) => {
              const latest = user.sessions[0];
              const status = STATUS[user.status];
              const isOpen = expanded.has(user.userId);
              const countLabel = user.sessionCount === 1 ? '1 session' : `${user.sessionCount} sessions`;
              return (
                <React.Fragment key={user.userId}>
                  <tr aria-label={user.name}>
                    <td className={TD}>
                      <span className="font-medium text-stone-900">{user.name}</span>
                      <span className="ml-2 text-xs text-stone-500">{user.role}</span>
                    </td>
                    <td className={TD}>
                      <span className="inline-flex items-center gap-1.5 text-stone-800">
                        <span className={`h-2 w-2 rounded-full ${status.dot}`} aria-hidden="true" />
                        {status.label}
                      </span>
                    </td>
                    <td className={`${TD} text-stone-700`}>{timeAgo(user.lastActivity)}</td>
                    <td className={`${TD} text-stone-700`}>{describeUserAgent(latest?.userAgent ?? null).label}</td>
                    <td className={`${TD} font-mono text-xs text-stone-700`}>{latest?.ipAddress ?? '—'}</td>
                    <td className={TD}>
                      {user.sessionCount > 1 ? (
                        <button
                          type="button"
                          onClick={() => toggle(user.userId)}
                          aria-expanded={isOpen}
                          aria-label={`Show sessions for ${user.name}`}
                          className="inline-flex items-center gap-1 text-sm text-blue-700 hover:underline"
                        >
                          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          {countLabel}
                        </button>
                      ) : (
                        <span className="text-stone-700">{countLabel}</span>
                      )}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={6} className="bg-stone-50 px-4 py-3">
                        <ul aria-label={`Sessions for ${user.name}`} className="space-y-1.5">
                          {user.sessions.map((session) => (
                            <li key={session.id} className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-stone-700">
                              <span className="font-medium">
                                {session.userAgent ? describeUserAgent(session.userAgent).label : 'Unknown browser'}
                              </span>
                              <span className="font-mono text-xs">{session.ipAddress ?? 'No address recorded'}</span>
                              <span>{`active ${timeAgo(session.lastActivity)}`}</span>
                              <span className="text-stone-500">{`signed in ${timeAgo(session.createdAt)}`}</span>
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
```

- [ ] **Step 5: Keep the old shell compiling until Task 13**

`src/components/developer/DevDashboard.tsx` still renders these two components with the old props. Replace its two render blocks so the build stays green; the shell is rewritten in Task 13.

Replace

```tsx
          {activeTab === 'overview' && versionInfo && metrics && (
            <OverviewTab
              versionInfo={versionInfo}
              metrics={metrics}
              formatUptime={formatUptime}
              formatBytes={formatBytes}
            />
          )}
```

with

```tsx
          {activeTab === 'overview' && <p className="text-sm text-stone-500">Overview is being rebuilt.</p>}
```

and replace

```tsx
          {activeTab === 'sessions' && <SessionsTab sessions={sessions} />}
```

with

```tsx
          {activeTab === 'sessions' && <p className="text-sm text-stone-500">Sessions is being rebuilt.</p>}
```

Then delete the now-unused imports of `OverviewTab` and `SessionsTab` from that file, and the `formatBytes` helper if the linter reports it unused.

- [ ] **Step 6: Verify**

Run: `npx vitest run src/components/developer/DevDashboard/__tests__/OverviewTab.test.tsx src/components/developer/DevDashboard/__tests__/SessionsTab.test.tsx && npm run build`
Expected: all PASS, build succeeds.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(dev-dashboard): Overview with live health checks; Sessions as one row per person

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: API and Usage tabs

**Files:**
- Create: `src/components/developer/DevDashboard/ApiTab.tsx`
- Create: `src/components/developer/DevDashboard/UsageTab.tsx`
- Test: `src/components/developer/DevDashboard/__tests__/ApiTab.test.tsx`, `UsageTab.test.tsx`

**Interfaces:**
- Consumes: `ApiAnalytics`, `Usage`, `TimeRange` (types.ts); `TrendBars`; `timeAgo`, `formatDateTime` (format.ts); fixtures `apiAnalytics.json`, `usage.json`.
- Produces: `<ApiTab data={ApiAnalytics} timeRange={TimeRange} />`, `<UsageTab data={Usage} />`, and `bucketLabel(start: string, range: TimeRange): string` exported from `ApiTab.tsx`. Both tabs are pure.

- [ ] **Step 1: Write the failing tests**

Create `src/components/developer/DevDashboard/__tests__/ApiTab.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import fixture from '../../../../utils/__fixtures__/devDashboard/apiAnalytics.json';
import { ApiTab, bucketLabel } from '../ApiTab';
import type { ApiAnalytics } from '../types';

const data = fixture as ApiAnalytics;

const endpointOrder = () =>
  within(screen.getByRole('table', { name: 'Endpoints' }))
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[0].textContent);

describe('ApiTab', () => {
  it('shows the headline numbers', () => {
    render(<ApiTab data={data} timeRange="24h" />);
    const totals = screen.getByRole('region', { name: 'Totals' });
    expect(within(totals).getByText('4,210')).toBeInTheDocument();
    expect(within(totals).getByText('0.81%')).toBeInTheDocument();
    expect(within(totals).getByText('34 errors')).toBeInTheDocument();
    expect(within(totals).getByText('24ms')).toBeInTheDocument();
    expect(within(totals).getByText('180ms')).toBeInTheDocument();
  });

  it('draws one bar per bucket, including empty ones', () => {
    render(<ApiTab data={data} timeRange="24h" />);
    const chart = screen.getByRole('img', { name: 'Requests over time, errors in red' });
    expect(chart.querySelectorAll('rect[data-bar]')).toHaveLength(3);
    expect(chart.querySelectorAll('rect[data-bar]')[1].getAttribute('height')).toBe('0');
  });

  it('lists endpoints busiest first, with max time filled in', () => {
    render(<ApiTab data={data} timeRange="24h" />);
    expect(endpointOrder()).toEqual(['/api/expense-messages/unread', '/api/expenses']);
    const row = screen.getAllByRole('row').find((r) => r.textContent?.includes('/api/expenses') && r.textContent.includes('47'))!;
    expect(row).toHaveTextContent('137ms');
    expect(row).toHaveTextContent('301ms');
    expect(row).toHaveTextContent('349ms');
  });

  it('re-sorts when a column header is pressed, and flips on a second press', () => {
    render(<ApiTab data={data} timeRange="24h" />);
    const header = screen.getByRole('columnheader', { name: /Avg/ });
    fireEvent.click(within(header).getByRole('button'));
    expect(endpointOrder()).toEqual(['/api/expenses', '/api/expense-messages/unread']);
    expect(header).toHaveAttribute('aria-sort', 'descending');
    fireEvent.click(within(header).getByRole('button'));
    expect(endpointOrder()).toEqual(['/api/expense-messages/unread', '/api/expenses']);
    expect(header).toHaveAttribute('aria-sort', 'ascending');
  });

  it('shows the slowest endpoints with their max time', () => {
    render(<ApiTab data={data} timeRange="24h" />);
    const slowest = screen.getByRole('region', { name: 'Slowest endpoints' });
    expect(within(slowest).getByText('/api/expenses')).toBeInTheDocument();
    expect(within(slowest).getByText('349ms')).toBeInTheDocument();
  });

  it('lists recent errors with who hit them and why', () => {
    render(<ApiTab data={data} timeRange="24h" />);
    const errors = within(screen.getByRole('region', { name: 'Recent errors' })).getAllByRole('listitem');
    expect(errors).toHaveLength(2);
    expect(errors[0]).toHaveTextContent('404');
    expect(errors[0]).toHaveTextContent('/api/session/properties');
    expect(errors[0]).toHaveTextContent('Sahil Khatri');
    expect(errors[0]).toHaveTextContent('Not found');
    expect(errors[1]).toHaveTextContent('500');
    expect(errors[1]).toHaveTextContent('Not signed in');
  });

  it('says so when there is no traffic at all', () => {
    const empty: ApiAnalytics = {
      totals: { requests: 0, errors: 0, errorRate: 0, p50Ms: 0, p95Ms: 0 },
      buckets: data.buckets.map((b) => ({ ...b, requests: 0, errors: 0 })),
      endpoints: [], slowest: [], recentErrors: [],
    };
    render(<ApiTab data={empty} timeRange="1h" />);
    expect(screen.getByText('No requests in this range.')).toBeInTheDocument();
    expect(screen.getByText('No errors in this range.')).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Endpoints' })).not.toBeInTheDocument();
  });
});

describe('bucketLabel', () => {
  it('labels daily buckets by their UTC date', () => {
    expect(bucketLabel('2026-10-08T00:00:00.000Z', '7d')).toBe('Oct 8');
    expect(bucketLabel('2026-10-08T00:00:00.000Z', '30d')).toBe('Oct 8');
  });

  it('labels shorter buckets by time of day', () => {
    expect(bucketLabel('2026-10-08T14:00:00.000Z', '24h')).toMatch(/\d{1,2}:\d{2}/);
  });
});
```

Create `src/components/developer/DevDashboard/__tests__/UsageTab.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import fixture from '../../../../utils/__fixtures__/devDashboard/usage.json';
import { UsageTab } from '../UsageTab';
import type { Usage } from '../types';

const data = fixture as Usage;

describe('UsageTab', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-08T16:00:00.000Z')); });
  afterEach(() => { vi.useRealTimers(); });

  it('shows total views and how many people', () => {
    render(<UsageTab data={data} />);
    const totals = screen.getByRole('region', { name: 'Totals' });
    expect(within(totals).getByText('186')).toBeInTheDocument();
    expect(within(totals).getByText('5')).toBeInTheDocument();
  });

  it('lists each screen with views, people and a daily trend', () => {
    render(<UsageTab data={data} />);
    const rows = within(screen.getByRole('table', { name: 'Screens' })).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('expenses');
    expect(rows[0]).toHaveTextContent('92');
    expect(within(rows[0]).getByRole('img', { name: 'Daily views of expenses' }).querySelectorAll('rect[data-bar]')).toHaveLength(2);
  });

  it('lists each person with last seen, device split and top screens', () => {
    render(<UsageTab data={data} />);
    const row = within(screen.getByRole('table', { name: 'People' })).getByRole('row', { name: /Seri Vira/ });
    expect(row).toHaveTextContent('40m ago');
    expect(row).toHaveTextContent('64');
    expect(row).toHaveTextContent('60 mobile, 4 desktop');
    expect(row).toHaveTextContent('expenses (41), leads (23)');
  });

  it('shows someone who has never opened the app, plainly', () => {
    render(<UsageTab data={data} />);
    const row = within(screen.getByRole('table', { name: 'People' })).getByRole('row', { name: /Rita Example/ });
    expect(row).toHaveTextContent('never');
    expect(row).toHaveTextContent('No activity');
  });

  it('keeps the people list when no screens were viewed in the range', () => {
    render(<UsageTab data={{ ...data, totals: { views: 0, uniqueUsers: 0 }, screens: [] }} />);
    expect(screen.getByText('No screen views in this range.')).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Screens' })).not.toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'People' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/components/developer/DevDashboard/__tests__/ApiTab.test.tsx src/components/developer/DevDashboard/__tests__/UsageTab.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write `ApiTab.tsx`**

Create `src/components/developer/DevDashboard/ApiTab.tsx`:

```tsx
import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import type { ApiAnalytics, TimeRange } from './types';
import { TrendBars } from './TrendBars';
import { formatDateTime } from './format';

type Endpoint = ApiAnalytics['endpoints'][number];
type SortKey = 'calls' | 'avgMs' | 'p95Ms' | 'maxMs' | 'errors';

const SECTION = 'rounded-lg border border-stone-200 bg-white p-4 md:p-5';
const HEADING = 'text-sm font-semibold text-stone-900 mb-3';
const TH = 'px-3 py-2 text-xs font-medium uppercase tracking-wide text-stone-500';
const TD = 'px-3 py-2 text-sm tabular-nums';

const COLUMNS: Array<{ key: SortKey; label: string; unit: string }> = [
  { key: 'calls', label: 'Calls', unit: '' },
  { key: 'avgMs', label: 'Avg', unit: 'ms' },
  { key: 'p95Ms', label: 'p95', unit: 'ms' },
  { key: 'maxMs', label: 'Max', unit: 'ms' },
  { key: 'errors', label: 'Errors', unit: '' },
];

const METHOD_TONE: Record<string, string> = {
  GET: 'bg-blue-50 text-blue-700',
  POST: 'bg-emerald-50 text-emerald-700',
  PUT: 'bg-amber-50 text-amber-800',
  PATCH: 'bg-amber-50 text-amber-800',
  DELETE: 'bg-red-50 text-red-700',
};

const Method: React.FC<{ value: string }> = ({ value }) => (
  <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${METHOD_TONE[value] ?? 'bg-stone-100 text-stone-700'}`}>
    {value}
  </span>
);

/** Daily buckets start at UTC midnight, so they are labelled by UTC date. */
export function bucketLabel(start: string, range: TimeRange): string {
  const date = new Date(start);
  if (range === '7d' || range === '30d') {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  }
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

const Stat: React.FC<{ label: string; value: string; note?: string }> = ({ label, value, note }) => (
  <div>
    <p className="text-xs uppercase tracking-wide text-stone-500">{label}</p>
    <p className="mt-1 text-2xl font-semibold text-stone-900 tabular-nums">{value}</p>
    {note && <p className="text-xs text-stone-500">{note}</p>}
  </div>
);

export const ApiTab: React.FC<{ data: ApiAnalytics; timeRange: TimeRange }> = ({ data, timeRange }) => {
  const [sort, setSort] = useState<{ key: SortKey; descending: boolean }>({ key: 'calls', descending: true });

  const endpoints = useMemo(() => {
    const direction = sort.descending ? -1 : 1;
    return [...data.endpoints].sort((a: Endpoint, b: Endpoint) => (a[sort.key] - b[sort.key]) * direction);
  }, [data.endpoints, sort]);

  const pressSort = (key: SortKey) =>
    setSort((current) => ({ key, descending: current.key === key ? !current.descending : true }));

  const { totals } = data;

  return (
    <div className="space-y-4">
      <section className={SECTION} aria-labelledby="devdash-api-totals">
        <h3 id="devdash-api-totals" className="sr-only">Totals</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="Requests" value={totals.requests.toLocaleString('en-US')} />
          <Stat
            label="Error rate"
            value={`${totals.errorRate}%`}
            note={`${totals.errors.toLocaleString('en-US')} ${totals.errors === 1 ? 'error' : 'errors'}`}
          />
          <Stat label="Median response" value={`${totals.p50Ms}ms`} />
          <Stat label="95th percentile" value={`${totals.p95Ms}ms`} />
        </div>
        <div className="mt-4">
          <TrendBars
            values={data.buckets.map((b) => b.requests)}
            highlights={data.buckets.map((b) => b.errors)}
            labels={data.buckets.map((b) => bucketLabel(b.start, timeRange))}
            ariaLabel="Requests over time, errors in red"
            height={56}
          />
        </div>
      </section>

      <section className={SECTION} aria-labelledby="devdash-api-endpoints">
        <h3 id="devdash-api-endpoints" className={HEADING}>Endpoints</h3>
        {endpoints.length === 0 ? (
          <p className="text-sm text-stone-500">No requests in this range.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full" aria-label="Endpoints">
              <thead>
                <tr className="border-b border-stone-200">
                  <th className={`${TH} text-left`}>Endpoint</th>
                  {COLUMNS.map((column) => {
                    const active = sort.key === column.key;
                    return (
                      <th
                        key={column.key}
                        className={`${TH} text-right`}
                        aria-sort={active ? (sort.descending ? 'descending' : 'ascending') : 'none'}
                      >
                        <button
                          type="button"
                          onClick={() => pressSort(column.key)}
                          className="inline-flex items-center gap-1 uppercase tracking-wide hover:text-stone-900"
                        >
                          {column.label}
                          {active && (sort.descending ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />)}
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {endpoints.map((endpoint) => (
                  <tr key={`${endpoint.method} ${endpoint.endpoint}`}>
                    <td className="px-3 py-2 text-sm">
                      <span className="mr-2"><Method value={endpoint.method} /></span>
                      <span className="font-mono text-xs text-stone-800">{endpoint.endpoint}</span>
                    </td>
                    <td className={`${TD} text-right text-stone-900`}>{endpoint.calls.toLocaleString('en-US')}</td>
                    <td className={`${TD} text-right text-stone-700`}>{`${endpoint.avgMs}ms`}</td>
                    <td className={`${TD} text-right text-stone-700`}>{`${endpoint.p95Ms}ms`}</td>
                    <td className={`${TD} text-right text-stone-700`}>{`${endpoint.maxMs}ms`}</td>
                    <td className={`${TD} text-right ${endpoint.errors > 0 ? 'font-medium text-red-600' : 'text-stone-500'}`}>
                      {endpoint.errors}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className={SECTION} aria-labelledby="devdash-api-slowest">
          <h3 id="devdash-api-slowest" className={HEADING}>Slowest endpoints</h3>
          {data.slowest.length === 0 ? (
            <p className="text-sm text-stone-500">Nothing with 5 or more calls in this range.</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {data.slowest.map((endpoint) => (
                <li key={`${endpoint.method} ${endpoint.endpoint}`} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="mr-2"><Method value={endpoint.method} /></span>
                    <span className="font-mono text-xs text-stone-800 break-all">{endpoint.endpoint}</span>
                  </span>
                  <span className="flex-shrink-0 text-right text-sm tabular-nums">
                    <span className="font-medium text-stone-900">{`${endpoint.avgMs}ms`}</span>
                    <span className="ml-2 text-xs text-stone-500">max <span>{`${endpoint.maxMs}ms`}</span></span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={SECTION} aria-labelledby="devdash-api-errors">
          <h3 id="devdash-api-errors" className={HEADING}>Recent errors</h3>
          {data.recentErrors.length === 0 ? (
            <p className="text-sm text-stone-500">No errors in this range.</p>
          ) : (
            <ul className="divide-y divide-stone-100 max-h-96 overflow-y-auto">
              {data.recentErrors.map((error) => (
                <li key={error.id} className="py-2 text-sm">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className={`font-medium tabular-nums ${error.statusCode >= 500 ? 'text-red-600' : 'text-amber-700'}`}>
                      {error.statusCode}
                    </span>
                    <Method value={error.method} />
                    <span className="font-mono text-xs text-stone-800 break-all">{error.endpoint}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-stone-500">
                    {`${formatDateTime(error.createdAt)} · ${error.userName ?? 'Not signed in'}`}
                    {error.errorMessage && <span className="text-stone-700">{` · ${error.errorMessage}`}</span>}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
};
```

- [ ] **Step 4: Write `UsageTab.tsx`**

Create `src/components/developer/DevDashboard/UsageTab.tsx`:

```tsx
import React from 'react';
import type { Usage } from './types';
import { TrendBars } from './TrendBars';
import { timeAgo } from './format';

const SECTION = 'rounded-lg border border-stone-200 bg-white p-4 md:p-5';
const HEADING = 'text-sm font-semibold text-stone-900 mb-3';
const TH = 'px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-stone-500';
const TD = 'px-3 py-2 text-sm';

const dayLabel = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

export const UsageTab: React.FC<{ data: Usage }> = ({ data }) => (
  <div className="space-y-4">
    <section className={SECTION} aria-labelledby="devdash-usage-totals">
      <h3 id="devdash-usage-totals" className="sr-only">Totals</h3>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-stone-500">Screen views</p>
          <p className="mt-1 text-2xl font-semibold text-stone-900 tabular-nums">{data.totals.views.toLocaleString('en-US')}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-stone-500">People</p>
          <p className="mt-1 text-2xl font-semibold text-stone-900 tabular-nums">{data.totals.uniqueUsers}</p>
        </div>
      </div>
    </section>

    <section className={SECTION} aria-labelledby="devdash-usage-screens">
      <h3 id="devdash-usage-screens" className={HEADING}>Screens</h3>
      {data.screens.length === 0 ? (
        <p className="text-sm text-stone-500">No screen views in this range.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full" aria-label="Screens">
            <thead>
              <tr className="border-b border-stone-200">
                <th className={TH}>Screen</th>
                <th className={`${TH} text-right`}>Views</th>
                <th className={`${TH} text-right`}>People</th>
                <th className={TH}>By day</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {data.screens.map((screen) => (
                <tr key={screen.page}>
                  <td className={`${TD} font-mono text-xs text-stone-800`}>{screen.page}</td>
                  <td className={`${TD} text-right tabular-nums text-stone-900`}>{screen.views.toLocaleString('en-US')}</td>
                  <td className={`${TD} text-right tabular-nums text-stone-700`}>{screen.uniqueUsers}</td>
                  <td className={`${TD} w-48`}>
                    <TrendBars
                      values={screen.daily.map((d) => d.views)}
                      labels={screen.daily.map((d) => dayLabel(d.day))}
                      ariaLabel={`Daily views of ${screen.page}`}
                      height={24}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>

    <section className={SECTION} aria-labelledby="devdash-usage-people">
      <h3 id="devdash-usage-people" className={HEADING}>People</h3>
      <div className="overflow-x-auto">
        <table className="w-full" aria-label="People">
          <thead>
            <tr className="border-b border-stone-200">
              <th className={TH}>Person</th>
              <th className={TH}>Last seen</th>
              <th className={`${TH} text-right`}>Views</th>
              <th className={TH}>Device</th>
              <th className={TH}>Most used</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {data.users.map((user) => (
              <tr key={user.userId} aria-label={user.name} className={user.views === 0 ? 'text-stone-400' : 'text-stone-800'}>
                <td className={TD}>
                  <span className={`font-medium ${user.views === 0 ? 'text-stone-500' : 'text-stone-900'}`}>{user.name}</span>
                  <span className="ml-2 text-xs text-stone-500">{user.role}</span>
                </td>
                <td className={TD}>{timeAgo(user.lastSeen)}</td>
                <td className={`${TD} text-right tabular-nums`}>{user.views}</td>
                {user.views === 0 ? (
                  <td className={TD} colSpan={2}>No activity</td>
                ) : (
                  <>
                    <td className={TD}>{`${user.mobileViews} mobile, ${user.desktopViews} desktop`}</td>
                    <td className={`${TD} font-mono text-xs`}>
                      {user.topPages.map((p) => `${p.page} (${p.views})`).join(', ')}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  </div>
);
```

- [ ] **Step 5: Verify**

Run: `npx vitest run src/components/developer/DevDashboard/__tests__/ApiTab.test.tsx src/components/developer/DevDashboard/__tests__/UsageTab.test.tsx && npm run build`
Expected: all PASS, build succeeds.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(dev-dashboard): API tab with sortable endpoints and recent errors; Usage tab

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Audit Log tab, the dashboard shell, and removal of the old tabs

**Files:**
- Create: `src/components/developer/DevDashboard/AuditLogTab.tsx`
- Rewrite: `src/components/developer/DevDashboard.tsx`
- Modify: `src/utils/api.ts` (replace the whole `devDashboard` block)
- Modify: `src/App.tsx:481` (drop the `user` prop)
- Delete in `src/components/developer/DevDashboard/`: `OcrTab.tsx`, `MetricsTab.tsx`, `AlertsTab.tsx`, `PageAnalyticsTab.tsx`, `ApiAnalyticsTab.tsx`, `AuditLogsTab.tsx`, `DashboardSummaryCards.tsx`, `DashboardTabNavigation.tsx`
- Test: `src/components/developer/DevDashboard/__tests__/AuditLogTab.test.tsx`, `src/components/developer/__tests__/DevDashboard.test.tsx`

**Interfaces:**
- Consumes: `useDashboardResource`, `refreshOpenResources`, `clearDashboardCache`, `TabState`, `OverviewTab`, `ApiTab`, `UsageTab`, `SessionsTab`, types, and all five fixtures.
- Produces:
  - `api.devDashboard.getOverview()`, `.getApiAnalytics(timeRange)`, `.getUsage(timeRange)`, `.getSessions()`, `.getAuditLogs(filters: AuditFilters)` — the final names; nothing else remains in that block.
  - `<AuditLogTab timeRange={TimeRange} />` (fetches its own data, because it owns filters and paging)
  - `<DevDashboard />` (no props)

- [ ] **Step 1: Replace the API bindings**

In `src/utils/api.ts`, replace the entire `devDashboard: { … },` block (old bindings and the five added in Task 10) with:

```ts
  devDashboard: {
    getOverview: () => apiClient.get<Overview>('/dev-dashboard/overview'),
    getApiAnalytics: (timeRange: TimeRange) =>
      apiClient.get<ApiAnalytics>('/dev-dashboard/api-analytics', { params: { timeRange } }),
    getUsage: (timeRange: TimeRange) => apiClient.get<Usage>('/dev-dashboard/usage', { params: { timeRange } }),
    getSessions: () => apiClient.get<SessionsPayload>('/dev-dashboard/sessions'),
    getAuditLogs: (filters: AuditFilters) => {
      // Empty filters are left off the query string rather than sent as "".
      const params: Record<string, string | number> = {
        timeRange: filters.timeRange, limit: filters.limit, offset: filters.offset,
      };
      if (filters.user) params.user = filters.user;
      if (filters.method) params.method = filters.method;
      if (filters.status) params.status = filters.status;
      if (filters.search) params.search = filters.search;
      return apiClient.get<AuditLogPage>('/dev-dashboard/audit-logs', { params });
    },
  },
```

- [ ] **Step 2: Write the failing Audit Log test**

Create `src/components/developer/DevDashboard/__tests__/AuditLogTab.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import fixture from '../../../../utils/__fixtures__/devDashboard/auditLogs.json';

const getAuditLogs = vi.fn();
vi.mock('../../../../utils/api', () => ({
  api: { devDashboard: { getAuditLogs: (filters: unknown) => getAuditLogs(filters) } },
}));

import { AuditLogTab } from '../AuditLogTab';
import { clearDashboardCache } from '../useDashboardResource';

const lastFilters = () => getAuditLogs.mock.calls[getAuditLogs.mock.calls.length - 1][0];
const rows = () => within(screen.getByRole('table', { name: 'Audit log' })).getAllByRole('row').slice(1);

describe('AuditLogTab', () => {
  beforeEach(() => {
    clearDashboardCache();
    getAuditLogs.mockReset();
    getAuditLogs.mockResolvedValue(fixture);
  });

  it('asks for the first page of the selected range with no filters', async () => {
    render(<AuditLogTab timeRange="24h" />);
    await waitFor(() => expect(rows()).toHaveLength(2));
    expect(getAuditLogs).toHaveBeenCalledWith({
      user: '', method: '', status: '', search: '', timeRange: '24h', limit: 50, offset: 0,
    });
  });

  it('shows who did what, where from, and how it went', async () => {
    render(<AuditLogTab timeRange="24h" />);
    await waitFor(() => expect(rows()).toHaveLength(2));
    const [write, login] = rows();
    expect(write).toHaveTextContent('sahil');
    expect(write).toHaveTextContent('PUT');
    expect(write).toHaveTextContent('/api/events/0b5f1c7e-1111-2222-3333-444455556666');
    expect(write).toHaveTextContent('Success');
    expect(write).toHaveTextContent('203.0.113.9');
    expect(login).toHaveTextContent('digi');
    expect(login).toHaveTextContent('Sign-in');
    expect(login).toHaveTextContent('login_failed');
    expect(login).toHaveTextContent('Failed');
    expect(login).toHaveTextContent('Invalid password');
  });

  it('applies the search box on submit, from the first page', async () => {
    render(<AuditLogTab timeRange="24h" />);
    await waitFor(() => expect(rows()).toHaveLength(2));
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'events' } });
    expect(lastFilters().search).toBe('');
    fireEvent.submit(screen.getByRole('search'));
    await waitFor(() => expect(lastFilters()).toMatchObject({ search: 'events', offset: 0 }));
  });

  it('applies a dropdown filter as soon as it changes', async () => {
    render(<AuditLogTab timeRange="24h" />);
    await waitFor(() => expect(rows()).toHaveLength(2));
    fireEvent.change(screen.getByLabelText('Action type'), { target: { value: 'auth' } });
    await waitFor(() => expect(lastFilters().method).toBe('auth'));
    fireEvent.change(screen.getByLabelText('Outcome'), { target: { value: 'failure' } });
    await waitFor(() => expect(lastFilters()).toMatchObject({ method: 'auth', status: 'failure' }));
  });

  it('pages forward and back', async () => {
    getAuditLogs.mockResolvedValue({ ...fixture, total: 120 });
    render(<AuditLogTab timeRange="24h" />);
    await waitFor(() => expect(screen.getByText('1–2 of 120')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(lastFilters().offset).toBe(50));
    await waitFor(() => expect(screen.getByText('51–52 of 120')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Previous page' }));
    await waitFor(() => expect(lastFilters().offset).toBe(0));
  });

  it('disables Next on the last page', async () => {
    render(<AuditLogTab timeRange="24h" />);
    await waitFor(() => expect(screen.getByText('1–2 of 37')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
  });

  it('returns to the first page when a filter changes', async () => {
    getAuditLogs.mockResolvedValue({ ...fixture, total: 120 });
    render(<AuditLogTab timeRange="24h" />);
    await waitFor(() => expect(rows()).toHaveLength(2));
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(lastFilters().offset).toBe(50));
    fireEvent.change(screen.getByLabelText('Outcome'), { target: { value: 'failure' } });
    await waitFor(() => expect(lastFilters()).toMatchObject({ status: 'failure', offset: 0 }));
  });

  it('returns to the first page when the time range changes', async () => {
    getAuditLogs.mockResolvedValue({ ...fixture, total: 120 });
    const { rerender } = render(<AuditLogTab timeRange="24h" />);
    await waitFor(() => expect(rows()).toHaveLength(2));
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(lastFilters().offset).toBe(50));
    rerender(<AuditLogTab timeRange="7d" />);
    await waitFor(() => expect(lastFilters()).toMatchObject({ timeRange: '7d', offset: 0 }));
  });

  it('says so when nothing matches, and keeps the filters on screen', async () => {
    getAuditLogs.mockResolvedValue({ logs: [], total: 0 });
    render(<AuditLogTab timeRange="24h" />);
    await waitFor(() => expect(screen.getByText('No audit entries match.')).toBeInTheDocument());
    expect(screen.getByLabelText('Search')).toBeInTheDocument();
  });

  it('shows the real error when the log cannot be read', async () => {
    getAuditLogs.mockRejectedValue(new Error('permission denied for table audit_logs'));
    render(<AuditLogTab timeRange="24h" />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('permission denied for table audit_logs'));
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/components/developer/DevDashboard/__tests__/AuditLogTab.test.tsx`
Expected: FAIL — cannot find module `../AuditLogTab`.

- [ ] **Step 4: Write `AuditLogTab.tsx`**

Create `src/components/developer/DevDashboard/AuditLogTab.tsx`:

```tsx
import React, { useState } from 'react';
import { Search } from 'lucide-react';
import { api } from '../../../utils/api';
import type { AuditFilters, AuditLogPage, TimeRange } from './types';
import { useDashboardResource } from './useDashboardResource';
import { TabState } from './TabState';
import { formatDateTime } from './format';

const PAGE_SIZE = 50;

type Choices = Pick<AuditFilters, 'user' | 'method' | 'status' | 'search'>;
const NO_FILTERS: Choices = { user: '', method: '', status: '', search: '' };

const OUTCOME: Record<string, { label: string; tone: string }> = {
  success: { label: 'Success', tone: 'bg-emerald-50 text-emerald-700' },
  warning: { label: 'Rejected', tone: 'bg-amber-50 text-amber-800' },
  failure: { label: 'Failed', tone: 'bg-red-50 text-red-700' },
};

const INPUT = 'rounded-lg border border-stone-300 px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500';
const TH = 'px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-stone-500';
const TD = 'px-3 py-2 text-sm align-top';

export const AuditLogTab: React.FC<{ timeRange: TimeRange }> = ({ timeRange }) => {
  // Text boxes are applied on submit; dropdowns apply immediately.
  const [draft, setDraft] = useState({ user: '', search: '' });
  const [applied, setApplied] = useState<Choices>(NO_FILTERS);
  // The page belongs to one range: a different range starts again at the top.
  const [page, setPage] = useState<{ range: TimeRange; offset: number }>({ range: timeRange, offset: 0 });
  const offset = page.range === timeRange ? page.offset : 0;

  const filters: AuditFilters = { ...applied, timeRange, limit: PAGE_SIZE, offset };
  const resource = useDashboardResource<AuditLogPage>(
    `audit:${JSON.stringify(filters)}`,
    () => api.devDashboard.getAuditLogs(filters)
  );

  const apply = (changes: Partial<Choices>) => {
    setApplied((current) => ({ ...current, ...changes }));
    setPage({ range: timeRange, offset: 0 });
  };
  const goTo = (nextOffset: number) => setPage({ range: timeRange, offset: Math.max(0, nextOffset) });

  return (
    <div className="space-y-4">
      <form
        role="search"
        className="flex flex-col gap-3 md:flex-row md:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          apply({ search: draft.search.trim(), user: draft.user.trim() });
        }}
      >
        <label className="flex-1 text-xs font-medium text-stone-600">
          Search
          <span className="relative mt-1 block">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" aria-hidden="true" />
            <input
              type="search"
              value={draft.search}
              onChange={(event) => setDraft((d) => ({ ...d, search: event.target.value }))}
              placeholder="Path, action or error"
              className={`${INPUT} w-full pl-9`}
            />
          </span>
        </label>
        <label className="text-xs font-medium text-stone-600">
          Person
          <input
            type="text"
            value={draft.user}
            onChange={(event) => setDraft((d) => ({ ...d, user: event.target.value }))}
            placeholder="Username"
            className={`${INPUT} mt-1 block w-full md:w-40`}
          />
        </label>
        <label className="text-xs font-medium text-stone-600">
          Action type
          <select
            value={applied.method}
            onChange={(event) => apply({ method: event.target.value as Choices['method'] })}
            className={`${INPUT} mt-1 block w-full md:w-36`}
          >
            <option value="">All</option>
            <option value="auth">Sign-in</option>
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
            <option value="PATCH">PATCH</option>
            <option value="DELETE">DELETE</option>
          </select>
        </label>
        <label className="text-xs font-medium text-stone-600">
          Outcome
          <select
            value={applied.status}
            onChange={(event) => apply({ status: event.target.value as Choices['status'] })}
            className={`${INPUT} mt-1 block w-full md:w-32`}
          >
            <option value="">All</option>
            <option value="success">Success</option>
            <option value="warning">Rejected</option>
            <option value="failure">Failed</option>
          </select>
        </label>
        <button type="submit" className="btn-primary">Apply</button>
      </form>

      <TabState resource={resource} skeletonRows={6}>
        {(data) =>
          data.logs.length === 0 ? (
            <p className="py-8 text-center text-sm text-stone-500">No audit entries match.</p>
          ) : (
            <>
              <div className="overflow-x-auto rounded-lg border border-stone-200">
                <table className="w-full" aria-label="Audit log">
                  <thead className="bg-stone-50">
                    <tr>
                      <th className={TH}>When</th>
                      <th className={TH}>Person</th>
                      <th className={TH}>Action</th>
                      <th className={TH}>Outcome</th>
                      <th className={TH}>Address</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {data.logs.map((log) => {
                      const outcome = OUTCOME[log.status] ?? { label: log.status, tone: 'bg-stone-100 text-stone-700' };
                      return (
                        <tr key={log.id}>
                          <td className={`${TD} whitespace-nowrap text-stone-600`}>{formatDateTime(log.createdAt)}</td>
                          <td className={TD}>
                            <span className="font-medium text-stone-900">{log.userName ?? 'Not signed in'}</span>
                            {log.userRole && <span className="ml-2 text-xs text-stone-500">{log.userRole}</span>}
                          </td>
                          <td className={TD}>
                            <span className="mr-2 inline-block rounded bg-stone-100 px-1.5 py-0.5 text-xs font-medium text-stone-700">
                              {log.method ?? 'Sign-in'}
                            </span>
                            <span className="font-mono text-xs text-stone-800 break-all">{log.path ?? log.action}</span>
                            {log.errorMessage && <p className="mt-0.5 text-xs text-red-700">{log.errorMessage}</p>}
                          </td>
                          <td className={TD}>
                            <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${outcome.tone}`}>
                              {outcome.label}
                            </span>
                          </td>
                          <td className={`${TD} font-mono text-xs text-stone-600`}>{log.ipAddress ?? '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm text-stone-600 tabular-nums">
                  {`${offset + 1}–${offset + data.logs.length} of ${data.total.toLocaleString('en-US')}`}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn-secondary"
                    aria-label="Previous page"
                    disabled={offset === 0}
                    onClick={() => goTo(offset - PAGE_SIZE)}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    aria-label="Next page"
                    disabled={offset + PAGE_SIZE >= data.total}
                    onClick={() => goTo(offset + PAGE_SIZE)}
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )
        }
      </TabState>
    </div>
  );
};
```

- [ ] **Step 5: Run the Audit Log test**

Run: `npx vitest run src/components/developer/DevDashboard/__tests__/AuditLogTab.test.tsx`
Expected: 10 tests PASS.

- [ ] **Step 6: Write the failing shell test**

Create `src/components/developer/__tests__/DevDashboard.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import overview from '../../../utils/__fixtures__/devDashboard/overview.json';
import apiAnalytics from '../../../utils/__fixtures__/devDashboard/apiAnalytics.json';
import usage from '../../../utils/__fixtures__/devDashboard/usage.json';
import sessions from '../../../utils/__fixtures__/devDashboard/sessions.json';
import auditLogs from '../../../utils/__fixtures__/devDashboard/auditLogs.json';

const calls = {
  getOverview: vi.fn(),
  getApiAnalytics: vi.fn(),
  getUsage: vi.fn(),
  getSessions: vi.fn(),
  getAuditLogs: vi.fn(),
};
vi.mock('../../../utils/api', () => ({
  api: {
    devDashboard: {
      getOverview: () => calls.getOverview(),
      getApiAnalytics: (range: string) => calls.getApiAnalytics(range),
      getUsage: (range: string) => calls.getUsage(range),
      getSessions: () => calls.getSessions(),
      getAuditLogs: (filters: unknown) => calls.getAuditLogs(filters),
    },
  },
}));

import { DevDashboard } from '../DevDashboard';
import { clearDashboardCache } from '../DevDashboard/useDashboardResource';

const openTab = (name: string) => fireEvent.click(screen.getByRole('tab', { name }));

describe('DevDashboard', () => {
  beforeEach(() => {
    clearDashboardCache();
    Object.values(calls).forEach((mock) => mock.mockReset());
    calls.getOverview.mockResolvedValue(overview);
    calls.getApiAnalytics.mockResolvedValue(apiAnalytics);
    calls.getUsage.mockResolvedValue(usage);
    calls.getSessions.mockResolvedValue(sessions);
    calls.getAuditLogs.mockResolvedValue(auditLogs);
  });

  it('has exactly five tabs and opens on Overview', async () => {
    render(<DevDashboard />);
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Overview', 'API', 'Usage', 'Sessions', 'Audit Log',
    ]);
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => expect(screen.getByRole('region', { name: 'Health checks' })).toBeInTheDocument());
  });

  it('loads only the open tab', async () => {
    render(<DevDashboard />);
    await waitFor(() => expect(calls.getOverview).toHaveBeenCalledTimes(1));
    expect(calls.getApiAnalytics).not.toHaveBeenCalled();
    expect(calls.getUsage).not.toHaveBeenCalled();
    expect(calls.getSessions).not.toHaveBeenCalled();
    expect(calls.getAuditLogs).not.toHaveBeenCalled();
  });

  it('shows the range picker only where a range applies', async () => {
    render(<DevDashboard />);
    expect(screen.queryByLabelText('Time range')).not.toBeInTheDocument();
    openTab('API');
    expect(screen.getByLabelText('Time range')).toHaveValue('24h');
    openTab('Sessions');
    expect(screen.queryByLabelText('Time range')).not.toBeInTheDocument();
    openTab('Usage');
    expect(screen.getByLabelText('Time range')).toBeInTheDocument();
    openTab('Audit Log');
    expect(screen.getByLabelText('Time range')).toBeInTheDocument();
  });

  it('refetches the open tab when the range changes, and keeps the range across tabs', async () => {
    render(<DevDashboard />);
    openTab('API');
    await waitFor(() => expect(calls.getApiAnalytics).toHaveBeenCalledWith('24h'));
    fireEvent.change(screen.getByLabelText('Time range'), { target: { value: '7d' } });
    await waitFor(() => expect(calls.getApiAnalytics).toHaveBeenCalledWith('7d'));
    openTab('Usage');
    await waitFor(() => expect(calls.getUsage).toHaveBeenCalledWith('7d'));
  });

  it('shows a tab it has already loaded without a loading state', async () => {
    render(<DevDashboard />);
    await waitFor(() => expect(screen.getByRole('region', { name: 'Health checks' })).toBeInTheDocument());
    openTab('Sessions');
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());
    openTab('Overview');
    expect(screen.getByRole('region', { name: 'Health checks' })).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Loading' })).not.toBeInTheDocument();
  });

  it('Refresh refetches the open tab only', async () => {
    render(<DevDashboard />);
    await waitFor(() => expect(calls.getOverview).toHaveBeenCalledTimes(1));
    openTab('Sessions');
    await waitFor(() => expect(calls.getSessions).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(calls.getSessions).toHaveBeenCalledTimes(2));
    expect(calls.getOverview).toHaveBeenCalledTimes(1);
  });

  it('keeps the other tabs usable when one fails', async () => {
    calls.getOverview.mockRejectedValue(new Error('overview exploded'));
    render(<DevDashboard />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('overview exploded'));
    openTab('Sessions');
    await waitFor(() => expect(screen.getByRole('row', { name: /Digi/ })).toBeInTheDocument());
  });
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `npx vitest run src/components/developer/__tests__/DevDashboard.test.tsx`
Expected: FAIL — the current shell renders nine tabs and calls endpoints that no longer exist.

- [ ] **Step 8: Rewrite the shell**

Replace the whole file `src/components/developer/DevDashboard.tsx` with:

```tsx
import React, { useState } from 'react';
import { RefreshCw, Code, BarChart3, Zap, Monitor, Users, Activity, LucideIcon } from 'lucide-react';
import { api } from '../../utils/api';
import type { TimeRange } from './DevDashboard/types';
import { useDashboardResource, refreshOpenResources } from './DevDashboard/useDashboardResource';
import { TabState } from './DevDashboard/TabState';
import { OverviewTab } from './DevDashboard/OverviewTab';
import { ApiTab } from './DevDashboard/ApiTab';
import { UsageTab } from './DevDashboard/UsageTab';
import { SessionsTab } from './DevDashboard/SessionsTab';
import { AuditLogTab } from './DevDashboard/AuditLogTab';

type TabId = 'overview' | 'api' | 'usage' | 'sessions' | 'audit';

const TABS: Array<{ id: TabId; label: string; icon: LucideIcon; ranged: boolean }> = [
  { id: 'overview', label: 'Overview', icon: BarChart3, ranged: false },
  { id: 'api', label: 'API', icon: Zap, ranged: true },
  { id: 'usage', label: 'Usage', icon: Monitor, ranged: true },
  { id: 'sessions', label: 'Sessions', icon: Users, ranged: false },
  { id: 'audit', label: 'Audit Log', icon: Activity, ranged: true },
];

const RANGES: Array<{ value: TimeRange; label: string }> = [
  { value: '1h', label: 'Last hour' },
  { value: '24h', label: 'Last 24 hours' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
];

const POLL_MS = 30_000;

// Each pane owns its data, so a tab that is not open loads nothing.
const OverviewPane: React.FC = () => {
  const resource = useDashboardResource('overview', api.devDashboard.getOverview, { pollMs: POLL_MS });
  return <TabState resource={resource}>{(data) => <OverviewTab data={data} />}</TabState>;
};

const ApiPane: React.FC<{ timeRange: TimeRange }> = ({ timeRange }) => {
  const resource = useDashboardResource(`api:${timeRange}`, () => api.devDashboard.getApiAnalytics(timeRange), { pollMs: POLL_MS });
  return <TabState resource={resource}>{(data) => <ApiTab data={data} timeRange={timeRange} />}</TabState>;
};

const UsagePane: React.FC<{ timeRange: TimeRange }> = ({ timeRange }) => {
  const resource = useDashboardResource(`usage:${timeRange}`, () => api.devDashboard.getUsage(timeRange), { pollMs: POLL_MS });
  return <TabState resource={resource}>{(data) => <UsageTab data={data} />}</TabState>;
};

const SessionsPane: React.FC = () => {
  const resource = useDashboardResource('sessions', api.devDashboard.getSessions, { pollMs: POLL_MS });
  return <TabState resource={resource}>{(data) => <SessionsTab data={data} />}</TabState>;
};

export const DevDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [timeRange, setTimeRange] = useState<TimeRange>('24h');
  const ranged = TABS.find((tab) => tab.id === activeTab)!.ranged;

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-blue-500 rounded-lg flex items-center justify-center">
            <Code className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-stone-900">Developer Dashboard</h1>
            <p className="text-sm text-stone-600">Health, API traffic, usage, sessions and the audit trail</p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          {ranged && (
            <select
              aria-label="Time range"
              value={timeRange}
              onChange={(event) => setTimeRange(event.target.value as TimeRange)}
              className="px-3 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-brand-500 text-sm"
            >
              {RANGES.map((range) => (
                <option key={range.value} value={range.value}>{range.label}</option>
              ))}
            </select>
          )}
          <button type="button" onClick={refreshOpenResources} className="btn-primary">
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-stone-200 overflow-hidden">
        <div className="overflow-x-auto px-4 pt-4 md:px-6 md:pt-6">
          <div className="seg-track" role="tablist" aria-label="Dashboard sections">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const selected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  id={`devdash-tab-${tab.id}`}
                  aria-selected={selected}
                  aria-controls="devdash-panel"
                  onClick={() => setActiveTab(tab.id)}
                  className={`seg-tab ${selected ? 'seg-tab-active' : 'seg-tab-idle'}`}
                >
                  <Icon className="w-4 h-4" aria-hidden="true" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div id="devdash-panel" role="tabpanel" aria-labelledby={`devdash-tab-${activeTab}`} className="p-4 md:p-6">
          {activeTab === 'overview' && <OverviewPane />}
          {activeTab === 'api' && <ApiPane timeRange={timeRange} />}
          {activeTab === 'usage' && <UsagePane timeRange={timeRange} />}
          {activeTab === 'sessions' && <SessionsPane />}
          {activeTab === 'audit' && <AuditLogTab timeRange={timeRange} />}
        </div>
      </div>
    </div>
  );
};
```

In `src/App.tsx`, change

```tsx
              {currentPage === 'devdashboard' && user.role === 'developer' && <DevDashboard user={user} />}
```

to

```tsx
              {currentPage === 'devdashboard' && user.role === 'developer' && <DevDashboard />}
```

- [ ] **Step 9: Delete the old tab components**

```bash
cd src/components/developer/DevDashboard
git rm OcrTab.tsx MetricsTab.tsx AlertsTab.tsx PageAnalyticsTab.tsx ApiAnalyticsTab.tsx \
       AuditLogsTab.tsx DashboardSummaryCards.tsx DashboardTabNavigation.tsx
cd -
```

Run: `grep -rnE "getVersion|getMetrics|getAlerts|acknowledgeAlert|resolveAlert|getPageAnalytics|getSummary|getOcrMetrics|getApiAnalyticsV2|getSessionsV2|getAuditLogPage|OcrTab|MetricsTab|AlertsTab|PageAnalyticsTab|ApiAnalyticsTab|AuditLogsTab|DashboardSummaryCards|DashboardTabNavigation" src`
Expected: no output. (`api.devDashboard` is the only place those binding names lived; if `getVersion` or `getSummary` turns up on a different object, leave that line alone.)

- [ ] **Step 10: Verify**

Run: `npx vitest run src/components/developer src/hooks/__tests__/usePageViewTracking.test.ts && npm run build`
Expected: all PASS, build succeeds.

Run: `npx eslint src/components/developer src/hooks/usePageViewTracking.ts src/utils/api.ts`
Expected: no errors.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat(dev-dashboard): five-tab shell where each tab loads on its own; Audit Log tab

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Docs, version, and end-to-end check

**Files:**
- Modify: `CLAUDE.md` (backend service boundaries, frontend section)
- Modify: `docs/ARCHITECTURE.md` (new section 11)
- Rewrite: `docs/DEV_DASHBOARD_DOCUMENTATION.md`
- Delete: `docs/OCR_TRAINING_GUIDE.md`
- Modify: `CHANGELOG.md`, `package.json`, `backend/package.json`, `backend/src/config/version.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: version `2.34.0` on a branch that is ready to merge.

- [ ] **Step 1: Update `CLAUDE.md`**

In the "Key service boundaries" list, replace the bullet that starts `- **\`ocr/\`** —` with:

```markdown
- **`ocr/`** — Receipt OCR goes through Midas in production (`routes/ocrV2.ts`
  falls back to the external OCR service only when expenses are local). User
  corrections are still captured into `ocr_corrections`
  (`UserCorrectionService.storeCorrection`); nothing in this app trains on them.
```

Add this bullet after the `notifications/` bullet:

```markdown
- **`devDashboard/`** — One module per developer-dashboard tab (`overview`,
  `apiAnalytics`, `usage`, `sessions`, `auditLog`), each behind one endpoint
  in `routes/devDashboard.ts`. Response shapes are pinned by
  `src/utils/__fixtures__/devDashboard/*.json`, asserted by both backend and
  frontend tests. Every query starts with a `/* devdash:<name> */` tag that
  unit tests route on. `middleware/auditTrail.ts` writes one `audit_logs` row
  per non-GET `/api` request (never the body); `routes/pageViews.ts` records
  screen opens sent by `usePageViewTracking`; `RetentionJob` prunes
  `api_requests` (30d), `page_views` (90d), `audit_logs` (365d) and expired
  sessions daily.
```

- [ ] **Step 2: Update `docs/ARCHITECTURE.md`**

Append a new section at the end of the file:

```markdown
## 11. Developer dashboard

Five tabs, each with one endpoint under `/api/dev-dashboard` and one module
under `backend/src/services/devDashboard/`:

| Tab | Endpoint | Source |
|---|---|---|
| Overview | `GET /overview` | process and OS figures, Postgres catalog, six live health checks over `api_requests` and `user_sessions` |
| API | `GET /api-analytics?timeRange=` | `api_requests`, written by `apiRequestLogger` (monitoring probes are not logged) |
| Usage | `GET /usage?timeRange=` | `page_views`, written by `POST /api/page-views` from `usePageViewTracking` |
| Sessions | `GET /sessions` | unexpired `user_sessions`, grouped by person |
| Audit Log | `GET /audit-logs` | `audit_logs` |

The API allows `admin` and `developer`; the screen is shown to `developer`
only. `timeRange` is `1h`, `24h`, `7d` or `30d` and is mapped through a fixed
lookup before reaching SQL as a parameter.

**Audit trail.** `middleware/auditTrail.ts` writes one row for every `POST`,
`PUT`, `PATCH` and `DELETE` under `/api` after the response finishes: who, the
real path, the outcome, the address. It never stores the request body and can
never fail a request. `/api/auth/*` is skipped because `logAuth` writes login,
failed-login and logout rows itself; those rows have no `request_method`,
which is how the tab's "Sign-in" filter finds them.

**Health checks** are computed on every Overview load and never stored. There
is no alert history, acknowledgement or notification.

**Retention.** `RetentionJob` runs a minute after startup and then daily:
`api_requests` 30 days, `page_views` 90 days, `audit_logs` 365 days, and
`user_sessions` past `expires_at`.

**Contract.** `src/utils/__fixtures__/devDashboard/*.json` is the response
contract. Backend tests assert each module returns exactly those keys;
frontend tab tests render from the same files.

**Not here.** OCR service monitoring and model training. Receipts are OCR'd
through Midas; this app only records user corrections in `ocr_corrections`.
```

- [ ] **Step 3: Replace the dashboard doc and remove the training guide**

```bash
git rm docs/OCR_TRAINING_GUIDE.md
```

Replace the whole of `docs/DEV_DASHBOARD_DOCUMENTATION.md` with:

```markdown
# Developer Dashboard

Shown to the `developer` role under Manage → Dev Dashboard.

| Tab | Answers |
|---|---|
| Overview | Is the app healthy? Version, memory, CPU load, disk, database size and connections, and six health checks with the measured value beside each threshold. |
| API | What is failing or slow? Requests, error rate, median and 95th-percentile response time, a requests-over-time strip (errors in red), a sortable endpoint table, the slowest endpoints, and the 50 most recent errors. |
| Usage | Who is using what? Views and people per screen with a daily trend, and per person: last seen, device split, most-used screens. People with no activity are listed. |
| Sessions | Who is signed in? One row per person; expand to see each device. |
| Audit Log | Who changed what? Every write to the API plus sign-in events, filterable by person, action type and outcome. |

Each tab loads only when opened, keeps its last result when you come back to
it, and refreshes every 30 seconds while the browser tab is visible (the
Audit Log refreshes only on demand, so paging stays put). The time range
applies to API, Usage and Audit Log.

Design and data sources: `docs/ARCHITECTURE.md` section 11.
```

Run: `grep -rn "OCR_TRAINING_GUIDE" docs README.md CLAUDE.md`
For each hit, delete that link line.

- [ ] **Step 4: Bump the version and write the changelog**

Set `"version": "2.34.0"` in both `package.json` and `backend/package.json`, then:

```bash
cd backend && npm run update-version && cd ..
```

Expected: `backend/src/config/version.ts` now reads `FRONTEND_VERSION = '2.34.0'`.

In `CHANGELOG.md`, add directly under `## [Unreleased]`:

```markdown

## [2.34.0] - 2026-10-08 - Developer dashboard rebuilt

### Changed
- **The developer dashboard has five tabs that show real numbers:** Overview, API, Usage, Sessions and Audit Log. Each loads on its own, so switching tabs is immediate.
- **Overview** shows memory, CPU load, disk and database figures that were previously blank, and replaces the Alerts tab with six health checks that show the measured value beside the threshold.
- **API** adds median and 95th-percentile response times, a requests-over-time strip, a sortable endpoint table and a list of recent errors with who hit them. Monitoring probes are no longer counted.
- **Sessions** is one row per person instead of one per login, with device and address filled in.

### Added
- **Usage:** which screens people open, how often, on what device, and who has not used the app.
- **Audit Log now records every change** made through the app, with who made it, from where, and whether it succeeded. Request contents are never stored.

### Removed
- **OCR Service and Model Training tabs.** Receipts are read through Midas, so this app could not report on the OCR service, and the training pipeline never trained anything. Corrections you make to scanned receipts are still saved.
- **Page Views tab**, replaced by Usage.

### Technical
- One module per tab under `backend/src/services/devDashboard/`; response shapes pinned by `src/utils/__fixtures__/devDashboard/*.json` on both sides.
- Migration `047_create_page_views.sql`; `POST /api/page-views`; `usePageViewTracking`.
- `middleware/auditTrail.ts` logs non-GET `/api` requests; `logAuth('token_refresh')` removed.
- `RetentionJob` (daily): `api_requests` 30d, `page_views` 90d, `audit_logs` 365d, expired sessions. These cleanups existed but were never called.
- Removed routes: `/api/retraining/*`, `/api/training/*`, `/api/learning/*`, `/api/training/sync/*`, `GET /api/ocr/v2/corrections/stats`, `GET /api/ocr/v2/corrections/export`, `GET /api/ocr/v2/accuracy`, and the old `/api/dev-dashboard/{version,summary,metrics,alerts,page-analytics,ocr-metrics}`.
- The dashboard no longer pages the Midas expense set.
```

- [ ] **Step 5: Run everything**

Run: `cd backend && npm run migrate && npx vitest run && npx tsc --noEmit && npm run build`
Expected: no failure in any file this plan created or modified; `tsc` prints nothing; build succeeds. List any other failing file by name in the report.

Run from the repo root: `npx vitest run src/components/developer src/hooks/__tests__/usePageViewTracking.test.ts && npm run lint && npm run build`
Expected: all named tests PASS, build succeeds. `npm run lint` must report no errors in files this plan touched.

- [ ] **Step 6: Check it in the running app**

Run: `npm run start:all`, then open `http://localhost:5173` and sign in as `developer` / `password123` (run `cd backend && npm run seed` first if that account does not exist).

Confirm each of these and record the result in the report:

1. Open two or three other screens, then Dev Dashboard. Five tabs. Overview shows non-zero memory, a disk figure or "Unavailable", a database size, and six health checks.
2. Switch through all five tabs and back. No full-screen spinner at any point; a tab opened before appears instantly.
3. API tab: change the range to Last 7 days; numbers change and the bar strip redraws. Click the Avg header; the table re-sorts.
4. Usage tab: the screens you opened in step 1 are listed with your name under People.
5. Sessions tab: one row for you with a browser label and an address.
6. In another screen, change something (for example edit an event), come back to Audit Log: the write is listed with your name, method, path and "Success". Choose Action type → Sign-in: your login is listed.
7. In the browser's network panel, confirm switching to a tab makes one `/api/dev-dashboard/…` request, not five.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "docs: developer dashboard rework; release 2.34.0

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Production rollout

Run by the session owner with the user, not by a task subagent: it needs production access and one decision from the user.

- [ ] **Step 1: Run the predeploy script on the production database**

Nobody can read production before the deploy, so nothing is diagnosed first. Copy `scripts/predeploy-2.34.0.sql` to the database container and run it as `postgres` before deploying the backend:

```bash
su postgres -c "psql -X -v ON_ERROR_STOP=1 -d expense_app_production -f /tmp/predeploy-2.34.0.sql"
```

It creates `page_views` and hands it to the app's role, brings `audit_logs` to the shape the code writes (migration 048), grants the app's role what it needs on `audit_logs`, `api_requests`, `user_sessions` and `page_views`, and records migrations 047 and 048 as applied. It is one transaction, reads no table data, and is safe to run again. It must end with `COMMIT` and exit 0; if it does not, stop and do not deploy.

- [ ] **Step 2: Merge**

```bash
cd /Users/sahilkhatri/Work/trade-show-app-dev-dashboard
git fetch origin && git rebase origin/main
cd backend && npx vitest run tests/services/devDashboard tests/routes/devDashboard.test.ts tests/middleware && cd ..
git push -u origin feat/dev-dashboard
```

Then merge into `main` from this worktree. The main checkout is on `feat/theme-preview`, so `main` is free to check out here:

```bash
git switch main && git pull --ff-only origin main
git merge --no-ff feat/dev-dashboard -m "Merge branch 'feat/dev-dashboard'"
git push origin main
```

- [ ] **Step 3: Deploy to production**

Backend first, then frontend, from `main` in this worktree:

```bash
./scripts/deploy-production-backend.sh
./scripts/deploy-production-frontend.sh
```

After the frontend deploy, wait 90 seconds for NPMplus to regenerate its proxy config before judging the public site.

- [ ] **Step 4: Verify in production**

1. Nothing is applied by hand here: the predeploy script from Step 1 created `page_views` and recorded migrations 047 and 048. The proof is item 4, where the Usage and Audit Log tabs load. If either shows an error, read the message it prints and re-run the predeploy script (it is safe to run again) rather than patching the database.
2. On CT 2220, `curl -s localhost:3000/api/health` reports version `2.34.0`.
3. In the backend journal, `[Retention] Scheduler started` appears and no `[Retention] Cleanup failed` line follows within two minutes.
4. At `https://argo.booute.duckdns.org`, signed in as a developer: all five tabs load with real values; make one change elsewhere and find it in Audit Log; open a screen and find it in Usage.
5. API tab → Recent errors: the `410` rows on `/api/retraining/status` now show the account and client making the once-a-minute calls; tell the user, and remove the tombstone route once the caller is stopped.
6. Sign out and in again, then confirm a fresh Audit Log row shows your real address, not the proxy's.

- [ ] **Step 5: Clean up**

After the user confirms production looks right, remove the worktree from the main checkout:

```bash
cd /Users/sahilkhatri/Work/trade-show-app
git worktree remove ../trade-show-app-dev-dashboard
git branch -d feat/dev-dashboard
```
