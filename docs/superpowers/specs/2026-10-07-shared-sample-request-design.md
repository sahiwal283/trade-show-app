# Shared Sample Request — Design

**Date:** 2026-10-07
**Status:** Approved for planning
**Target release:** v2.31.0
**Supersedes parts of:** `2026-10-07-sample-requests-design.md` (v2.30.0, live in production)

## Goal

Two changes to the sample request feature shipped in v2.30.0:

1. The Samples view moves off the top-level Admin / My / Samples toggle and
   into the booking board row beside Booth, Flights, Hotels, Cars, Tasks.
2. There is **one sample request per event**, not one per rep. Any
   participant on the show can open it and change quantities. Nobody owns it.

Everything else from v2.30.0 stays: the 10-day close window, the puller
notification on submit and re-submit, the dashboard countdown row, the
48-hour reminder, the admin catalog, the general notifications table.

## Decisions made during brainstorming

| Question | Decision |
|---|---|
| Where do plain reps reach the shared form? | The Samples board tab is visible to everyone on the show. Non-privileged reps see just that one board tab under My Checklist. |
| Dashboard row after submission | Stays visible for everyone as a quieter "Submitted · edit until <close>" link. Before submission it is the amber/red countdown row. |
| 48-hour reminder | Fires to every participant 48 h before close **regardless of whether the form was submitted** (send-once per user per event, as today). |
| Puller's view | The same form, read-only unless they are on the roster or an override role, plus a status line and a **change history** (who changed which numbers and when). |
| Puller notifications | On every submit or re-submit by anyone, naming the person. Edits without a submit stay silent. |
| Concurrent editing | Row-level saves: the client sends only changed rows; the server merges row by row. The page refreshes untouched rows every 30 s and on window focus and shows "Updated by <name> just now". |
| Data migration | Reshape in place (migration 044). Existing per-rep rows for an event are merged by summing quantities into one row. |
| Close time | Unchanged: 23:59:59 America/New_York on `(travel_start_date ?? show_start_date) − 10 days`, computed only by `sampleRequestWindow.ts`. |

## Data model

One new migration, `044_shared_sample_requests.sql`.

### `sample_requests` (reshaped)

```sql
-- before: UNIQUE (event_id, user_id); user_id NOT NULL
ALTER TABLE sample_requests RENAME COLUMN user_id TO created_by;
ALTER TABLE sample_requests ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE sample_requests
  ADD COLUMN submitted_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN last_edited_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN last_edited_at TIMESTAMPTZ;
-- merge step (below), then:
ALTER TABLE sample_requests DROP CONSTRAINT sample_requests_event_id_user_id_key;
ALTER TABLE sample_requests ADD CONSTRAINT sample_requests_event_id_key UNIQUE (event_id);
```

`status` (`draft` | `submitted`), `submitted_at`, `created_at`, `updated_at`
stay. The migration also redefines the `created_by` foreign key as
`ON DELETE SET NULL` (it was `CASCADE` when the column was `user_id`), so a
shared request survives the deletion of whoever first opened it.

### Merge step (inside the migration's transaction)

For each `event_id` with more than one request row:

1. Pick the keeper: the row with the earliest `created_at`.
2. For each `product_id` across all rows of that event, insert or update the
   keeper's `sample_request_items` row with the **sum** of `singles`,
   `displays`, `empty_displays`.
3. For each `material_id`, sum `qty`; `notes` becomes the earliest non-null,
   non-blank notes among the rows (by `created_at`).
4. Keeper `status` = `submitted` if any row was submitted; `submitted_at` =
   the earliest such `submitted_at`; `submitted_by` = that row's old
   `user_id`. `last_edited_at` = the latest `updated_at` across rows;
   `last_edited_by` = that row's old `user_id`.
5. Delete the non-keeper rows (items/materials cascade).

Events with exactly one row keep it as is (`created_by` = old `user_id`).

### `sample_request_items`, `sample_request_materials`

Unchanged shape; now one set per event.

### `sample_request_changes` (new)

