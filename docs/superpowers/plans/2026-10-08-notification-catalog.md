# Notification Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every event, booth, travel, reminder and admin trigger in the spec produces one bell row and one push per recipient through a single catalog in `backend/src/services/notifications/`.

**Architecture:** One named catalog function per trigger resolves recipients, builds the copy and link, and calls the existing `notificationService.notify()`. Routes and services call the catalog fire-and-forget after their write commits. One `ReminderScheduler` with a send-once ledger table replaces `TravelReminderService`. The frontend maps a notification link to a page and hash through one lookup that mirrors the backend's.

**Tech Stack:** Express + TypeScript, raw `pg` queries, Vitest (backend and frontend), React + Vite, a plain-JS push service worker.

**Spec:** `docs/superpowers/specs/2026-10-08-notification-catalog-design.md`

## Global Constraints

- Branch: `feat/notification-catalog` (already exists, spec committed on it). Target release **v2.32.0**.
- Every notification goes through `notificationService.notify()` (via `notifyMany`). No code calls `pushService.sendToUser` or inserts into `notifications` directly.
- The actor (the user who made the change) is never a recipient. Inactive users (`users.is_active = false`) are never recipients.
- A notification failure never fails, delays or rolls back the request, transaction or scan that caused it. Catalog calls from routes and services are always `void x(...).catch(logNotifyError('<label>'))`.
- An edit notifies only when a watched field changed. Saving unchanged sends nothing.
- Raw parameterized SQL only, no ORM. Schema changes only in the new file `045_notification_catalog.sql`; never edit an existing migration.
- `kind` values are exactly those in the spec: `event.added`, `event.removed`, `event.details_changed`, `event.cancelled`, `booth.ordered`, `booth.shipped`, `booth.map_uploaded`, `booth.component_reported`, `travel.booked`, `travel.changed`, `travel.cancelled`, `reminder.event_30d`, `reminder.event_7d`, `reminder.expenses_1d`, `reminder.expenses_7d`, `reminder.flight_checkin_24h`, `reminder.flight_departure_3h`, `admin.user_pending`, `badge.crm_failed`.
- Link pages are exactly: `checklist`, `samples`, `expenses`, `admin-users`, `booth-inventory`, `badge-scans`.
- Backend tests run from `backend/`: `npx vitest run <path>`. Frontend tests run from the repo root: `npx vitest run <path>`.
- The frontend suite has about 90 unrelated failures on `main`. Judge frontend changes by the files this plan touches, not by the whole-suite count.
- Do not use `git stash`.
- Every commit message ends with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Never run `deploy-sandbox.sh` (it targets production). Sandbox is `./deploy-sandbox-2600.sh`.

## Review Focus

1. **The same calendar day arriving as a JS `Date` on one side and a `'YYYY-MM-DD'` string on the other** (pg returns `DATE` columns as `Date`; request bodies are strings). Expected: no "details changed" or "booking changed" notification. Pinned in Task 3 (`dayKey`) and Task 4 (`diffEventDetails`).
2. **A booking row with no assignee, a blank confirmation number, or `booked = false`.** Expected: nothing is sent and nothing throws. Pinned in Task 6 (`classifyBooking`).
3. **First start after deploy with badge scans that had already failed for good, and flight reminders already sent by the old service.** Expected: nobody is notified about old failures and nobody gets a second check-in reminder. Pinned in Task 1 (integration test).
4. **An event with no travel date, an event exactly on a window boundary, and a cancelled event.** Expected: show start is the anchor; day 30 and day 23 are inside the 30-day window, day 31 and day 22 are not; cancelled events get nothing. Pinned in Task 9 (integration test).
5. **A push click message whose URL is missing, not a string, or has no hash.** Expected: the open app stays where it is and does not throw. Pinned in Task 10 (`hashFromPushUrl`).

## File Structure

Backend, new:

| File | Responsibility |
|---|---|
| `backend/src/database/migrations/045_notification_catalog.sql` | Ledger table, flight-ledger carry-over, badge column and backfill |
| `backend/src/services/notifications/values.ts` | Pure normalisers and formatters: `dayKey`, `instantKey`, `textKey`, `formatDay` |
| `backend/src/services/notifications/recipients.ts` | `eventParticipants`, `usersWithRole`, `activeUsers` |
| `backend/src/services/notifications/eventRefs.ts` | `eventById`, `eventByChecklistId` → `EventSnapshot` |
| `backend/src/services/notifications/notifyMany.ts` | `notifyMany`, `logNotifyError` |
| `backend/src/services/notifications/eventNotifications.ts` | Event roster and detail triggers |
| `backend/src/services/notifications/boothNotifications.ts` | Booth triggers |
| `backend/src/services/notifications/travelNotifications.ts` | Booking triggers and `classifyBooking` |
| `backend/src/services/notifications/adminNotifications.ts` | `userPending`, `badgeCrmFailed` |
| `backend/src/services/notifications/reminderDefinitions.ts` | The six reminder definitions (due SQL + copy) |
| `backend/src/services/notifications/ReminderScheduler.ts` | The loop and ledger claim |
| `backend/src/services/notifications/index.ts` | Re-exports |
| `backend/tests/helpers/routeHandler.ts` | Pulls an inline handler off an Express router for tests |

Backend, modified: `services/NotificationService.ts`, `database/repositories/NotificationRepository.ts`, `database/repositories/ChecklistRepository.ts`, `database/repositories/BadgeScanRepository.ts`, `routes/events.ts`, `routes/checklist.ts`, `routes/auth.ts`, `services/AuthentikOidcService.ts`, `services/booth/BoothInventoryService.ts`, `services/badge/BadgeCrmPushService.ts`, `server.ts`. Deleted: `services/TravelReminderService.ts`.

Frontend, new: `src/utils/notificationLinks.ts`, `src/utils/__fixtures__/notificationLinks.json`. Modified: `src/utils/initialPageFromHash.ts`, `src/components/layout/Header.tsx`, `src/components/expenses/ExpenseSubmission.tsx`, `src/App.tsx`, `public/push-sw.js`.

---

### Task 1: Migration 045

**Files:**
- Create: `backend/src/database/migrations/045_notification_catalog.sql`
- Test: `backend/tests/integration/notification-catalog-schema.test.ts`

**Interfaces:**
- Produces: table `notification_reminders (kind TEXT, subject_id TEXT, user_id UUID, sent_at TIMESTAMPTZ, PRIMARY KEY (kind, subject_id, user_id))`; column `badge_scans.crm_failure_notified_at TIMESTAMPTZ`.

- [ ] **Step 1: Write the failing integration test**

