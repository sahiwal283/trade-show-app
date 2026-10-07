# Sample Requests — Design

**Date:** 2026-10-07
**Status:** Approved for planning
**Target release:** v2.30.0

## Goal

Replace the two paper trade show checklists (Haute Brands and Coolioh /
Boomin Brands) with an in-app **Sample Request** section on the Checklist
page. Every person assigned to a show requests the product samples and
marketing materials they need. The request window opens when the event is
created and closes one week before travel. One designated staff member (the
"sample puller") receives every submission and sees a combined list per show.

Only the sample and marketing-materials sections of the paper sheets are in
scope. "Booth essentials", "activation kit" and "before leaving" are not.

## Decisions made during brainstorming

| Question | Decision |
|---|---|
| Which products does a rep see? | Both brands at every show. No event or user brand tagging. |
| Fields per product | Three integers: **Singles**, **Displays**, **Empty Displays**. |
| Fields per marketing material | **Qty** (integer) and **Notes** (text). |
| Who fills it in? | Every event participant, regardless of role. |
| Who is the puller? | One user chosen in Admin settings (`app_settings` key `sample_puller_user_id`). |
| When is the puller notified? | On **submit** and **re-submit** only. Draft edits never notify. |
| Notification channels | Web push **and** the header bell panel (persistent until read). |
| Close time | 23:59:59 America/New_York on `travel_start_date − 7 days`. Falls back to `show_start_date` when travel start is null. Computed live, never stored. |
| Date moves after open | Deadline moves with it. Later date reopens a closed form; earlier date past the cutoff closes it. |
| Participant added after close | No notification, no action item. Section shows "closed". |
| Late edits | Admin and coordinator can edit any rep's request after close. |
| Catalog management | Admin UI: brand → product line → product, plus a shared materials list. Seeded from the two sheets. Retired items are **inactive**, never deleted. |
| Reminder | One `closing_48h` push + bell entry to participants who have not submitted, 48 hours before close. |
| Offline | Requires connectivity. Offline shows last loaded state read-only. No sync-queue work. |

## Data model

One new migration, `043_create_sample_requests.sql`.

### Catalog

```sql
sample_product_lines
  id            UUID PK
  brand         TEXT NOT NULL CHECK (brand IN ('haute_brands','boomin_brands'))
  name          TEXT NOT NULL
  position      INT NOT NULL DEFAULT 0
  is_active     BOOLEAN NOT NULL DEFAULT TRUE
  created_at, updated_at TIMESTAMPTZ
  UNIQUE (brand, name)

sample_products
  id               UUID PK
  product_line_id  UUID NOT NULL REFERENCES sample_product_lines(id) ON DELETE RESTRICT
  name             TEXT NOT NULL
  position         INT NOT NULL DEFAULT 0
  is_active        BOOLEAN NOT NULL DEFAULT TRUE
  created_at, updated_at TIMESTAMPTZ
  UNIQUE (product_line_id, name)

sample_materials
  id          UUID PK
  name        TEXT NOT NULL UNIQUE
  position    INT NOT NULL DEFAULT 0
  is_active   BOOLEAN NOT NULL DEFAULT TRUE
  created_at, updated_at TIMESTAMPTZ
```

Brand keys reuse the badge-scan convention (`haute_brands`, `boomin_brands`).
Display names: "Haute Brands", "Coolioh".

### Requests

```sql
sample_requests
  id            UUID PK
  event_id      UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted'))
  submitted_at  TIMESTAMPTZ
  created_at, updated_at TIMESTAMPTZ
  UNIQUE (event_id, user_id)

sample_request_items
  request_id      UUID NOT NULL REFERENCES sample_requests(id) ON DELETE CASCADE
  product_id      UUID NOT NULL REFERENCES sample_products(id) ON DELETE RESTRICT
  singles         INT NOT NULL DEFAULT 0 CHECK (singles >= 0)
  displays        INT NOT NULL DEFAULT 0 CHECK (displays >= 0)
  empty_displays  INT NOT NULL DEFAULT 0 CHECK (empty_displays >= 0)
  PRIMARY KEY (request_id, product_id)

sample_request_materials
  request_id    UUID NOT NULL REFERENCES sample_requests(id) ON DELETE CASCADE
  material_id   UUID NOT NULL REFERENCES sample_materials(id) ON DELETE RESTRICT
  qty           INT NOT NULL DEFAULT 0 CHECK (qty >= 0)
  notes         TEXT
  PRIMARY KEY (request_id, material_id)
```