```sql
CREATE TABLE sample_request_changes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id  UUID NOT NULL REFERENCES sample_requests(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('item','material')),
  target_id   UUID NOT NULL,              -- sample_products.id or sample_materials.id
  field       TEXT NOT NULL CHECK (field IN ('singles','displays','empty_displays','qty','notes')),
  old_value   TEXT,
  new_value   TEXT,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX sample_request_changes_request_idx ON sample_request_changes (request_id, changed_at DESC);
```

Written by the server, one row per field whose value actually changed, in
the same transaction as the row upsert. History is therefore derived from
what persisted, never from the client's account of what it did.

### Unchanged

`sample_request_reminders` (still per user; reminders go to everyone),
`notifications`, the catalog tables, `app_settings.sample_puller_user_id`.

## Backend

### `SampleRequestService`

| Method | Rule |
|---|---|
| `getForEvent(eventId, actor)` | Readable by participants, override roles (admin, coordinator, developer) and the configured puller. Creates the event's draft row if missing. Returns `{ request, window, canEdit }` where `request` carries items, materials, status, `submittedBy`/`submittedAt`, `lastEditedBy`/`lastEditedAt` (user **names**, plus ids), and `canEdit` is computed for the actor (participant or override while open; override after close). |
| `patchRows(eventId, patch, actor)` | `patch = { items: SampleRequestItem[], materials: SampleRequestMaterial[] }` containing only the rows the client changed. Guards: roster or override; window open unless override (409 `WINDOW_CLOSED`). Validates every row against the catalog (inactive rows allowed, as today) and the 0–10000 range; a 400 writes nothing. Per row: load current, upsert (delete when all quantities are 0 and notes blank), write one `sample_request_changes` row per changed field. Updates `last_edited_by/at`. Returns the full current request. |
| `submit(eventId, actor)` | Same guards. Sets `status='submitted'`, `submitted_at=now()`, `submitted_by=actor`. Notifies the puller: first submission "New sample request · <show>", later "Sample request updated · <show>", body names the submitter. Notification failure never fails the submit. |
| `getHistory(eventId, actor)` | Same read access as `getForEvent`. Newest first, capped at 200, each row resolved to user name and product/material name (with line and brand for products). |
| `listMyOpen(userId)` | Open windows for the user's shows. Status is the event's status; submitted shows are still returned (the dashboard shows the quieter variant). |
| `announceIfOpen` | Unchanged. |
| `canViewSamples(eventId, actor)` | Roster, override roles, or puller. Replaces the old `canViewSummary`. |

`SampleRequestReminderService`: the "unsubmitted only" filter is removed;
every participant is reminded once per event.

Removed: `getRequest`/`saveDraft`/`submit` keyed by target user, the
on-behalf path, `getEventSummary`.

### Routes (`/api/sample-requests`)

| Method | Path | Who |
|---|---|---|
| GET | `/catalog`, catalog CRUD | unchanged |
| GET | `/mine` | any (dashboard feed) |
| GET | `/:eventId/access` | any → `{ canView, canEdit }` |
| GET | `/:eventId` | roster, override, puller |
| PATCH | `/:eventId` | roster/override (service enforces window) |
| POST | `/:eventId/submit` | roster/override |
| GET | `/:eventId/history` | roster, override, puller |

Removed: `/:eventId/mine`, `/:eventId/users/:userId*`, `/:eventId/summary`,
`/access` (replaced by the per-event one). UUID guards and the 409/400/404
conventions from v2.30.0 stay.

## Frontend

### Placement

- `BookingBoard` gains a `samples` tab after Tasks. Count label: `0/1` until
  submitted, `1/1` after.
- The top-level toggle on the checklist page returns to Admin Checklist /
  My Checklist. For non-privileged reps, `UserChecklist` renders the same
  Samples panel under its show switcher behind a one-tab segmented control
  labelled Samples, so the page reads like the board.