```ts
// backend/tests/integration/notification-catalog-schema.test.ts
import { describe, it, expect, afterAll } from 'vitest';
import { pool, query } from '../../src/config/database';

/** Verifies migration 045 applied (migrate.ts silently skips on 42501). */
describe('notification catalog schema (migration 045)', () => {
  afterAll(async () => { await pool.end(); });

  it('creates the send-once ledger with a three-column primary key', async () => {
    const { rows } = await query(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conrelid = 'notification_reminders'::regclass AND contype = 'p'`
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].def).toBe('PRIMARY KEY (kind, subject_id, user_id)');
  });

  it('adds the badge failure marker', async () => {
    const { rows } = await query(
      `SELECT data_type FROM information_schema.columns
        WHERE table_name = 'badge_scans' AND column_name = 'crm_failure_notified_at'`
    );
    expect(rows[0]?.data_type).toBe('timestamp with time zone');
  });

  it('carried every already-sent flight reminder into the new ledger', async () => {
    const { rows } = await query(
      `SELECT count(*)::int AS missing
         FROM travel_reminders r
         JOIN checklist_flights f ON f.id = r.flight_id
        WHERE f.attendee_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM notification_reminders n
             WHERE n.kind = 'reminder.flight_' || r.kind
               AND n.subject_id = r.flight_id::text
               AND n.user_id = f.attendee_id)`
    );
    expect(rows[0].missing).toBe(0);
  });

  it('left no already-exhausted badge scan waiting to notify', async () => {
    const { rows } = await query(
      `SELECT count(*)::int AS waiting FROM badge_scans
        WHERE crm_status = 'failed' AND crm_attempts >= 5 AND crm_failure_notified_at IS NULL`
    );
    expect(rows[0].waiting).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run (from `backend/`, local Postgres running): `npx vitest run tests/integration/notification-catalog-schema.test.ts`
Expected: FAIL with `relation "notification_reminders" does not exist`.

- [ ] **Step 3: Write the migration**

```sql
-- backend/src/database/migrations/045_notification_catalog.sql
-- Migration: Notification catalog
-- Description: One send-once ledger for every scheduled reminder (event,
--   expense and flight), replacing the flight-only travel_reminders ledger,
--   plus a marker so a badge scan that failed for good notifies its scanner
--   exactly once.
-- Version: 2.32.0
-- Date: October 8, 2026

CREATE TABLE IF NOT EXISTS notification_reminders (
  kind        TEXT NOT NULL,
  subject_id  TEXT NOT NULL,   -- event uuid, or flight id for flight reminders
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, subject_id, user_id)
);

COMMENT ON TABLE notification_reminders IS
  'Send-once ledger: a row is claimed before a reminder is sent, so it fires once per kind, subject and user';

-- Carry the flight ledger over so nobody is re-reminded on deploy.
INSERT INTO notification_reminders (kind, subject_id, user_id, sent_at)
SELECT 'reminder.flight_' || r.kind,   -- checkin_24h, departure_3h
       r.flight_id::text, f.attendee_id, r.sent_at
FROM travel_reminders r
JOIN checklist_flights f ON f.id = r.flight_id
WHERE f.attendee_id IS NOT NULL
ON CONFLICT DO NOTHING;

ALTER TABLE badge_scans ADD COLUMN IF NOT EXISTS crm_failure_notified_at TIMESTAMPTZ;

COMMENT ON COLUMN badge_scans.crm_failure_notified_at IS
  'When the scanner was told this lead failed to reach the CRM for good; NULL means not yet told';

-- Scans that had already failed for good before this release are history,
-- not news: mark them told so the first pass after deploy stays quiet.
UPDATE badge_scans
   SET crm_failure_notified_at = now()
 WHERE crm_status = 'failed' AND crm_attempts >= 5 AND crm_failure_notified_at IS NULL;
```

- [ ] **Step 4: Apply and verify**

Run (from `backend/`): `npm run migrate && npx vitest run tests/integration/notification-catalog-schema.test.ts`
Expected: migrate logs `045_notification_catalog.sql` applied; 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/database/migrations/045_notification_catalog.sql backend/tests/integration/notification-catalog-schema.test.ts
git commit -m "feat(notifications): migration 045, reminder ledger and badge failure marker"
```

---

### Task 2: One link table for push URLs

**Files:**
- Create: `src/utils/__fixtures__/notificationLinks.json`
- Modify: `backend/src/database/repositories/NotificationRepository.ts` (the `NotificationLink` interface)
- Modify: `backend/src/services/NotificationService.ts` (`linkToUrl`)
- Test: `backend/tests/services/notificationLinks.test.ts`

**Interfaces:**
- Produces: `NotificationPage = 'checklist' | 'samples' | 'expenses' | 'admin-users' | 'booth-inventory' | 'badge-scans'`; `NotificationLink { page: NotificationPage | string; eventId?: string }`; `linkToUrl(link): string`. The fixture file is the shared contract that Task 10's frontend test also asserts.

- [ ] **Step 1: Write the shared fixture**

```json
[
  { "link": { "page": "checklist", "eventId": "ev-1" }, "url": "/#event=ev-1&tab=my", "page": "checklist", "hash": "event=ev-1&tab=my" },
  { "link": { "page": "samples", "eventId": "ev-1" }, "url": "/#event=ev-1&tab=samples", "page": "checklist", "hash": "event=ev-1&tab=samples" },
  { "link": { "page": "expenses", "eventId": "ev-1" }, "url": "/#expenses-event=ev-1", "page": "expenses", "hash": "expenses-event=ev-1" },
  { "link": { "page": "admin-users" }, "url": "/#users", "page": "settings", "hash": "users" },
  { "link": { "page": "booth-inventory" }, "url": "/#booths", "page": "booths", "hash": "booths" },
  { "link": { "page": "badge-scans" }, "url": "/#leads", "page": "leads", "hash": "leads" },
  { "link": null, "url": "/", "page": null, "hash": null },
  { "link": { "page": "checklist" }, "url": "/", "page": null, "hash": null },
  { "link": { "page": "expenses" }, "url": "/", "page": null, "hash": null },
  { "link": { "page": "constructor" }, "url": "/", "page": null, "hash": null }
]
```

Save it as `src/utils/__fixtures__/notificationLinks.json`.

- [ ] **Step 2: Write the failing backend test**

```ts
// backend/tests/services/notificationLinks.test.ts
import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

vi.mock('../../src/database/repositories/NotificationRepository', () => ({ notificationRepository: {} }));
vi.mock('../../src/services/PushService', () => ({ pushService: {} }));

import { linkToUrl } from '../../src/services/NotificationService';

const cases: Array<{ link: any; url: string }> = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../../src/utils/__fixtures__/notificationLinks.json'), 'utf8')
);

describe('linkToUrl (shared fixture with the frontend)', () => {
  it.each(cases)('maps $link to $url', ({ link, url }) => {
    expect(linkToUrl(link)).toBe(url);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run (from `backend/`): `npx vitest run tests/services/notificationLinks.test.ts`
Expected: FAIL on the `expenses`, `admin-users`, `booth-inventory` and `badge-scans` rows (each returns `/`).

- [ ] **Step 4: Implement**

In `backend/src/database/repositories/NotificationRepository.ts` replace the `NotificationLink` line with:

```ts
export type NotificationPage =
  | 'checklist' | 'samples' | 'expenses' | 'admin-users' | 'booth-inventory' | 'badge-scans';

export interface NotificationLink { page: NotificationPage | string; eventId?: string }
```

In `backend/src/services/NotificationService.ts` replace the whole `linkToUrl` function (and its doc comment) with:

```ts
/** Links that need an event id. Mirrored by src/utils/notificationLinks.ts. */
const EVENT_LINKS = new Map<string, (eventId: string) => string>([
  ['checklist', (id) => `/#event=${id}&tab=my`],
  ['samples', (id) => `/#event=${id}&tab=samples`],
  ['expenses', (id) => `/#expenses-event=${id}`],
]);

/** Links that only pick a page. */
const PAGE_LINKS = new Map<string, string>([
  ['admin-users', '/#users'],
  ['booth-inventory', '/#booths'],
  ['badge-scans', '/#leads'],
]);

/**
 * Hash deep link the app understands. The same table lives on the frontend;
 * src/utils/__fixtures__/notificationLinks.json is asserted by both sides.
 */
export function linkToUrl(link: NotificationLink | null | undefined): string {
  if (!link) return '/';
  const forEvent = EVENT_LINKS.get(link.page);
  if (forEvent) return link.eventId ? forEvent(link.eventId) : '/';
  return PAGE_LINKS.get(link.page) ?? '/';
}
```

- [ ] **Step 5: Run the tests**

Run (from `backend/`): `npx vitest run tests/services/notificationLinks.test.ts tests/services/NotificationService.test.ts`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/utils/__fixtures__/notificationLinks.json backend/src/database/repositories/NotificationRepository.ts backend/src/services/NotificationService.ts backend/tests/services/notificationLinks.test.ts
git commit -m "feat(notifications): link table with expenses, admin, booth and badge destinations"
```

---

### Task 3: Catalog foundation (values, recipients, event refs, notifyMany)

**Files:**
- Create: `backend/src/services/notifications/values.ts`, `recipients.ts`, `eventRefs.ts`, `notifyMany.ts`, `index.ts`
- Test: `backend/tests/services/notifications/values.test.ts`, `recipients.test.ts`, `notifyMany.test.ts`

**Interfaces:**
- Produces:
  - `dayKey(v: unknown): string | null` (`'YYYY-MM-DD'`), `instantKey(v: unknown): number | null`, `textKey(v: unknown): string | null`, `formatDay(v: unknown): string | null` (`'Oct 31, 2026'`)
  - `interface RecipientOptions { except?: Array<string | null | undefined> }`
  - `eventParticipants(eventId: string, opts?: RecipientOptions): Promise<string[]>`
  - `usersWithRole(roles: string[], opts?: RecipientOptions): Promise<string[]>`
  - `activeUsers(userIds: Array<string | null | undefined>, opts?: RecipientOptions): Promise<string[]>`
  - `interface EventSnapshot { id: string; name: string; status?: unknown; venue?: unknown; city?: unknown; state?: unknown; show_start_date?: unknown; show_end_date?: unknown; travel_start_date?: unknown; travel_end_date?: unknown }`
  - `eventById(eventId: string): Promise<EventSnapshot | null>`, `eventByChecklistId(checklistId: number): Promise<EventSnapshot | null>`
  - `notifyMany(userIds: string[], input: NotifyInput): Promise<void>` (never throws), `logNotifyError(label: string): (error: unknown) => void`

- [ ] **Step 1: Write the failing tests**

```ts
// backend/tests/services/notifications/values.test.ts
import { describe, it, expect } from 'vitest';
import { dayKey, instantKey, textKey, formatDay } from '../../../src/services/notifications/values';

describe('dayKey', () => {
  it('reads a pg DATE (local-midnight Date) and an ISO string as the same day', () => {
    expect(dayKey(new Date(2026, 9, 31))).toBe('2026-10-31');
    expect(dayKey('2026-10-31')).toBe('2026-10-31');
    expect(dayKey('2026-10-31T00:00:00.000Z')).toBe('2026-10-31');
  });
  it('treats null, undefined, empty and an invalid Date as no value', () => {
    expect(dayKey(null)).toBeNull();
    expect(dayKey(undefined)).toBeNull();
    expect(dayKey('')).toBeNull();
    expect(dayKey(new Date('nope'))).toBeNull();
  });
});

describe('instantKey', () => {
  it('compares a Date and its ISO string as equal', () => {
    const d = new Date('2026-10-31T14:30:00Z');
    expect(instantKey(d)).toBe(instantKey('2026-10-31T14:30:00.000Z'));
  });
  it('returns null for empty or unparseable input', () => {
    expect(instantKey(null)).toBeNull();
    expect(instantKey('')).toBeNull();
    expect(instantKey('nope')).toBeNull();
  });
});

describe('textKey', () => {
  it('trims and treats blank as null', () => {
    expect(textKey('  Delta ')).toBe('Delta');
    expect(textKey('   ')).toBeNull();
    expect(textKey(null)).toBeNull();
  });
});

describe('formatDay', () => {
  it('formats a day for a notification body', () => {
    expect(formatDay('2026-10-31')).toBe('Oct 31, 2026');
    expect(formatDay(new Date(2026, 0, 5))).toBe('Jan 5, 2026');
  });
  it('returns null for no value', () => { expect(formatDay(null)).toBeNull(); });
});
```

```ts
// backend/tests/services/notifications/recipients.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../src/config/database', () => ({ query: vi.fn() }));

import { query } from '../../../src/config/database';
import { eventParticipants, usersWithRole, activeUsers } from '../../../src/services/notifications/recipients';

const rows = (r: unknown[]) => ({ rows: r } as any);

describe('recipients', () => {
  beforeEach(() => vi.clearAllMocks());

  it('eventParticipants asks only for active users and drops the actor', async () => {
    vi.mocked(query).mockResolvedValueOnce(rows([{ user_id: 'u-1' }, { user_id: 'u-2' }, { user_id: 'u-1' }]));
    expect(await eventParticipants('ev-1', { except: ['u-2', null, undefined] })).toEqual(['u-1']);
    const [sql, params] = vi.mocked(query).mock.calls[0];
    expect(String(sql)).toMatch(/JOIN users u ON u\.id = ep\.user_id/);
    expect(String(sql)).toMatch(/u\.is_active/);
    expect(params).toEqual(['ev-1']);
  });

  it('usersWithRole filters by role and active, and drops the actor', async () => {
    vi.mocked(query).mockResolvedValueOnce(rows([{ id: 'a-1' }, { id: 'd-1' }]));
    expect(await usersWithRole(['admin', 'developer'], { except: ['d-1'] })).toEqual(['a-1']);
    const [sql, params] = vi.mocked(query).mock.calls[0];
    expect(String(sql)).toMatch(/role = ANY\(\$1::text\[\]\)/);
    expect(String(sql)).toMatch(/is_active/);
    expect(params).toEqual([['admin', 'developer']]);
  });

  it('activeUsers keeps only ids the database says are active', async () => {
    vi.mocked(query).mockResolvedValueOnce(rows([{ id: 'u-1' }]));
    expect(await activeUsers(['u-1', 'u-2', null, 'u-3'], { except: ['u-3'] })).toEqual(['u-1']);
    expect(vi.mocked(query).mock.calls[0][1]).toEqual([['u-1', 'u-2']]);
  });

  it('activeUsers does not query when nobody is left', async () => {
    expect(await activeUsers(['u-1'], { except: ['u-1'] })).toEqual([]);
    expect(await activeUsers([null, undefined])).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });
});
```

```ts
// backend/tests/services/notifications/notifyMany.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../src/services/NotificationService', () => ({
  notificationService: { notify: vi.fn(async () => ({ id: 'n' })) },
}));

import { notificationService } from '../../../src/services/NotificationService';
import { notifyMany, logNotifyError } from '../../../src/services/notifications/notifyMany';

const input = { kind: 'k', title: 'T', body: 'B', link: null };

describe('notifyMany', () => {
  beforeEach(() => vi.clearAllMocks());

  it('notifies each user once', async () => {
    await notifyMany(['u-1', 'u-2'], input);
    expect(vi.mocked(notificationService.notify).mock.calls.map((c) => c[0])).toEqual(['u-1', 'u-2']);
  });

  it('does nothing for an empty list', async () => {
    await notifyMany([], input);
    expect(notificationService.notify).not.toHaveBeenCalled();
  });

  it('logs one failure and still notifies the rest, without throwing', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(notificationService.notify).mockRejectedValueOnce(new Error('down'));
    await expect(notifyMany(['u-1', 'u-2'], input)).resolves.toBeUndefined();
    expect(notificationService.notify).toHaveBeenCalledTimes(2);
    expect(err).toHaveBeenCalledWith(expect.stringContaining('u-1'), expect.any(Error));
    err.mockRestore();
  });

  it('logNotifyError returns a logger that names the trigger', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    logNotifyError('booth.ordered')(new Error('x'));
    expect(err).toHaveBeenCalledWith(expect.stringContaining('booth.ordered'), expect.any(Error));
    err.mockRestore();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run (from `backend/`): `npx vitest run tests/services/notifications`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

```ts
// backend/src/services/notifications/values.ts
/**
 * Normalisers for comparing "before" and "after" values that reach us in
 * different shapes: pg returns DATE columns as local-midnight Date objects,
 * request bodies carry strings, and blank means the same as null.
 */

const pad = (n: number): string => String(n).padStart(2, '0');

/** Calendar day as 'YYYY-MM-DD', or null when there is no usable value. */
export function dayKey(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }
  const text = String(value).trim();
  if (text === '') return null;
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(text);
  return iso ? iso[1] : text;
}

/** A moment in time as epoch milliseconds, or null. */
export function instantKey(value: unknown): number | null {
  if (value == null || value === '') return null;
  const ms = value instanceof Date ? value.getTime() : new Date(String(value)).getTime();
  return isNaN(ms) ? null : ms;
}

/** Trimmed text; blank and null are the same thing. */
export function textKey(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}

/** 'Oct 31, 2026' for a notification body, or null. */
export function formatDay(value: unknown): string | null {
  const key = dayKey(value);
  if (!key) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return key;
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
```

```ts
// backend/src/services/notifications/recipients.ts
/**
 * The only place that answers "who gets this notification". Every function
 * drops inactive users and whoever is listed in `except` (the actor).
 */
import { query } from '../../config/database';

export interface RecipientOptions { except?: Array<string | null | undefined> }

function without(ids: string[], opts?: RecipientOptions): string[] {
  const skip = new Set((opts?.except ?? []).filter((id): id is string => Boolean(id)));
  return [...new Set(ids)].filter((id) => !skip.has(id));
}

export async function eventParticipants(eventId: string, opts?: RecipientOptions): Promise<string[]> {
  const r = await query(
    `SELECT ep.user_id FROM event_participants ep
       JOIN users u ON u.id = ep.user_id
      WHERE ep.event_id = $1 AND u.is_active`,
    [eventId]
  );
  return without(r.rows.map((row: { user_id: string }) => row.user_id), opts);
}

export async function usersWithRole(roles: string[], opts?: RecipientOptions): Promise<string[]> {
  const r = await query(`SELECT id FROM users WHERE role = ANY($1::text[]) AND is_active`, [roles]);
  return without(r.rows.map((row: { id: string }) => row.id), opts);
}

/** Narrows named users (an assignee, people just added) to the active ones. */
export async function activeUsers(
  userIds: Array<string | null | undefined>,
  opts?: RecipientOptions
): Promise<string[]> {
  const ids = without(userIds.filter((id): id is string => Boolean(id)), opts);
  if (ids.length === 0) return [];
  const r = await query(`SELECT id FROM users WHERE id = ANY($1::uuid[]) AND is_active`, [ids]);
  const active = new Set(r.rows.map((row: { id: string }) => row.id));
  return ids.filter((id) => active.has(id));
}
```

```ts
// backend/src/services/notifications/eventRefs.ts
/** The slice of an event a notification needs for its copy and link. */
import { query } from '../../config/database';

export interface EventSnapshot {
  id: string; name: string;
  status?: unknown; venue?: unknown; city?: unknown; state?: unknown;
  show_start_date?: unknown; show_end_date?: unknown;
  travel_start_date?: unknown; travel_end_date?: unknown;
}

const COLUMNS = `e.id, e.name, e.status, e.venue, e.city, e.state,
  e.show_start_date, e.show_end_date, e.travel_start_date, e.travel_end_date`;

export async function eventById(eventId: string): Promise<EventSnapshot | null> {
  const r = await query(`SELECT ${COLUMNS} FROM events e WHERE e.id = $1`, [eventId]);
  return (r.rows[0] as EventSnapshot) || null;
}

export async function eventByChecklistId(checklistId: number): Promise<EventSnapshot | null> {
  const r = await query(
    `SELECT ${COLUMNS} FROM events e JOIN event_checklists c ON c.event_id = e.id WHERE c.id = $1`,
    [checklistId]
  );
  return (r.rows[0] as EventSnapshot) || null;
}
```

```ts
// backend/src/services/notifications/notifyMany.ts
import { notificationService, NotifyInput } from '../NotificationService';

/** One bell row + push per user. One user's failure never stops the rest. */
export async function notifyMany(userIds: string[], input: NotifyInput): Promise<void> {
  for (const userId of userIds) {
    try {
      await notificationService.notify(userId, input);
    } catch (error) {
      console.error(`[Notifications] ${input.kind} failed for user ${userId}:`, error);
    }
  }
}

/** `void catalogCall(...).catch(logNotifyError('booth.ordered'))` */
export const logNotifyError = (label: string) => (error: unknown): void => {
  console.error(`[Notifications] ${label} failed:`, error);
};
```

```ts
// backend/src/services/notifications/index.ts
/** The notification catalog: every trigger Argo notifies about lives here. */
export { notifyMany, logNotifyError } from './notifyMany';
export { eventParticipants, usersWithRole, activeUsers } from './recipients';
export { eventById, eventByChecklistId } from './eventRefs';
export type { EventSnapshot } from './eventRefs';
```

- [ ] **Step 4: Run the tests**

Run (from `backend/`): `npx vitest run tests/services/notifications`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/notifications backend/tests/services/notifications
git commit -m "feat(notifications): catalog foundation (recipients, event refs, notifyMany, value normalisers)"
```

---

### Task 4: Event notifications and the events routes

**Files:**
- Create: `backend/src/services/notifications/eventNotifications.ts`
- Modify: `backend/src/services/notifications/index.ts`
- Modify: `backend/src/routes/events.ts` (`handleCreateEvent`, `handleUpdateEvent`, `handleAddParticipants`)
- Modify: `backend/tests/routes/events.sampleAnnounce.test.ts` (mocks only)
- Test: `backend/tests/services/notifications/eventNotifications.test.ts`, `backend/tests/routes/events.notifications.test.ts`

**Interfaces:**
- Consumes: `activeUsers`, `eventParticipants`, `eventById`, `EventSnapshot`, `notifyMany`, `logNotifyError`, `dayKey`, `textKey`, `formatDay` (Task 3).
- Produces:
  - `interface DetailChange { field: string; label: string; from: string | null; to: string | null }`
  - `diffEventDetails(before: EventSnapshot, after: EventSnapshot): DetailChange[]`
  - `eventNotifications.added(eventId: string, userIds: string[], actorId?: string | null): Promise<void>`
  - `eventNotifications.afterUpdate(input: { before: EventSnapshot; after: EventSnapshot; previousIds: string[] | null; rosterIds: string[] | null; actorId: string | null }): Promise<void>`

- [ ] **Step 1: Write the failing service test**

```ts
// backend/tests/services/notifications/eventNotifications.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../src/services/notifications/recipients', () => ({
  activeUsers: vi.fn(async (ids: string[], opts?: { except?: unknown[] }) =>
    ids.filter((id) => id && !(opts?.except ?? []).includes(id))),
  eventParticipants: vi.fn(async () => ['u-1', 'u-2']),
}));
vi.mock('../../../src/services/notifications/eventRefs', () => ({
  eventById: vi.fn(async () => EVENT),
}));
vi.mock('../../../src/services/notifications/notifyMany', () => ({
  notifyMany: vi.fn(async () => undefined),
}));

import { eventNotifications, diffEventDetails } from '../../../src/services/notifications/eventNotifications';
import { eventParticipants } from '../../../src/services/notifications/recipients';
import { notifyMany } from '../../../src/services/notifications/notifyMany';

const EVENT = {
  id: 'ev-1', name: 'Expo', status: 'upcoming', venue: 'Hall A', city: 'Las Vegas', state: 'NV',
  show_start_date: '2026-11-01', show_end_date: '2026-11-03',
  travel_start_date: '2026-10-31', travel_end_date: '2026-11-04',
};
const sent = () => vi.mocked(notifyMany).mock.calls.map(([users, input]) => ({ users, kind: input.kind }));

describe('diffEventDetails', () => {
  it('reports nothing when the same days arrive as Date and string', () => {
    const before = { ...EVENT, show_start_date: new Date(2026, 10, 1), travel_start_date: new Date(2026, 9, 31) };
    expect(diffEventDetails(before, EVENT)).toEqual([]);
  });
  it('treats blank and null text as the same', () => {
    expect(diffEventDetails({ ...EVENT, state: '' }, { ...EVENT, state: null })).toEqual([]);
  });
  it('reports each changed field with formatted old and new values', () => {
    const changes = diffEventDetails(EVENT, { ...EVENT, show_start_date: '2026-11-08', venue: 'Hall B' });
    expect(changes).toEqual([
      { field: 'show_start_date', label: 'Show start', from: 'Nov 1, 2026', to: 'Nov 8, 2026' },
      { field: 'venue', label: 'Venue', from: 'Hall A', to: 'Hall B' },
    ]);
  });
  it('ignores fields outside the watch list', () => {
    expect(diffEventDetails(EVENT, { ...EVENT, name: 'Renamed' } as any)).toEqual([]);
  });
});

describe('eventNotifications.added', () => {
  beforeEach(() => vi.clearAllMocks());

  it('tells each added user, with a checklist link, and skips the actor', async () => {
    await eventNotifications.added('ev-1', ['u-1', 'adm'], 'adm');
    expect(notifyMany).toHaveBeenCalledWith(['u-1'], expect.objectContaining({
      kind: 'event.added',
      title: "You've been added to Expo",
      link: { page: 'checklist', eventId: 'ev-1' },
    }));
    expect(vi.mocked(notifyMany).mock.calls[0][1].body).toContain('Hall A');
    expect(vi.mocked(notifyMany).mock.calls[0][1].body).toContain('Nov 1, 2026');
  });

  it('sends nothing when nobody is left after removing the actor', async () => {
    await eventNotifications.added('ev-1', ['adm'], 'adm');
    await eventNotifications.added('ev-1', [], 'adm');
    expect(notifyMany).not.toHaveBeenCalled();
  });
});

describe('eventNotifications.afterUpdate', () => {
  beforeEach(() => vi.clearAllMocks());
  const base = { before: EVENT, after: EVENT, previousIds: null, rosterIds: null, actorId: 'adm' };

  it('sends nothing when nothing changed', async () => {
    await eventNotifications.afterUpdate({ ...base, previousIds: ['u-1'], rosterIds: ['u-1'] });
    expect(notifyMany).not.toHaveBeenCalled();
  });

  it('tells added and removed users', async () => {
    await eventNotifications.afterUpdate({ ...base, previousIds: ['u-1', 'u-2'], rosterIds: ['u-2', 'u-3'] });
    expect(sent()).toEqual([
      { users: ['u-3'], kind: 'event.added' },
      { users: ['u-1'], kind: 'event.removed' },
    ]);
    const removed = vi.mocked(notifyMany).mock.calls[1][1];
    expect(removed.link).toBeNull();
    expect(removed.title).toBe("You've been removed from Expo");
  });

  it('tells the roster about changed details, but not people added in the same save', async () => {
    await eventNotifications.afterUpdate({
      ...base, after: { ...EVENT, city: 'Reno' }, previousIds: ['u-1'], rosterIds: ['u-1', 'u-3'],
    });
    expect(sent().map((s) => s.kind)).toEqual(['event.added', 'event.details_changed']);
    expect(eventParticipants).toHaveBeenCalledWith('ev-1', { except: ['adm', 'u-3'] });
    expect(vi.mocked(notifyMany).mock.calls[1][1].body).toBe('City: Las Vegas → Reno');
  });

  it('sends only "cancelled" when a save both cancels and changes details', async () => {
    await eventNotifications.afterUpdate({ ...base, after: { ...EVENT, status: 'cancelled', city: 'Reno' } });
    expect(sent().map((s) => s.kind)).toEqual(['event.cancelled']);
    expect(vi.mocked(notifyMany).mock.calls[0][1].link).toBeNull();
  });

  it('does not re-announce an event that was already cancelled', async () => {
    const cancelled = { ...EVENT, status: 'cancelled' };
    await eventNotifications.afterUpdate({ ...base, before: cancelled, after: cancelled });
    expect(notifyMany).not.toHaveBeenCalled();
  });

  it('one failing step does not stop the others', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(notifyMany).mockRejectedValueOnce(new Error('boom'));
    await expect(eventNotifications.afterUpdate({
      ...base, previousIds: ['u-1'], rosterIds: ['u-3'],
    })).resolves.toBeUndefined();
    expect(sent().map((s) => s.kind)).toEqual(['event.added', 'event.removed']);
    err.mockRestore();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run (from `backend/`): `npx vitest run tests/services/notifications/eventNotifications.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement the catalog file**

```ts
// backend/src/services/notifications/eventNotifications.ts
/**
 * Event roster and detail notifications: added, removed, details changed,
 * cancelled. Routes hand over what they already know (who was on the roster,
 * the row before and after) and this file decides what to send.
 */
import { activeUsers, eventParticipants } from './recipients';
import { eventById, EventSnapshot } from './eventRefs';
import { notifyMany } from './notifyMany';
import { dayKey, textKey, formatDay } from './values';

export interface DetailChange { field: string; label: string; from: string | null; to: string | null }

type Field = keyof EventSnapshot;

const DAY_FIELDS: Array<[Field, string]> = [
  ['show_start_date', 'Show start'], ['show_end_date', 'Show end'],
  ['travel_start_date', 'Travel start'], ['travel_end_date', 'Travel end'],
];
const TEXT_FIELDS: Array<[Field, string]> = [['venue', 'Venue'], ['city', 'City'], ['state', 'State']];

/** Watched fields that differ. Compares normalised values, never raw ones. */
export function diffEventDetails(before: EventSnapshot, after: EventSnapshot): DetailChange[] {
  const changes: DetailChange[] = [];
  for (const [field, label] of DAY_FIELDS) {
    if (dayKey(before[field]) !== dayKey(after[field])) {
      changes.push({ field, label, from: formatDay(before[field]), to: formatDay(after[field]) });
    }
  }
  for (const [field, label] of TEXT_FIELDS) {
    if (textKey(before[field]) !== textKey(after[field])) {
      changes.push({ field, label, from: textKey(before[field]), to: textKey(after[field]) });
    }
  }
  return changes;
}

const becameCancelled = (before: EventSnapshot, after: EventSnapshot): boolean =>
  before.status !== 'cancelled' && after.status === 'cancelled';

function whereAndWhen(event: EventSnapshot): string {
  const place = [textKey(event.venue), textKey(event.city)].filter(Boolean).join(', ');
  const start = formatDay(event.show_start_date);
  const end = formatDay(event.show_end_date);
  const when = start && end && start !== end ? `${start} to ${end}` : start;
  return [place, when].filter(Boolean).join(' · ');
}

export interface AfterUpdateInput {
  before: EventSnapshot;
  after: EventSnapshot;
  /** Roster before the save; null when the save did not touch participants. */
  previousIds: string[] | null;
  /** Roster after the save; null when the save did not touch participants. */
  rosterIds: string[] | null;
  actorId: string | null;
}

async function step(label: string, run: () => Promise<void>): Promise<void> {
  try {
    await run();
  } catch (error) {
    console.error(`[Notifications] ${label} failed:`, error);
  }
}

export const eventNotifications = {
  async added(eventId: string, userIds: string[], actorId?: string | null): Promise<void> {
    const recipients = await activeUsers(userIds, { except: [actorId] });
    if (recipients.length === 0) return;
    const event = await eventById(eventId);
    if (!event) return;
    const details = whereAndWhen(event);
    await notifyMany(recipients, {
      kind: 'event.added',
      title: `You've been added to ${event.name}`,
      body: details ? `${details}. Open the checklist for your travel details.` : 'Open the checklist for your travel details.',
      link: { page: 'checklist', eventId: event.id },
    });
  },

  async removed(event: EventSnapshot, userIds: string[], actorId?: string | null): Promise<void> {
    const recipients = await activeUsers(userIds, { except: [actorId] });
    if (recipients.length === 0) return;
    await notifyMany(recipients, {
      kind: 'event.removed',
      title: `You've been removed from ${event.name}`,
      body: `You are no longer on the roster for ${event.name}.`,
      link: null,
    });
  },

  async detailsChanged(
    event: EventSnapshot, changes: DetailChange[], actorId?: string | null, alsoExcept: string[] = []
  ): Promise<void> {
    if (changes.length === 0) return;
    const recipients = await eventParticipants(event.id, { except: [actorId, ...alsoExcept] });
    if (recipients.length === 0) return;
    await notifyMany(recipients, {
      kind: 'event.details_changed',
      title: `${event.name}: details changed`,
      body: changes.map((c) => `${c.label}: ${c.from ?? 'not set'} → ${c.to ?? 'not set'}`).join(' · '),
      link: { page: 'checklist', eventId: event.id },
    });
  },

  async cancelled(event: EventSnapshot, actorId?: string | null, alsoExcept: string[] = []): Promise<void> {
    const recipients = await eventParticipants(event.id, { except: [actorId, ...alsoExcept] });
    if (recipients.length === 0) return;
    await notifyMany(recipients, {
      kind: 'event.cancelled',
      title: `${event.name} was cancelled`,
      body: `${event.name} has been cancelled.`,
      link: null,
    });
  },

  /** Everything an Edit Event save can trigger, each step isolated. */
  async afterUpdate(input: AfterUpdateInput): Promise<void> {
    const { before, after, previousIds, rosterIds, actorId } = input;
    const previous = new Set(previousIds ?? []);
    const roster = new Set(rosterIds ?? []);
    const added = rosterIds && previousIds ? rosterIds.filter((id) => !previous.has(id)) : [];
    const removed = rosterIds && previousIds ? previousIds.filter((id) => !roster.has(id)) : [];

    if (added.length > 0) {
      await step('event.added', () => eventNotifications.added(after.id, added, actorId));
    }
    if (removed.length > 0) {
      await step('event.removed', () => eventNotifications.removed(after, removed, actorId));
    }
    if (becameCancelled(before, after)) {
      await step('event.cancelled', () => eventNotifications.cancelled(after, actorId, added));
      return;
    }
    const changes = diffEventDetails(before, after);
    if (changes.length > 0) {
      await step('event.details_changed', () => eventNotifications.detailsChanged(after, changes, actorId, added));
    }
  },
};
```

Append to `backend/src/services/notifications/index.ts`:

```ts
export { eventNotifications, diffEventDetails } from './eventNotifications';
export type { DetailChange, AfterUpdateInput } from './eventNotifications';
```

- [ ] **Step 4: Run the service test**

Run (from `backend/`): `npx vitest run tests/services/notifications/eventNotifications.test.ts`
Expected: all PASS.

- [ ] **Step 5: Write the failing route test**

```ts
// backend/tests/routes/events.notifications.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Response } from 'express';