A save replaces the full item and material sets for the request. Rows whose
quantities are all zero (and, for materials, notes empty) are not stored.

### Notifications (general purpose)

```sql
notifications
  id          UUID PK
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE
  kind        TEXT NOT NULL            -- e.g. sample_request.open, sample_request.submitted, sample_request.closing_48h
  title       TEXT NOT NULL
  body        TEXT NOT NULL
  link        JSONB                    -- { page: 'checklist', eventId: '…' }
  read_at     TIMESTAMPTZ
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
INDEX (user_id, read_at)
```

This table is the first general-purpose in-app notification store. Sample
requests are its first producer. The existing derived pending-expense list and
`expense_message_notifications` are **not** migrated in this work.

### Send-once ledger

```sql
sample_request_reminders
  event_id   UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE
  kind       TEXT NOT NULL             -- 'form_open' | 'closing_48h'
  sent_at    TIMESTAMPTZ NOT NULL DEFAULT now()
  PRIMARY KEY (event_id, user_id, kind)
```

Insert `ON CONFLICT DO NOTHING` **before** sending. A conflict means it was
already handled. Same pattern as `travel_reminders`.

### Setting

`app_settings.key = 'sample_puller_user_id'`, value `{ "userId": "<uuid>" | null }`.

### Seed data

The migration seeds, in sheet order:

**boomin_brands**
- Freeze Dried Candy: Rainbow Bursts, Sour Bursts, Fuego Bursts, Polar Pops, Smart Blasts, Chic-Oh Stix, Cosmic Caramel, Dubai Chocolate, Peach Pops, Party Pack (40ct), Assorted Pack (5ct)
- Peelz: Mango, Grape, Peach, Banana
- Coolioh Fuego Peelz: Mango Magma, Grapanero, Lava Banana, Peach Diablo
- Coolioh Fuegos: Rushin' Chili, Flamin' Pina, Blazin' Mango, Gushin' Dill Pickle
- Tokyo Ice Cream: Tokyo Ice Cream

**haute_brands**
- Oh! Mit: Mango Peach, Purple Haze, Blue Razz, Spear-mit, Pink Rozay, Pineapple Xpress
- HyMIT: Mango Peach, Purple Haze, Blue Razz, Spear-mit, Pink Rozay, Pineapple Xpress
- Sex Strips: Fix Your Spark, Fix Him, Her Fix, Jack Rabbit (J.R.)

**materials**: Clip Strips, T-Shirts, Swag Bags, Floor Displays, Stickers, Banner

Seeds use `ON CONFLICT DO NOTHING` so re-running is safe.

## Window rule

```
closeDate = (travel_start_date ?? show_start_date) − 7 days
closesAt  = closeDate at 23:59:59 America/New_York
opensAt   = event.created_at
isOpen    = now >= opensAt && now <= closesAt
```

Implemented once in `SampleRequestService.getWindow(event)` and used by every
endpoint, the dashboard feed, and the reminder scanner. The frontend never
computes the close time; it receives `closesAt` and renders the countdown.

Events with neither date have no window (`isOpen = false`, `closesAt = null`).

## Backend

### `SampleRequestService` (`backend/src/services/sampleRequests/`)

