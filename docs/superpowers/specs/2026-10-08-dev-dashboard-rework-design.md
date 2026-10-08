# Dev Dashboard Rework — Design

Date: 2026-10-08
Branch: `feat/dev-dashboard` (off `main`, independent of `feat/theme-preview`)
Target: production

## Purpose

The developer dashboard should answer four questions quickly:

1. Is the app healthy?
2. What is failing or slow?
3. Who is using what?
4. Who changed what?

Today it answers almost none of them. Most tabs render zeros or blanks because
the frontend reads field names the backend does not send, two tabs describe
systems Argo does not own or that never worked, and every tab switch reloads
the whole dashboard behind a full-screen spinner.

## Findings that drive the design

| Area | Finding |
|---|---|
| Load time | `activeTab` is in the load effect's deps, so each tab switch re-runs the full load. That load pages the entire Midas expense set three times (summary, metrics, OCR metrics) and pings the OCR container with 5s timeouts. |
| Metrics | Backend sends `system.memory.usagePercent`, `database.databaseSizePretty`; the tab reads `system.memory_usage`, `database.size`. Disk and queries/sec are never computed. |
| OCR Service | Same shape mismatch. In production receipts go Argo → Midas → OCR, so Argo cannot report OCR usage or cost. |
| Model Training | `ocr_corrections` is written on expense submit, but the retraining job only writes a prompt-template JSON that nothing reads. Job state is saved under `dist/` and lost on each deploy. |
| Audit Logs | Only login, logout, token refresh and one user-admin action are written. Production shows zero rows, so the insert or the read is failing there (see Rollout). |
| Sessions | The route uses `services/dashboard/SessionService`, which omits IP and user agent, includes expired rows and caps at 100. `cleanupExpiredSessions` is never called. |
| API Analytics | Monitoring probes are over half the rows. "Slowest" omits max time. `cleanup_old_api_requests()` is never called. |
| Alerts | Status filter ignored, acknowledge/resolve are stubs, nothing is stored. |
| Page Views | API calls bucketed into five hardcoded pages; field names do not match the tab. |

## Decisions

- Five tabs: **Overview, API, Usage, Sessions, Audit Log**.
- Remove OCR Service, Model Training, Metrics, Alerts and Page Views tabs.
  Metrics and Alerts fold into Overview; Page Views is replaced by Usage, built
  on real client-side view tracking.
- Remove the training pipeline; keep correction capture.
- Audit log records every write automatically.
- Usage tracks screens and people; no time-on-screen.

## Architecture

Each tab has one endpoint and one data hook. Nothing is loaded for a tab that
is not open.

### Backend

`services/devDashboard/`, one module per tab, each exporting plain async
functions over `pool`:

| Module | Endpoint | Returns |
|---|---|---|
| `overview.ts` | `GET /api/dev-dashboard/overview` | version, environment, process uptime; memory, CPU load, disk; DB size, connections, largest tables; health checks |
| `apiAnalytics.ts` | `GET /api/dev-dashboard/api-analytics?timeRange=` | totals, p50/p95, time buckets, endpoint stats, slowest, recent errors |
| `usage.ts` | `GET /api/dev-dashboard/usage?timeRange=` | per-screen and per-user usage |
| `sessions.ts` | `GET /api/dev-dashboard/sessions` | unexpired sessions grouped by user |
| `auditLog.ts` | `GET /api/dev-dashboard/audit-logs?…` | filtered, paged audit rows |

`timeRange` is one of `1h`, `24h`, `7d`, `30d`; anything else is treated as
`24h`. The value is mapped to an interval through a fixed lookup and passed as
a query parameter, never interpolated into SQL.

Access stays as it is today: `admin` or `developer` on the API; the screen
itself is shown to `developer` only.

Deleted: `DevDashboardService.ts`, `DevDashboardService.helpers.ts`,
`DevDashboardService.expenseStats.ts`, `services/dashboard/*`, and the
`/version`, `/summary`, `/metrics`, `/alerts*`, `/page-analytics`,
`/ocr-metrics` routes. The six health-check queries move into `overview.ts`.

#### Overview