vi.mock('../../src/config/database', () => ({ pool: { connect: vi.fn() }, query: vi.fn() }));
vi.mock('../../src/middleware/auth', () => ({
  authenticateToken: (_req: any, _res: any, next: any) => next(),
  authorize: () => (_req: any, _res: any, next: any) => next(),
}));
const BEFORE = { id: 'ev-1', name: 'Expo', status: 'upcoming', city: 'Las Vegas' };
vi.mock('../../src/database/repositories', () => ({
  eventRepository: {
    create: vi.fn(async (d: any) => ({ id: 'ev-new', ...d })),
    findById: vi.fn(async () => BEFORE),
    updateWithTransaction: vi.fn(async (id: string, d: any) => ({ id, ...d })),
  },
}));
vi.mock('../../src/services/EventParticipantService', () => ({
  processParticipants: vi.fn(async () => ['u-1', 'u-2']),
  getCurrentParticipantIds: vi.fn(async () => ['u-1']),
  removeAllParticipants: vi.fn(),
}));
vi.mock('../../src/services/sampleRequests/SampleRequestService', () => ({
  sampleRequestService: { announceIfOpen: vi.fn(async () => undefined) },
}));
vi.mock('../../src/services/notifications', () => ({
  eventNotifications: { added: vi.fn(async () => undefined), afterUpdate: vi.fn(async () => undefined) },
  logNotifyError: () => () => undefined,
}));

import { handleCreateEvent, handleAddParticipants, handleUpdateEvent } from '../../src/routes/events';
import { pool } from '../../src/config/database';
import { eventRepository } from '../../src/database/repositories';
import { processParticipants } from '../../src/services/EventParticipantService';
import { eventNotifications } from '../../src/services/notifications';

const mockRes = () => ({ json: vi.fn().mockReturnThis(), status: vi.fn().mockReturnThis() }) as unknown as Response & {
  json: ReturnType<typeof vi.fn>; status: ReturnType<typeof vi.fn>;
};
const body = { name: 'Expo', venue: 'V', city: 'Reno', state: 'NV', start_date: '2026-12-01', end_date: '2026-12-02' };
const mockClient = () => {
  const client = { query: vi.fn(async () => ({ rows: [] })), release: vi.fn() };
  vi.mocked(pool.connect).mockResolvedValueOnce(client as any);
  return client;
};