| Method | Rule |
|---|---|
| `getWindow(event)` | See above. |
| `getCatalog()` | Active lines/products/materials, ordered by position. Admin CRUD variants include inactive. |
| `getOrCreateDraft(eventId, userId, actor)` | Actor must be the participant themself, or admin/coordinator/developer. Non-participants get 403. |
| `saveDraft(eventId, userId, payload, actor)` | 409 `WINDOW_CLOSED` with `closesAt` when closed, unless actor is admin/coordinator/developer. Replaces items + materials in one transaction. Does not change status. |
| `submit(eventId, userId, actor)` | Same guard. Sets `status='submitted'`, `submitted_at=now()`. Notifies the puller: first submit → "New sample request", later → "Sample request updated". |
| `listMyOpenRequests(userId)` | Events the user participates in with `isOpen`, each with `closesAt`, `status`, `submittedAt`. Dashboard feed. |
| `getEventSummary(eventId)` | Per brand → line → product: summed singles/displays/empty_displays, plus per-rep breakdown; same for materials; participant list with submitted/not. Draft (unsubmitted) quantities are included in the totals but each rep row is flagged `draft`. Puller, admin, coordinator, developer. |
| `announceIfOpen(eventId, userIds)` | Called from event create and participant add. If window open: ledger insert `form_open` per user, notify only on successful insert. |

### `NotificationService` (`backend/src/services/NotificationService.ts`)

`create(userId, { kind, title, body, link })` inserts the bell row then calls
`pushService.sendToUser` fire-and-forget. `listUnread(userId)`,
`markRead(userId, ids)`, `markAllRead(userId)`.

### `SampleRequestReminderService`

Scanner modeled on `TravelReminderService`: 15-minute interval, 15-second
startup delay. For each event whose `closesAt` is within the next 48 hours and
in the future, for each participant without a submitted request: ledger insert
`closing_48h`, then notify. Silent no-op when push is disabled (bell rows are
still written).

### Routes

`/api/sample-requests` (all authenticated):

| Method | Path | Who |
|---|---|---|
| GET | `/catalog` | any |
| POST/PUT/DELETE | `/catalog/lines`, `/catalog/lines/:id` | admin, developer (DELETE = deactivate) |
| POST/PUT/DELETE | `/catalog/products`, `/catalog/products/:id` | admin, developer |
| POST/PUT/DELETE | `/catalog/materials`, `/catalog/materials/:id` | admin, developer |
| PUT | `/catalog/reorder` | admin, developer |
| GET | `/mine` | any — dashboard feed |
| GET | `/:eventId/mine` | participant |
| PUT | `/:eventId/mine` | participant — save draft |
| POST | `/:eventId/mine/submit` | participant |
| GET | `/:eventId/summary` | puller, admin, coordinator, developer |
| PUT | `/:eventId/users/:userId` | admin, coordinator, developer — edit on behalf, bypasses window |
| POST | `/:eventId/users/:userId/submit` | admin, coordinator, developer |

`/api/notifications`:

| Method | Path |
|---|---|
| GET | `/unread` |
| POST | `/read` body `{ ids: [] }` |
| POST | `/read-all` |

Puller setting: read/written through the existing `/api/settings` route. The
`GET /settings` response includes `samplePullerUserId` for all roles so the
frontend can show the Samples tab to the puller.

### Hooks into existing code

- `routes/events.ts` POST `/` and POST `/:id/participants` → `announceIfOpen`.
- `server.ts` starts `SampleRequestReminderService` next to `TravelReminderService`.

## Frontend

### Checklist page — My tab

New `SampleRequestSection` rendered above the itinerary cards in
`UserChecklist`.

- Header: title, status pill (**Draft** / **Submitted** / **Closed**), countdown
  "Closes in 3d 4h" (red under 48h), or "Closed <date>".
- One card per brand (Haute Brands, Coolioh). Product lines as sub-headers,
  one row per active product with three numeric inputs: Singles, Displays,
  Empty Displays. Inactive products already on the request render greyed with
  "no longer offered".
- Marketing materials card: Qty + Notes per row.
- Autosave draft with ~800 ms debounce via `PUT /:eventId/mine`. Saved / Saving
  indicator.