- **Health checks.** The six existing checks (error rate, slow responses,
  stale sessions, repeated endpoint failures, traffic spike, auth failures)
  each return `{ id, label, status: 'pass' | 'warn' | 'fail', value, threshold }`
  on every call, including when passing. No acknowledge or resolve.
- **System.** Memory used/total, 1-minute load average and core count, disk
  used/total for the uploads volume via `fs.statfs`.
- **Database.** Size, active connections against `max_connections`, ten
  largest tables.
- **Not included.** Expense totals. They are business figures, and computing
  them is what pages Midas.

#### API

All queries exclude `/api/dev-dashboard%`.

- Totals: request count, error rate, p50 and p95 response time
  (`percentile_cont`).
- Buckets: request and error counts per bucket — 5 minutes for `1h`, hourly
  for `24h`, daily for `7d` and `30d`.
- Endpoints: per method + endpoint — calls, average, p95, max, errors. Top 50
  by calls; sorting is client-side.
- Slowest: top 10 by average with at least 5 calls, including max.
- Recent errors: last 50 rows with `status_code >= 400` — time, method,
  endpoint, status, user name, error message.

`apiRequestLogger` stops recording `/health`, `/api/health` and
`/api/meta/version`.

#### Usage

Migration `047_create_page_views.sql`:

```sql
CREATE TABLE page_views (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  page VARCHAR(64) NOT NULL,
  device VARCHAR(10) NOT NULL CHECK (device IN ('mobile', 'desktop')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_page_views_created_at ON page_views (created_at);
CREATE INDEX idx_page_views_user_created ON page_views (user_id, created_at DESC);
```

`POST /api/page-views` with `{ page, device }`, authenticated, any role.
`page` must match `^[a-z0-9-]{1,64}$`; `device` must be one of the two values.
Responds 204. A new route file `routes/pageViews.ts` and repository
`PageViewRepository`.

The usage endpoint returns:

- Totals: views, unique users.
- Per screen: views, unique users, daily counts across the range.
- Per user: name, role, last seen, views, top screens, mobile/desktop split.
  Active users with no views in the range are listed with an empty row so
  "has not used the app" is visible.

#### Sessions

Unexpired rows from `user_sessions` joined to `users`, grouped by user in the
service: status from the most recent `last_activity` (active under 5 minutes,
idle under 30, otherwise away), last active, session count, and the individual
sessions with IP, raw user agent and created time. The frontend parses the
user agent into "Chrome · macOS" style labels.

#### Audit Log

`middleware/auditTrail.ts`, mounted once before the routes. On response
finish, for `POST`, `PUT`, `PATCH`, `DELETE` under `/api`, it writes one
`audit_logs` row:

- `action` — `METHOD normalized-path`, e.g. `PUT /api/events/:id`
- `request_method`, `request_path` (real path, IDs intact, no query string)
- `user_id`, `user_name`, `user_role` from `req.user` when present
- `status` — `success` under 400, `warning` 400–499, `failure` 500+
- `ip_address`, `user_agent`
- `error_message` for failures, taken from the JSON error body

No request body is stored. Skipped paths: `/api/auth/*` (login and logout
are written by `logAuth`, so logging them here would duplicate them, and
refresh is noise), `/api/page-views`, `/api/push/*`, `/api/midas/*`. The
write is fire-and-forget and can never fail a request.

Existing explicit writers stay: `logAuth` for login success, login failure and
logout (these carry the reason a login failed). `logAuth('token_refresh')` is
removed. The explicit `auditLogRepository.create` in `routes/users.ts` is
removed, since the middleware now covers it.

The read endpoint accepts `user`, `method`, `status`, `search`, `timeRange`,
`limit` (default 50, max 200) and `offset`, all applied in SQL. It returns
`{ logs, total }`. The simulated-from-expenses fallback is deleted; a query
failure returns a 500 with the error, so a broken table is visible.

#### Retention

`services/devDashboard/RetentionJob.ts`, started in `server.ts` beside the
other schedulers. Runs once at startup and then every 24 hours:

| Table | Kept |
|---|---|
| `api_requests` | 30 days |
| `page_views` | 90 days |
| `audit_logs` | 365 days |
| `user_sessions` | until `expires_at` |

Each delete is independent; one failing is logged and does not stop the rest.

### Removed: training pipeline