describe('events routes -> event notifications', () => {
  beforeEach(() => vi.clearAllMocks());

  it('create tells everyone added, naming the creator as actor', async () => {
    await handleCreateEvent({ user: { id: 'adm', role: 'admin' }, body: { ...body, participant_ids: ['u-1', 'u-2'] } } as any, mockRes());
    expect(eventNotifications.added).toHaveBeenCalledWith('ev-new', ['u-1', 'u-2'], 'adm');
  });

  it('inline add tells only the newly added', async () => {
    await handleAddParticipants({ user: { id: 'adm' }, params: { id: 'ev-1' }, body: { user_ids: ['u-1', 'u-2'] } } as any, mockRes());
    expect(eventNotifications.added).toHaveBeenCalledWith('ev-1', ['u-2'], 'adm');
  });

  it('update hands before, after and both rosters to afterUpdate, after commit', async () => {
    const client = mockClient();
    vi.mocked(processParticipants).mockResolvedValueOnce(['u-2', 'u-3']);
    await handleUpdateEvent({ user: { id: 'adm', role: 'admin' }, params: { id: 'ev-1' }, body: { ...body, participant_ids: ['u-2', 'u-3'] } } as any, mockRes());
    expect(eventNotifications.afterUpdate).toHaveBeenCalledWith({
      before: BEFORE,
      after: expect.objectContaining({ id: 'ev-1', city: 'Reno' }),
      previousIds: ['u-1'],
      rosterIds: ['u-2', 'u-3'],
      actorId: 'adm',
    });
    const commitOrder = client.query.mock.invocationCallOrder[client.query.mock.calls.findIndex((c) => c[0] === 'COMMIT')];
    expect(commitOrder).toBeLessThan(vi.mocked(eventNotifications.afterUpdate).mock.invocationCallOrder[0]);
  });

  it('update without participants passes null rosters', async () => {
    mockClient();
    await handleUpdateEvent({ user: { id: 'adm', role: 'admin' }, params: { id: 'ev-1' }, body } as any, mockRes());
    expect(eventNotifications.afterUpdate).toHaveBeenCalledWith(expect.objectContaining({ previousIds: null, rosterIds: null }));
  });

  it('a failed "before" read skips notifications but not the update', async () => {
    mockClient();
    vi.mocked(eventRepository.findById).mockRejectedValueOnce(new Error('db blip'));
    const res = mockRes();
    await handleUpdateEvent({ user: { id: 'adm', role: 'admin' }, params: { id: 'ev-1' }, body } as any, res);
    expect(res.json).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
    expect(eventNotifications.afterUpdate).not.toHaveBeenCalled();
  });

  it('a rejecting notifier never fails the response', async () => {
    mockClient();
    vi.mocked(eventNotifications.afterUpdate).mockRejectedValueOnce(new Error('boom'));
    const res = mockRes();
    await handleUpdateEvent({ user: { id: 'adm', role: 'admin' }, params: { id: 'ev-1' }, body } as any, res);
    await new Promise((r) => setImmediate(r));
    expect(res.json).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run (from `backend/`): `npx vitest run tests/routes/events.notifications.test.ts`
Expected: FAIL, `eventNotifications.added` not called.

- [ ] **Step 7: Wire `routes/events.ts`**

Add the import below the `sampleRequestService` import:

```ts
import { eventNotifications, logNotifyError } from '../services/notifications';
```

In `handleCreateEvent`, directly after the `void sampleRequestService.announceIfOpen(event.id, addedIds)...` statement:

```ts
    void eventNotifications.added(event.id, addedIds, req.user?.id)
      .catch(logNotifyError('event.added'));
```

In `handleUpdateEvent`, replace `let newlyAddedIds: string[] = [];` with:

```ts
    let newlyAddedIds: string[] = [];
    let previousIds: string[] | null = null;
    let rosterIds: string[] | null = null;
    // Snapshot for change notifications. A failed read only costs the
    // notification, never the update.
    const before = await eventRepository.findById(id).catch(() => null);
```

In the `if (participants || participant_ids)` block, replace the two lines that compute `rosterIds` and `newlyAddedIds` with:

```ts
      previousIds = [...existingIds];
      rosterIds = await processParticipants(id, participants, participant_ids, client, existingIds);
      newlyAddedIds = rosterIds.filter((uid) => !existingIds.has(uid));
```

Directly after the existing `if (newlyAddedIds.length > 0) { void sampleRequestService.announceIfOpen(...) }` block:

```ts
    if (before) {
      void eventNotifications.afterUpdate({
        before, after: event, previousIds, rosterIds, actorId: req.user?.id ?? null,
      }).catch(logNotifyError('event update'));
    }
```

In `handleAddParticipants`, directly after the `void sampleRequestService.announceIfOpen(id, newlyAddedIds)...` statement:

```ts
    void eventNotifications.added(id, newlyAddedIds, req.user?.id)
      .catch(logNotifyError('event.added'));
```

- [ ] **Step 8: Keep the existing events test green**

In `backend/tests/routes/events.sampleAnnounce.test.ts`, add `findById: vi.fn(async () => ({ id: 'ev-1', name: 'X' })),` to the `eventRepository` mock object, and add this mock below the `SampleRequestService` mock:

```ts
vi.mock('../../src/services/notifications', () => ({
  eventNotifications: { added: vi.fn(async () => undefined), afterUpdate: vi.fn(async () => undefined) },
  logNotifyError: () => () => undefined,
}));
```

- [ ] **Step 9: Run the tests**

Run (from `backend/`): `npx vitest run tests/routes/events.notifications.test.ts tests/routes/events.sampleAnnounce.test.ts tests/services/notifications && npx tsc --noEmit`
Expected: all PASS, no type errors.

- [ ] **Step 10: Commit**

```bash
git add backend/src/services/notifications backend/src/routes/events.ts backend/tests/routes/events.notifications.test.ts backend/tests/routes/events.sampleAnnounce.test.ts backend/tests/services/notifications/eventNotifications.test.ts
git commit -m "feat(notifications): added, removed, details-changed and cancelled event notifications"
```

---

### Task 5: Booth notifications

**Files:**
- Create: `backend/src/services/notifications/boothNotifications.ts`
- Create: `backend/tests/helpers/routeHandler.ts`
- Modify: `backend/src/services/notifications/index.ts`
- Modify: `backend/src/routes/checklist.ts` (`PUT /:checklistId`, `POST /:checklistId/booth-map`, `POST /:checklistId/booth-shipping`)
- Modify: `backend/src/services/booth/BoothInventoryService.ts` (`reportComponent`)
- Test: `backend/tests/services/notifications/boothNotifications.test.ts`, `backend/tests/routes/checklist.boothNotifications.test.ts`, `backend/tests/services/BoothInventoryService.reportNotify.test.ts`

**Interfaces:**
- Consumes: `eventParticipants`, `usersWithRole`, `eventByChecklistId`, `notifyMany`, `logNotifyError`, `formatDay`, `textKey` (Task 3).
- Produces:
  - `boothNotifications.ordered(checklistId: number, actorId?: string | null): Promise<void>`
  - `boothNotifications.shipped(checklistId: number, shipping: { carrier_name?: unknown; tracking_number?: unknown; delivery_date?: unknown }, actorId?: string | null): Promise<void>`
  - `boothNotifications.mapUploaded(checklistId: number, actorId?: string | null): Promise<void>`
  - `boothNotifications.componentReported(report: { componentId: string; kind: 'damage' | 'missing'; notes?: string | null }, actorId?: string | null): Promise<void>`
  - `routeHandler(router, method, path)` test helper: returns the last handler registered for that route.

- [ ] **Step 1: Write the test helper**

```ts
// backend/tests/helpers/routeHandler.ts
/**
 * Pulls the final handler for a route off an Express router, so routes whose
 * handlers are defined inline can be called with a mock req/res.
 */
export function routeHandler(
  router: any,
  method: 'get' | 'post' | 'put' | 'patch' | 'delete',
  path: string
): (req: any, res: any, next?: any) => Promise<void> {
  const layer = router.stack.find((l: any) => l.route && l.route.path === path && l.route.methods[method]);
  if (!layer) throw new Error(`No ${method.toUpperCase()} ${path} route registered`);
  const stack = layer.route.stack;
  return stack[stack.length - 1].handle;
}
```

- [ ] **Step 2: Write the failing service test**

```ts
// backend/tests/services/notifications/boothNotifications.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../src/config/database', () => ({ query: vi.fn() }));
vi.mock('../../../src/services/notifications/recipients', () => ({
  eventParticipants: vi.fn(async () => ['u-1', 'u-2']),
  usersWithRole: vi.fn(async () => ['adm-1', 'coord-1']),
}));
vi.mock('../../../src/services/notifications/eventRefs', () => ({
  eventByChecklistId: vi.fn(async () => ({ id: 'ev-1', name: 'Expo' })),
}));
vi.mock('../../../src/services/notifications/notifyMany', () => ({ notifyMany: vi.fn(async () => undefined) }));

import { query } from '../../../src/config/database';
import { boothNotifications } from '../../../src/services/notifications/boothNotifications';
import { eventParticipants, usersWithRole } from '../../../src/services/notifications/recipients';
import { eventByChecklistId } from '../../../src/services/notifications/eventRefs';
import { notifyMany } from '../../../src/services/notifications/notifyMany';

const lastInput = () => vi.mocked(notifyMany).mock.calls.at(-1)![1];

describe('boothNotifications', () => {
  beforeEach(() => vi.clearAllMocks());

  it('ordered tells everyone on the event except the actor', async () => {
    await boothNotifications.ordered(7, 'adm');
    expect(eventByChecklistId).toHaveBeenCalledWith(7);
    expect(eventParticipants).toHaveBeenCalledWith('ev-1', { except: ['adm'] });
    expect(notifyMany).toHaveBeenCalledWith(['u-1', 'u-2'], expect.objectContaining({
      kind: 'booth.ordered', title: 'Booth ordered · Expo', link: { page: 'checklist', eventId: 'ev-1' },
    }));
  });

  it('shipped carries carrier, tracking number and arrival day when present', async () => {
    await boothNotifications.shipped(7, { carrier_name: 'FedEx', tracking_number: '1Z999', delivery_date: '2026-10-29' }, 'adm');
    expect(lastInput().kind).toBe('booth.shipped');
    expect(lastInput().body).toBe('The booth for Expo has shipped with FedEx · Tracking 1Z999 · Arrives Oct 29, 2026');
  });

  it('shipped stays readable with no carrier details', async () => {
    await boothNotifications.shipped(7, {}, 'adm');
    expect(lastInput().body).toBe('The booth for Expo has shipped');
  });

  it('mapUploaded links to the checklist', async () => {
    await boothNotifications.mapUploaded(7, 'adm');
    expect(lastInput()).toEqual(expect.objectContaining({
      kind: 'booth.map_uploaded', title: 'Booth map available · Expo', link: { page: 'checklist', eventId: 'ev-1' },
    }));
  });

  it('sends nothing when the checklist has no event or nobody is left', async () => {
    vi.mocked(eventByChecklistId).mockResolvedValueOnce(null);
    await boothNotifications.ordered(7, 'adm');
    vi.mocked(eventParticipants).mockResolvedValueOnce([]);
    await boothNotifications.ordered(7, 'adm');
    expect(notifyMany).not.toHaveBeenCalled();
  });

  it('componentReported tells admins and coordinators, naming the piece and reporter', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [{ component: 'Back wall fabric', booth: '10x20 Haute', reporter: 'Ana' }] } as any);
    await boothNotifications.componentReported({ componentId: 'c-1', kind: 'damage', notes: 'torn corner' }, 'u-9');
    expect(usersWithRole).toHaveBeenCalledWith(['admin', 'coordinator'], { except: ['u-9'] });
    expect(notifyMany).toHaveBeenCalledWith(['adm-1', 'coord-1'], {
      kind: 'booth.component_reported',
      title: 'Booth component reported damaged',
      body: 'Ana reported "Back wall fabric" (10x20 Haute) as damaged. Note: torn corner',
      link: { page: 'booth-inventory' },
    });
  });

  it('componentReported words a missing report and survives an unknown reporter', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [{ component: 'Light', booth: 'Booth B', reporter: null }] } as any);
    await boothNotifications.componentReported({ componentId: 'c-1', kind: 'missing' }, 'u-9');
    expect(lastInput().title).toBe('Booth component reported missing');
    expect(lastInput().body).toBe('Someone reported "Light" (Booth B) as missing.');
  });

  it('componentReported sends nothing when the component is gone', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [] } as any);
    await boothNotifications.componentReported({ componentId: 'c-x', kind: 'missing' }, 'u-9');
    expect(notifyMany).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run (from `backend/`): `npx vitest run tests/services/notifications/boothNotifications.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 4: Implement the catalog file**

```ts
// backend/src/services/notifications/boothNotifications.ts
/**
 * Booth notifications. Checklist progress (ordered, shipped, map) goes to
 * everyone on the show; an inventory damage or missing report goes to the
 * people who look after the booths.
 */
import { query } from '../../config/database';
import { eventParticipants, usersWithRole } from './recipients';
import { eventByChecklistId } from './eventRefs';
import { notifyMany } from './notifyMany';
import { formatDay, textKey } from './values';
import type { NotifyInput } from '../NotificationService';

type Actor = string | null | undefined;

async function toEvent(
  checklistId: number, actorId: Actor, build: (eventName: string) => Omit<NotifyInput, 'link'>
): Promise<void> {
  const event = await eventByChecklistId(checklistId);
  if (!event) return;
  const recipients = await eventParticipants(event.id, { except: [actorId] });
  if (recipients.length === 0) return;
  await notifyMany(recipients, { ...build(event.name), link: { page: 'checklist', eventId: event.id } });
}

export interface ComponentReport { componentId: string; kind: 'damage' | 'missing'; notes?: string | null }

export const boothNotifications = {
  ordered(checklistId: number, actorId?: Actor): Promise<void> {
    return toEvent(checklistId, actorId, (name) => ({
      kind: 'booth.ordered',
      title: `Booth ordered · ${name}`,
      body: `The booth for ${name} has been ordered.`,
    }));
  },

  shipped(
    checklistId: number,
    shipping: { carrier_name?: unknown; tracking_number?: unknown; delivery_date?: unknown },
    actorId?: Actor
  ): Promise<void> {
    const carrier = textKey(shipping.carrier_name);
    const tracking = textKey(shipping.tracking_number);
    const arrives = formatDay(shipping.delivery_date);
    return toEvent(checklistId, actorId, (name) => ({
      kind: 'booth.shipped',
      title: `Booth shipped · ${name}`,
      body: `The booth for ${name} has shipped${carrier ? ` with ${carrier}` : ''}`
        + `${tracking ? ` · Tracking ${tracking}` : ''}${arrives ? ` · Arrives ${arrives}` : ''}`,
    }));
  },

  mapUploaded(checklistId: number, actorId?: Actor): Promise<void> {
    return toEvent(checklistId, actorId, (name) => ({
      kind: 'booth.map_uploaded',
      title: `Booth map available · ${name}`,
      body: `The booth map for ${name} has been uploaded. Open the checklist to see where the booth is.`,
    }));
  },

  async componentReported(report: ComponentReport, actorId?: Actor): Promise<void> {
    const r = await query(
      `SELECT c.name AS component, b.name AS booth,
              (SELECT u.name FROM users u WHERE u.id = $2) AS reporter
         FROM booth_components c JOIN booths b ON b.id = c.booth_id
        WHERE c.id = $1`,
      [report.componentId, actorId ?? null]
    );
    const row = r.rows[0] as { component: string; booth: string; reporter: string | null } | undefined;
    if (!row) return;
    const recipients = await usersWithRole(['admin', 'coordinator'], { except: [actorId] });
    if (recipients.length === 0) return;
    const state = report.kind === 'missing' ? 'missing' : 'damaged';
    const note = textKey(report.notes);
    await notifyMany(recipients, {
      kind: 'booth.component_reported',
      title: `Booth component reported ${state}`,
      body: `${row.reporter ?? 'Someone'} reported "${row.component}" (${row.booth}) as ${state}.${note ? ` Note: ${note}` : ''}`,
      link: { page: 'booth-inventory' },
    });
  },
};
```

Append to `backend/src/services/notifications/index.ts`:

```ts
export { boothNotifications } from './boothNotifications';
export type { ComponentReport } from './boothNotifications';
```

- [ ] **Step 5: Run the service test**

Run (from `backend/`): `npx vitest run tests/services/notifications/boothNotifications.test.ts`
Expected: all PASS.

- [ ] **Step 6: Write the failing route and service wiring tests**

```ts
// backend/tests/routes/checklist.boothNotifications.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';

vi.mock('../../src/config/database', () => ({ query: vi.fn() }));
vi.mock('../../src/config/upload', () => ({
  uploadBoothMap: { single: () => (_req: any, _res: any, cb: any) => cb() },
}));
vi.mock('../../src/middleware/auth', () => ({
  authorize: () => (_req: any, _res: any, next: any) => next(),
}));
vi.mock('../../src/services/PushService', () => ({ pushService: { sendToUser: vi.fn(async () => undefined) } }));
vi.mock('../../src/database/repositories', () => ({
  checklistRepository: { findById: vi.fn(), updateMainFields: vi.fn(), createBoothShipping: vi.fn() },
}));
vi.mock('../../src/services/notifications', () => ({
  boothNotifications: {
    ordered: vi.fn(async () => undefined), shipped: vi.fn(async () => undefined), mapUploaded: vi.fn(async () => undefined),
  },
  travelNotifications: {},
  logNotifyError: () => () => undefined,
}));

import router from '../../src/routes/checklist';
import { checklistRepository } from '../../src/database/repositories';
import { boothNotifications } from '../../src/services/notifications';
import { routeHandler } from '../helpers/routeHandler';

const repo = vi.mocked(checklistRepository) as any;
const mockRes = () => ({ json: vi.fn().mockReturnThis(), status: vi.fn().mockReturnThis() }) as any;
const user = { id: 'adm', role: 'admin' };

describe('checklist routes -> booth notifications', () => {
  beforeEach(() => vi.clearAllMocks());
  const put = routeHandler(router, 'put', '/:checklistId');
  const putReq = (boothOrdered: boolean) => ({ user, params: { checklistId: '7' }, body: { boothOrdered } });

  it('notifies when the booth flag goes from off to on', async () => {
    repo.findById.mockResolvedValueOnce({ id: 7, booth_ordered: false });
    repo.updateMainFields.mockResolvedValueOnce({ id: 7, booth_ordered: true });
    await put(putReq(true), mockRes());
    expect(boothNotifications.ordered).toHaveBeenCalledWith(7, 'adm');
  });

  it('stays silent when the booth was already ordered, or is being un-ordered', async () => {
    repo.findById.mockResolvedValueOnce({ id: 7, booth_ordered: true });
    repo.updateMainFields.mockResolvedValueOnce({ id: 7, booth_ordered: true });
    await put(putReq(true), mockRes());
    repo.findById.mockResolvedValueOnce({ id: 7, booth_ordered: true });
    repo.updateMainFields.mockResolvedValueOnce({ id: 7, booth_ordered: false });
    await put(putReq(false), mockRes());
    expect(boothNotifications.ordered).not.toHaveBeenCalled();
  });

  it('stays silent, and still saves, when the before-read fails', async () => {
    repo.findById.mockRejectedValueOnce(new Error('db blip'));
    repo.updateMainFields.mockResolvedValueOnce({ id: 7, booth_ordered: true });
    const res = mockRes();
    await put(putReq(true), res);
    expect(res.json).toHaveBeenCalledWith({ id: 7, booth_ordered: true });
    expect(boothNotifications.ordered).not.toHaveBeenCalled();
  });

  it('a rejecting notifier never fails the save', async () => {
    repo.findById.mockResolvedValueOnce({ id: 7, booth_ordered: false });
    repo.updateMainFields.mockResolvedValueOnce({ id: 7, booth_ordered: true });
    vi.mocked(boothNotifications.ordered).mockRejectedValueOnce(new Error('boom'));
    const res = mockRes();
    await put(putReq(true), res);
    await new Promise((r) => setImmediate(r));
    expect(res.status).not.toHaveBeenCalled();
  });

  it('notifies when a shipment is saved as shipped, not when it is only planned', async () => {
    const post = routeHandler(router, 'post', '/:checklistId/booth-shipping');
    const shippedRow = { id: 1, checklist_id: 7, shipped: true, carrier_name: 'FedEx', tracking_number: '1Z' };
    repo.createBoothShipping.mockResolvedValueOnce(shippedRow);
    await post({ user, params: { checklistId: '7' }, body: { shipped: true } }, mockRes());
    expect(boothNotifications.shipped).toHaveBeenCalledWith(7, shippedRow, 'adm');

    repo.createBoothShipping.mockResolvedValueOnce({ id: 2, checklist_id: 7, shipped: false });
    await post({ user, params: { checklistId: '7' }, body: {} }, mockRes());
    expect(boothNotifications.shipped).toHaveBeenCalledTimes(1);
  });

  it('notifies when a booth map is uploaded', async () => {
    const post = routeHandler(router, 'post', '/:checklistId/booth-map');
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    repo.updateMainFields.mockResolvedValueOnce({ id: 7, booth_map_url: '/uploads/booth-maps/m.png' });
    const res = mockRes();
    await post({
      user, params: { checklistId: '7' },
      file: { path: '/tmp/m.png', filename: 'm.png', originalname: 'm.png', mimetype: 'image/png', size: 10 },
    }, res);
    expect(res.json).toHaveBeenCalledWith({ mapUrl: '/uploads/booth-maps/m.png' });
    expect(boothNotifications.mapUploaded).toHaveBeenCalledWith(7, 'adm');
  });
});
```

```ts
// backend/tests/services/BoothInventoryService.reportNotify.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/config/database', () => ({ query: vi.fn() }));
vi.mock('../../src/services/booth/BoothMovementService', () => ({
  boothMovementService: { withTransaction: vi.fn(async () => ({ id: 'mv-1' })) },
}));
vi.mock('../../src/services/notifications', () => ({
  boothNotifications: { componentReported: vi.fn(async () => undefined) },
  logNotifyError: () => () => undefined,
}));

import { boothInventoryService } from '../../src/services/booth/BoothInventoryService';
import { boothMovementService } from '../../src/services/booth/BoothMovementService';
import { boothNotifications } from '../../src/services/notifications';

describe('BoothInventoryService.reportComponent -> notification', () => {
  beforeEach(() => vi.clearAllMocks());
  const req = { kind: 'damage' as const, notes: 'torn', performedBy: 'u-9' };

  it('notifies after the transaction returns, and still returns the movement', async () => {
    const result = await boothInventoryService.reportComponent('c-1', req);
    expect(result).toEqual({ id: 'mv-1' });
    expect(boothNotifications.componentReported).toHaveBeenCalledWith(
      { componentId: 'c-1', kind: 'damage', notes: 'torn' }, 'u-9'
    );
    expect(vi.mocked(boothMovementService.withTransaction).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(boothNotifications.componentReported).mock.invocationCallOrder[0]);
  });

  it('does not notify when the report fails', async () => {
    vi.mocked(boothMovementService.withTransaction).mockRejectedValueOnce(new Error('not found'));
    await expect(boothInventoryService.reportComponent('c-x', req)).rejects.toThrow('not found');
    expect(boothNotifications.componentReported).not.toHaveBeenCalled();
  });

  it('a rejecting notifier does not fail the report', async () => {
    vi.mocked(boothNotifications.componentReported).mockRejectedValueOnce(new Error('boom'));
    await expect(boothInventoryService.reportComponent('c-1', req)).resolves.toEqual({ id: 'mv-1' });
  });
});
```

If `boothInventoryService` is not the exported singleton's name, read the last lines of `backend/src/services/booth/BoothInventoryService.ts` and use the name it exports (the route file `backend/src/routes/boothComponents.ts` imports it).

- [ ] **Step 7: Run them to verify they fail**

Run (from `backend/`): `npx vitest run tests/routes/checklist.boothNotifications.test.ts tests/services/BoothInventoryService.reportNotify.test.ts`
Expected: FAIL, the notifier mocks are never called.

- [ ] **Step 8: Wire `routes/checklist.ts`**

Add below the `PushService` import:

```ts
import { boothNotifications, logNotifyError } from '../services/notifications';
```

Replace the body of the `PUT /:checklistId` handler's `try` block with:

```ts
    const { checklistId } = req.params;
    const { boothOrdered, boothNotes, electricityOrdered, electricityNotes } = req.body;
    const id = parseInt(checklistId);

    // undefined = the read failed; then we cannot tell whether the flag flipped.
    const before = await checklistRepository.findById(id).catch(() => undefined);

    const checklist = await checklistRepository.updateMainFields(id, {
      boothOrdered,
      boothNotes,
      electricityOrdered,
      electricityNotes
    });

    if (before && !before.booth_ordered && checklist.booth_ordered) {
      void boothNotifications.ordered(id, req.user?.id).catch(logNotifyError('booth.ordered'));
    }

    res.json(checklist);
```

In the booth-map upload handler, directly before `res.json({ mapUrl: checklist.booth_map_url });`:

```ts
      void boothNotifications.mapUploaded(checklistIdNum, req.user?.id)
        .catch(logNotifyError('booth.map_uploaded'));
```

In the `POST /:checklistId/booth-shipping` handler, directly before `res.json(shipping);`:

```ts
    if (shipping.shipped) {
      void boothNotifications.shipped(parseInt(checklistId), shipping, req.user?.id)
        .catch(logNotifyError('booth.shipped'));
    }
```

- [ ] **Step 9: Wire `BoothInventoryService.reportComponent`**

Add the import beside the other imports:

```ts
import { boothNotifications, logNotifyError } from '../notifications';
```

Change the method so the transaction result is captured, then the notification is sent, then the result is returned. The transaction body itself is unchanged:

```ts
  async reportComponent(componentId: string, req: ReportRequest): Promise<BoothMovement> {
    const movement = await boothMovementService.withTransaction(async (client) => {
      // ... existing transaction body, unchanged, including its `return boothMovementService.record({...}, client);`
    });

    // After commit: the people who look after the booths hear about it.
    void boothNotifications
      .componentReported({ componentId, kind: req.kind, notes: req.notes ?? null }, req.performedBy)
      .catch(logNotifyError('booth.component_reported'));

    return movement;
  }
```

Known limit, accepted: a client that replays the same report with the same idempotency key notifies again. The movement ledger dedupes the report; the bell does not.

- [ ] **Step 10: Run the tests**

Run (from `backend/`): `npx vitest run tests/routes/checklist.boothNotifications.test.ts tests/services/BoothInventoryService.reportNotify.test.ts tests/services/notifications && npx tsc --noEmit`
Expected: all PASS, no type errors.

- [ ] **Step 11: Commit**

```bash
git add backend/src/services/notifications backend/src/routes/checklist.ts backend/src/services/booth/BoothInventoryService.ts backend/tests/helpers backend/tests/routes/checklist.boothNotifications.test.ts backend/tests/services/BoothInventoryService.reportNotify.test.ts backend/tests/services/notifications/boothNotifications.test.ts
git commit -m "feat(notifications): booth ordered, shipped, map uploaded and component reported"
```

---

### Task 6: Travel booking notifications

**Files:**
- Create: `backend/src/services/notifications/travelNotifications.ts`
- Modify: `backend/src/services/notifications/index.ts`
- Modify: `backend/src/database/repositories/ChecklistRepository.ts` (three getters)
- Modify: `backend/src/routes/checklist.ts` (nine booking handlers; delete `notifyBooking` and its helpers)
- Test: `backend/tests/services/notifications/travelNotifications.test.ts`, `backend/tests/routes/checklist.travelNotifications.test.ts`

**Interfaces:**
- Consumes: `activeUsers`, `eventByChecklistId`, `notifyMany`, `logNotifyError`, `dayKey`, `instantKey`, `textKey`, `formatDay` (Task 3).
- Produces:
  - `interface BookingRow { checklist_id: number; booked?: unknown; confirmation_number?: unknown }` (no index signature, so `ChecklistFlight`, `ChecklistHotel` and `ChecklistCarRental` are assignable to it)
  - `interface BookingEffect { type: 'booked' | 'changed' | 'cancelled'; userId: string; row: BookingRow; changed: string[] }`
  - `classifyBooking(before: BookingRow | null, after: BookingRow | null, config: BookingConfig): BookingEffect[]`
  - `FLIGHT`, `HOTEL`, `CAR_RENTAL`: the three `BookingConfig` values
  - `travelNotifications.flightSaved(before, after, actorId?)`, `.hotelSaved(...)`, `.carRentalSaved(...)`: each `(before: BookingRow | null, after: BookingRow | null, actorId?: string | null) => Promise<void>`. `before` is null on create; `after` is null on delete.
  - `checklistRepository.getFlightById(id: number): Promise<ChecklistFlight | null>`, `getHotelById`, `getCarRentalById`

- [ ] **Step 1: Write the failing service test**

```ts
// backend/tests/services/notifications/travelNotifications.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../src/services/notifications/recipients', () => ({
  activeUsers: vi.fn(async (ids: string[], opts?: { except?: unknown[] }) =>
    ids.filter((id) => id && !(opts?.except ?? []).includes(id))),
}));
vi.mock('../../../src/services/notifications/eventRefs', () => ({
  eventByChecklistId: vi.fn(async () => ({ id: 'ev-1', name: 'Expo' })),
}));
vi.mock('../../../src/services/notifications/notifyMany', () => ({ notifyMany: vi.fn(async () => undefined) }));

import {
  classifyBooking, travelNotifications, FLIGHT, HOTEL, CAR_RENTAL,
} from '../../../src/services/notifications/travelNotifications';
import { eventByChecklistId } from '../../../src/services/notifications/eventRefs';
import { notifyMany } from '../../../src/services/notifications/notifyMany';

const flight = (over: Record<string, unknown> = {}) => ({
  id: 1, checklist_id: 7, attendee_id: 'u-1', carrier: 'Delta', confirmation_number: 'ABC123',
  booked: true, departure_at: '2026-10-31T14:30:00.000Z', notes: null, ...over,
});
const types = (effects: Array<{ type: string; userId: string }>) => effects.map((e) => `${e.type}:${e.userId}`);

describe('classifyBooking', () => {
  it('created booked -> booked', () => {
    expect(types(classifyBooking(null, flight(), FLIGHT))).toEqual(['booked:u-1']);
  });
  it('not booked -> booked on update', () => {
    expect(types(classifyBooking(flight({ booked: false }), flight(), FLIGHT))).toEqual(['booked:u-1']);
  });
  it('unchanged save -> nothing, even when the timestamp arrives as a Date', () => {
    const before = flight({ departure_at: new Date('2026-10-31T14:30:00.000Z'), carrier: ' Delta ' });
    expect(classifyBooking(before, flight(), FLIGHT)).toEqual([]);
  });
  it('a note-only edit -> nothing', () => {
    expect(classifyBooking(flight(), flight({ notes: 'aisle seat' }), FLIGHT)).toEqual([]);
  });
  it('a watched field changed -> changed, naming the fields', () => {
    const effects = classifyBooking(flight(), flight({ confirmation_number: 'XYZ9', departure_at: '2026-10-31T18:00:00.000Z' }), FLIGHT);
    expect(types(effects)).toEqual(['changed:u-1']);
    expect(effects[0].changed).toEqual(['Confirmation number', 'Departure time']);
  });
  it('booked -> un-booked -> cancelled', () => {
    expect(types(classifyBooking(flight(), flight({ booked: false }), FLIGHT))).toEqual(['cancelled:u-1']);
  });
  it('booked row deleted -> cancelled', () => {
    expect(types(classifyBooking(flight(), null, FLIGHT))).toEqual(['cancelled:u-1']);
  });
  it('reassigned -> cancelled for the old person, booked for the new', () => {
    const before = { id: 3, checklist_id: 7, assigned_to_id: 'u-1', provider: 'Hertz', confirmation_number: 'H1', booked: true };
    expect(types(classifyBooking(before, { ...before, assigned_to_id: 'u-2' }, CAR_RENTAL)))
      .toEqual(['cancelled:u-1', 'booked:u-2']);
  });
  it('nothing for a row that never counted as booked', () => {
    expect(classifyBooking(null, flight({ booked: false }), FLIGHT)).toEqual([]);
    expect(classifyBooking(null, flight({ confirmation_number: '  ' }), FLIGHT)).toEqual([]);
    expect(classifyBooking(null, flight({ attendee_id: null }), FLIGHT)).toEqual([]);
    expect(classifyBooking(flight({ booked: false }), null, FLIGHT)).toEqual([]);
    expect(classifyBooking(null, null, FLIGHT)).toEqual([]);
  });
  it('hotel dates compare by day, whatever shape they arrive in', () => {
    const hotel = { id: 2, checklist_id: 7, attendee_id: 'u-1', property_name: 'Venetian', confirmation_number: 'H9', booked: true,
      check_in_date: new Date(2026, 9, 31), check_out_date: new Date(2026, 10, 4) };
    expect(classifyBooking(hotel, { ...hotel, check_in_date: '2026-10-31', check_out_date: '2026-11-04' }, HOTEL)).toEqual([]);
    expect(types(classifyBooking(hotel, { ...hotel, check_out_date: '2026-11-05' }, HOTEL))).toEqual(['changed:u-1']);
  });
});

describe('travelNotifications', () => {
  beforeEach(() => vi.clearAllMocks());
  const last = () => vi.mocked(notifyMany).mock.calls.at(-1)!;

  it('flight booked: tells the attendee with a checklist link', async () => {
    await travelNotifications.flightSaved(null, flight(), 'adm');
    expect(eventByChecklistId).toHaveBeenCalledWith(7);
    expect(last()).toEqual([['u-1'], {
      kind: 'travel.booked',
      title: 'Flight booked ✈️ · Expo',
      body: 'Delta · Confirmation ABC123',
      link: { page: 'checklist', eventId: 'ev-1' },
    }]);
  });

  it('hotel changed: says what changed and gives the current details', async () => {
    const hotel = { id: 2, checklist_id: 7, attendee_id: 'u-1', property_name: 'Venetian', confirmation_number: 'H9', booked: true,
      check_in_date: '2026-10-31', check_out_date: '2026-11-04' };
    await travelNotifications.hotelSaved(hotel, { ...hotel, check_in_date: '2026-11-01' }, 'adm');
    expect(last()[1]).toEqual(expect.objectContaining({
      kind: 'travel.changed',
      title: 'Hotel updated 🏨 · Expo',
      body: 'Check-in date changed. Venetian · Confirmation H9 · Check-in Nov 1, 2026',
    }));
  });

  it('car rental cancelled: tells the assignee', async () => {
    const car = { id: 3, checklist_id: 7, assigned_to_id: 'u-1', provider: 'Hertz', confirmation_number: 'C7', booked: true };
    await travelNotifications.carRentalSaved(car, null, 'adm');
    expect(last()).toEqual([['u-1'], expect.objectContaining({
      kind: 'travel.cancelled',
      title: 'Car rental cancelled · Expo',
      body: 'Your car rental for Expo was cancelled. Confirmation C7.',
    })]);
  });

  it('does not notify someone about a booking they made for themselves', async () => {
    await travelNotifications.flightSaved(null, flight(), 'u-1');
    expect(notifyMany).not.toHaveBeenCalled();
  });

  it('does not look anything up when there is nothing to say', async () => {
    await travelNotifications.flightSaved(flight(), flight(), 'adm');
    expect(eventByChecklistId).not.toHaveBeenCalled();
    expect(notifyMany).not.toHaveBeenCalled();
  });

  it('still notifies, without a link, when the checklist has no event', async () => {
    vi.mocked(eventByChecklistId).mockResolvedValueOnce(null);
    await travelNotifications.flightSaved(null, flight(), 'adm');
    expect(last()[1]).toEqual(expect.objectContaining({ title: 'Flight booked ✈️', link: null }));
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run (from `backend/`): `npx vitest run tests/services/notifications/travelNotifications.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement the catalog file**

```ts
// backend/src/services/notifications/travelNotifications.ts
/**
 * Flight, hotel and car rental notifications for the one person a booking is
 * for. Routes hand over the row before and after their write; classifyBooking
 * decides whether that is a new booking, a change, a cancellation, a
 * reassignment, or nothing worth a notification.
 */
import { activeUsers } from './recipients';
import { eventByChecklistId } from './eventRefs';
import { notifyMany } from './notifyMany';
import { dayKey, instantKey, textKey, formatDay } from './values';

/**
 * Any flight, hotel or car rental row. Deliberately has no index signature so
 * the repository's row interfaces are assignable to it; read other columns
 * through `col`.
 */
export interface BookingRow { checklist_id: number; booked?: unknown; confirmation_number?: unknown }

const col = (row: BookingRow, name: string): unknown => (row as unknown as Record<string, unknown>)[name];

type FieldType = 'text' | 'day' | 'instant';
interface WatchedField { field: string; label: string; type: FieldType }

export interface BookingConfig {
  noun: string;
  emoji: string;
  /** Column naming the person the booking is for. */
  assigneeField: string;
  watched: WatchedField[];
  /** One line describing the booking as it stands. */
  summary(row: BookingRow): string;
}

export interface BookingEffect {
  type: 'booked' | 'changed' | 'cancelled';
  userId: string;
  row: BookingRow;
  /** Labels of the watched fields that changed; empty unless type is 'changed'. */
  changed: string[];
}

const parts = (...items: Array<string | null | false | undefined>): string => items.filter(Boolean).join(' · ');
const confirmation = (row: BookingRow): string => `Confirmation ${textKey(row.confirmation_number)}`;

export const FLIGHT: BookingConfig = {
  noun: 'Flight', emoji: '✈️', assigneeField: 'attendee_id',
  watched: [
    { field: 'carrier', label: 'Carrier', type: 'text' },
    { field: 'confirmation_number', label: 'Confirmation number', type: 'text' },
    { field: 'departure_at', label: 'Departure time', type: 'instant' },
  ],
  summary: (row) => parts(textKey(col(row, 'carrier')), confirmation(row)),
};

export const HOTEL: BookingConfig = {
  noun: 'Hotel', emoji: '🏨', assigneeField: 'attendee_id',
  watched: [
    { field: 'property_name', label: 'Hotel', type: 'text' },
    { field: 'confirmation_number', label: 'Confirmation number', type: 'text' },
    { field: 'check_in_date', label: 'Check-in date', type: 'day' },
    { field: 'check_out_date', label: 'Check-out date', type: 'day' },
  ],
  summary: (row) => {
    const checkIn = formatDay(col(row, 'check_in_date'));
    return parts(textKey(col(row, 'property_name')), confirmation(row), checkIn && `Check-in ${checkIn}`);
  },
};

export const CAR_RENTAL: BookingConfig = {
  noun: 'Car rental', emoji: '🚗', assigneeField: 'assigned_to_id',
  watched: [
    { field: 'provider', label: 'Rental company', type: 'text' },
    { field: 'confirmation_number', label: 'Confirmation number', type: 'text' },
    { field: 'pickup_date', label: 'Pickup date', type: 'day' },
    { field: 'return_date', label: 'Return date', type: 'day' },
  ],
  summary: (row) => {
    const pickup = formatDay(col(row, 'pickup_date'));
    return parts(textKey(col(row, 'provider')), confirmation(row), pickup && `Pickup ${pickup}`);
  },
};

const KEY: Record<FieldType, (v: unknown) => string | number | null> = { text: textKey, day: dayKey, instant: instantKey };

/** The assignee if this row counts as a real booking, otherwise null. */
function bookedFor(row: BookingRow | null, config: BookingConfig): string | null {
  if (!row || row.booked !== true || !textKey(row.confirmation_number)) return null;
  return textKey(col(row, config.assigneeField));
}

export function classifyBooking(
  before: BookingRow | null, after: BookingRow | null, config: BookingConfig
): BookingEffect[] {
  const was = bookedFor(before, config);
  const is = bookedFor(after, config);
  if (!was && !is) return [];
  if (!was && is) return [{ type: 'booked', userId: is, row: after!, changed: [] }];
  if (was && !is) return [{ type: 'cancelled', userId: was, row: before!, changed: [] }];
  if (was !== is) {
    return [
      { type: 'cancelled', userId: was!, row: before!, changed: [] },
      { type: 'booked', userId: is!, row: after!, changed: [] },
    ];
  }
  const changed = config.watched
    .filter((w) => KEY[w.type](col(before!, w.field)) !== KEY[w.type](col(after!, w.field)))
    .map((w) => w.label);
  return changed.length > 0 ? [{ type: 'changed', userId: is!, row: after!, changed }] : [];
}

function message(effect: BookingEffect, config: BookingConfig, eventName: string | null) {
  const suffix = eventName ? ` · ${eventName}` : '';
  if (effect.type === 'booked') {
    return { kind: 'travel.booked', title: `${config.noun} booked ${config.emoji}${suffix}`, body: config.summary(effect.row) };
  }
  if (effect.type === 'changed') {
    return {
      kind: 'travel.changed',
      title: `${config.noun} updated ${config.emoji}${suffix}`,
      body: `${effect.changed.join(', ')} changed. ${config.summary(effect.row)}`,
    };
  }
  return {
    kind: 'travel.cancelled',
    title: `${config.noun} cancelled${suffix}`,
    body: `Your ${config.noun.toLowerCase()}${eventName ? ` for ${eventName}` : ''} was cancelled. ${confirmation(effect.row)}.`,
  };
}

type Actor = string | null | undefined;

async function saved(
  config: BookingConfig, before: BookingRow | null, after: BookingRow | null, actorId: Actor
): Promise<void> {
  const effects = classifyBooking(before, after, config);
  if (effects.length === 0) return;
  const event = await eventByChecklistId((after ?? before)!.checklist_id);
  for (const effect of effects) {
    const recipients = await activeUsers([effect.userId], { except: [actorId] });
    if (recipients.length === 0) continue;
    await notifyMany(recipients, {
      ...message(effect, config, event?.name ?? null),
      link: event ? { page: 'checklist', eventId: event.id } : null,
    });
  }
}

export const travelNotifications = {
  flightSaved: (before: BookingRow | null, after: BookingRow | null, actorId?: Actor) => saved(FLIGHT, before, after, actorId),
  hotelSaved: (before: BookingRow | null, after: BookingRow | null, actorId?: Actor) => saved(HOTEL, before, after, actorId),
  carRentalSaved: (before: BookingRow | null, after: BookingRow | null, actorId?: Actor) => saved(CAR_RENTAL, before, after, actorId),
};
```

Append to `backend/src/services/notifications/index.ts`:

```ts
export { travelNotifications, classifyBooking, FLIGHT, HOTEL, CAR_RENTAL } from './travelNotifications';
export type { BookingRow, BookingEffect, BookingConfig } from './travelNotifications';
```

- [ ] **Step 4: Run the service test**

Run (from `backend/`): `npx vitest run tests/services/notifications/travelNotifications.test.ts`
Expected: all PASS.

- [ ] **Step 5: Add the repository getters**

In `backend/src/database/repositories/ChecklistRepository.ts`, add each method directly above the matching `update…` method:

```ts
  /** One flight row, or null. Used to compare before and after an edit. */
  async getFlightById(id: number): Promise<ChecklistFlight | null> {
    const result = await this.executeQuery<ChecklistFlight>(`SELECT * FROM checklist_flights WHERE id = $1`, [id]);
    return result.rows[0] || null;
  }
```

```ts
  /** One hotel row, or null. Used to compare before and after an edit. */
  async getHotelById(id: number): Promise<ChecklistHotel | null> {
    const result = await this.executeQuery<ChecklistHotel>(`SELECT * FROM checklist_hotels WHERE id = $1`, [id]);
    return result.rows[0] || null;
  }
```

```ts
  /** One car rental row, or null. Used to compare before and after an edit. */
  async getCarRentalById(id: number): Promise<ChecklistCarRental | null> {
    const result = await this.executeQuery<ChecklistCarRental>(`SELECT * FROM checklist_car_rentals WHERE id = $1`, [id]);
    return result.rows[0] || null;
  }
```

- [ ] **Step 6: Write the failing route test**

```ts
// backend/tests/routes/checklist.travelNotifications.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/config/database', () => ({ query: vi.fn() }));
vi.mock('../../src/config/upload', () => ({ uploadBoothMap: { single: () => (_r: any, _s: any, cb: any) => cb() } }));
vi.mock('../../src/middleware/auth', () => ({ authorize: () => (_req: any, _res: any, next: any) => next() }));
vi.mock('../../src/database/repositories', () => ({
  checklistRepository: {
    createFlight: vi.fn(), getFlightById: vi.fn(), updateFlight: vi.fn(), deleteFlight: vi.fn(async () => true),
    createHotel: vi.fn(), getHotelById: vi.fn(), updateHotel: vi.fn(), deleteHotel: vi.fn(async () => true),
    createCarRental: vi.fn(), getCarRentalById: vi.fn(), updateCarRental: vi.fn(), deleteCarRental: vi.fn(async () => true),
  },
}));
vi.mock('../../src/services/notifications', () => ({
  boothNotifications: {},
  travelNotifications: {
    flightSaved: vi.fn(async () => undefined), hotelSaved: vi.fn(async () => undefined), carRentalSaved: vi.fn(async () => undefined),
  },
  logNotifyError: () => () => undefined,
}));

import router from '../../src/routes/checklist';
import { checklistRepository } from '../../src/database/repositories';
import { travelNotifications } from '../../src/services/notifications';
import { routeHandler } from '../helpers/routeHandler';

const repo = vi.mocked(checklistRepository) as any;
const mockRes = () => ({ json: vi.fn().mockReturnThis(), status: vi.fn().mockReturnThis() }) as any;
const user = { id: 'adm', role: 'admin' };
const BEFORE = { id: 1, checklist_id: 7, booked: true, confirmation_number: 'A' };
const AFTER = { id: 1, checklist_id: 7, booked: true, confirmation_number: 'B' };

const KINDS = [
  { name: 'flight', create: '/:checklistId/flights', item: '/flights/:flightId', param: 'flightId',
    createFn: 'createFlight', getFn: 'getFlightById', updateFn: 'updateFlight', saved: 'flightSaved' },
  { name: 'hotel', create: '/:checklistId/hotels', item: '/hotels/:hotelId', param: 'hotelId',
    createFn: 'createHotel', getFn: 'getHotelById', updateFn: 'updateHotel', saved: 'hotelSaved' },
  { name: 'car rental', create: '/:checklistId/car-rentals', item: '/car-rentals/:rentalId', param: 'rentalId',
    createFn: 'createCarRental', getFn: 'getCarRentalById', updateFn: 'updateCarRental', saved: 'carRentalSaved' },
] as const;

describe.each(KINDS)('checklist $name routes -> travel notifications', (k) => {
  beforeEach(() => vi.clearAllMocks());
  const saved = () => vi.mocked((travelNotifications as any)[k.saved]);

  it('create passes (null, created row, actor)', async () => {
    repo[k.createFn].mockResolvedValueOnce(AFTER);
    const res = mockRes();
    await routeHandler(router, 'post', k.create)({ user, params: { checklistId: '7' }, body: {} }, res);
    expect(res.json).toHaveBeenCalledWith(AFTER);
    expect(saved()).toHaveBeenCalledWith(null, AFTER, 'adm');
  });

  it('update passes (row before, row after, actor)', async () => {
    repo[k.getFn].mockResolvedValueOnce(BEFORE);
    repo[k.updateFn].mockResolvedValueOnce(AFTER);
    await routeHandler(router, 'put', k.item)({ user, params: { [k.param]: '1' }, body: {} }, mockRes());
    expect(repo[k.getFn]).toHaveBeenCalledWith(1);
    expect(saved()).toHaveBeenCalledWith(BEFORE, AFTER, 'adm');
  });

  it('update still saves, silently, when the before-read fails', async () => {
    repo[k.getFn].mockRejectedValueOnce(new Error('db blip'));
    repo[k.updateFn].mockResolvedValueOnce(AFTER);
    const res = mockRes();
    await routeHandler(router, 'put', k.item)({ user, params: { [k.param]: '1' }, body: {} }, res);
    expect(res.json).toHaveBeenCalledWith(AFTER);
    expect(saved()).not.toHaveBeenCalled();
  });

  it('delete passes (row before, null, actor)', async () => {
    repo[k.getFn].mockResolvedValueOnce(BEFORE);
    const res = mockRes();
    await routeHandler(router, 'delete', k.item)({ user, params: { [k.param]: '1' } }, res);
    expect(res.json).toHaveBeenCalledWith({ success: true });
    expect(saved()).toHaveBeenCalledWith(BEFORE, null, 'adm');
  });

  it('delete of a row that was not there says nothing', async () => {
    repo[k.getFn].mockResolvedValueOnce(null);
    await routeHandler(router, 'delete', k.item)({ user, params: { [k.param]: '1' } }, mockRes());
    expect(saved()).not.toHaveBeenCalled();
  });

  it('a rejecting notifier never fails the save', async () => {
    repo[k.createFn].mockResolvedValueOnce(AFTER);
    saved().mockRejectedValueOnce(new Error('boom'));
    const res = mockRes();
    await routeHandler(router, 'post', k.create)({ user, params: { checklistId: '7' }, body: {} }, res);
    await new Promise((r) => setImmediate(r));
    expect(res.status).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 7: Run it to verify it fails**

Run (from `backend/`): `npx vitest run tests/routes/checklist.travelNotifications.test.ts`
Expected: FAIL, `flightSaved` and the others are never called.

- [ ] **Step 8: Wire the nine booking handlers and delete the old helper**

In `backend/src/routes/checklist.ts`:

1. Change the notifications import to:

```ts
import { boothNotifications, travelNotifications, logNotifyError } from '../services/notifications';
```

2. Delete these, which nothing uses after this step: the `pushService, PushPayload` import line, the `import { query } from '../config/database';` line, and the whole block from the `notifyBooking` doc comment down to and including `formatNotificationDate` (the `notifyBooking` const, `interface ShowRef`, `getShowByChecklist`, `getShowByBookingRow`, `formatNotificationDate`).

3. In each **create** handler, replace the `if (x.booked && x.confirmation_number && ...) { ... notifyBooking(...) }` block with one line:

```ts
    // flights
    void travelNotifications.flightSaved(null, flight, req.user?.id).catch(logNotifyError('travel.flight'));
```
```ts
    // hotels
    void travelNotifications.hotelSaved(null, hotel, req.user?.id).catch(logNotifyError('travel.hotel'));
```
```ts
    // car rentals
    void travelNotifications.carRentalSaved(null, rental, req.user?.id).catch(logNotifyError('travel.car_rental'));
```

4. In each **update** handler, read the row first and replace the old `if (...) { notifyBooking(...) }` block. Flight shown in full; hotel and car rental follow the same three edits with their own names.

```ts
// Update flight
router.put('/flights/:flightId', authorize('admin', 'coordinator', 'developer'), async (req: AuthRequest, res: Response) => {
  try {
    const { flightId } = req.params;
    const { carrier, confirmationNumber, notes, booked, departureAt } = req.body;
    const id = parseInt(flightId);

    // undefined = the read failed; then there is nothing to compare against.
    const before = await checklistRepository.getFlightById(id).catch(() => undefined);

    const flight = await checklistRepository.updateFlight(id, {
      carrier,
      confirmation_number: confirmationNumber,
      notes,
      booked,
      departure_at: departureAt || null
    });

    if (before !== undefined) {
      void travelNotifications.flightSaved(before, flight, req.user?.id).catch(logNotifyError('travel.flight'));
    }

    res.json(flight);
  } catch (error) {
    console.error('[Checklist] Error updating flight:', error);
    res.status(500).json({ error: 'Failed to update flight' });
  }
});
```

Hotel update: `const id = parseInt(hotelId);`, `const before = await checklistRepository.getHotelById(id).catch(() => undefined);`, `updateHotel(id, {...})` with its existing field object unchanged, then

```ts
    if (before !== undefined) {
      void travelNotifications.hotelSaved(before, hotel, req.user?.id).catch(logNotifyError('travel.hotel'));
    }
```

Car rental update: `const id = parseInt(rentalId);`, `const before = await checklistRepository.getCarRentalById(id).catch(() => undefined);`, `updateCarRental(id, {...})` with its existing field object unchanged, then

```ts
    if (before !== undefined) {
      void travelNotifications.carRentalSaved(before, rental, req.user?.id).catch(logNotifyError('travel.car_rental'));
    }
```

5. In each **delete** handler, read the row first and notify after the delete. Flight shown in full:

```ts
// Delete flight
router.delete('/flights/:flightId', authorize('admin', 'coordinator', 'developer'), async (req: AuthRequest, res: Response) => {
  try {
    const { flightId } = req.params;
    const id = parseInt(flightId);
    const before = await checklistRepository.getFlightById(id).catch(() => null);
    await checklistRepository.deleteFlight(id);
    if (before) {
      void travelNotifications.flightSaved(before, null, req.user?.id).catch(logNotifyError('travel.flight'));
    }
    res.json({ success: true });
  } catch (error) {
    console.error('[Checklist] Error deleting flight:', error);
    res.status(500).json({ error: 'Failed to delete flight' });
  }
});
```

Hotel delete uses `getHotelById` / `deleteHotel` / `hotelSaved(before, null, ...)` with label `'travel.hotel'`. Car rental delete uses `getCarRentalById` / `deleteCarRental` / `carRentalSaved(before, null, ...)` with label `'travel.car_rental'`.

- [ ] **Step 9: Run the tests and the type check**

Run (from `backend/`): `npx vitest run tests/routes/checklist.travelNotifications.test.ts tests/routes/checklist.boothNotifications.test.ts tests/services/notifications && npx tsc --noEmit && grep -n "notifyBooking\|pushService" src/routes/checklist.ts`
Expected: all PASS, no type errors, and the final `grep` prints nothing.

- [ ] **Step 10: Commit**

```bash
git add backend/src/services/notifications backend/src/database/repositories/ChecklistRepository.ts backend/src/routes/checklist.ts backend/tests/routes/checklist.travelNotifications.test.ts backend/tests/services/notifications/travelNotifications.test.ts
git commit -m "feat(notifications): booking booked, changed, cancelled and reassigned, with a bell row"
```

---

### Task 7: New user awaiting approval

**Files:**
- Create: `backend/src/services/notifications/adminNotifications.ts`
- Modify: `backend/src/services/notifications/index.ts`
- Modify: `backend/src/routes/auth.ts` (`POST /register`)
- Modify: `backend/src/services/AuthentikOidcService.ts` (auto-provision loop)
- Modify: `backend/tests/services/AuthentikOidcService.test.ts`
- Test: `backend/tests/services/notifications/adminNotifications.test.ts`, `backend/tests/routes/auth.registerNotify.test.ts`

**Interfaces:**
- Consumes: `usersWithRole`, `notifyMany`, `logNotifyError`, `textKey` (Task 3).
- Produces: `adminNotifications.userPending(user: { name: string; email?: string | null; via: 'registration' | 'sso' }): Promise<void>`

- [ ] **Step 1: Write the failing service test**

```ts
// backend/tests/services/notifications/adminNotifications.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../src/services/notifications/recipients', () => ({
  usersWithRole: vi.fn(async () => ['adm-1', 'dev-1']),
  activeUsers: vi.fn(async (ids: string[]) => ids.filter(Boolean)),
}));
vi.mock('../../../src/services/notifications/notifyMany', () => ({ notifyMany: vi.fn(async () => undefined) }));

import { adminNotifications } from '../../../src/services/notifications/adminNotifications';
import { usersWithRole } from '../../../src/services/notifications/recipients';
import { notifyMany } from '../../../src/services/notifications/notifyMany';

describe('adminNotifications.userPending', () => {
  beforeEach(() => vi.clearAllMocks());

  it('tells admins and developers about a registration, linking to Users', async () => {
    await adminNotifications.userPending({ name: 'Jane Doe', email: 'jane@x.com', via: 'registration' });
    expect(usersWithRole).toHaveBeenCalledWith(['admin', 'developer']);
    expect(notifyMany).toHaveBeenCalledWith(['adm-1', 'dev-1'], {
      kind: 'admin.user_pending',
      title: 'New user awaiting approval',
      body: 'Jane Doe (jane@x.com) registered and needs a role before they can use Argo.',
      link: { page: 'admin-users' },
    });
  });

  it('words an SSO sign-in differently and copes with no email', async () => {
    await adminNotifications.userPending({ name: 'Jane Doe', via: 'sso' });
    expect(vi.mocked(notifyMany).mock.calls[0][1].body)
      .toBe('Jane Doe signed in with SSO for the first time and needs a role before they can use Argo.');
  });

  it('sends nothing when there is nobody to tell', async () => {
    vi.mocked(usersWithRole).mockResolvedValueOnce([]);
    await adminNotifications.userPending({ name: 'Jane', via: 'sso' });
    expect(notifyMany).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run (from `backend/`): `npx vitest run tests/services/notifications/adminNotifications.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
// backend/src/services/notifications/adminNotifications.ts
/**
 * Notifications about the app itself rather than a show: an account waiting
 * for a role, and a badge scan that could not reach the CRM.
 */
import { usersWithRole } from './recipients';
import { notifyMany } from './notifyMany';
import { textKey } from './values';

export interface PendingUser { name: string; email?: string | null; via: 'registration' | 'sso' }

export const adminNotifications = {
  async userPending(user: PendingUser): Promise<void> {
    const recipients = await usersWithRole(['admin', 'developer']);
    if (recipients.length === 0) return;
    const email = textKey(user.email);
    const how = user.via === 'sso' ? 'signed in with SSO for the first time' : 'registered';
    await notifyMany(recipients, {
      kind: 'admin.user_pending',
      title: 'New user awaiting approval',
      body: `${user.name}${email ? ` (${email})` : ''} ${how} and needs a role before they can use Argo.`,
      link: { page: 'admin-users' },
    });
  },
};
```

Append to `backend/src/services/notifications/index.ts`:

```ts
export { adminNotifications } from './adminNotifications';
export type { PendingUser } from './adminNotifications';
```

- [ ] **Step 4: Run the service test**

Run (from `backend/`): `npx vitest run tests/services/notifications/adminNotifications.test.ts`
Expected: all PASS.

- [ ] **Step 5: Write the failing wiring tests**

```ts
// backend/tests/routes/auth.registerNotify.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/config/database', () => ({ query: vi.fn() }));
vi.mock('bcrypt', () => ({ default: { hash: vi.fn(async () => 'hashed'), compare: vi.fn() } }));
vi.mock('../../src/middleware/sessionTracker', () => ({ createSession: vi.fn(), deleteSession: vi.fn() }));
vi.mock('../../src/middleware/auth', () => ({
  getToken: vi.fn(), tryVerifyPlatformJwt: vi.fn(),
  authenticateToken: (_req: any, _res: any, next: any) => next(),
}));
vi.mock('../../src/utils/auditLogger', () => ({ logAuth: vi.fn(async () => undefined) }));
vi.mock('../../src/database/repositories', () => ({ userRepository: {} }));
vi.mock('../../src/services/notifications', () => ({
  adminNotifications: { userPending: vi.fn(async () => undefined) },
  logNotifyError: () => () => undefined,
}));

import router from '../../src/routes/auth';
import { query } from '../../src/config/database';
import { adminNotifications } from '../../src/services/notifications';
import { routeHandler } from '../helpers/routeHandler';

const register = routeHandler(router, 'post', '/register');
const mockRes = () => ({ json: vi.fn().mockReturnThis(), status: vi.fn().mockReturnThis() }) as any;
const req = (body: Record<string, unknown>) => ({ body, headers: {}, socket: { remoteAddress: '127.0.0.1' }, ip: '127.0.0.1' });
const valid = { username: 'jane', password: 'Str0ng!Pass', name: 'Jane Doe', email: 'jane@x.com' };

describe('POST /register -> admin notification', () => {
  beforeEach(() => vi.clearAllMocks());

  it('tells admins once the pending user is stored', async () => {
    vi.mocked(query)
      .mockResolvedValueOnce({ rows: [] } as any)   // duplicate check
      .mockResolvedValueOnce({ rows: [{ id: 'u-9', username: 'jane', name: 'Jane Doe', email: 'jane@x.com', role: 'pending' }] } as any);
    const res = mockRes();
    await register(req(valid), res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(adminNotifications.userPending).toHaveBeenCalledWith({ name: 'Jane Doe', email: 'jane@x.com', via: 'registration' });
  });

  it('says nothing when registration is rejected', async () => {
    const res = mockRes();
    await register(req({ ...valid, password: 'weak' }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(adminNotifications.userPending).not.toHaveBeenCalled();
  });

  it('a rejecting notifier never fails the registration', async () => {
    vi.mocked(query)
      .mockResolvedValueOnce({ rows: [] } as any)
      .mockResolvedValueOnce({ rows: [{ id: 'u-9', username: 'jane', name: 'Jane Doe', email: 'jane@x.com', role: 'pending' }] } as any);
    vi.mocked(adminNotifications.userPending).mockRejectedValueOnce(new Error('boom'));
    const res = mockRes();
    await register(req(valid), res);
    await new Promise((r) => setImmediate(r));
    expect(res.status).toHaveBeenCalledWith(201);
  });
});
```

In `backend/tests/services/AuthentikOidcService.test.ts`, add this mock directly below the existing `vi.mock('../../src/database/repositories', ...)` block:

```ts
vi.mock('../../src/services/notifications', () => ({
  adminNotifications: { userPending: vi.fn(async () => undefined) },
  logNotifyError: () => () => undefined,
}));
```

add this import below the existing `userRepository` import:

```ts
import { adminNotifications } from '../../src/services/notifications';
```

and add these two tests directly after the existing `'no match → provisions pending user with claims-derived username'` test:

```ts
  it('no match → tells admins a new SSO user is waiting', async () => {
    vi.mocked(adminNotifications.userPending).mockClear();
    repo.findByAuthentikSub.mockResolvedValue(null);
    repo.findByEmailCiWithSso.mockResolvedValue(null);
    repo.createSsoUser.mockResolvedValue({ id: 'u3', username: 'jane', name: 'Jane Doe', email: 'jane@x.com', role: 'pending' });
    await resolveSsoUser(CLAIMS);
    expect(adminNotifications.userPending).toHaveBeenCalledTimes(1);
    expect(adminNotifications.userPending).toHaveBeenCalledWith({ name: 'Jane Doe', email: 'jane@x.com', via: 'sso' });
  });

  it('a returning pending SSO user does not notify again', async () => {
    vi.mocked(adminNotifications.userPending).mockClear();
    repo.findByAuthentikSub.mockResolvedValue({ id: 'u1', username: 'jane', name: 'Jane', email: 'jane@x.com', role: 'pending', authentik_sub: 'ak-uuid-1' });
    await resolveSsoUser(CLAIMS);
    expect(adminNotifications.userPending).not.toHaveBeenCalled();
  });
```

- [ ] **Step 6: Run them to verify they fail**

Run (from `backend/`): `npx vitest run tests/routes/auth.registerNotify.test.ts tests/services/AuthentikOidcService.test.ts`
Expected: FAIL on the three new "tells admins" assertions.

- [ ] **Step 7: Wire both call sites**

`backend/src/routes/auth.ts`: add the import below the `userRepository` import:

```ts
import { adminNotifications, logNotifyError } from '../services/notifications';
```

and directly after the `console.log(`[REGISTRATION] New user registered: ...`)` line:

```ts
    void adminNotifications.userPending({ name: user.name, email: user.email, via: 'registration' })
      .catch(logNotifyError('admin.user_pending'));
```

`backend/src/services/AuthentikOidcService.ts`: add the import below the `userRepository` import:

```ts
import { adminNotifications, logNotifyError } from './notifications';
```

and in the auto-provision loop, directly after the `console.log(`[OIDC] auto-provisioned pending user ...`)` line and before `return { status: 'pending' };`:

```ts
      void adminNotifications.userPending({ name, email, via: 'sso' })
        .catch(logNotifyError('admin.user_pending'));
```

- [ ] **Step 8: Run the tests**

Run (from `backend/`): `npx vitest run tests/routes/auth.registerNotify.test.ts tests/services/AuthentikOidcService.test.ts tests/routes/oidc.test.ts tests/services/notifications && npx tsc --noEmit`
Expected: all PASS, no type errors. If `tests/routes/oidc.test.ts` fails because it now loads `services/notifications`, add the same `vi.mock('../../src/services/notifications', ...)` block from Step 5 to that file.

- [ ] **Step 9: Commit**

```bash
git add backend/src/services/notifications backend/src/routes/auth.ts backend/src/services/AuthentikOidcService.ts backend/tests/routes/auth.registerNotify.test.ts backend/tests/services/AuthentikOidcService.test.ts backend/tests/services/notifications/adminNotifications.test.ts backend/tests/routes/oidc.test.ts
git commit -m "feat(notifications): tell admins and developers when a new user is awaiting approval"
```

---

### Task 8: Badge scan failed to reach the CRM

**Files:**
- Modify: `backend/src/database/repositories/BadgeScanRepository.ts` (`claimExhaustedForNotification`, `requeue`)
- Modify: `backend/src/services/notifications/adminNotifications.ts` (`badgeCrmFailed`)
- Modify: `backend/src/services/badge/BadgeCrmPushService.ts` (`pushOnce`)
- Modify: `backend/tests/services/BadgeCrmPushService.test.ts`, `backend/tests/repositories/BadgeScanRepository.test.ts`, `backend/tests/services/notifications/adminNotifications.test.ts`

**Interfaces:**
- Consumes: `activeUsers`, `notifyMany`, `logNotifyError`, `textKey` (Task 3); `adminNotifications` (Task 7); column `badge_scans.crm_failure_notified_at` (Task 1).
- Produces:
  - `interface ExhaustedScan { id: string; scanned_by: string | null; first_name: string | null; last_name: string | null; company: string | null }`
  - `badgeScanRepository.claimExhaustedForNotification(): Promise<ExhaustedScan[]>` (marks and returns in one statement)
  - `adminNotifications.badgeCrmFailed(scan: ExhaustedScan): Promise<void>`

- [ ] **Step 1: Write the failing tests**

Add to `backend/tests/repositories/BadgeScanRepository.test.ts`, inside the top-level `describe('BadgeScanRepository', ...)`:

```ts
  describe('CRM failure notifications', () => {
    it('claims exhausted, un-notified scans in one statement and returns them', async () => {
      vi.mocked(dbQuery).mockResolvedValue(ok([{ id: 'scan-1', scanned_by: 'u-1', first_name: 'A', last_name: 'B', company: 'C' }]));
      const claimed = await repo.claimExhaustedForNotification();
      expect(claimed).toHaveLength(1);
      const sql = vi.mocked(dbQuery).mock.calls[0][0] as string;
      expect(sql).toMatch(/UPDATE badge_scans\s+SET crm_failure_notified_at = CURRENT_TIMESTAMP/);
      expect(sql).toContain("crm_status = 'failed'");
      expect(sql).toContain('crm_attempts >= 5');
      expect(sql).toContain('crm_failure_notified_at IS NULL');
      expect(sql).toContain('RETURNING id, scanned_by, first_name, last_name, company');
    });

    it('a manual retry re-arms the notification', async () => {
      vi.mocked(dbQuery).mockResolvedValue(ok([row()]));
      await repo.requeue('scan-1');
      expect(vi.mocked(dbQuery).mock.calls[0][0] as string).toContain('crm_failure_notified_at = NULL');
    });
  });
```

Add to `backend/tests/services/notifications/adminNotifications.test.ts`:

```ts
describe('adminNotifications.badgeCrmFailed', () => {
  beforeEach(() => vi.clearAllMocks());
  const scan = { id: 's-1', scanned_by: 'u-1', first_name: 'Shamsher', last_name: 'Jessani', company: 'VTA' };

  it('tells the person who scanned it, linking to Leads', async () => {
    await adminNotifications.badgeCrmFailed(scan);
    expect(notifyMany).toHaveBeenCalledWith(['u-1'], {
      kind: 'badge.crm_failed',
      title: "A badge scan didn't reach the CRM",
      body: 'Shamsher Jessani (VTA) could not be sent to Zoho CRM after several tries. Open Leads to check it and retry.',
      link: { page: 'badge-scans' },
    });
  });

  it('falls back to "A lead" when the scan has no name', async () => {
    await adminNotifications.badgeCrmFailed({ ...scan, first_name: null, last_name: ' ', company: null });
    expect(vi.mocked(notifyMany).mock.calls[0][1].body)
      .toBe('A lead could not be sent to Zoho CRM after several tries. Open Leads to check it and retry.');
  });

  it('sends nothing when nobody is recorded as the scanner', async () => {
    await adminNotifications.badgeCrmFailed({ ...scan, scanned_by: null });
    expect(notifyMany).not.toHaveBeenCalled();
  });
});
```

In `backend/tests/services/BadgeCrmPushService.test.ts`, change the repository mock to include the new method, and add the notifications mock below it:

```ts
vi.mock('../../src/database/repositories/BadgeScanRepository', () => ({
  badgeScanRepository: {
    claimPendingByBrand: vi.fn(async () => []),
    markPushResult: vi.fn(async () => {}),
    claimExhaustedForNotification: vi.fn(async () => []),
  },
}));
vi.mock('../../src/services/notifications', () => ({
  adminNotifications: { badgeCrmFailed: vi.fn(async () => undefined) },
  logNotifyError: () => () => undefined,
}));
```

add the import below the existing `badgeScanRepository` import:

```ts
import { adminNotifications } from '../../src/services/notifications';
```

and add this `describe` at the end of the file:

```ts
describe('BadgeCrmPushService -> failure notifications', () => {
  const exhausted = { id: 'scan-9', scanned_by: 'u-1', first_name: 'A', last_name: 'B', company: 'C' };

  it('notifies for each newly exhausted scan after a pass, even an empty one', async () => {
    vi.mocked(badgeScanRepository.claimExhaustedForNotification).mockResolvedValueOnce([exhausted] as any);
    await badgeCrmPushService.pushOnce();
    expect(adminNotifications.badgeCrmFailed).toHaveBeenCalledWith(exhausted);
  });

  it('a failing claim or notifier never fails the pass', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(badgeScanRepository.claimExhaustedForNotification).mockRejectedValueOnce(new Error('db down'));
    await expect(badgeCrmPushService.pushOnce()).resolves.toEqual(expect.objectContaining({ attempted: 0 }));

    vi.mocked(badgeScanRepository.claimExhaustedForNotification).mockResolvedValueOnce([exhausted, { ...exhausted, id: 'scan-10' }] as any);
    vi.mocked(adminNotifications.badgeCrmFailed).mockRejectedValueOnce(new Error('boom'));
    await expect(badgeCrmPushService.pushOnce()).resolves.toBeDefined();
    expect(adminNotifications.badgeCrmFailed).toHaveBeenCalledTimes(2);
    err.mockRestore();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run (from `backend/`): `npx vitest run tests/repositories/BadgeScanRepository.test.ts tests/services/BadgeCrmPushService.test.ts tests/services/notifications/adminNotifications.test.ts`
Expected: FAIL: `claimExhaustedForNotification is not a function`, `badgeCrmFailed is not a function`, and the `requeue` SQL assertion.

- [ ] **Step 3: Implement the repository methods**

In `backend/src/database/repositories/BadgeScanRepository.ts`, add below the `PushResult` interface:

```ts
/** What the failure notification needs to name a lead. */
export interface ExhaustedScan {
  id: string;
  scanned_by: string | null;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
}
```

In `requeue`, change the `SET` clause to also clear the marker:

```ts
          SET crm_status = 'pending', crm_error = NULL, crm_attempts = 0,
              crm_last_attempt_at = NULL, crm_failure_notified_at = NULL,
              updated_at = CURRENT_TIMESTAMP
```

Add this method directly below `markPushResult`:

```ts
  /**
   * Scans that have used every CRM attempt and whose scanner has not been
   * told yet. Marking and returning happen in one statement, so two passes
   * can never both pick up the same scan.
   */
  async claimExhaustedForNotification(): Promise<ExhaustedScan[]> {
    const result = await this.executeQuery<ExhaustedScan>(
      `UPDATE badge_scans
          SET crm_failure_notified_at = CURRENT_TIMESTAMP
        WHERE crm_status = 'failed'
          AND crm_attempts >= ${MAX_CRM_ATTEMPTS}
          AND crm_failure_notified_at IS NULL
        RETURNING id, scanned_by, first_name, last_name, company`
    );
    return result.rows;
  }
```

- [ ] **Step 4: Implement `badgeCrmFailed`**

In `backend/src/services/notifications/adminNotifications.ts`, change the recipients import to `import { usersWithRole, activeUsers } from './recipients';`, add `import type { ExhaustedScan } from '../../database/repositories/BadgeScanRepository';`, and add this method to the `adminNotifications` object:

```ts
  async badgeCrmFailed(scan: ExhaustedScan): Promise<void> {
    const recipients = await activeUsers([scan.scanned_by]);
    if (recipients.length === 0) return;
    const name = [textKey(scan.first_name), textKey(scan.last_name)].filter(Boolean).join(' ');
    const company = textKey(scan.company);
    const who = name ? `${name}${company ? ` (${company})` : ''}` : (company ?? 'A lead');
    await notifyMany(recipients, {
      kind: 'badge.crm_failed',
      title: "A badge scan didn't reach the CRM",
      body: `${who} could not be sent to Zoho CRM after several tries. Open Leads to check it and retry.`,
      link: { page: 'badge-scans' },
    });
  },
```

- [ ] **Step 5: Wire `BadgeCrmPushService.pushOnce`**

Add the import below the other imports:

```ts
import { adminNotifications, logNotifyError } from '../notifications';
```

Replace the `try { return await this.runPass(summary); } finally { this.inFlight = false; }` block in `pushOnce` with:

```ts
    try {
      const result = await this.runPass(summary);
      await this.notifyExhausted();
      return result;
    } finally {
      this.inFlight = false;
    }
```

Add this private method directly below `pushOnce`:

```ts
  /**
   * Tell each scanner whose lead has now failed for good. Runs after every
   * pass, including an empty one, so a terminal failure recorded on the
   * previous tick is still reported. Never throws.
   */
  private async notifyExhausted(): Promise<void> {
    try {
      const scans = await badgeScanRepository.claimExhaustedForNotification();
      for (const scan of scans) {
        await adminNotifications.badgeCrmFailed(scan).catch(logNotifyError('badge.crm_failed'));
      }
    } catch (error) {
      console.error('[BadgeCrmPush] Could not check for failed leads to report:', error);
    }
  }
```

- [ ] **Step 6: Run the tests**

Run (from `backend/`): `npx vitest run tests/repositories/BadgeScanRepository.test.ts tests/services/BadgeCrmPushService.test.ts tests/services/BadgeScanService.test.ts tests/services/notifications && npx tsc --noEmit`
Expected: all PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add backend/src/database/repositories/BadgeScanRepository.ts backend/src/services/notifications/adminNotifications.ts backend/src/services/badge/BadgeCrmPushService.ts backend/tests/repositories/BadgeScanRepository.test.ts backend/tests/services/BadgeCrmPushService.test.ts backend/tests/services/notifications/adminNotifications.test.ts
git commit -m "feat(notifications): tell the scanner when a badge lead fails to reach the CRM for good"
```

---

### Task 9: Reminder scheduler

**Files:**
- Create: `backend/src/services/notifications/reminderDefinitions.ts`, `backend/src/services/notifications/ReminderScheduler.ts`
- Modify: `backend/src/services/notifications/index.ts`
- Modify: `backend/src/server.ts` (import line 42, start call at line 229)
- Delete: `backend/src/services/TravelReminderService.ts`
- Modify (comments only): `backend/src/services/ZohoCrmLeadsService.ts`, `backend/src/services/ExpenseMessageScanner.ts`, `backend/src/services/sampleRequests/SampleRequestReminderService.ts`
- Test: `backend/tests/services/notifications/reminderDefinitions.test.ts`, `backend/tests/services/notifications/ReminderScheduler.test.ts`, `backend/tests/integration/reminder-windows.test.ts`

**Interfaces:**
- Consumes: `notifyMany` (Task 3); table `notification_reminders` (Task 1); `NotifyInput` from `NotificationService`.
- Produces:
  - `interface DueRow { subject_id: string; user_id: string; [key: string]: unknown }`
  - `interface ReminderDefinition { kind: string; dueSql: string; build(row: DueRow): NotifyInput }`. `dueSql` takes one parameter, `$1` = the kind, and returns rows not yet in the ledger.
  - `REMINDER_DEFINITIONS: ReminderDefinition[]` (six entries)
  - `class ReminderScheduler { start(): void; stop(): void; scan(): Promise<void> }` and the singleton `reminderScheduler`

- [ ] **Step 1: Write the failing unit tests**

```ts
// backend/tests/services/notifications/reminderDefinitions.test.ts
import { describe, it, expect } from 'vitest';
import { REMINDER_DEFINITIONS } from '../../../src/services/notifications/reminderDefinitions';

const def = (kind: string) => {
  const found = REMINDER_DEFINITIONS.find((d) => d.kind === kind);
  if (!found) throw new Error(`no definition for ${kind}`);
  return found;
};
const eventRow = (days: number) => ({ subject_id: 'ev-1', user_id: 'u-1', event_id: 'ev-1', event_name: 'Expo', days });

describe('reminder definitions', () => {
  it('covers exactly the six kinds in the spec', () => {
    expect(REMINDER_DEFINITIONS.map((d) => d.kind)).toEqual([
      'reminder.event_30d', 'reminder.event_7d', 'reminder.expenses_1d', 'reminder.expenses_7d',
      'reminder.flight_checkin_24h', 'reminder.flight_departure_3h',
    ]);
  });

  it('every due query skips what the ledger already holds for its own kind', () => {
    for (const d of REMINDER_DEFINITIONS) {
      expect(d.dueSql).toMatch(/NOT EXISTS \(\s*SELECT 1 FROM notification_reminders r\s+WHERE r\.kind = \$1/);
      expect(d.dueSql).toContain('u.is_active');
    }
  });

  it('event and expense reminders skip cancelled shows and use the spec anchors', () => {
    for (const kind of ['reminder.event_30d', 'reminder.event_7d']) {
      expect(def(kind).dueSql).toContain("e.status <> 'cancelled'");
      expect(def(kind).dueSql).toContain('COALESCE(e.travel_start_date, e.show_start_date)');
    }
    for (const kind of ['reminder.expenses_1d', 'reminder.expenses_7d']) {
      expect(def(kind).dueSql).toContain("e.status <> 'cancelled'");
      expect(def(kind).dueSql).toContain('COALESCE(e.show_end_date, e.end_date)');
    }
    expect(def('reminder.event_30d').dueSql).toContain('BETWEEN 23 AND 30');
    expect(def('reminder.event_7d').dueSql).toContain('BETWEEN 0 AND 7');
    expect(def('reminder.expenses_1d').dueSql).toContain('BETWEEN 1 AND 6');
    expect(def('reminder.expenses_7d').dueSql).toContain('BETWEEN 7 AND 13');
  });

  it('counts down in plain words', () => {
    const build = def('reminder.event_7d').build;
    expect(build(eventRow(5)).title).toBe('Expo is in 5 days');
    expect(build(eventRow(1)).title).toBe('Expo is tomorrow');
    expect(build(eventRow(0)).title).toBe('Expo is today');
    expect(def('reminder.event_30d').build(eventRow(28))).toEqual(expect.objectContaining({
      kind: 'reminder.event_30d', title: 'Expo is in 28 days', link: { page: 'checklist', eventId: 'ev-1' },
    }));
  });

  it('expense reminders link to Expenses for that show', () => {
    expect(def('reminder.expenses_1d').build(eventRow(1))).toEqual(expect.objectContaining({
      kind: 'reminder.expenses_1d', title: 'Submit your expenses · Expo', link: { page: 'expenses', eventId: 'ev-1' },
    }));
    expect(def('reminder.expenses_7d').build(eventRow(7)).title).toBe('Reminder: submit your expenses · Expo');
  });

  it('flight reminders keep the wording of the service they replace', () => {
    const row = { subject_id: '12', user_id: 'u-1', event_id: 'ev-1', event_name: 'Expo', carrier: 'Delta', confirmation_number: 'ABC123' };
    expect(def('reminder.flight_checkin_24h').build(row)).toEqual({
      kind: 'reminder.flight_checkin_24h',
      title: '✈️ Time to check in',
      body: 'Delta departs in about 24 hours for Expo. Check in with your airline now. Confirmation ABC123.',
      link: { page: 'checklist', eventId: 'ev-1' },
    });
    expect(def('reminder.flight_departure_3h').build({ subject_id: '12', user_id: 'u-1', event_id: null, event_name: null, carrier: null, confirmation_number: null }))
      .toEqual({
        kind: 'reminder.flight_departure_3h',
        title: '🛫 Flight today',
        body: 'Your flight departs in about 3 hours. Time to head out.',
        link: null,
      });
    expect(def('reminder.flight_checkin_24h').dueSql).toContain("interval '24 hours'");
    expect(def('reminder.flight_departure_3h').dueSql).toContain("interval '3 hours'");
  });
});
```

```ts
// backend/tests/services/notifications/ReminderScheduler.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../src/config/database', () => ({ query: vi.fn() }));
vi.mock('../../../src/services/notifications/notifyMany', () => ({ notifyMany: vi.fn(async () => undefined) }));

import { query } from '../../../src/config/database';
import { notifyMany } from '../../../src/services/notifications/notifyMany';
import { ReminderScheduler } from '../../../src/services/notifications/ReminderScheduler';

const rows = (r: unknown[]) => ({ rows: r } as any);
const DEF = {
  kind: 'reminder.test', dueSql: 'SELECT due',
  build: (row: any) => ({ kind: 'reminder.test', title: `T ${row.subject_id}`, body: 'B', link: null }),
};
const due = (subject_id: string, user_id: string) => ({ subject_id, user_id });

describe('ReminderScheduler.scan', () => {
  beforeEach(() => vi.clearAllMocks());

  it('claims the ledger row first, then notifies', async () => {
    vi.mocked(query)
      .mockResolvedValueOnce(rows([due('ev-1', 'u-1')]))
      .mockResolvedValueOnce(rows([{ kind: 'reminder.test' }]));
    await new ReminderScheduler([DEF]).scan();
    const calls = vi.mocked(query).mock.calls;
    expect(calls[0]).toEqual(['SELECT due', ['reminder.test']]);
    expect(String(calls[1][0])).toMatch(/INSERT INTO notification_reminders \(kind, subject_id, user_id\)/);
    expect(String(calls[1][0])).toMatch(/ON CONFLICT \(kind, subject_id, user_id\) DO NOTHING/);
    expect(calls[1][1]).toEqual(['reminder.test', 'ev-1', 'u-1']);
    expect(notifyMany).toHaveBeenCalledWith(['u-1'], expect.objectContaining({ title: 'T ev-1' }));
    expect(vi.mocked(query).mock.invocationCallOrder[1]).toBeLessThan(vi.mocked(notifyMany).mock.invocationCallOrder[0]);
  });

  it('does not notify when another pass already claimed the row', async () => {
    vi.mocked(query).mockResolvedValueOnce(rows([due('ev-1', 'u-1')])).mockResolvedValueOnce(rows([]));
    await new ReminderScheduler([DEF]).scan();
    expect(notifyMany).not.toHaveBeenCalled();
  });

  it('one failing claim does not stop the next recipient', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(query)
      .mockResolvedValueOnce(rows([due('ev-1', 'u-1'), due('ev-1', 'u-2')]))
      .mockRejectedValueOnce(new Error('claim failed'))
      .mockResolvedValueOnce(rows([{ kind: 'reminder.test' }]));
    await new ReminderScheduler([DEF]).scan();
    expect(vi.mocked(notifyMany).mock.calls.map((c) => c[0])).toEqual([['u-2']]);
    err.mockRestore();
  });

  it('one failing definition does not stop the next, and scan never throws', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(query)
      .mockRejectedValueOnce(new Error('bad sql'))
      .mockResolvedValueOnce(rows([due('ev-2', 'u-3')]))
      .mockResolvedValueOnce(rows([{ kind: 'reminder.other' }]));
    const other = { ...DEF, kind: 'reminder.other' };
    await expect(new ReminderScheduler([DEF, other]).scan()).resolves.toBeUndefined();
    expect(vi.mocked(notifyMany).mock.calls.map((c) => c[0])).toEqual([['u-3']]);
    err.mockRestore();
  });

  it('a scan that overlaps a running one is skipped', async () => {
    let release!: (v: any) => void;
    vi.mocked(query).mockReturnValueOnce(new Promise((r) => { release = r; }) as any);
    const scheduler = new ReminderScheduler([DEF]);
    const first = scheduler.scan();
    await scheduler.scan();
    expect(query).toHaveBeenCalledTimes(1);
    release(rows([]));
    await first;
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run (from `backend/`): `npx vitest run tests/services/notifications/reminderDefinitions.test.ts tests/services/notifications/ReminderScheduler.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement the definitions**

```ts
// backend/src/services/notifications/reminderDefinitions.ts
/**
 * Every scheduled reminder Argo sends. A definition is a query for who is
 * due (and not yet in the ledger) plus the words to send. Windows, not
 * deadlines: an event created inside a window still gets that reminder, and
 * one created after it never gets it late.
 */
import type { NotifyInput } from '../NotificationService';

export interface DueRow { subject_id: string; user_id: string; [key: string]: unknown }

export interface ReminderDefinition {
  kind: string;
  /** $1 = kind. Returns rows not yet claimed in notification_reminders. */
  dueSql: string;
  build(row: DueRow): NotifyInput;
}

/** When the trip starts: travel start, or show start if no travel date. */
const DAYS_UNTIL_EVENT = `(COALESCE(e.travel_start_date, e.show_start_date)::date - CURRENT_DATE)`;
/** Days since the show closed. */
const DAYS_SINCE_SHOW = `(CURRENT_DATE - COALESCE(e.show_end_date, e.end_date)::date)`;

function eventDueSql(daysExpr: string, from: number, to: number): string {
  return `
    SELECT e.id::text AS subject_id, ep.user_id, e.id AS event_id, e.name AS event_name,
           ${daysExpr} AS days
      FROM events e
      JOIN event_participants ep ON ep.event_id = e.id
      JOIN users u ON u.id = ep.user_id
     WHERE e.status <> 'cancelled'
       AND u.is_active
       AND ${daysExpr} BETWEEN ${from} AND ${to}
       AND NOT EXISTS (
         SELECT 1 FROM notification_reminders r
          WHERE r.kind = $1 AND r.subject_id = e.id::text AND r.user_id = ep.user_id
       )`;
}

function flightDueSql(hours: number): string {
  return `
    SELECT f.id::text AS subject_id, f.attendee_id AS user_id, e.id AS event_id, e.name AS event_name,
           f.carrier, f.confirmation_number
      FROM checklist_flights f
      JOIN event_checklists c ON c.id = f.checklist_id
      LEFT JOIN events e ON e.id = c.event_id
      JOIN users u ON u.id = f.attendee_id
     WHERE f.booked = true
       AND u.is_active
       AND f.departure_at IS NOT NULL
       AND f.departure_at > now()
       AND f.departure_at <= now() + interval '${hours} hours'
       AND NOT EXISTS (
         SELECT 1 FROM notification_reminders r
          WHERE r.kind = $1 AND r.subject_id = f.id::text AND r.user_id = f.attendee_id
       )`;
}

const countdown = (days: unknown): string => {
  const n = Number(days);
  if (n <= 0) return 'today';
  if (n === 1) return 'tomorrow';
  return `in ${n} days`;
};

const eventLink = (row: DueRow, page: 'checklist' | 'expenses') =>
  row.event_id ? { page, eventId: String(row.event_id) } : null;

const flightLabel = (row: DueRow): string => (row.carrier ? String(row.carrier) : 'Your flight');
const confirmationSuffix = (row: DueRow): string =>
  row.confirmation_number ? ` Confirmation ${row.confirmation_number}.` : '';

export const REMINDER_DEFINITIONS: ReminderDefinition[] = [
  {
    kind: 'reminder.event_30d',
    dueSql: eventDueSql(DAYS_UNTIL_EVENT, 23, 30),
    build: (row) => ({
      kind: 'reminder.event_30d',
      title: `${row.event_name} is ${countdown(row.days)}`,
      body: `Check that your flight and hotel for ${row.event_name} are booked, and look over the checklist.`,
      link: eventLink(row, 'checklist'),
    }),
  },
  {
    kind: 'reminder.event_7d',
    dueSql: eventDueSql(DAYS_UNTIL_EVENT, 0, 7),
    build: (row) => ({
      kind: 'reminder.event_7d',
      title: `${row.event_name} is ${countdown(row.days)}`,
      body: `Check your travel details for ${row.event_name} and finish anything left on your checklist.`,
      link: eventLink(row, 'checklist'),
    }),
  },
  {
    kind: 'reminder.expenses_1d',
    dueSql: eventDueSql(DAYS_SINCE_SHOW, 1, 6),
    build: (row) => ({
      kind: 'reminder.expenses_1d',
      title: `Submit your expenses · ${row.event_name}`,
      body: `${row.event_name} has wrapped up. Submit your receipts and expenses while they are fresh.`,
      link: eventLink(row, 'expenses'),
    }),
  },
  {
    kind: 'reminder.expenses_7d',
    dueSql: eventDueSql(DAYS_SINCE_SHOW, 7, 13),
    build: (row) => ({
      kind: 'reminder.expenses_7d',
      title: `Reminder: submit your expenses · ${row.event_name}`,
      body: `It has been a week since ${row.event_name} ended. If you still have expenses to submit, please submit them now.`,
      link: eventLink(row, 'expenses'),
    }),
  },
  {
    kind: 'reminder.flight_checkin_24h',
    dueSql: flightDueSql(24),
    build: (row) => ({
      kind: 'reminder.flight_checkin_24h',
      title: '✈️ Time to check in',
      body: `${flightLabel(row)} departs in about 24 hours${row.event_name ? ` for ${row.event_name}` : ''}. Check in with your airline now.${confirmationSuffix(row)}`,
      link: eventLink(row, 'checklist'),
    }),
  },
  {
    kind: 'reminder.flight_departure_3h',
    dueSql: flightDueSql(3),
    build: (row) => ({
      kind: 'reminder.flight_departure_3h',
      title: '🛫 Flight today',
      body: `${flightLabel(row)} departs in about 3 hours. Time to head out.${confirmationSuffix(row)}`,
      link: eventLink(row, 'checklist'),
    }),
  },
];
```

- [ ] **Step 4: Implement the scheduler**

```ts
// backend/src/services/notifications/ReminderScheduler.ts
/**
 * One loop for every scheduled reminder (see reminderDefinitions.ts).
 *
 * Send-once guarantee: a notification_reminders row is inserted (ON CONFLICT
 * DO NOTHING) BEFORE the notification goes out. A conflict means another
 * pass or instance already handled it. A crash between the claim and the
 * send loses that one reminder and never duplicates it.
 *
 * Runs whether or not push is configured: the bell row is the durable half.
 */
import { query } from '../../config/database';
import { notifyMany } from './notifyMany';
import { REMINDER_DEFINITIONS, ReminderDefinition, DueRow } from './reminderDefinitions';

const SCAN_INTERVAL_MS = 5 * 60 * 1000; // flight reminders need the 5-minute grain
const STARTUP_DELAY_MS = 15 * 1000; // let DB/migrations settle

export class ReminderScheduler {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly definitions: ReminderDefinition[] = REMINDER_DEFINITIONS) {}

  start(): void {
    if (this.timer) return;
    setTimeout(() => void this.scan(), STARTUP_DELAY_MS);
    this.timer = setInterval(() => void this.scan(), SCAN_INTERVAL_MS);
    console.log(`[Reminders] Scheduler started (every 5 minutes: ${this.definitions.map((d) => d.kind).join(', ')})`);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** One pass over every definition. Never throws. */
  async scan(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      for (const definition of this.definitions) {
        try {
          await this.process(definition);
        } catch (error) {
          console.error(`[Reminders] Scan failed for ${definition.kind}:`, error);
        }
      }
    } finally {
      this.running = false;
    }
  }

  private async process(definition: ReminderDefinition): Promise<void> {
    const due = await query(definition.dueSql, [definition.kind]);
    for (const row of due.rows as DueRow[]) {
      // Per recipient: one failed claim must not abort the rest of the pass.
      try {
        const claimed = await query(
          `INSERT INTO notification_reminders (kind, subject_id, user_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (kind, subject_id, user_id) DO NOTHING
           RETURNING kind`,
          [definition.kind, row.subject_id, row.user_id]
        );
        if (claimed.rows.length === 0) continue; // another pass/instance got it
        await notifyMany([row.user_id], definition.build(row));
        console.log(`[Reminders] Sent ${definition.kind} for ${row.subject_id} to user ${row.user_id}`);
      } catch (error) {
        console.error(`[Reminders] ${definition.kind} failed for ${row.subject_id}, user ${row.user_id}:`, error);
      }
    }
  }
}

export const reminderScheduler = new ReminderScheduler();
```

Append to `backend/src/services/notifications/index.ts`:

```ts
export { ReminderScheduler, reminderScheduler } from './ReminderScheduler';
export { REMINDER_DEFINITIONS } from './reminderDefinitions';
export type { ReminderDefinition, DueRow } from './reminderDefinitions';
```

- [ ] **Step 5: Run the unit tests**

Run (from `backend/`): `npx vitest run tests/services/notifications/reminderDefinitions.test.ts tests/services/notifications/ReminderScheduler.test.ts`
Expected: all PASS.

- [ ] **Step 6: Write the real-database window test**

```ts
// backend/tests/integration/reminder-windows.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool, query } from '../../src/config/database';
import { REMINDER_DEFINITIONS } from '../../src/services/notifications/reminderDefinitions';

/**
 * Real-database proof of the reminder windows. The windows live in SQL, so
 * only Postgres can say which events are due on a given day.
 */
const PREFIX = `reminder-windows-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let userId: string;
let inactiveUserId: string;
const eventIds = new Map<string, string>();

/** Offsets are days from today. travel = null means "no travel date". */
async function mkEvent(tag: string, travel: number | null, showStart: number, showEnd: number, status = 'upcoming') {
  const { rows } = await query(
    `INSERT INTO events (name, venue, city, state, start_date, end_date,
                         show_start_date, show_end_date, travel_start_date, travel_end_date, status)
     VALUES ($1, 'v', 'c', 's',
             CURRENT_DATE + $3::int, CURRENT_DATE + $4::int,
             CURRENT_DATE + $3::int, CURRENT_DATE + $4::int,
             CASE WHEN $2::int IS NULL THEN NULL ELSE CURRENT_DATE + $2::int END,
             CURRENT_DATE + $4::int, $5)
     RETURNING id`,
    [`${PREFIX}-${tag}`, travel, showStart, showEnd, status]
  );
  eventIds.set(tag, rows[0].id);
  await query(`INSERT INTO event_participants (event_id, user_id) VALUES ($1, $2), ($1, $3)`, [rows[0].id, userId, inactiveUserId]);
}

async function dueTags(kind: string): Promise<string[]> {
  const def = REMINDER_DEFINITIONS.find((d) => d.kind === kind)!;
  const { rows } = await query(def.dueSql, [kind]);
  const byId = new Map([...eventIds].map(([tag, id]) => [id, tag]));
  return rows
    .filter((r: any) => byId.has(r.subject_id))
    .map((r: any) => { expect(r.user_id).toBe(userId); return byId.get(r.subject_id)!; })
    .sort();
}

beforeAll(async () => {
  const mkUser = async (tag: string, active: boolean) => (await query(
    `INSERT INTO users (username, password, name, email, role, is_active) VALUES ($1, 'x', $2, $3, 'salesperson', $4) RETURNING id`,
    [`${PREFIX}-${tag}`, `${PREFIX} ${tag}`, `${PREFIX}-${tag}@example.test`, active]
  )).rows[0].id as string;
  userId = await mkUser('active', true);
  inactiveUserId = await mkUser('inactive', false);

  // Upcoming shows: travel starts N days out, show runs N+1 .. N+3.
  for (const n of [31, 30, 23, 22, 8, 7, 0]) await mkEvent(`in-${n}`, n, n + 1, n + 3);
  await mkEvent('started-yesterday', -1, 0, 2);
  await mkEvent('no-travel-date', null, 5, 7);
  await mkEvent('cancelled-in-5', 5, 6, 8, 'cancelled');
  await mkEvent('claimed-in-5', 5, 6, 8);
  await query(
    `INSERT INTO notification_reminders (kind, subject_id, user_id) VALUES ('reminder.event_7d', $1, $2)`,
    [eventIds.get('claimed-in-5'), userId]
  );

  // Finished shows: show ended N days ago.
  for (const n of [0, 1, 6, 7, 13, 14]) await mkEvent(`ended-${n}`, -n - 5, -n - 3, -n, 'completed');
  await mkEvent('cancelled-ended-2', -7, -5, -2, 'cancelled');
});

afterAll(async () => {
  const ids = [...eventIds.values()];
  await query(`DELETE FROM notification_reminders WHERE subject_id = ANY($1::text[])`, [ids]);
  await query(`DELETE FROM events WHERE id = ANY($1::uuid[])`, [ids]);
  await query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [[userId, inactiveUserId]]);
  await pool.end();
});

describe('reminder windows (real database)', () => {
  it('30-day reminder: days 30 down to 23 only', async () => {
    expect(await dueTags('reminder.event_30d')).toEqual(['in-23', 'in-30']);
  });

  it('7-day reminder: days 7 down to 0, show start as the anchor when there is no travel date, never cancelled or already claimed', async () => {
    expect(await dueTags('reminder.event_7d')).toEqual(['in-0', 'in-7', 'no-travel-date']);
  });

  it('first expense reminder: 1 to 6 days after the show ends', async () => {
    expect(await dueTags('reminder.expenses_1d')).toEqual(['ended-1', 'ended-6']);
  });

  it('second expense reminder: 7 to 13 days after the show ends', async () => {
    expect(await dueTags('reminder.expenses_7d')).toEqual(['ended-13', 'ended-7']);
  });
});
```

- [ ] **Step 7: Run it against the local database**

Run (from `backend/`): `npx vitest run tests/integration/reminder-windows.test.ts`
Expected: 4 tests PASS. If an insert fails on a column or constraint the local schema names differently, fix the test's insert to match the schema (not the definitions), and re-run.

- [ ] **Step 8: Swap the scheduler in `server.ts` and delete the old service**

In `backend/src/server.ts` replace line 42:

```ts
import { reminderScheduler } from './services/notifications';
```

and replace the two lines at 228–229 (`// Flight check-in / departure push reminders ...` and `travelReminderService.start();`) with:

```ts
    // Scheduled reminders: upcoming shows, post-show expenses, flight check-in
    // and departure (bell + push; runs even without push)
    reminderScheduler.start();
```

Then:

```bash
git rm backend/src/services/TravelReminderService.ts
sed -i '' 's/same pattern as TravelReminderService/same pattern as ReminderScheduler/' backend/src/services/ZohoCrmLeadsService.ts backend/src/services/sampleRequests/SampleRequestReminderService.ts
sed -i '' 's/Unlike TravelReminderService this does NOT idle when push is unconfigured —/Like ReminderScheduler, this does NOT idle when push is unconfigured —/' backend/src/services/ExpenseMessageScanner.ts
grep -rn "TravelReminderService\|travelReminderService" backend/src
```

Expected: the final `grep` prints nothing.

- [ ] **Step 9: Type check and run the notification tests**

Run (from `backend/`): `npx tsc --noEmit && npx vitest run tests/services/notifications tests/services/SampleRequestReminderService.test.ts`
Expected: no type errors, all PASS.

- [ ] **Step 10: Commit**

```bash
git add -A backend/src/services backend/src/server.ts backend/tests/services/notifications backend/tests/integration/reminder-windows.test.ts
git commit -m "feat(notifications): one reminder scheduler for upcoming shows, post-show expenses and flights"
```

---

### Task 10: Frontend deep links and push click handling

**Files:**
- Create: `src/utils/notificationLinks.ts`
- Modify: `src/utils/initialPageFromHash.ts`
- Modify: `src/components/layout/Header.tsx` (`openAppNotification`)
- Modify: `src/components/expenses/ExpenseSubmission.tsx` (the `openFromHash` effect)
- Modify: `src/App.tsx` (one new effect)
- Modify: `public/push-sw.js` (`notificationclick`)
- Test: `src/utils/__tests__/notificationLinks.test.ts`, `src/utils/__tests__/initialPageFromHash.test.ts`, `src/components/layout/__tests__/Header.notifications.test.tsx`

**Interfaces:**
- Consumes: `src/utils/__fixtures__/notificationLinks.json` (Task 2).
- Produces:
  - `interface NotificationTarget { page: string | null; hash: string | null }`
  - `notificationTarget(link: AppNotification['link']): NotificationTarget`
  - `hashFromPushUrl(url: unknown): string | null` (hash without the leading `#`)
  - `eventFilterFromHash(hash: string): string | null`
  - `PAGE_ONLY_HASHES: ReadonlySet<string>` (`'#booths'`, `'#leads'`)
  - `PAGE_ROLES: Record<string, string[]>`
  - `initialPageFromHash(hash): 'expenses' | 'checklist' | 'settings' | 'booths' | 'leads' | 'dashboard'`

- [ ] **Step 1: Write the failing tests**

```ts
// src/utils/__tests__/notificationLinks.test.ts
import { describe, it, expect } from 'vitest';
import cases from '../__fixtures__/notificationLinks.json';
import { notificationTarget, hashFromPushUrl, eventFilterFromHash, PAGE_ONLY_HASHES } from '../notificationLinks';
import { initialPageFromHash } from '../initialPageFromHash';

describe('notificationTarget (shared fixture with the backend)', () => {
  it.each(cases)('maps $link to page $page, hash $hash', ({ link, page, hash }) => {
    expect(notificationTarget(link as never)).toEqual({ page, hash });
  });

  it.each(cases.filter((c) => c.hash))('a cold push to $url opens the same page as a bell tap', ({ url, page }) => {
    expect(initialPageFromHash(url.slice(1))).toBe(page);
  });

  it.each(cases.filter((c) => c.hash))('the push URL $url carries the same hash as the bell tap', ({ url, hash }) => {
    expect(hashFromPushUrl(url)).toBe(hash);
  });
});

describe('hashFromPushUrl', () => {
  it('returns null for anything that is not a URL with a hash', () => {
    expect(hashFromPushUrl(undefined)).toBeNull();
    expect(hashFromPushUrl(null)).toBeNull();
    expect(hashFromPushUrl(42)).toBeNull();
    expect(hashFromPushUrl('/')).toBeNull();
    expect(hashFromPushUrl('/#')).toBeNull();
  });
  it('reads the hash from a relative or absolute URL', () => {
    expect(hashFromPushUrl('/#event=ev-1&tab=my')).toBe('event=ev-1&tab=my');
    expect(hashFromPushUrl('https://argo.example/#leads')).toBe('leads');
  });
});

describe('eventFilterFromHash', () => {
  it('reads the event from the event-card link and the notification link', () => {
    expect(eventFilterFromHash('#event=ev-1')).toBe('ev-1');
    expect(eventFilterFromHash('#expenses-event=ev-2')).toBe('ev-2');
  });
  it('returns null for other hashes', () => {
    expect(eventFilterFromHash('#expense=x')).toBeNull();
    expect(eventFilterFromHash('#status=pending')).toBeNull();
    expect(eventFilterFromHash('')).toBeNull();
  });
});

describe('PAGE_ONLY_HASHES', () => {
  it('holds the hashes that only choose a page', () => {
    expect([...PAGE_ONLY_HASHES].sort()).toEqual(['#booths', '#leads']);
  });
});
```

Add to `src/utils/__tests__/initialPageFromHash.test.ts`, inside the existing `describe`:

```ts
  it('routes an expenses-for-event link to expenses', () => { expect(initialPageFromHash('#expenses-event=x')).toBe('expenses'); });
  it('routes the users link to settings', () => { expect(initialPageFromHash('#users')).toBe('settings'); });
  it('routes the booth inventory link to booths', () => { expect(initialPageFromHash('#booths')).toBe('booths'); });
  it('routes the badge scans link to leads', () => { expect(initialPageFromHash('#leads')).toBe('leads'); });
  it('keeps an unknown hash on the dashboard', () => { expect(initialPageFromHash('#nope')).toBe('dashboard'); });
```

Add to `src/components/layout/__tests__/Header.notifications.test.tsx`, directly after the existing `'deep-links a samples row to the samples tab'` test:

```ts
  it.each([
    [{ page: 'expenses', eventId: 'ev-3' }, '#expenses-event=ev-3', 'expenses'],
    [{ page: 'admin-users' }, '#users', 'settings'],
    [{ page: 'booth-inventory' }, '#booths', 'booths'],
    [{ page: 'badge-scans' }, '#leads', 'leads'],
  ])('deep-links %o to %s on the %s page', async (link, hash, page) => {
    mockRows([row({ link })]);
    const onNavigate = vi.fn();
    renderHeader(onNavigate);
    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }));
    fireEvent.click(await screen.findByText('Sample request open · Expo'));
    expect(window.location.hash).toBe(hash);
    expect(onNavigate).toHaveBeenCalledWith(page);
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run (from the repo root): `npx vitest run src/utils/__tests__/notificationLinks.test.ts src/utils/__tests__/initialPageFromHash.test.ts src/components/layout/__tests__/Header.notifications.test.tsx`
Expected: FAIL: `notificationLinks` module not found, the four new `initialPageFromHash` routes return `dashboard`, and the four new Header rows do not navigate.

- [ ] **Step 3: Implement the link util**

```ts
// src/utils/notificationLinks.ts
/**
 * Where a notification takes you. The backend builds push URLs from the same
 * table (linkToUrl in backend/src/services/NotificationService.ts);
 * __fixtures__/notificationLinks.json is asserted by both sides.
 */
import type { AppNotification } from './notificationsApi';

export interface NotificationTarget { page: string | null; hash: string | null }

const NOWHERE: NotificationTarget = { page: null, hash: null };

/** Links that need an event id. */
const EVENT_TARGETS = new Map<string, (eventId: string) => NotificationTarget>([
  ['checklist', (id) => ({ page: 'checklist', hash: `event=${id}&tab=my` })],
  ['samples', (id) => ({ page: 'checklist', hash: `event=${id}&tab=samples` })],
  ['expenses', (id) => ({ page: 'expenses', hash: `expenses-event=${id}` })],
]);

/** Links that only pick a page. */
const PAGE_TARGETS = new Map<string, NotificationTarget>([
  ['admin-users', { page: 'settings', hash: 'users' }],
  ['booth-inventory', { page: 'booths', hash: 'booths' }],
  ['badge-scans', { page: 'leads', hash: 'leads' }],
]);

export function notificationTarget(link: AppNotification['link']): NotificationTarget {
  if (!link) return NOWHERE;
  const forEvent = EVENT_TARGETS.get(link.page);
  if (forEvent) return link.eventId ? forEvent(link.eventId) : NOWHERE;
  return PAGE_TARGETS.get(link.page) ?? NOWHERE;
}

/** Hash (no leading #) carried by a push URL such as "/#event=…", or null. */
export function hashFromPushUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  const at = url.indexOf('#');
  if (at < 0) return null;
  return url.slice(at + 1) || null;
}

/** The show to filter Expenses to, from an event card or a notification. */
export function eventFilterFromHash(hash: string): string | null {
  if (!hash.startsWith('#event=') && !hash.startsWith('#expenses-event=')) return null;
  const params = new URLSearchParams(hash.slice(1));
  return params.get('event') ?? params.get('expenses-event');
}

/**
 * Hashes that only choose a page. App clears them once applied, so a later
 * reload does not drag the user back there.
 */
export const PAGE_ONLY_HASHES: ReadonlySet<string> = new Set(['#booths', '#leads']);

/** Pages a deep link may only open for these roles (mirrors App's render guards). */
export const PAGE_ROLES: Record<string, string[]> = {
  booths: ['admin', 'coordinator', 'developer'],
  leads: ['admin', 'coordinator', 'salesperson', 'developer'],
};
```

- [ ] **Step 4: Implement `initialPageFromHash`**

Replace the whole file `src/utils/initialPageFromHash.ts`:

```ts
/**
 * The page App mounts on first paint for a cold deep link. A push or email
 * click lands with no in-app onNavigate call, so the hash alone picks it:
 *  - `#expense=<id>`                 → expenses (ExpenseSubmission reads it)
 *  - `#expenses-event=<id>`          → expenses, filtered to that show
 *  - `#event=<id>&tab=my|samples`    → checklist (TradeShowChecklist reads it)
 *  - `#users`                        → settings (AdminSettings opens Users)
 *  - `#booths`, `#leads`             → booth inventory, badge scans
 *  - anything else, incl. a bare `#event=<id>` → dashboard (unchanged)
 */
export type InitialPage = 'expenses' | 'checklist' | 'settings' | 'booths' | 'leads' | 'dashboard';

export function initialPageFromHash(hash: string): InitialPage {
  if (hash.startsWith('#expense=') || hash.startsWith('#expenses-event=')) return 'expenses';
  if (hash === '#users') return 'settings';
  if (hash === '#booths') return 'booths';
  if (hash === '#leads') return 'leads';
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const tab = params.get('tab');
  if (params.has('event') && (tab === 'my' || tab === 'samples')) return 'checklist';
  return 'dashboard';
}
```

- [ ] **Step 5: Use the table in `Header.tsx`**

Add the import below the `notificationsApi` import:

```ts
import { notificationTarget } from '../../utils/notificationLinks';
```

Replace the `if (n.link?.page === 'checklist' ...) { ... } else if (...) { ... }` chain at the end of `openAppNotification` with:

```ts
    const target = notificationTarget(n.link);
    if (target.hash) window.location.hash = target.hash;
    if (target.page) onNavigate?.(target.page);
```

- [ ] **Step 6: Accept the notification hash in `ExpenseSubmission.tsx`**

Add the import beside the other `utils` imports:

```ts
import { eventFilterFromHash } from '../../utils/notificationLinks';
```

In the `openFromHash` effect, replace the branch

```ts
      } else if (window.location.hash.startsWith('#event=')) {
        // Deep link from an event card: land pre-filtered to that show
        setEventFilter(new URLSearchParams(window.location.hash.slice(1)).get('event') ?? '');
        history.replaceState(null, '', window.location.pathname + window.location.search);
```

with

```ts
      } else if (eventFilterFromHash(window.location.hash) !== null) {
        // Deep link from an event card or an expense reminder: land
        // pre-filtered to that show
        setEventFilter(eventFilterFromHash(window.location.hash) ?? '');
        history.replaceState(null, '', window.location.pathname + window.location.search);
```

- [ ] **Step 7: Handle deep links that arrive while the app is open, in `App.tsx`**

Add the import below the `initialPageFromHash` import:

```ts
import { hashFromPushUrl, PAGE_ONLY_HASHES, PAGE_ROLES } from './utils/notificationLinks';
```

Add these two effects directly below the `const notifications = useNotifications();` line (above every early `return`, so hook order never changes):

```ts
  // Deep links that arrive while the app is already open. A tapped push
  // reaches us as a message from the push service worker; a bell tap on a
  // page-only link sets a hash that nothing else consumes.
  useEffect(() => {
    const applyPageOnlyHash = () => {
      const hash = window.location.hash;
      if (!PAGE_ONLY_HASHES.has(hash)) return;
      setCurrentPage(initialPageFromHash(hash));
      history.replaceState(null, '', window.location.pathname + window.location.search);
    };
    const onWorkerMessage = (event: MessageEvent) => {
      if (event.data?.type !== 'notification-click') return;
      const hash = hashFromPushUrl(event.data.url);
      if (!hash) return;
      setCurrentPage(initialPageFromHash(`#${hash}`));
      window.location.hash = hash;
    };
    applyPageOnlyHash();
    window.addEventListener('hashchange', applyPageOnlyHash);
    navigator.serviceWorker?.addEventListener('message', onWorkerMessage);
    return () => {
      window.removeEventListener('hashchange', applyPageOnlyHash);
      navigator.serviceWorker?.removeEventListener('message', onWorkerMessage);
    };
  }, []);

  // A deep link never strands someone on a page their role cannot open.
  useEffect(() => {
    if (!user) return;
    const allowed = PAGE_ROLES[currentPage];
    if (allowed && !allowed.includes(user.role)) setCurrentPage('dashboard');
  }, [user, currentPage]);
```

- [ ] **Step 8: Make the service worker pass the link to an open window**

In `public/push-sw.js`, replace the body of the `for` loop inside `notificationclick`:

```js
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if ('focus' in client) {
          // The app is already open: tell it where to go, then bring it forward.
          // App.tsx listens for this and routes exactly as it would on a cold start.
          client.postMessage({ type: 'notification-click', url: url });
          return client.focus();
        }
      }
```

- [ ] **Step 9: Run the tests, lint and build**

Run (from the repo root): `npx vitest run src/utils/__tests__/notificationLinks.test.ts src/utils/__tests__/initialPageFromHash.test.ts src/components/layout/__tests__/Header.notifications.test.tsx && npm run lint && npm run build`
Expected: the three test files PASS; lint reports no new errors in the files this task touched; the build succeeds.

- [ ] **Step 10: Check it by hand in the running app**

Run `npm run start:all`, log in as `admin` / `password123`, then in the browser console:

```js
window.location.hash = 'leads'
```

Expected: the app switches to the Leads page and the hash disappears from the address bar. Repeat with `'booths'` (Booth inventory), `'users'` (Admin settings, Users tab) and `'expenses-event=<an event id from the Events page>'` (Expenses, filtered to that show). Then, still in the console, simulate a push tap on an open app:

```js
navigator.serviceWorker.dispatchEvent(new MessageEvent('message', { data: { type: 'notification-click', url: '/#leads' } }))
```

Expected: the app switches to Leads. A message with `url: '/'` or no `url` changes nothing and logs no error.

- [ ] **Step 11: Commit**

```bash
git add src/utils/notificationLinks.ts src/utils/initialPageFromHash.ts src/utils/__tests__/notificationLinks.test.ts src/utils/__tests__/initialPageFromHash.test.ts src/components/layout/Header.tsx src/components/layout/__tests__/Header.notifications.test.tsx src/components/expenses/ExpenseSubmission.tsx src/App.tsx public/push-sw.js
git commit -m "feat(notifications): deep links for the new notification types, and push taps that navigate an open app"
```

---

### Task 11: Release v2.32.0

**Files:**
- Modify: `package.json`, `package-lock.json`, `backend/package.json`, `backend/package-lock.json` (version)
- Modify: `CHANGELOG.md`, `CLAUDE.md`, `docs/ARCHITECTURE.md`

**Interfaces:**
- Consumes: everything above.
- Produces: branch merged to `main`, pushed, deployed to production, verified.

- [ ] **Step 1: Full verification**

Run (from `backend/`): `npx tsc --noEmit && npx vitest run --exclude 'tests/integration/**' && npx vitest run tests/integration/notification-catalog-schema.test.ts tests/integration/reminder-windows.test.ts && npm run build`
Expected: no type errors; every unit and route test PASS; both integration files PASS; build succeeds.

Run (from the repo root): `npm run lint && npx vitest run src/utils src/components/layout && npm run build`
Expected: lint clean for touched files; those two directories PASS; build succeeds.

- [ ] **Step 2: Bump the version in both packages**

```bash
npm version 2.32.0 --no-git-tag-version
(cd backend && npm version 2.32.0 --no-git-tag-version)
```

- [ ] **Step 3: Changelog**

In `CHANGELOG.md`, add directly below `## [Unreleased]`:

```markdown
## [2.32.0] - 2026-10-08 - Notifications for events, booths, travel and reminders

### Added
- **Event notifications.** You are told when you are added to or removed from a show, when its dates, venue or city change (with the old and new value), and when it is cancelled.
- **Booth notifications.** Everyone on a show is told when the booth is ordered, when it ships (with carrier and tracking number) and when the booth map is uploaded.
- **Upcoming-show reminders** about 30 days and 7 days before travel starts.
- **Submit-your-expenses reminders** the day after a show ends and again a week later, to everyone who attended.
- **New user awaiting approval.** Admins and developers are told when someone registers or signs in with SSO for the first time and needs a role.
- **Booth component reported.** Admins and coordinators are told when a booth inventory piece is reported damaged or missing.
- **Badge scan failed.** The person who scanned a badge is told when the lead could not be sent to Zoho CRM after every retry.

### Changed
- **Flight, hotel and car rental notifications now appear in the bell**, not only as a push, and you are also told when a booking is changed, cancelled or moved to someone else.
- **Flight check-in and departure reminders now appear in the bell** and no longer depend on push being configured.
- Tapping a push notification while Argo is already open now takes you to the right page. Before, it only brought the window forward.
- Whoever makes a change is no longer notified about their own change.

### Technical
- New `backend/src/services/notifications/` catalog: one function per trigger. `ReminderScheduler` replaces `TravelReminderService`.
- Migration `045_notification_catalog.sql`: `notification_reminders` ledger (existing flight reminders carried over) and `badge_scans.crm_failure_notified_at`.
```

- [ ] **Step 4: Docs**

In `CLAUDE.md`, add this bullet directly after the `sampleRequests/` bullet in "Key service boundaries":

```markdown
- **`notifications/`** — The notification catalog: one named function per
  trigger (`eventNotifications`, `boothNotifications`, `travelNotifications`,
  `adminNotifications`). `recipients.ts` is the only place that decides who
  is told; the actor and inactive users never are. Callers fire-and-forget
  after their write commits. `ReminderScheduler` runs every definition in
  `reminderDefinitions.ts` through the `notification_reminders` send-once
  ledger. Link → URL lives in `linkToUrl` and is mirrored by
  `src/utils/notificationLinks.ts`; both are asserted against
  `src/utils/__fixtures__/notificationLinks.json`.
```

In `docs/ARCHITECTURE.md`, replace the line `` `NotificationService` writes a `notifications` row and a push in one call. `` with:

```markdown
`NotificationService` writes a `notifications` row and a push in one call.

## 10. Notification catalog

`backend/src/services/notifications/` holds every trigger Argo notifies
about, one function each:

| File | Triggers |
|---|---|
| `eventNotifications.ts` | added, removed, details changed, cancelled |
| `boothNotifications.ts` | booth ordered, shipped, map uploaded, component reported |
| `travelNotifications.ts` | flight, hotel and car rental booked, changed, cancelled, reassigned |
| `adminNotifications.ts` | new user awaiting approval, badge scan failed to reach the CRM |
| `reminderDefinitions.ts` | show in 30 / 7 days, expenses 1 / 7 days after, flight check-in and departure |

Rules: every trigger goes through `notificationService.notify()` (one bell
row, one push); the actor and inactive users are never recipients
(`recipients.ts`); routes call the catalog fire-and-forget after their write
commits, so a notification failure never fails a request. For edits the
route hands over the row before and after, and pure functions
(`diffEventDetails`, `classifyBooking`) decide whether anything is worth
sending.

`ReminderScheduler` runs every 5 minutes. Each definition is a query for who
is due inside a window plus the words to send. A `notification_reminders`
row is claimed before sending, so each reminder fires once per kind, subject
and user.

A notification's `link` maps to a hash URL in `linkToUrl` (backend, for
pushes) and to a page and hash in `src/utils/notificationLinks.ts` (frontend,
for bell taps). `src/utils/__fixtures__/notificationLinks.json` is asserted
by both. A push tapped while the app is open reaches `App.tsx` as a
`notification-click` message from `public/push-sw.js`.

The pending-expense bell and the expense-message bell are separate and are
replaced by the Midas expense notifications spec.
```

- [ ] **Step 5: Commit the release**

```bash
git add package.json package-lock.json backend/package.json backend/package-lock.json CHANGELOG.md CLAUDE.md docs/ARCHITECTURE.md
git commit -m "chore(release): 2.32.0"
```

- [ ] **Step 6: Merge and push**

```bash
git checkout main
git merge --no-ff feat/notification-catalog -m "Merge branch 'feat/notification-catalog'"
git push origin main
```

- [ ] **Step 7: Deploy to production, backend first**

Check the targets first: `cat deployment-config.json` and confirm the production backend and frontend containers are the ones `scripts/deploy-production-backend.sh` and `scripts/deploy-production-frontend.sh` name. Do not run `deploy-sandbox.sh`.

```bash
./scripts/deploy-production-backend.sh
./scripts/deploy-production-frontend.sh
```

Expected: the backend script reports deployed version `2.32.0` from `http://localhost:3000/api/health` inside the backend container. After the frontend deploy, clear the NPMplus proxy cache (Proxmox container 104) as `CLAUDE.md` describes.

- [ ] **Step 8: Verify production**

1. `curl -s https://argo.booute.duckdns.org/api/health` reports version `2.32.0`.
2. Migration 045 applied. `migrate.ts` silently skips a migration on a permissions error (42501), so check the table itself in the production database (`expense_app_production`):

```sql
SELECT to_regclass('public.notification_reminders') IS NOT NULL AS ledger,
       EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name = 'badge_scans' AND column_name = 'crm_failure_notified_at') AS badge_column;
```

Expected: both `true`. If reading the production database is blocked from this session, ask the user to run the query and report the result; do not mark the release verified without it.

3. The backend log shows `[Reminders] Scheduler started` and, within a minute, one `[Reminders] Sent ...` line per reminder whose window a current show is already inside. That one-time burst is expected (see the spec's Rollout section).
4. On a phone with the PWA installed: have an admin add you to a test show and confirm the bell row, the push, and that tapping the push opens that show's checklist, both with Argo closed and with it open.

- [ ] **Step 9: Record what changed for next time**

Write `notification-catalog-state.md` in the project memory directory (`/Users/sahilkhatri/.claude/projects/-Users-sahilkhatri-Work-trade-show-app/memory/`) recording: v2.32.0 is live with the notification catalog; spec 2 (expense notifications via Midas, including removing Argo's pending-expense bell) is the next piece; the poll-versus-webhook choice for Midas → Argo is still open and the user allows webhooks in both repos. Add its one-line pointer to `MEMORY.md`.