- **Submit** button. After the first submit it reads **Resubmit changes** and is
  enabled only when the current draft differs from the last submitted snapshot.
- Closed: inputs read-only, banner "Sample requests for this show closed on
  <date>. Contact your coordinator for changes." Admin/coordinator/developer see
  an **Edit anyway** toggle that unlocks inputs and routes saves through the
  on-behalf endpoints.
- Offline: last loaded state read-only with a "reconnect to edit" note.

### Dashboard — Needs your attention

`ActionQueue` gains rows from `GET /sample-requests/mine` for each open show
not yet submitted: "Sample request for <show> closes in 2d 6h". Amber tone;
red within 48h. Click → Checklist page with that show selected. Already
submitted shows do not appear.

### Header bell

Third source: `GET /notifications/unread`, polled every 60 s like messages.
Rows show title, body, relative time. Click → `POST /read` then navigate by
`link`. Panel offers "Mark all read". The two existing sources are untouched.

### Checklist page — Admin tab — Samples

New `SamplesTab` visible to the puller, admin, coordinator, developer. Shows:
close time and open/closed state; participants with submitted / not submitted
and submitted time; aggregated table per brand → line → product with the three
summed columns; expand a row for per-rep quantities; materials table likewise.

### Admin settings — Sample products

New `SampleCatalogSection`: two brand panels, each with product lines (add,
rename, reorder, activate/deactivate) and their products (same operations).
Materials list below with the same operations. "Sample puller" user picker at
the top (active users only, clearable).

### Navigation

Event id passed into the checklist page selects that show on load. Reuse the
existing page-change mechanism in `App.tsx`; add an optional `eventId` param.

## Error handling

- Save/submit after close → 409 `{ code: 'WINDOW_CLOSED', closesAt }`. UI flips to
  closed state instead of a generic error toast.
- Notification sends are fire-and-forget; push failure never fails a submit.
- No puller configured → submit succeeds, server logs a warning, Samples tab
  shows "No sample puller set — configure one in Admin settings."
- Retired product on an existing request → still rendered and preserved on save.
- Catalog delete is a deactivate; products with request rows can never be
  hard-deleted (FK RESTRICT).
- Reminder scanner: ledger-first, so a crash between insert and send loses at
  most one notification rather than duplicating it.

## Testing

Backend (Vitest):
- Window rule: travel vs show fallback, Eastern end-of-day, no dates, exactly at
  boundary, date moved later reopens.
- Draft/submit guards: participant, non-participant 403, closed 409, admin
  override.
- Submit notifications: first vs re-submit wording, no puller configured,
  puller is the submitter.
- `listMyOpenRequests`: excludes submitted, closed, and non-participant events.
- Summary aggregation with mixed submitted/draft reps (drafts are included in
  the aggregate but flagged).
- Reminder scanner: send-once across two scans, skips submitted, skips closed.
- `announceIfOpen`: ledger dedupe on participant re-add.
- Route authorization for catalog CRUD and summary.

Frontend (Vitest + Testing Library):
- Section states: draft, submitted, closed, offline.
- Autosave debounce and Submit/Resubmit enablement.
- Dashboard row rendering and countdown colour.
- Bell merge and mark-read.
- Catalog admin add/rename/deactivate.

Judge the frontend suite by the feature directories touched; the baseline on
main has unrelated pre-existing failures.

## Release

- Bump `package.json` and `backend/package.json` to **2.30.0**.
- Migration auto-applies on backend start and seeds the catalog.
- Manual post-deploy step: pick the sample puller in Admin settings.
- CHANGELOG and ARCHITECTURE entries for sample requests and the new
  notifications table.

## Out of scope

- Booth essentials, activation kit, before-leaving lists.
- Offline editing / sync queue for sample requests.
- Migrating existing expense and message notifications into `notifications`.
- Per-event or per-user brand scoping.
- Inventory deduction or Midas/Zoho integration for samples.