- Routes: `modelRetraining.ts`, `ocrTraining.ts`, `learningAnalytics.ts`,
  `trainingSync.ts`, and their mounts.
- Services: `ModelRetrainingService`, `PromptRefinementService`,
  `CrossEnvironmentSyncService`.
- From `ocrV2.ts`: `GET /corrections/stats`, `GET /corrections/export`,
  `GET /accuracy` (no remaining callers).
- Frontend: `components/dev/ModelTrainingDashboard.tsx`.

Kept: `POST /api/ocr/v2/corrections`, `UserCorrectionService.storeCorrection`
and the `ocr_corrections` table. No tables are dropped.

### Frontend

```
src/components/developer/
  DevDashboard.tsx              header, range picker, tab switch
  DevDashboard/
    useDashboardResource.ts     fetch + cache + background refresh
    OverviewTab.tsx
    ApiTab.tsx
    UsageTab.tsx
    SessionsTab.tsx
    AuditLogTab.tsx
    TrendBars.tsx               inline SVG bar strip
    userAgent.ts                UA → browser / OS / device label
src/hooks/usePageViewTracking.ts
```

`useDashboardResource(key, fetcher)` keeps a module-level cache keyed by tab
and parameters. On mount it returns the cached value immediately and
refetches; with no cache it reports `loading` and the tab renders a skeleton.
Errors render in the tab with a retry button. While the tab is mounted and the
document is visible it refetches every 30 seconds; Audit Log does not
auto-refresh, so paging and filters stay put. The header Refresh button
refetches the open tab.

The header keeps the title and range picker and drops the four summary cards;
their useful numbers live in Overview and API. The range picker applies to
API, Usage and Audit Log and is hidden on Overview and Sessions.

`usePageViewTracking(currentPage, user)` is called from `App.tsx`. When
`currentPage` changes for a logged-in user it posts the page and device
(`mobile` when the viewport is under 768px). Failures are swallowed and never
queued for offline sync.

No chart library is added.

## Error handling

- Each endpoint fails independently with a 500 and message; the other tabs
  keep working.
- A failing health-check query reports that check as `fail` with the error as
  its value, and the rest of Overview still renders.
- Audit and page-view writes never affect the request that triggered them.

## Testing

- **Contract fixtures.** `src/utils/__fixtures__/devDashboard/*.json`, one per
  endpoint. Backend tests assert each service's output has exactly the
  fixture's keys; frontend tab tests render from the same fixture. A renamed
  field fails a test on one side or the other.
- **Real-database tests** for the new SQL: percentiles and buckets, usage
  aggregation, audit filters and paging, retention deletes, migration 047.
- **Unit tests** for `auditTrail` (methods, skip list, status mapping, no body
  stored, never throws), the page-view route validation, `userAgent.ts`, and
  `useDashboardResource` (cache hit, background refresh, hidden-tab pause).
- **Component tests** per tab: populated, empty, error.
- Existing `DevDashboardService*.test.ts` files are replaced by per-module
  tests.

## Rollout

1. **Diagnose the empty audit log before deploy.** On CT 2320 as `postgres`:

   ```sql
   SELECT tableowner FROM pg_tables WHERE tablename = 'audit_logs';
   SELECT has_table_privilege('trade_show_app_prod', 'audit_logs', 'INSERT, SELECT, DELETE');
   SELECT count(*) FROM audit_logs;
   ```

   If the app role lacks privileges, grant them as `postgres`. If the table is
   missing, apply migration 004 as `postgres` and record it in
   `schema_migrations`.
2. Migration 047 creates a new table, so the app role can apply it. Verify it
   in `schema_migrations` after deploy.
3. Bump the version in both `package.json` files, deploy backend then
   frontend to production, restart NPMplus.
4. Verify in production: each tab loads with real values, a write shows up in
   Audit Log, a screen change shows up in Usage.

## Known risk

Something calls `GET /api/retraining/status` once a minute with a developer
token, and it is not the current frontend. After this ships it receives 404.
Watch the API tab's recent errors after deploy to identify the caller.

## Out of scope

- OCR service monitoring (belongs with the OCR container or Midas).
- Actual model training.
- Stored alerts, alert history, or alert notifications.
- Time-on-screen tracking.
- Status of background jobs and external dependencies.