- The deep link `#event=<id>&tab=samples` opens that show's Samples board
  tab (or the rep's Samples panel). `tab=my` behaves as today. Cold-start
  routing and the Expenses/Reports hash readers stay as fixed in v2.30.0.

### `SamplesPanel` (one component, both places)

Status line: "Submitted by Rita on Oct 14 · last edited by Sameer 5 min
ago" (or "Not yet submitted"). Countdown pill or Closed pill (red inside
48 h). Two brand cards (Haute Brands, Coolioh) with product lines and the
three inputs; materials card with Qty and Notes. Submit / "Resubmit
changes" button. A collapsible **History** section under the form listing
"Sameer changed Mango singles 2 → 4 · 5 min ago", newest first. "Edit
anyway" toggle for override roles after close. "Updated by Sameer just now"
note when a poll brings someone else's change. Read-only rendering for a
viewer without edit rights (the puller off-roster).

### `useEventSampleRequest`

- Loads `GET /:eventId` and the catalog (`includeInactive=true`).
- Tracks dirty state **per row**; autosave after 800 ms sends only the dirty
  rows as a PATCH; the response reconciles every row the user is not
  currently editing (dirty or focused rows are preserved).
- Polls `GET /:eventId` every 30 s and on `window` focus; same
  reconciliation rule; sets `updatedBy` when `lastEditedBy` changes to
  someone else.
- Submit awaits any in-flight patch, flushes dirty rows, aborts on failure,
  then posts submit.
- Carries over from v2.30.0: offline (read-only + flush on reconnect),
  forbidden (render nothing), closed derived from the clock, unmount save
  of dirty rows, 409 → closed, quantities clamped to 10000.

### Dashboard

`ActionQueue` rows from `GET /mine`:
- not submitted → amber (red inside 48 h): "Sample request for <show>
  closes in 2d 6h", action Start/Finish;
- submitted → stone: "Sample request for <show> submitted · edit until
  <close date>", action Open.
Both deep-link to `#event=<id>&tab=samples`.

### Removed

`SampleRequestSection` on My Checklist, `SamplesSummaryTab`, the on-behalf
chip editor, `useSampleRequest`, and their tests. Admin catalog editor is
unchanged.

## Error handling

- Patch after close (non-override) → 409 `{ code: 'WINDOW_CLOSED', closesAt }`; the panel flips to Closed.
- Patch with an unknown product/material, a non-integer, or a value outside 0–10000 → 400; nothing written, no change-log rows.
- Concurrent patches: different rows both persist; the same row takes the later patch for that row only; both are in history.
- Poll failure: silent; the panel keeps its last state.
- History failure: "History unavailable" under the form; editing unaffected.
- Puller notification failure: logged, submit succeeds. No puller configured: warning logged, submit succeeds.

## Testing

Backend (Vitest):
- Migration 044 integration test: two reps' rows for one event sum into one row, extras deleted, `submitted` and `submitted_by` preserved, `UNIQUE (event_id)` present, `sample_request_changes` exists.
- Service: `patchRows` upserts only the sent rows, deletes zero rows, writes change rows only for fields that changed, rejects bad rows with no writes; `submit` wording and submitter name, first vs repeat; read access for puller, roster, override, stranger (403); `getHistory` order and cap; `listMyOpen` includes submitted shows with their status.
- Reminder scanner reminds submitted and unsubmitted alike, once.
- Routes: new paths, removed paths gone, UUID guards.

Frontend (Vitest + Testing Library):
- Hook: dirty-row tracking, PATCH payload contains only changed rows, reconciliation preserves rows under edit, poll on focus, "updated by" note, submit flush ordering.
- Panel: status line variants, history list, read-only mode, Closed state, Edit anyway.
- Board tab for an admin and the one-tab panel for a rep; dashboard rows for both statuses.
- Judge the suite by the directories touched (baseline failures pre-exist).

## Release

- Bump to **2.31.0** in both package files.
- Migration 044 auto-applies (with the merge) on backend start; verify `schema_migrations` afterwards as usual.
- No new manual step; the puller setting carries over.
- CHANGELOG entry; ARCHITECTURE §9 rewritten for the shared form; CLAUDE.md bullet updated.

## Out of scope

- Per-rep requests (removed), catalog reorder UI, offline sync queue,
  notification retention, re-announcing when a date move reopens a window.
