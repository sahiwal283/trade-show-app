# Midas Expense Notifications Implementation Plan (Argo)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Argo users are told in Argo's one bell list (and by push) when Midas approves, rejects, asks about, messages on or pays their expense, exactly once per event, and the browser-computed "pending expenses" and separate "messages" bell sections are removed for every role.

**Architecture:** A `MidasEventScanner` pulls Midas's ordered event feed (`GET /ext/events`) with a stored cursor, turns each event into a notification through a new catalog file, and writes it with the event id as a dedupe key. A signed ping endpoint triggers an immediate pull; the 2-minute timer stays as the safety net. Conversation notifications are marked read when the user opens that expense's thread.

**Tech Stack:** Express + TypeScript, raw `pg` queries, Vitest, React + Vite. Builds on the v2.32.0 notification catalog (`backend/src/services/notifications/`).

**Spec:** `docs/superpowers/specs/2026-10-08-midas-expense-notifications-design.md`. The Midas half is a separate plan: `~/Work/midas/docs/superpowers/plans/2026-10-08-ext-events-and-needs-review.md`.

## Global Constraints

- Branch: `feat/midas-expense-notifications` (exists; the spec is committed on it). Target release **v2.33.0**.
- Every notification goes through `notificationService.notify()` (via `notifyMany`). One bell row and one push per Midas event, never more: the event's `id` is the dedupe key, and the push is sent only when a row was actually inserted.
- `kind` values are exactly: `expense.approved`, `expense.rejected`, `expense.info_requested`, `expense.message`, `expense.mention`, `expense.reimbursement_paid`, `expense.incomplete`. Midas types map to them as `approved`, `rejected`, `action_required`, `message`, `mention`, `reimbursement_paid`, `expense_incomplete`.
- New link page: `expense` with `expenseId` (Argo's own expense id, the feed's `expense.sourceRefId`). Push URL `/#expense=<id>`, app page `expenses`.
- An event for an unknown user, an inactive user, a non-UUID `externalUserId` or an unknown `type` is skipped and logged, and the cursor still advances. A database or Midas failure leaves the cursor where it was.
- The ping endpoint is `POST /api/midas/events-ping`, unauthenticated by session. It accepts only a valid `X-Midas-Signature` (hex HMAC-SHA256 of the `X-Midas-Timestamp` string, keyed with env `MIDAS_EVENTS_PING_SECRET`, constant-time compare) with a timestamp within 300 seconds of now. Valid → `202` and trigger a scan. Anything else, or no secret configured → `401` and nothing else.
- The feed contract fixture `backend/tests/fixtures/midasEvents.json` is byte-identical to `apps/api/src/__tests__/fixtures/extEvents.json` in the Midas repo. Do not reformat it.
- Raw parameterized SQL only. Schema changes only in the new file `046_midas_event_notifications.sql`; never edit an existing migration.
- Backend tests run from `backend/`: `npx vitest run <path>`. Frontend tests run from the repo root: `npx vitest run <path>`. The frontend suite has about 90 unrelated failures on `main`; judge frontend changes by the files a task touches.
- Do not use `git stash`. Do not push, merge or deploy.
- Every commit message ends with a `Co-Authored-By: Claude <model> <noreply@anthropic.com>` trailer on its own line.

## Review Focus

1. **The same feed page is read twice (crash after insert, before the cursor moves).** Expected: no second bell row and no second push. Pinned in Task 1 (repository and service) and Task 4 (scanner).
2. **An event names a user Argo does not have, or `externalUserId` is not a UUID.** Expected: skipped, logged, the cursor advances, later events in the same page are delivered. Pinned in Task 3 and Task 4.
3. **A ping arrives while a scan is running.** Expected: no overlapping scan; one more scan runs right after the current one so the new event is not left waiting two minutes. Pinned in Task 4.
4. **A forged, replayed or unsigned ping.** Expected: `401`, no scan, no error thrown; a signature of the wrong length does not crash the comparison. Pinned in Task 5.
5. **A user had unread message notifications in the old table at cutover.** Expected: they appear in the general bell after the migration and clear when the thread is opened. Pinned in Task 1 (migration test) and Task 6.

## File Structure

New:

| File | Responsibility |
|---|---|
| `backend/src/database/migrations/046_midas_event_notifications.sql` | `notifications.source_event_id` + carry-over of unread message notifications |
| `backend/src/services/notifications/expenseNotifications.ts` | Midas event → notification (kind, wording, link) and delivery |
| `backend/src/services/midas/MidasEventScanner.ts` | Pull loop, cursor, single-flight, `trigger()` |
| `backend/src/routes/midasPing.ts` | Signature check and the ping route |
| `backend/tests/fixtures/midasEvents.json` | Feed contract fixture (copy of Midas's) |

Modified: `database/repositories/NotificationRepository.ts`, `services/NotificationService.ts`, `services/notifications/index.ts`, `services/midas/MidasTypes.ts`, `services/midas/MidasClient.ts`, `services/midas/MockMidasClient.ts`, `services/ExpenseMessageService.ts`, `routes/expenseMessages.ts`, `database/repositories/ExpenseMessageNotificationRepository.ts`, `server.ts`, `src/utils/notificationLinks.ts`, `src/utils/notificationsApi.ts`, `src/utils/__fixtures__/notificationLinks.json`, `src/components/layout/Header.tsx`, docs, env examples, version files. Deleted: `services/ExpenseMessageScanner.ts` and its test.

---

### Task 1: Migration 046 and exactly-once notifications

**Files:**
- Create: `backend/src/database/migrations/046_midas_event_notifications.sql`
- Modify: `backend/src/database/repositories/NotificationRepository.ts`, `backend/src/services/NotificationService.ts`
- Test: `backend/tests/integration/midas-event-notifications-schema.test.ts`, `backend/tests/services/NotificationService.test.ts` (extend), `backend/tests/repositories/NotificationRepository.test.ts` (create)

**Interfaces:**
- Produces:
  - `NotificationLink { page: NotificationPage | string; eventId?: string; expenseId?: string }`; `NotificationPage` gains `'expense'`
  - `NotificationInsert.source_event_id?: string | null`
  - `notificationRepository.insert(data): Promise<NotificationRow | null>` (null = an event with that id is already stored)
  - `notificationRepository.markReadForExpense(userId: string, expenseId: string, kinds: string[]): Promise<number>`
  - `NotifyInput.dedupeKey?: string`
  - `notificationService.notify(userId, input): Promise<NotificationRow | null>` (null = duplicate; no push sent)

- [ ] **Step 1: Write the failing tests**

```ts
// backend/tests/integration/midas-event-notifications-schema.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool, query } from '../../src/config/database';

/** Verifies migration 046 applied (migrate.ts silently skips on 42501) and that its dedupe key behaves. */
const PREFIX = `mig046-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let userId: string;

beforeAll(async () => {
  userId = (await query(
    `INSERT INTO users (username, password, name, email, role) VALUES ($1, 'x', $1, $2, 'salesperson') RETURNING id`,
    [PREFIX, `${PREFIX}@example.test`]
  )).rows[0].id;
});

afterAll(async () => {
  await query(`DELETE FROM users WHERE id = $1`, [userId]);
  await pool.end();
});

describe('migration 046', () => {
  it('adds a unique, nullable source_event_id', async () => {
    const col = await query(
      `SELECT is_nullable FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'source_event_id'`
    );
    expect(col.rows[0]?.is_nullable).toBe('YES');
    const uniq = await query(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conrelid = 'notifications'::regclass AND contype = 'u'`
    );
    expect(uniq.rows.map((r: { def: string }) => r.def)).toContain('UNIQUE (source_event_id)');
  });

  it('a second insert with the same event id is a no-op, and rows without one never collide', async () => {
    const insert = (eventId: string | null) => query(
      `INSERT INTO notifications (user_id, kind, title, body, source_event_id) VALUES ($1, 'expense.approved', 'T', 'B', $2)
       ON CONFLICT (source_event_id) DO NOTHING RETURNING id`,
      [userId, eventId]
    );
    const key = `${PREFIX}-evt`;
    expect((await insert(key)).rows).toHaveLength(1);
    expect((await insert(key)).rows).toHaveLength(0);
    expect((await insert(null)).rows).toHaveLength(1);
    expect((await insert(null)).rows).toHaveLength(1);
  });

  it('left no unread legacy message notification behind', async () => {
    const { rows } = await query(
      `SELECT count(*)::int AS missing FROM expense_message_notifications m
        WHERE m.read_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.source_event_id = 'legacy-message:' || m.midas_message_id::text)`
    );
    expect(rows[0].missing).toBe(0);
  });
});
```

```ts
// backend/tests/repositories/NotificationRepository.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/config/database', () => ({ query: vi.fn() }));

import { query } from '../../src/config/database';
import { notificationRepository } from '../../src/database/repositories/NotificationRepository';

const base = { user_id: 'u-1', kind: 'expense.approved', title: 'T', body: 'B', link: { page: 'expense', expenseId: 'ex-1' } };

describe('NotificationRepository', () => {
  beforeEach(() => vi.clearAllMocks());

  it('inserts with the event id and skips on conflict', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [{ id: 'n-1' }] } as any);
    const row = await notificationRepository.insert({ ...base, source_event_id: 'evt-1' });
    expect(row).toEqual({ id: 'n-1' });
    const [sql, params] = vi.mocked(query).mock.calls[0];
    expect(String(sql)).toMatch(/ON CONFLICT \(source_event_id\) DO NOTHING/);
    expect(params).toEqual(['u-1', 'expense.approved', 'T', 'B', JSON.stringify(base.link), 'evt-1']);
  });

  it('returns null when the event was already stored', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [] } as any);
    expect(await notificationRepository.insert({ ...base, source_event_id: 'evt-1' })).toBeNull();
  });

  it('stores null for a notification with no event id', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [{ id: 'n-2' }] } as any);
    await notificationRepository.insert(base);
    expect(vi.mocked(query).mock.calls[0][1]?.[5]).toBeNull();
  });

  it('markReadForExpense is scoped to the user, the expense and the given kinds', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rowCount: 2 } as any);
    const n = await notificationRepository.markReadForExpense('u-1', 'ex-1', ['expense.message', 'expense.mention']);
    expect(n).toBe(2);
    const [sql, params] = vi.mocked(query).mock.calls[0];
    expect(String(sql)).toMatch(/user_id = \$1/);
    expect(String(sql)).toMatch(/link->>'expenseId' = \$2/);
    expect(String(sql)).toMatch(/kind = ANY\(\$3::text\[\]\)/);
    expect(String(sql)).toMatch(/read_at IS NULL/);
    expect(params).toEqual(['u-1', 'ex-1', ['expense.message', 'expense.mention']]);
  });

  it('markReadForExpense does not query for an empty kind list', async () => {
    expect(await notificationRepository.markReadForExpense('u-1', 'ex-1', [])).toBe(0);
    expect(query).not.toHaveBeenCalled();
  });
});
```

Add to `backend/tests/services/NotificationService.test.ts`, inside `describe('NotificationService.notify', …)`:

```ts
  it('passes the dedupe key to the repository as the event id', async () => {
    await notificationService.notify('u-1', { kind: 'expense.approved', title: 'T', body: 'B', dedupeKey: 'evt-1' });
    expect(notificationRepository.insert).toHaveBeenCalledWith(expect.objectContaining({ source_event_id: 'evt-1' }));
  });

  it('sends no push and returns null when the event was already stored', async () => {
    vi.mocked(notificationRepository.insert).mockResolvedValueOnce(null as never);
    const row = await notificationService.notify('u-1', { kind: 'expense.approved', title: 'T', body: 'B', dedupeKey: 'evt-1' });
    expect(row).toBeNull();
    expect(pushService.sendToUser).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run (from `backend/`): `npx vitest run tests/repositories/NotificationRepository.test.ts tests/services/NotificationService.test.ts tests/integration/midas-event-notifications-schema.test.ts`
Expected: FAIL: no `ON CONFLICT` in the insert, `markReadForExpense` is not a function, the duplicate still pushes, and the `source_event_id` column does not exist.

- [ ] **Step 3: Write the migration**

```sql
-- backend/src/database/migrations/046_midas_event_notifications.sql
-- Migration: Midas event notifications
-- Description: Expense notifications now arrive from Midas's event feed and
--   live in the general notifications table. source_event_id is the feed
--   event's id: a re-read page must not create a second bell row. Unread
--   rows from the old message-notification table are carried over so nobody
--   loses an unread message when the separate bell section is removed.
-- Version: 2.33.0
-- Date: October 8, 2026

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS source_event_id TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notifications_source_event_id_key') THEN
    ALTER TABLE notifications ADD CONSTRAINT notifications_source_event_id_key UNIQUE (source_event_id);
  END IF;
END $$;

COMMENT ON COLUMN notifications.source_event_id IS
  'Id of the external event this row was written for (Midas feed event id); NULL for notifications Argo raised itself';

INSERT INTO notifications (user_id, kind, title, body, link, source_event_id, created_at)
SELECT m.user_id,
       CASE WHEN m.request_type IS NOT NULL THEN 'expense.info_requested' ELSE 'expense.message' END,
       CASE WHEN m.request_type IS NOT NULL THEN 'More info needed on your expense' ELSE 'New message on your expense' END,
       m.sender_name || ': ' || m.body_snippet,
       CASE WHEN m.expense_ref_id IS NOT NULL
            THEN jsonb_build_object('page', 'expense', 'expenseId', m.expense_ref_id::text) END,
       'legacy-message:' || m.midas_message_id::text,
       m.message_created_at
FROM expense_message_notifications m
WHERE m.read_at IS NULL
ON CONFLICT (source_event_id) DO NOTHING;
```

- [ ] **Step 4: Implement the repository and service changes**

In `backend/src/database/repositories/NotificationRepository.ts`:

- `NotificationPage` gains `| 'expense'`.
- `NotificationLink` becomes `{ page: NotificationPage | string; eventId?: string; expenseId?: string }`.
- `NotificationInsert` gains `source_event_id?: string | null;`.
- Replace `insert` and add `markReadForExpense`:

```ts
  /**
   * Null means a row for this source event already exists: the caller must
   * treat the notification as already delivered (no second push).
   */
  async insert(data: NotificationInsert): Promise<NotificationRow | null> {
    const r = await query(
      `INSERT INTO notifications (user_id, kind, title, body, link, source_event_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (source_event_id) DO NOTHING
       RETURNING *`,
      [
        data.user_id, data.kind, data.title, data.body,
        data.link ? JSON.stringify(data.link) : null,
        data.source_event_id ?? null,
      ]
    );
    return (r.rows[0] as NotificationRow) ?? null;
  }

  /** Mark one user's unread notifications of the given kinds for one expense as read. */
  async markReadForExpense(userId: string, expenseId: string, kinds: string[]): Promise<number> {
    if (kinds.length === 0) return 0;
    const r = await query(
      `UPDATE notifications SET read_at = now()
       WHERE user_id = $1 AND link->>'expenseId' = $2 AND kind = ANY($3::text[]) AND read_at IS NULL`,
      [userId, expenseId, kinds]
    );
    return r.rowCount ?? 0;
  }
```

Update the file's header comment: expense notifications from Midas now live here too.

In `backend/src/services/NotificationService.ts`:

- `NotifyInput` gains `/** Id of the external event this stands for; a second notify with the same key is a no-op. */ dedupeKey?: string;`
- Replace `notify`:

```ts
  /** Null means this event was already delivered (see dedupeKey): nothing was written or pushed. */
  async notify(userId: string, input: NotifyInput): Promise<NotificationRow | null> {
    const row = await notificationRepository.insert({
      user_id: userId, kind: input.kind, title: input.title, body: input.body, link: input.link ?? null,
      source_event_id: input.dedupeKey ?? null,
    });
    if (!row) return null;
    try {
      await pushService.sendToUser(userId, { title: input.title, body: input.body, url: linkToUrl(input.link) });
    } catch (error) {
      console.error(`[Notifications] push failed for user ${userId} (${input.kind}):`, error);
    }
    return row;
  }
```

- [ ] **Step 5: Apply the migration and run the tests**

Run (from `backend/`): `npm run migrate && npx vitest run tests/repositories/NotificationRepository.test.ts tests/services/NotificationService.test.ts tests/integration/midas-event-notifications-schema.test.ts tests/services/notifications && npx tsc --noEmit`
Expected: migrate applies `046_midas_event_notifications.sql`; all tests PASS; no type errors. If `tsc` reports a caller that used `notify`'s return value as non-null, fix that caller to handle `null` and list it in the report.

- [ ] **Step 6: Commit**

```bash
git add backend/src/database/migrations/046_midas_event_notifications.sql backend/src/database/repositories/NotificationRepository.ts backend/src/services/NotificationService.ts backend/tests/integration/midas-event-notifications-schema.test.ts backend/tests/repositories/NotificationRepository.test.ts backend/tests/services/NotificationService.test.ts
git commit -m "feat(notifications): exactly-once notifications by source event id (migration 046)"
```

---

### Task 2: The `expense` link

**Files:**
- Modify: `src/utils/__fixtures__/notificationLinks.json`, `backend/src/services/NotificationService.ts` (`linkToUrl`), `src/utils/notificationLinks.ts`, `src/utils/notificationsApi.ts`
- Test: existing `backend/tests/services/notificationLinks.test.ts` and `src/utils/__tests__/notificationLinks.test.ts` (both iterate the fixture; no test code changes)

**Interfaces:**
- Consumes: `NotificationLink.expenseId` (Task 1).
- Produces: link `{ page: 'expense', expenseId }` → push URL `/#expense=<id>`; frontend target `{ page: 'expenses', hash: 'expense=<id>' }`. Without an `expenseId` it resolves to `/` and no target.

- [ ] **Step 1: Add the fixture rows (this is the failing test)**

In `src/utils/__fixtures__/notificationLinks.json`, add these two objects to the array, directly after the `expenses` + `eventId` row:

```json
  { "link": { "page": "expense", "expenseId": "ex-1" }, "url": "/#expense=ex-1", "page": "expenses", "hash": "expense=ex-1" },
  { "link": { "page": "expense" }, "url": "/", "page": null, "hash": null },
```

- [ ] **Step 2: Run both fixture tests to verify they fail**

Run (from `backend/`): `npx vitest run tests/services/notificationLinks.test.ts`
Run (repo root): `npx vitest run src/utils/__tests__/notificationLinks.test.ts`
Expected: both FAIL on the new `expense` row with an id (backend returns `/`, frontend returns no target).

- [ ] **Step 3: Implement on both sides**

In `backend/src/services/NotificationService.ts`, in `linkToUrl`, directly after `if (!link) return '/';`:

```ts
  // One expense, by Argo's own id: the hash ExpenseSubmission opens the modal for.
  if (link.page === 'expense') return link.expenseId ? `/#expense=${link.expenseId}` : '/';
```

In `src/utils/notificationsApi.ts`, widen the link type on `AppNotification`:

```ts
  link: { page: string; eventId?: string; expenseId?: string } | null; read_at: string | null; created_at: string;
```

In `src/utils/notificationLinks.ts`, in `notificationTarget`, directly after `if (!link) return NOWHERE;`:

```ts
  // One expense, by its id: ExpenseSubmission opens the modal for `#expense=<id>`.
  if (link.page === 'expense') {
    return link.expenseId ? { page: 'expenses', hash: `expense=${link.expenseId}` } : NOWHERE;
  }
```

`initialPageFromHash` already routes `#expense=` to `expenses`; no change.

- [ ] **Step 4: Run the tests**

Run (from `backend/`): `npx vitest run tests/services/notificationLinks.test.ts && npx tsc --noEmit`
Run (repo root): `npx vitest run src/utils/__tests__/notificationLinks.test.ts src/utils/__tests__/initialPageFromHash.test.ts src/components/layout/__tests__/Header.notifications.test.tsx`
Expected: all PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/utils/__fixtures__/notificationLinks.json backend/src/services/NotificationService.ts src/utils/notificationLinks.ts src/utils/notificationsApi.ts
git commit -m "feat(notifications): expense link type for notifications about one expense"
```

---

### Task 3: Feed client and the expense notification catalog

**Files:**
- Create: `backend/tests/fixtures/midasEvents.json`, `backend/src/services/notifications/expenseNotifications.ts`
- Modify: `backend/src/services/midas/MidasTypes.ts`, `backend/src/services/midas/MidasClient.ts`, `backend/src/services/midas/MockMidasClient.ts`, `backend/src/services/notifications/index.ts`
- Test: `backend/tests/services/notifications/expenseNotifications.test.ts`

**Interfaces:**
- Consumes: `activeUsers`, `notifyMany` (catalog, v2.32.0); `NotifyInput.dedupeKey` (Task 1); the `expense` link (Task 2); `isValidUuid` from `backend/src/utils/uuid`.
- Produces:
  - `interface MidasFeedEvent { seq: number; id: string; type: string; createdAt: string; externalUserId: string; expense: { id: string; sourceRefId: string | null; merchant: string; amount: string | number; status: string }; senderName?: string; excerpt?: string; messageId?: string; requestType?: string; note?: string; missing?: string[] }`
  - `interface MidasEventFeedResult { events: MidasFeedEvent[]; nextCursor: string | null }`
  - `MidasClient.listEventsSince(cursor: string, limit: number): Promise<MidasEventFeedResult>` (also on `MockMidasClient`)
  - `CONVERSATION_KINDS: string[]` = `['expense.message', 'expense.mention', 'expense.info_requested']`
  - `expenseNotifications.fromMidasEvent(event: MidasFeedEvent): NotifyInput | null` (null = unknown type)
  - `expenseNotifications.deliver(event: MidasFeedEvent): Promise<'sent' | 'skipped'>`. Throws only on infrastructure failure (database), never for a bad event.

- [ ] **Step 1: Copy the contract fixture**

Create `backend/tests/fixtures/midasEvents.json` with exactly the content of `/Users/sahilkhatri/Work/midas/apps/api/src/__tests__/fixtures/extEvents.json` on the Midas branch `feat/ext-events-needs-review`:

```bash
cp /Users/sahilkhatri/Work/midas/apps/api/src/__tests__/fixtures/extEvents.json backend/tests/fixtures/midasEvents.json
```

If that file does not exist yet (the Midas plan's Task 2 has not run), take the JSON from the Midas plan's Task 2 Step 1 verbatim. The two files must stay byte-identical; the controller diffs them before release.

- [ ] **Step 2: Write the failing test**

```ts
// backend/tests/services/notifications/expenseNotifications.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

vi.mock('../../../src/services/notifications/recipients', () => ({
  activeUsers: vi.fn(async (ids: string[]) => ids),
}));
vi.mock('../../../src/services/notifications/notifyMany', () => ({ notifyMany: vi.fn(async () => undefined) }));

import { expenseNotifications, CONVERSATION_KINDS } from '../../../src/services/notifications/expenseNotifications';
import { activeUsers } from '../../../src/services/notifications/recipients';
import { notifyMany } from '../../../src/services/notifications/notifyMany';

const fixture = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../fixtures/midasEvents.json'), 'utf8'));
const byType = (type: string) => fixture.events.find((e: { type: string }) => e.type === type);
const USER = '11111111-2222-4333-8444-555555555555';
const withUser = (e: object) => ({ ...e, externalUserId: USER });
const expenseLink = { page: 'expense', expenseId: 'argo-exp-1' };

describe('expenseNotifications.fromMidasEvent (contract fixture shared with Midas)', () => {
  it('approved', () => {
    expect(expenseNotifications.fromMidasEvent(byType('approved'))).toEqual({
      kind: 'expense.approved', title: 'Expense approved',
      body: 'Your $42.10 expense at Staples was approved.', link: expenseLink,
    });
  });
  it('rejected carries the note', () => {
    expect(expenseNotifications.fromMidasEvent(byType('rejected'))).toEqual({
      kind: 'expense.rejected', title: 'Expense rejected',
      body: 'Your $42.10 expense at Staples was rejected. Note: Duplicate submission', link: expenseLink,
    });
  });
  it('message quotes the sender', () => {
    expect(expenseNotifications.fromMidasEvent(byType('message'))).toEqual({
      kind: 'expense.message', title: 'New message on your expense',
      body: 'Rita on your $42.10 expense at Staples: "Which show was this for?"', link: expenseLink,
    });
  });
  it('action_required reads as a request', () => {
    expect(expenseNotifications.fromMidasEvent(byType('action_required'))).toEqual({
      kind: 'expense.info_requested', title: 'More info needed on your expense',
      body: 'Rita needs more information for your $42.10 expense at Staples: "Please attach the itemised receipt"',
      link: expenseLink,
    });
  });
  it('expense_incomplete lists what is missing and has no link without an Argo expense id', () => {
    expect(expenseNotifications.fromMidasEvent(byType('expense_incomplete'))).toEqual({
      kind: 'expense.incomplete', title: 'Your expense is missing details',
      body: 'Your $18.00 expense at Uber is missing: receipt, payment method. Add them so the accountant can approve it.',
      link: null,
    });
  });
  it('mention and reimbursement_paid', () => {
    expect(expenseNotifications.fromMidasEvent({ ...byType('message'), type: 'mention' })).toEqual(expect.objectContaining({
      kind: 'expense.mention', title: 'Rita mentioned you on your expense',
    }));
    expect(expenseNotifications.fromMidasEvent({ ...byType('approved'), type: 'reimbursement_paid' })).toEqual({
      kind: 'expense.reimbursement_paid', title: 'Reimbursement paid',
      body: 'Your $42.10 reimbursement for Staples was marked paid.', link: expenseLink,
    });
  });
  it('words a single missing item and a missing sender sensibly', () => {
    expect(expenseNotifications.fromMidasEvent({ ...byType('expense_incomplete'), missing: ['receipt'] })!.body)
      .toBe('Your $18.00 expense at Uber is missing: receipt. Add it so the accountant can approve it.');
    const noSender = { ...byType('message'), senderName: undefined };
    expect(expenseNotifications.fromMidasEvent(noSender)!.body).toMatch(/^Your accountant on your /);
  });
  it('returns null for a type this build does not know', () => {
    expect(expenseNotifications.fromMidasEvent({ ...byType('approved'), type: 'something_new' })).toBeNull();
  });
  it('the conversation kinds are exactly the three that clear when the thread is opened', () => {
    expect([...CONVERSATION_KINDS].sort()).toEqual(['expense.info_requested', 'expense.mention', 'expense.message']);
  });
});

describe('expenseNotifications.deliver', () => {
  beforeEach(() => vi.clearAllMocks());

  it('notifies the Argo user once, keyed on the event id', async () => {
    const event = withUser(byType('approved'));
    expect(await expenseNotifications.deliver(event as never)).toBe('sent');
    expect(activeUsers).toHaveBeenCalledWith([USER]);
    expect(notifyMany).toHaveBeenCalledWith([USER], expect.objectContaining({
      kind: 'expense.approved', dedupeKey: '11111111-1111-4111-8111-111111111111',
    }));
  });

  it('skips an event whose user id is not an Argo id, without touching the database', async () => {
    expect(await expenseNotifications.deliver(byType('approved'))).toBe('skipped'); // "argo-user-1" is not a UUID
    expect(activeUsers).not.toHaveBeenCalled();
    expect(notifyMany).not.toHaveBeenCalled();
  });

  it('skips an unknown or inactive user', async () => {
    vi.mocked(activeUsers).mockResolvedValueOnce([]);
    expect(await expenseNotifications.deliver(withUser(byType('approved')) as never)).toBe('skipped');
    expect(notifyMany).not.toHaveBeenCalled();
  });

  it('skips an unknown type', async () => {
    expect(await expenseNotifications.deliver(withUser({ ...byType('approved'), type: 'something_new' }) as never)).toBe('skipped');
    expect(notifyMany).not.toHaveBeenCalled();
  });

  it('lets a database failure through so the scanner retries the page', async () => {
    vi.mocked(activeUsers).mockRejectedValueOnce(new Error('db down'));
    await expect(expenseNotifications.deliver(withUser(byType('approved')) as never)).rejects.toThrow('db down');
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run (from `backend/`): `npx vitest run tests/services/notifications/expenseNotifications.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 4: Implement the types and client methods**

In `backend/src/services/midas/MidasTypes.ts`, after `MidasMessageFeedResult`:

```ts
/** A row from Ext GET /events: something Midas would have told the submitter, handed to us instead. */
export interface MidasFeedEvent {
  seq: number;
  /** Stable and unique; the dedupe key for the notification we write. */
  id: string;
  /** approved | rejected | action_required | message | mention | reimbursement_paid | expense_incomplete (others must be ignored). */
  type: string;
  createdAt: string;
  /** Our own user id for the submitter. */
  externalUserId: string;
  expense: {
    id: string;
    /** Our own expense id. */
    sourceRefId: string | null;
    merchant: string;
    amount: string | number;
    status: string;
  };
  senderName?: string;
  excerpt?: string;
  messageId?: string;
  requestType?: string;
  note?: string;
  missing?: string[];
}

export interface MidasEventFeedResult {
  events: MidasFeedEvent[];
  nextCursor: string | null;
}
```

In `backend/src/services/midas/MidasClient.ts`, add `MidasEventFeedResult` to the type imports and, directly after `listMessagesSince`:

```ts
  /** Events after `cursor` (the last seq processed; '0' for the start), oldest first. */
  async listEventsSince(cursor: string, limit: number): Promise<MidasEventFeedResult> {
    try {
      const res = await this.http.get('/events', { params: { since: cursor, limit } });
      return await this.parse<MidasEventFeedResult>(
        res.status, res.data, [200], res.headers as Record<string, unknown>
      );
    } catch (e) {
      return toMidasError(e);
    }
  }
```

In `backend/src/services/midas/MockMidasClient.ts`, add the type import and, directly after its `listMessagesSince`:

```ts
  /** The mock raises no events. */
  async listEventsSince(_cursor: string, _limit: number): Promise<MidasEventFeedResult> {
    return { events: [], nextCursor: null };
  }
```

- [ ] **Step 5: Implement the catalog file**

```ts
// backend/src/services/notifications/expenseNotifications.ts
/**
 * Expense notifications that originate in Midas: a decision, a message, a
 * reimbursement. Midas hands each one to us as a feed event (it sends the
 * submitter nothing itself); this file turns an event into the one bell row
 * and push the submitter gets in Argo.
 */
import { activeUsers } from './recipients';
import { notifyMany } from './notifyMany';
import { isValidUuid } from '../../utils/uuid';
import type { NotifyInput } from '../NotificationService';
import type { MidasFeedEvent } from '../midas/MidasTypes';

/** Kinds that are about the conversation; opening the thread marks them read. */
export const CONVERSATION_KINDS = ['expense.message', 'expense.mention', 'expense.info_requested'];

/** "12.5" | 12.5 → "$12.50"; falls back to the raw value when not numeric. */
function money(amount: string | number): string {
  const n = typeof amount === 'number' ? amount : Number(amount);
  return Number.isFinite(n) ? `$${n.toFixed(2)}` : `$${amount}`;
}

type Wording = { kind: string; title: string; body: string };

function wordingFor(event: MidasFeedEvent): Wording | null {
  const amount = money(event.expense.amount);
  const at = `${amount} expense at ${event.expense.merchant}`;
  const quote = event.excerpt ? `: "${event.excerpt}"` : '';

  switch (event.type) {
    case 'approved':
      return { kind: 'expense.approved', title: 'Expense approved', body: `Your ${at} was approved.` };
    case 'rejected':
      return {
        kind: 'expense.rejected', title: 'Expense rejected',
        body: `Your ${at} was rejected.${event.note ? ` Note: ${event.note}` : ''}`,
      };
    case 'action_required':
      return {
        kind: 'expense.info_requested', title: 'More info needed on your expense',
        body: `${event.senderName ?? 'Your accountant'} needs more information for your ${at}${quote}`,
      };
    case 'message':
      return {
        kind: 'expense.message', title: 'New message on your expense',
        body: `${event.senderName ?? 'Your accountant'} on your ${at}${quote}`,
      };
    case 'mention':
      return {
        kind: 'expense.mention', title: `${event.senderName ?? 'Someone'} mentioned you on your expense`,
        body: `${event.senderName ?? 'Your accountant'} on your ${at}${quote}`,
      };
    case 'reimbursement_paid':
      return {
        kind: 'expense.reimbursement_paid', title: 'Reimbursement paid',
        body: `Your ${amount} reimbursement for ${event.expense.merchant} was marked paid.`,
      };
    case 'expense_incomplete': {
      const missing = event.missing ?? [];
      return {
        kind: 'expense.incomplete', title: 'Your expense is missing details',
        body: `Your ${at} is missing: ${missing.join(', ')}. Add ${missing.length === 1 ? 'it' : 'them'} so the accountant can approve it.`,
      };
    }
    default:
      return null;
  }
}

export const expenseNotifications = {
  /** The notification for a feed event, or null for a type this build does not know. */
  fromMidasEvent(event: MidasFeedEvent): NotifyInput | null {
    const wording = wordingFor(event);
    if (!wording) return null;
    return {
      ...wording,
      link: event.expense.sourceRefId ? { page: 'expense', expenseId: event.expense.sourceRefId } : null,
    };
  },

  /**
   * Deliver one event to its Argo user, at most once (the event id is the
   * dedupe key). 'skipped' is a decision, not a failure: an event we cannot
   * or should not deliver must not hold up the feed. Throws only when the
   * database does, so the scanner retries the page.
   */
  async deliver(event: MidasFeedEvent): Promise<'sent' | 'skipped'> {
    const input = expenseNotifications.fromMidasEvent(event);
    if (!input) {
      console.log(`[MidasEvents] Unknown event type "${event.type}" (${event.id}) — skipped`);
      return 'skipped';
    }
    if (!isValidUuid(event.externalUserId)) {
      console.log(`[MidasEvents] Event ${event.id} has no Argo user id — skipped`);
      return 'skipped';
    }
    const recipients = await activeUsers([event.externalUserId]);
    if (recipients.length === 0) {
      console.log(`[MidasEvents] No active Argo user ${event.externalUserId} for event ${event.id} — skipped`);
      return 'skipped';
    }
    await notifyMany(recipients, { ...input, dedupeKey: event.id });
    return 'sent';
  },
};
```

Append to `backend/src/services/notifications/index.ts`:

```ts
export { expenseNotifications, CONVERSATION_KINDS } from './expenseNotifications';
```

- [ ] **Step 6: Run the tests and type-check**

Run (from `backend/`): `npx vitest run tests/services/notifications && npx tsc --noEmit`
Expected: all PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add backend/tests/fixtures/midasEvents.json backend/src/services/notifications/expenseNotifications.ts backend/src/services/notifications/index.ts backend/src/services/midas/MidasTypes.ts backend/src/services/midas/MidasClient.ts backend/src/services/midas/MockMidasClient.ts backend/tests/services/notifications/expenseNotifications.test.ts
git commit -m "feat(notifications): Midas feed client and the expense notification catalog"
```

---

### Task 4: `MidasEventScanner`

**Files:**
- Create: `backend/src/services/midas/MidasEventScanner.ts`
- Modify: `backend/src/server.ts`
- Delete: `backend/src/services/ExpenseMessageScanner.ts`, `backend/tests/services/ExpenseMessageScanner.test.ts`
- Test: `backend/tests/services/MidasEventScanner.test.ts`

**Interfaces:**
- Consumes: `getMidasClient().listEventsSince(cursor, limit)` (Task 3); `expenseNotifications.deliver(event)` (Task 3); `getCursor(key)`, `setCursor(key, cursor)` from `ExpenseMessageNotificationRepository` (existing, kept); `isMessagingEnabled()` (existing).
- Produces: `class MidasEventScanner { start(): void; stop(): void; scan(): Promise<void>; trigger(): void }` and the singleton `midasEventScanner`.

- [ ] **Step 1: Write the failing test**

```ts
// backend/tests/services/MidasEventScanner.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/services/midas', () => ({ getMidasClient: vi.fn() }));
vi.mock('../../src/services/ExpenseMessageService', () => ({ isMessagingEnabled: vi.fn(() => true) }));
vi.mock('../../src/database/repositories/ExpenseMessageNotificationRepository', () => ({
  getCursor: vi.fn(async () => '40'),
  setCursor: vi.fn(async () => undefined),
}));
vi.mock('../../src/services/notifications', () => ({
  expenseNotifications: { deliver: vi.fn(async () => 'sent') },
}));

import { getMidasClient } from '../../src/services/midas';
import { getCursor, setCursor } from '../../src/database/repositories/ExpenseMessageNotificationRepository';
import { expenseNotifications } from '../../src/services/notifications';
import { MidasEventScanner } from '../../src/services/midas/MidasEventScanner';

const event = (seq: number) => ({ seq, id: `evt-${seq}`, type: 'approved' });
const listEventsSince = vi.fn();
const KEY = 'trade_show:events';

describe('MidasEventScanner.scan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getMidasClient).mockReturnValue({ listEventsSince } as never);
    process.env.MIDAS_MESSAGE_SCAN_PAGE_SIZE = '2';
  });

  it('delivers a page in order, then moves the cursor', async () => {
    listEventsSince.mockResolvedValueOnce({ events: [event(41)], nextCursor: '41' });
    await new MidasEventScanner().scan();
    expect(getCursor).toHaveBeenCalledWith(KEY);
    expect(listEventsSince).toHaveBeenCalledWith('40', 2);
    expect(expenseNotifications.deliver).toHaveBeenCalledWith(event(41));
    expect(setCursor).toHaveBeenCalledWith(KEY, '41');
    expect(vi.mocked(expenseNotifications.deliver).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(setCursor).mock.invocationCallOrder[0]);
  });

  it('starts from 0 when it has never run', async () => {
    vi.mocked(getCursor).mockResolvedValueOnce(null);
    listEventsSince.mockResolvedValueOnce({ events: [], nextCursor: null });
    await new MidasEventScanner().scan();
    expect(listEventsSince).toHaveBeenCalledWith('0', 2);
    expect(setCursor).not.toHaveBeenCalled();
  });

  it('follows full pages to the end', async () => {
    listEventsSince
      .mockResolvedValueOnce({ events: [event(41), event(42)], nextCursor: '42' })
      .mockResolvedValueOnce({ events: [event(43)], nextCursor: '43' });
    await new MidasEventScanner().scan();
    expect(listEventsSince).toHaveBeenNthCalledWith(2, '42', 2);
    expect(setCursor).toHaveBeenLastCalledWith(KEY, '43');
  });

  it('a skipped event does not hold up the feed', async () => {
    listEventsSince.mockResolvedValueOnce({ events: [event(41), event(42)], nextCursor: '42' })
      .mockResolvedValueOnce({ events: [], nextCursor: null });
    vi.mocked(expenseNotifications.deliver).mockResolvedValueOnce('skipped');
    await new MidasEventScanner().scan();
    expect(expenseNotifications.deliver).toHaveBeenCalledTimes(2);
    expect(setCursor).toHaveBeenCalledWith(KEY, '42');
  });

  it('leaves the cursor alone when delivery fails, so the page is retried', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    listEventsSince.mockResolvedValueOnce({ events: [event(41), event(42)], nextCursor: '42' });
    vi.mocked(expenseNotifications.deliver).mockResolvedValueOnce('sent').mockRejectedValueOnce(new Error('db down'));
    await expect(new MidasEventScanner().scan()).resolves.toBeUndefined();
    expect(setCursor).not.toHaveBeenCalled();
    err.mockRestore();
  });

  it('never throws when Midas is unreachable, and leaves the cursor alone', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    listEventsSince.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await expect(new MidasEventScanner().scan()).resolves.toBeUndefined();
    expect(setCursor).not.toHaveBeenCalled();
    err.mockRestore();
  });

  it('a trigger during a running scan does not overlap it, and runs exactly one more scan afterwards', async () => {
    let release!: (v: unknown) => void;
    listEventsSince
      .mockReturnValueOnce(new Promise((r) => { release = r; }))
      .mockResolvedValue({ events: [], nextCursor: null });
    const scanner = new MidasEventScanner();
    const first = scanner.scan();
    scanner.trigger();
    scanner.trigger();
    await new Promise((r) => setImmediate(r));
    expect(listEventsSince).toHaveBeenCalledTimes(1);
    release({ events: [], nextCursor: null });
    await first;
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    expect(listEventsSince).toHaveBeenCalledTimes(2);
  });

  it('trigger with nothing running starts a scan', async () => {
    listEventsSince.mockResolvedValueOnce({ events: [], nextCursor: null });
    new MidasEventScanner().trigger();
    await new Promise((r) => setImmediate(r));
    expect(listEventsSince).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run (from `backend/`): `npx vitest run tests/services/MidasEventScanner.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
// backend/src/services/midas/MidasEventScanner.ts
/**
 * Pulls Midas's event feed and turns each event into an Argo notification.
 *
 * Midas hands submitter-facing notifications on our expenses to us instead of
 * delivering them itself. The pull is the delivery path: it is ordered by
 * seq and the cursor moves only after a page is fully handled, so a crash
 * re-reads the page and the notification's dedupe key makes that a no-op.
 * Midas also pings us when it records an event (routes/midasPing.ts calls
 * trigger()), which makes delivery near-instant; the timer is the safety net
 * for a lost ping.
 *
 * Runs whether or not push is configured: the bell row is the durable half.
 */
import { getMidasClient } from './index';
import { isMessagingEnabled } from '../ExpenseMessageService';
import { getCursor, setCursor } from '../../database/repositories/ExpenseMessageNotificationRepository';
import { expenseNotifications } from '../notifications';

/** Key in midas_message_sync_state. Distinct from the retired message scanner's 'trade_show'. */
const CURSOR_KEY = 'trade_show:events';
const STARTUP_DELAY_MS = 20_000;
/** Guards against an unbounded loop if a cursor ever fails to advance. */
const MAX_PAGES = 50;

function intervalMs(): number {
  return parseInt(process.env.MIDAS_MESSAGE_SCAN_INTERVAL_MS || '120000', 10);
}

function pageSize(): number {
  return parseInt(process.env.MIDAS_MESSAGE_SCAN_PAGE_SIZE || '100', 10);
}

export class MidasEventScanner {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  /** A ping arrived mid-scan: go round once more when this scan finishes. */
  private rerun = false;

  start(): void {
    if (this.timer) return;
    if (!isMessagingEnabled()) {
      console.log('[MidasEvents] Messaging not enabled — scanner idle');
      return;
    }
    setTimeout(() => void this.scan(), STARTUP_DELAY_MS);
    this.timer = setInterval(() => void this.scan(), intervalMs());
    console.log(`[MidasEvents] Scanner started (every ${intervalMs()}ms, plus on ping)`);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Midas says there is something new. Never overlaps a running scan. */
  trigger(): void {
    if (this.running) {
      this.rerun = true;
      return;
    }
    void this.scan();
  }

  /** One sweep to the end of the feed. Never throws. */
  async scan(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const client = getMidasClient();
      const size = pageSize();
      let cursor = (await getCursor(CURSOR_KEY)) ?? '0';

      for (let page = 0; page < MAX_PAGES; page += 1) {
        const result = await client.listEventsSince(cursor, size);
        if (result.events.length === 0) return;

        // A throw here (database down) leaves the cursor unmoved: the next
        // tick re-reads this page and the dedupe key absorbs the repeats.
        // 'skipped' events are decided, not deferred, so the cursor passes them.
        for (const event of result.events) {
          await expenseNotifications.deliver(event);
        }

        if (result.nextCursor) {
          await setCursor(CURSOR_KEY, result.nextCursor);
          cursor = result.nextCursor;
        }
        if (result.events.length < size) return;
      }
      console.warn(`[MidasEvents] Stopped after ${MAX_PAGES} pages with more available`);
    } catch (error) {
      console.error('[MidasEvents] Scan failed:', error);
    } finally {
      this.running = false;
      if (this.rerun) {
        this.rerun = false;
        void this.scan();
      }
    }
  }
}

export const midasEventScanner = new MidasEventScanner();
```

- [ ] **Step 4: Swap it in and retire the old scanner**

In `backend/src/server.ts`:

- replace `import { expenseMessageScanner } from './services/ExpenseMessageScanner';` with `import { midasEventScanner } from './services/midas/MidasEventScanner';`
- replace the comment and call `expenseMessageScanner.start();` with:

```ts
    // Pull Midas's event feed and notify expense owners (idles unless
    // EXPENSE_MESSAGING_ENABLED=true); Midas pings /api/midas/events-ping to
    // make this immediate
    midasEventScanner.start();
```

Then:

```bash
git rm backend/src/services/ExpenseMessageScanner.ts backend/tests/services/ExpenseMessageScanner.test.ts
grep -rn "ExpenseMessageScanner\|expenseMessageScanner" backend/src backend/tests
```

Expected: the `grep` prints only comment references, if any. Reword any comment that points at the deleted file to name `MidasEventScanner` (for example in `ReminderScheduler.ts` or `SampleRequestReminderService.ts` if they mention it), and re-run the grep until it prints nothing.

- [ ] **Step 5: Run the tests and type-check**

Run (from `backend/`): `npx vitest run tests/services/MidasEventScanner.test.ts tests/services/notifications && npx tsc --noEmit`
Expected: all PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add -A backend/src/services/midas/MidasEventScanner.ts backend/src/server.ts backend/tests/services/MidasEventScanner.test.ts
git add -u backend/src backend/tests
git commit -m "feat(notifications): MidasEventScanner pulls the event feed; the message scanner is retired"
```

Before committing run `git status --short` and confirm only this task's files are staged.

---

### Task 5: The ping endpoint

**Files:**
- Create: `backend/src/routes/midasPing.ts`
- Modify: `backend/src/server.ts`
- Test: `backend/tests/routes/midasPing.test.ts`

**Interfaces:**
- Consumes: `midasEventScanner.trigger()` (Task 4).
- Produces: `verifyPing(i: { timestamp: unknown; signature: unknown; secret: string | undefined; nowSeconds: number }): boolean`; `handleEventsPing(req, res)`; the router mounted at `/api/midas`.

- [ ] **Step 1: Write the failing test**

```ts
// backend/tests/routes/midasPing.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';

vi.mock('../../src/services/midas/MidasEventScanner', () => ({
  midasEventScanner: { trigger: vi.fn() },
}));

import { verifyPing, handleEventsPing } from '../../src/routes/midasPing';
import { midasEventScanner } from '../../src/services/midas/MidasEventScanner';

const SECRET = 'shh';
const NOW = 1_760_000_000;
const sign = (ts: string, secret = SECRET) => crypto.createHmac('sha256', secret).update(ts).digest('hex');

describe('verifyPing', () => {
  const ts = String(NOW);
  it('accepts a correctly signed, fresh timestamp', () => {
    expect(verifyPing({ timestamp: ts, signature: sign(ts), secret: SECRET, nowSeconds: NOW })).toBe(true);
  });
  it('accepts up to 300 seconds of clock difference either way, and no more', () => {
    for (const offset of [-300, 300]) {
      const t = String(NOW + offset);
      expect(verifyPing({ timestamp: t, signature: sign(t), secret: SECRET, nowSeconds: NOW })).toBe(true);
    }
    for (const offset of [-301, 301]) {
      const t = String(NOW + offset);
      expect(verifyPing({ timestamp: t, signature: sign(t), secret: SECRET, nowSeconds: NOW })).toBe(false);
    }
  });
  it('rejects a signature made with another secret', () => {
    expect(verifyPing({ timestamp: ts, signature: sign(ts, 'other'), secret: SECRET, nowSeconds: NOW })).toBe(false);
  });
  it('rejects a signature for a different timestamp (replay with a fresh time)', () => {
    expect(verifyPing({ timestamp: ts, signature: sign(String(NOW - 10)), secret: SECRET, nowSeconds: NOW })).toBe(false);
  });
  it('rejects missing, malformed and wrong-length values without throwing', () => {
    expect(verifyPing({ timestamp: undefined, signature: sign(ts), secret: SECRET, nowSeconds: NOW })).toBe(false);
    expect(verifyPing({ timestamp: ts, signature: undefined, secret: SECRET, nowSeconds: NOW })).toBe(false);
    expect(verifyPing({ timestamp: 'soon', signature: sign('soon'), secret: SECRET, nowSeconds: NOW })).toBe(false);
    expect(verifyPing({ timestamp: ts, signature: 'abc', secret: SECRET, nowSeconds: NOW })).toBe(false);
    expect(verifyPing({ timestamp: ts, signature: 'zz'.repeat(32), secret: SECRET, nowSeconds: NOW })).toBe(false);
    expect(verifyPing({ timestamp: [ts], signature: sign(ts), secret: SECRET, nowSeconds: NOW })).toBe(false);
  });
  it('rejects everything when no secret is configured', () => {
    expect(verifyPing({ timestamp: ts, signature: sign(ts, ''), secret: undefined, nowSeconds: NOW })).toBe(false);
    expect(verifyPing({ timestamp: ts, signature: sign(ts, ''), secret: '', nowSeconds: NOW })).toBe(false);
  });
});

describe('POST /api/midas/events-ping', () => {
  const mockRes = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), end: vi.fn() }) as any;
  const req = (headers: Record<string, string>) => ({ get: (name: string) => headers[name.toLowerCase()] }) as any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW * 1000));
    process.env.MIDAS_EVENTS_PING_SECRET = SECRET;
  });
  afterEach(() => {
    vi.useRealTimers();
    delete process.env.MIDAS_EVENTS_PING_SECRET;
  });

  it('answers 202 and triggers a scan for a valid ping', () => {
    const res = mockRes();
    const ts = String(NOW);
    handleEventsPing(req({ 'x-midas-timestamp': ts, 'x-midas-signature': sign(ts) }), res);
    expect(res.status).toHaveBeenCalledWith(202);
    expect(midasEventScanner.trigger).toHaveBeenCalledTimes(1);
  });

  it('answers 401 and does nothing for a bad signature', () => {
    const res = mockRes();
    handleEventsPing(req({ 'x-midas-timestamp': String(NOW), 'x-midas-signature': 'nope' }), res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(midasEventScanner.trigger).not.toHaveBeenCalled();
  });

  it('answers 401 when the secret is not configured', () => {
    delete process.env.MIDAS_EVENTS_PING_SECRET;
    const res = mockRes();
    const ts = String(NOW);
    handleEventsPing(req({ 'x-midas-timestamp': ts, 'x-midas-signature': sign(ts) }), res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(midasEventScanner.trigger).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run (from `backend/`): `npx vitest run tests/routes/midasPing.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
// backend/src/routes/midasPing.ts
/**
 * Midas's "you have events" ping — /api/midas/events-ping
 *
 * Not a session route: Midas calls it server to server. It carries no data.
 * A valid ping only makes the event scanner pull now instead of waiting for
 * its timer, so the worst a forged one could do is cause a pull that would
 * have happened anyway; it is still signed so it cannot be used to make this
 * server call Midas on demand.
 */
import crypto from 'crypto';
import express, { Request, Response } from 'express';
import { midasEventScanner } from '../services/midas/MidasEventScanner';

/** How far Midas's clock and ours may disagree, and how long a captured ping stays usable. */
const MAX_SKEW_SECONDS = 300;

export function verifyPing(i: {
  timestamp: unknown; signature: unknown; secret: string | undefined; nowSeconds: number;
}): boolean {
  if (!i.secret) return false;
  if (typeof i.timestamp !== 'string' || !/^\d{1,12}$/.test(i.timestamp)) return false;
  if (typeof i.signature !== 'string' || !/^[0-9a-f]{64}$/i.test(i.signature)) return false;
  if (Math.abs(i.nowSeconds - Number(i.timestamp)) > MAX_SKEW_SECONDS) return false;

  const expected = crypto.createHmac('sha256', i.secret).update(i.timestamp).digest();
  const given = Buffer.from(i.signature, 'hex');
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

export function handleEventsPing(req: Request, res: Response): void {
  const ok = verifyPing({
    timestamp: req.get('X-Midas-Timestamp'),
    signature: req.get('X-Midas-Signature'),
    secret: process.env.MIDAS_EVENTS_PING_SECRET,
    nowSeconds: Math.floor(Date.now() / 1000),
  });
  if (!ok) {
    res.status(401).json({ error: 'Invalid ping signature' });
    return;
  }
  midasEventScanner.trigger();
  res.status(202).json({ accepted: true });
}

const router = express.Router();
router.post('/events-ping', handleEventsPing);

export default router;
```

In `backend/src/server.ts`, add `import midasPingRoutes from './routes/midasPing';` beside the other route imports and mount it directly after the `app.use('/api/auth/oidc', oidcRoutes);` line (before the block of authenticated routes):

```ts
// Server-to-server ping from Midas (signed; no session). See routes/midasPing.ts.
app.use('/api/midas', midasPingRoutes);
```

- [ ] **Step 4: Run the tests and type-check**

Run (from `backend/`): `npx vitest run tests/routes/midasPing.test.ts && npx tsc --noEmit`
Expected: all PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/midasPing.ts backend/src/server.ts backend/tests/routes/midasPing.test.ts
git commit -m "feat(notifications): signed Midas ping endpoint that triggers an immediate event pull"
```

---

### Task 6: Read-on-open, and remove the old unread feed

**Files:**
- Modify: `backend/src/services/ExpenseMessageService.ts`, `backend/src/routes/expenseMessages.ts`, `backend/src/server.ts`, `backend/src/database/repositories/ExpenseMessageNotificationRepository.ts`
- Modify tests: `backend/tests/services/ExpenseMessageService.test.ts`, `backend/tests/repositories/ExpenseMessageNotificationRepository.test.ts`, and any route test for `/expense-messages/unread`

**Interfaces:**
- Consumes: `notificationRepository.markReadForExpense(userId, expenseId, kinds)` (Task 1); `CONVERSATION_KINDS` (Task 3).
- Produces: `expenseMessageService.markRead(expenseId, actor)` marks the caller's conversation notifications for that expense read and returns the count, with no call to Midas. `GET /api/expense-messages/unread` no longer exists. `ExpenseMessageNotificationRepository` exports only `getCursor` and `setCursor`.

- [ ] **Step 1: Write the failing test**

In `backend/tests/services/ExpenseMessageService.test.ts`, read the existing mocks at the top of the file, then:

- add this mock beside the others:

```ts
vi.mock('../../src/database/repositories/NotificationRepository', () => ({
  notificationRepository: { markReadForExpense: vi.fn(async () => 3) },
}));
```

- import `notificationRepository` from that module;
- replace every existing test of `markRead` and delete every test of `unreadForUser` with:

```ts
describe('markRead', () => {
  it('marks the caller\'s conversation notifications for that expense read, without calling Midas', async () => {
    const actor = { id: 'u-1', email: 'a@x.com', name: 'Ana', role: 'salesperson', username: 'ana' };
    const updated = await expenseMessageService.markRead('ex-1', actor as never);
    expect(updated).toBe(3);
    expect(notificationRepository.markReadForExpense).toHaveBeenCalledWith(
      'u-1', 'ex-1', ['expense.message', 'expense.mention', 'expense.info_requested']
    );
  });
});
```

If that file's Midas client or expense store mock exposes a spy (for example `getById`), also assert in this test that it was not called.

- [ ] **Step 2: Run it to verify it fails**

Run (from `backend/`): `npx vitest run tests/services/ExpenseMessageService.test.ts`
Expected: FAIL: `markReadForExpense` not called (the service still calls `markThreadRead`).

- [ ] **Step 3: Implement**

In `backend/src/services/ExpenseMessageService.ts`:

- replace the import of `markThreadRead, listUnread` with:

```ts
import { notificationRepository } from '../database/repositories/NotificationRepository';
import { CONVERSATION_KINDS } from './notifications/expenseNotifications';
```

- replace `markRead` and delete `unreadForUser`:

```ts
  /**
   * The user opened this expense's conversation: clear their message,
   * mention and info-request notifications for it. Scoped to the caller's
   * own notifications, so it needs no access check against the expense and
   * no call to Midas.
   */
  async markRead(expenseId: string, actor: ExpenseActor): Promise<number> {
    return notificationRepository.markReadForExpense(actor.id, expenseId, CONVERSATION_KINDS);
  }
```

In `backend/src/routes/expenseMessages.ts`: delete the `unreadRouter` export and its `/unread` handler, and change the file's header comment to "Expense message thread routes, mounted under /api/expenses."

In `backend/src/server.ts`: change the import to `import expenseMessageRoutes from './routes/expenseMessages';` and delete the line `app.use('/api/expense-messages', authenticateToken, sessionTracker, expenseMessageUnreadRoutes);`.

In `backend/src/database/repositories/ExpenseMessageNotificationRepository.ts`: delete `NotificationInsert`, `NotificationRow`, `recordNotifications`, `listUnread` and `markThreadRead`. Keep `getCursor` and `setCursor`. Replace the header comment with:

```ts
/**
 * Cursor storage for the Midas event scanner (table midas_message_sync_state).
 *
 * This file used to hold the message-notification rows too; those now live
 * in the general notifications table (see migration 046). The
 * expense_message_notifications table is left in place, unused.
 */
```

In `backend/tests/repositories/ExpenseMessageNotificationRepository.test.ts`: delete the tests of the removed functions; keep the `getCursor` / `setCursor` tests. If nothing is left, delete the file.

Search for and remove any route test of the unread endpoint: `grep -rn "expense-messages/unread\|unreadRouter\|unreadForUser\|markThreadRead\|recordNotifications\|listUnread(" backend/src backend/tests` must print nothing when you are done (the `notificationRepository.listUnread` method on the general notifications repository is unrelated and stays; the pattern above only matches the bare function call form, so check each hit).

- [ ] **Step 4: Run the tests and type-check**

Run (from `backend/`): `npx vitest run tests/services/ExpenseMessageService.test.ts tests/repositories tests/routes && npx tsc --noEmit`
Expected: all PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add -u backend/src backend/tests
git commit -m "feat(notifications): opening a thread clears its notifications; the separate unread feed is removed"
```

Before committing run `git status --short` and confirm only this task's files are staged.

---

### Task 7: One bell list in the header

**Files:**
- Modify: `src/components/layout/Header.tsx`
- Test: `src/components/layout/__tests__/Header.notifications.test.tsx`

**Interfaces:**
- Consumes: the general notification list (`notificationsApi.listUnread`), which now carries expense notifications too; `notificationTarget` handles the `expense` link (Task 2).
- Produces: a header bell with exactly one source. No request to `/expenses` (for the bell) and none to `/expense-messages/unread`.

- [ ] **Step 1: Write the failing tests**

In `src/components/layout/__tests__/Header.notifications.test.tsx`, the file already mocks `../../../utils/api` (`getExpenses`) and `../../../utils/apiClient` (`get`). Import both mocks (`import { api } from '../../../utils/api'; import { apiClient } from '../../../utils/apiClient';`) and add inside the main `describe`:

```ts
  it('builds the bell from the notification list only: no expense fetch, no message feed', async () => {
    renderHeader();
    await waitFor(() => expect(notificationsApi.listUnread).toHaveBeenCalled());
    expect(api.getExpenses).not.toHaveBeenCalled();
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it.each(['admin', 'developer', 'accountant', 'coordinator'] as const)(
    'shows no pending-expense section or count to a %s',
    async (role) => {
      mockRows([]);
      vi.mocked(api.getExpenses).mockResolvedValue([{ id: 'e-1', status: 'pending' }] as never);
      render(<Header user={{ ...user, role }} onLogout={vi.fn()} onToggleMobileMenu={vi.fn()} onNavigate={vi.fn()} />);
      await waitFor(() => expect(notificationsApi.listUnread).toHaveBeenCalled());
      fireEvent.click(screen.getByRole('button', { name: /Notifications/ }));
      expect(screen.queryByText(/pending/i)).not.toBeInTheDocument();
      expect(screen.getByText('No new notifications')).toBeInTheDocument();
    }
  );

  it('opens an expense notification on that expense', async () => {
    mockRows([row({ kind: 'expense.approved', title: 'Expense approved', link: { page: 'expense', expenseId: 'ex-9' } })]);
    const onNavigate = vi.fn();
    renderHeader(onNavigate);
    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }));
    fireEvent.click(await screen.findByText('Expense approved'));
    expect(window.location.hash).toBe('#expense=ex-9');
    expect(onNavigate).toHaveBeenCalledWith('expenses');
  });
```

If the `user` fixture's `role` type rejects `'accountant'` or others, cast the spread (`as never`) rather than changing the fixture.

- [ ] **Step 2: Run them to verify they fail**

Run (repo root): `npx vitest run src/components/layout/__tests__/Header.notifications.test.tsx`
Expected: FAIL: `getExpenses` and `apiClient.get` are called, and the pending section renders for privileged roles. (The "opens an expense notification" test may already pass after Task 2; that is fine.)

- [ ] **Step 3: Remove the two derived sections from `Header.tsx`**

Read the whole component first. Then remove, and only remove:

1. The pending-expense state and effect: `notifications` / `setNotifications`, `previousNotificationCount`, `hasViewedNotifications`, and the `React.useEffect` that calls `api.getExpenses()` (or reads cached expenses) and filters `status === 'pending'` by role.
2. The message state and effect: `unreadMessages` / `setUnreadMessages` and the `React.useEffect` that polls `/expense-messages/unread`.
3. In the panel JSX: the "N pending" chip in the panel header; the `unreadMessages.length > 0 && (...)` block; and the list that maps `notifications` (pending expenses) into buttons with "Pending expense approval · tap to review". Keep the empty state ("No new notifications") and show it when `appNotifications.length === 0`.
4. Simplify the unread indicator to `const hasUnreadNotifications = appNotifications.length > 0;` and `handleNotificationClick` to only toggle the panel.
5. Imports that are now unused (`api`, `apiClient`, the `Expense` type) — remove each only if nothing else in the file uses it.

Do not change the general notification list (`appNotifications`), its polling, `openAppNotification`, or "Mark all read".

- [ ] **Step 4: Run the tests, lint and build**

Run (repo root): `npx vitest run src/components/layout/__tests__/Header.notifications.test.tsx src/utils/__tests__/notificationLinks.test.ts && npm run lint && npm run build`
Expected: both test files PASS; lint reports 0 errors; the build succeeds. If another existing Header test file asserts the removed sections, update or delete those assertions and list them in the report.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/Header.tsx src/components/layout/__tests__
git commit -m "feat(notifications): the header bell has one list; pending-expense and message sections removed"
```

---

### Task 8: Docs and release v2.33.0

**Files:**
- Modify: `CHANGELOG.md`, `CLAUDE.md`, `docs/ARCHITECTURE.md`, `env.example`, `backend/env.example`, `package.json`, `package-lock.json`, `backend/package.json`, `backend/package-lock.json`, `backend/src/config/version.ts`

**Interfaces:**
- Produces: a release commit on the branch. Merge, push, deploy and the switch-on are the controller's (see the Midas plan's "Deploy and switch-on") and are NOT part of this task.

- [ ] **Step 1: Full verification**

Run (from `backend/`): `npx tsc --noEmit && npx vitest run --exclude 'tests/integration/**' && npx vitest run tests/integration/midas-event-notifications-schema.test.ts tests/integration/notification-catalog-schema.test.ts tests/integration/reminder-windows.test.ts && npm run build`
Run (repo root): `npm run lint && npx vitest run src/utils src/components/layout && npm run build`
Expected: no type errors; every backend unit, route and listed integration test passes; both builds succeed; frontend failures, if any, are only in `src/utils/__tests__/api.pdf-download.test.ts` (pre-existing, unchanged on this branch). Record the counts in the report. If anything else fails, stop and report BLOCKED with the output.

Also confirm the contract fixture still matches Midas's:

```bash
diff /Users/sahilkhatri/Work/midas/apps/api/src/__tests__/fixtures/extEvents.json backend/tests/fixtures/midasEvents.json && echo IDENTICAL
```

Expected: `IDENTICAL`. If the Midas file is missing or differs, report it; do not edit either file to force a match.

- [ ] **Step 2: Version**

```bash
npm version 2.33.0 --no-git-tag-version
(cd backend && npm version 2.33.0 --no-git-tag-version)
```

Set `FRONTEND_VERSION` in `backend/src/config/version.ts` to `'2.33.0'`. Then `git grep -n "2\.32\.0" -- . ':!CHANGELOG.md' ':!docs' ':!*package-lock.json'` must print nothing.

- [ ] **Step 3: Changelog**

In `CHANGELOG.md`, directly below `## [Unreleased]`:

```markdown
## [2.33.0] - 2026-10-08 - Expense notifications from Midas

### Added
- **You are told what happened to your expense.** A notification in the bell, and a push, when your expense is approved, rejected (with the accountant's note), when more information is requested, when your reimbursement is paid, and when an expense you submitted is still missing a receipt, category or payment method.
- **Messages and mentions from the accountant** now arrive in the same list, usually within seconds. Opening the expense's conversation clears them, and you can reply there as before.

### Changed
- **The bell is one list.** The separate "messages" section is gone; message notifications that were still unread are carried over.
- **The "pending expenses" list in the bell is gone for everyone**, including admins, developers, coordinators and accountants. Accountants are told about expenses that need review in Midas (Midas v1.21.0).

### Technical
- Argo pulls Midas's event feed (`GET /ext/events`) with `MidasEventScanner`, which replaces `ExpenseMessageScanner`. Midas pings `POST /api/midas/events-ping` (HMAC-signed, env `MIDAS_EVENTS_PING_SECRET`) to trigger an immediate pull; the 2-minute timer remains as the fallback.
- Migration `046_midas_event_notifications.sql`: `notifications.source_event_id` (unique) makes each event exactly-once; unread rows from `expense_message_notifications` are copied into `notifications`. The old table is left in place, unused.
- Removed `GET /api/expense-messages/unread`. `POST /api/expenses/:id/messages/read` now clears the caller's conversation notifications for that expense.
- Requires Midas v1.21.0 with events enabled for Argo's connection and the `events:read` permission.
```

- [ ] **Step 4: Docs and env examples**

In `CLAUDE.md`, in the `notifications/` bullet under "Key service boundaries", append:

```markdown
  `expenseNotifications` turns Midas feed events into notifications;
  `services/midas/MidasEventScanner.ts` pulls `GET /ext/events` (cursor in
  `midas_message_sync_state`, key `trade_show:events`) and
  `routes/midasPing.ts` lets Midas trigger a pull. `notifications.source_event_id`
  is the dedupe key, so a re-read page never notifies twice.
```

In `docs/ARCHITECTURE.md`:

- replace the bullet that begins `- **`ExpenseMessageScanner.ts`** —` with:

```markdown
- **`midas/MidasEventScanner.ts`** — pulls Midas's event feed (`GET /ext/events`), ordered by sequence number. Midas hands every submitter-facing notification on an Argo expense to Argo instead of delivering it itself; each event becomes one notification through `notifications/expenseNotifications.ts`. Delivery is at-least-once from the feed and exactly-once in the bell, because the event id is a unique key on the notification row. Midas also pings `/api/midas/events-ping` (signed) so the pull happens at once; the 2-minute timer covers a lost ping.
```

- in any sequence diagram that names `ExpenseMessageScanner` as a participant, rename the participant to `MidasEventScanner` and change its poll arrow's label to `GET /ext/events?since=<seq>`; change nothing else in the diagram.
- in section "10. Notification catalog", add a row to the table: `| `expenseNotifications.ts` | approved, rejected, info requested, message, mention, reimbursement paid, missing details (from Midas events) |` and replace that section's last paragraph (the one saying the pending-expense and message bells are separate) with: "The bell has one source: the `notifications` table."

In `env.example` and `backend/env.example`, beside `EXPENSE_MESSAGING_ENABLED` / the Midas block, add:

```
# Shared secret for Midas's "you have events" ping (POST /api/midas/events-ping).
# Must equal Midas's EXT_EVENTS_PING_SECRET. Unset = pings are rejected; the 2-minute pull still delivers.
# MIDAS_EVENTS_PING_SECRET=
```

- [ ] **Step 5: Commit**

```bash
git add CHANGELOG.md CLAUDE.md docs/ARCHITECTURE.md env.example backend/env.example package.json package-lock.json backend/package.json backend/package-lock.json backend/src/config/version.ts
git commit -m "chore(release): 2.33.0"
```

---

## Deploy (controller, after both whole-branch reviews)

Run together with the Midas plan's "Deploy and switch-on", in that plan's order. The Argo steps are:

1. Midas v1.21.0 is deployed and verified, with events still off. Grant `events:read` to Argo's production connection now (it is harmless while events are off, and without it the new scanner logs a 403 every two minutes).
2. Put `MIDAS_EVENTS_PING_SECRET` (the same value as Midas's `EXT_EVENTS_PING_SECRET`) in `/etc/expenseapp/backend.env` on CT 2220.
3. Merge and push Argo. Deploy the backend with `./scripts/deploy-production-backend.sh`. From the startup log confirm `✓ Applied: 046_midas_event_notifications.sql` and `[MidasEvents] Scanner started`, and that no `[MidasEvents] Scan failed` line follows.
4. Deploy the frontend with `./scripts/deploy-production-frontend.sh`; wait for NPMplus; confirm the public health endpoint reports `2.33.0`.
5. Switch events on in Midas (Midas plan, step 6), then run the end-to-end check with the user.
