# Notification Catalog — Design

**Date:** 2026-10-08
**Status:** Awaiting review
**Target release:** v2.32.0
**Scope:** Argo repo only. Spec 1 of 2. Spec 2 (expense notifications via
Midas) is designed separately and is summarised under "Out of scope".

## Goal

Tell the right person, in the bell and by push, whenever something in Argo
changes that they need to know about. Today only sample requests do this
properly. Bookings send a push with no bell row, check-in reminders stop
running when push is unconfigured, and being added to an event, booth
progress, event changes and upcoming-show reminders send nothing at all.

Success means: every trigger in the catalog below produces exactly one bell
row and one push per recipient, through one code path, and the full list of
what Argo notifies about can be read in one folder.

## Decisions made during brainstorming

| Question | Decision |
|---|---|
| Where does the accountant hear about submitted expenses? | In Midas only. Argo's pending-expense bell is removed for every role, in spec 2. |
| How is the work split? | Two specs. This one is Argo-only. Spec 2 covers Midas. |
| Midas → Argo transport | Open. Webhooks in both repos are allowed if cleaner than the 2-minute poll. Decided in spec 2. |
| Booth changes that notify everyone | Booth ordered, booth shipped, booth map uploaded. Electricity ordered does not notify. |
| Event changes that notify | Dates or venue changed, event cancelled, removed from event, booking changed or cancelled. |
| Other areas in scope | Submit-your-expenses reminder, new user awaiting approval, booth component reported, badge scan failed to reach the CRM. |
| Second expense reminder | Goes to every attendee, whether or not they have submitted an expense. No Midas lookup. |
| New-user approval recipients | `admin` and `developer`. |
| Structure | A notification catalog: one named function per trigger. Not inline calls, not an event bus. |

## Rules that apply to every trigger

- One call to `notificationService.notify()` per recipient: one bell row, one
  push. No trigger writes either channel by hand.
- The actor (the user who made the change) is never a recipient.
- Inactive users (`users.is_active = false`) are never recipients.
- An edit notifies only when a field in the trigger's watch list changed.
  Saving a record unchanged sends nothing.
- A notification failure never fails, delays or rolls back the request or
  scan that caused it.
- No per-user mute or preference settings.

## The catalog

`kind` is the value stored in `notifications.kind`.

### Event roster and details

| kind | Fires when | Recipients | Link |
|---|---|---|---|
| `event.added` | A user is newly on an event's roster (create, update, or the checklist's inline add) | The added user | `checklist` + event |
| `event.removed` | A user was on the roster before an update and is not after | The removed user | none (dashboard) |
| `event.details_changed` | Any of `show_start_date`, `show_end_date`, `travel_start_date`, `travel_end_date`, `venue`, `city`, `state` changed | Everyone on the event after the update | `checklist` + event |
| `event.cancelled` | `status` changes to `cancelled` | Everyone on the event | none (dashboard) |

`event.details_changed` names each changed field with its old and new value
in the body. A user added in the same update gets `event.added` only. When an
update both cancels the event and changes details, only `event.cancelled` is
sent. Deleting an event sends nothing: the roster is gone with it, and
cancelling is the supported way to call a show off.

### Booth

Recipients are everyone on the event.

| kind | Fires when | Link |
|---|---|---|
| `booth.ordered` | `booth_ordered` goes from false to true | `checklist` + event |
| `booth.shipped` | A booth shipping record is created with `shipped = true`; body carries carrier and tracking number when present | `checklist` + event |
| `booth.map_uploaded` | A booth map is uploaded (first time or replacement) | `checklist` + event |

### Travel bookings

Recipient is the one affected user: `attendee_id` for flights and hotels,
`assigned_to_id` for car rentals. Link is `checklist` + event (the user's My
Checklist tab).

"Booked" keeps today's meaning: `booked = true`, a confirmation number is
present, and the item has an assignee.

| kind | Fires when |
|---|---|
| `travel.booked` | An item becomes booked: created booked, or updated from not-booked to booked |
| `travel.changed` | A booked item stays booked with the same assignee and a watched field changed |
| `travel.cancelled` | A booked item is deleted, or updated to not-booked |

Reassignment (booked before and after, different assignee) sends
`travel.cancelled` to the previous assignee and `travel.booked` to the new
one.

Watched fields:

- Flight: `carrier`, `confirmation_number`, `departure_at`
- Hotel: `property_name`, `confirmation_number`, `check_in_date`, `check_out_date`
- Car rental: `provider`, `confirmation_number`, `pickup_date`, `return_date`

A car rental with `rental_type = 'group'` still notifies only its
`assigned_to_id`, as it does today.

### Reminders

Recipients are everyone on the event at the moment the reminder fires.

| kind | Window | Link |
|---|---|---|
| `reminder.event_30d` | Anchor is 23 to 30 days away | `checklist` + event |
| `reminder.event_7d` | Anchor is 0 to 7 days away | `checklist` + event |
| `reminder.expenses_1d` | Show ended 1 to 6 days ago | `expenses` + event |
| `reminder.expenses_7d` | Show ended 7 to 13 days ago | `expenses` + event |
| `reminder.flight_checkin_24h` | Departure within 24 h (unchanged) | `checklist` + event |
| `reminder.flight_departure_3h` | Departure within 3 h (unchanged) | `checklist` + event |

- The event anchor is `COALESCE(travel_start_date, show_start_date)`, the
  same anchor the sample window uses.
- "Show ended" is `COALESCE(show_end_date, end_date)`.
- Each reminder is sent once per user per event (per flight for the two
  flight reminders). A user added after a reminder fired does not get it
  retroactively; they got `event.added`.
- A window, not a deadline, is what stops late sends: an event created 10
  days out never enters the 30-day window and only gets the 7-day reminder.
- Cancelled events are skipped by all event and expense reminders.
- Flight reminders go to the flight's attendee only, and now write a bell
  row and run whether or not push is configured.

### Other areas

| kind | Fires when | Recipients | Link |
|---|---|---|---|
| `admin.user_pending` | A user is created in the `pending` role, by registration (`routes/auth.ts`) or SSO auto-provision (`AuthentikOidcService`) | Users with role `admin` or `developer` | `admin-users` |
| `booth.component_reported` | `BoothInventoryService.reportComponent` commits a `damage` or `missing` report | Users with role `admin` or `coordinator` | `booth-inventory` |
| `badge.crm_failed` | A badge scan's CRM push fails for good: `crm_status = 'failed'` and `crm_attempts` has reached `MAX_CRM_ATTEMPTS` (including terminal failures, which jump straight there) | The scan's `scanned_by` user, if set | `badge-scans` |

`badge.crm_failed` is sent once per scan. A manual retry that resets the scan
and fails for good again notifies again.

## Architecture

New folder `backend/src/services/notifications/`:

| File | Responsibility | Depends on |
|---|---|---|
| `recipients.ts` | `eventParticipants(eventId, { except })` and `usersWithRole(roles, { except })`. Both drop inactive users. The only place recipient queries live. | `config/database` |
| `notifyMany.ts` | `notifyMany(userIds, input)`: calls `notificationService.notify` per user, catches and logs per user, returns nothing. | `NotificationService` |
| `eventNotifications.ts` | `added`, `removed`, `detailsChanged`, `cancelled`, plus the pure `diffEventDetails(before, after)`. | `recipients`, `notifyMany` |
| `boothNotifications.ts` | `ordered`, `shipped`, `mapUploaded`, `componentReported`. | `recipients`, `notifyMany` |
| `travelNotifications.ts` | `flightSaved(before, after, actorId)`, `hotelSaved`, `carRentalSaved`, and the pure `classifyBooking(before, after, watched)` that returns which of booked / changed / cancelled / reassigned / nothing applies. `before` is null on create, `after` is null on delete. | `recipients`, `notifyMany` |
| `adminNotifications.ts` | `userPending`, `badgeCrmFailed`. | `recipients`, `notifyMany` |
| `ReminderScheduler.ts` | One 15-minute loop over a list of reminder definitions. Each definition supplies a query for due `(subject_id, user_id)` pairs and a message builder. | `notifyMany`, ledger |
| `index.ts` | Re-exports the catalog. | |

`NotificationService`, `NotificationRepository` and `PushService` are used as
they are. `NotificationLink` and `linkToUrl` gain the new link pages (see
"Deep links").

### How callers use it

After the write has committed, off the response path:

```ts
void boothNotifications.ordered(eventId, req.user!.id).catch(logNotifyError);
```

Call sites:

| Caller | Calls |
|---|---|
| `routes/events.ts` create / update / add participants | `eventNotifications.added` with the newly-added ids each handler already computes; update also calls `removed`, `detailsChanged`, `cancelled` |
| `routes/checklist.ts` `PUT /:checklistId` | `boothNotifications.ordered` when the flag flips |
| `routes/checklist.ts` booth-map upload | `boothNotifications.mapUploaded` |
| `routes/checklist.ts` booth-shipping create | `boothNotifications.shipped` when `shipped` |
| `routes/checklist.ts` flight / hotel / car create, update, delete | `travelNotifications.*Saved(before, after, actor)` |
| `routes/auth.ts` register, `AuthentikOidcService` auto-provision | `adminNotifications.userPending` |
| `BoothInventoryService.reportComponent` (after its transaction) | `boothNotifications.componentReported` |
| `BadgeCrmPushService` after marking results | `adminNotifications.badgeCrmFailed` |

The `notifyBooking` helper and its inline payloads in `routes/checklist.ts`
are deleted.

### Change detection

- **Bookings and booth flag.** The route reads the current row before the
  update or delete and passes before and after to the catalog. The checklist
  repository gains single-row getters where they are missing.
- **Event update.** The handler reads the event before
  `updateWithTransaction` and already snapshots the roster. After commit it
  has before and after for both.
- The comparison itself (`diffEventDetails`, `classifyBooking`) is pure and
  compares normalised values: dates as `YYYY-MM-DD`, timestamps as epoch
  milliseconds, strings trimmed with null and empty treated as equal.

### Reminder scheduler

`ReminderScheduler` replaces `TravelReminderService`. On each pass, for each
definition: run its due query, and for each `(subject_id, user_id)` insert
the ledger row with `ON CONFLICT DO NOTHING RETURNING`; only when a row comes
back, notify. Ledger-first means a crash between claim and send loses that
one reminder and never duplicates it, which matches the two schedulers
already in production.

It starts unconditionally from `server.ts` (bell rows do not depend on push)
with the same 15-second startup delay as the existing schedulers.

`SampleRequestReminderService` is left alone. It works and has its own
window rule.

## Data

One migration, `045_notification_catalog.sql`:

```sql
CREATE TABLE IF NOT EXISTS notification_reminders (
  kind        TEXT NOT NULL,
  subject_id  TEXT NOT NULL,   -- event uuid, or flight id for flight reminders
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, subject_id, user_id)
);

-- Carry the flight ledger over so nobody is re-reminded on deploy.
INSERT INTO notification_reminders (kind, subject_id, user_id, sent_at)
SELECT 'reminder.flight_' || r.kind,   -- checkin_24h, departure_3h
       r.flight_id::text, f.attendee_id, r.sent_at
FROM travel_reminders r
JOIN checklist_flights f ON f.id = r.flight_id
WHERE f.attendee_id IS NOT NULL
ON CONFLICT DO NOTHING;

ALTER TABLE badge_scans ADD COLUMN IF NOT EXISTS crm_failure_notified_at TIMESTAMPTZ;
```

- `subject_id` is text because events use uuids and flights use integers.
  There is no foreign key on it; rows for deleted subjects are inert.
- `travel_reminders` is left in place, unused. Dropping it is a later
  cleanup once the release has been stable.
- `crm_failure_notified_at` is set in the same statement that selects scans
  to notify (`UPDATE ... WHERE crm_failure_notified_at IS NULL ... RETURNING`)
  and cleared when a manual retry resets the scan.
- The `notifications` table is unchanged.
- The `ON CONFLICT` target is a plain primary key, not a partial index.

## Frontend

### Bell

The new notifications render in the existing general list in `Header.tsx`.
The pending-expense section and the expense-message section are untouched
here and are replaced in spec 2. The list stays unread-only with tap to open
and mark read, and "mark all read".

### Deep links

`NotificationLink.page` gains four values. One table per side maps a link to
its destination:

| `page` | App page | Hash |
|---|---|---|
| `checklist` + `eventId` | `checklist` | `#event=<id>&tab=my` (existing) |
| `samples` + `eventId` | `checklist` | `#event=<id>&tab=samples` (existing) |
| `expenses` + `eventId` | `expenses` | `#expenses-event=<id>` |
| `admin-users` | `settings` | `#users` (existing hash) |
| `booth-inventory` | `booths` | `#booths` |
| `badge-scans` | `leads` | `#leads` |
| none | `dashboard` | none |

- `expenses` cannot reuse a bare `#event=<id>`: `initialPageFromHash` sends
  that to the dashboard on a cold start. `ExpenseSubmission` treats
  `#expenses-event=<id>` exactly as it treats `#event=<id>` today (sets the
  event filter).
- Backend: `linkToUrl` becomes a lookup over this table.
- Frontend: a new `src/utils/notificationLinks.ts` exports
  `notificationTarget(link) → { page, hash }`. `Header.tsx` uses it in place
  of its if-chain, and `initialPageFromHash` learns `#expenses-event=`,
  `#users`, `#booths`, `#leads`.
- A user whose role cannot open the target page lands on the dashboard, as
  `App.tsx` already does for blocked pages. Recipients are chosen by role, so
  this only matters after a role change.
- A shared fixture of link → URL cases is asserted by a backend test and a
  frontend test, so the two tables cannot drift.

### Push click while the app is open

`public/push-sw.js` currently focuses an open window and ignores the
notification's URL. It will navigate the focused client to the URL
(`client.navigate(url)`, falling back to `postMessage` + a listener in
`App.tsx` that sets the hash, for browsers where `navigate` is unavailable on
an uncontrolled client). The existing hash listeners then route as they do
for a bell tap.

## Error handling

- Catalog functions are called fire-and-forget with a logged catch. They
  never throw into a route, a service transaction or a scheduler pass.
- `notifyMany` isolates recipients: one failure is logged and the rest
  proceed.
- Push failure does not block the bell row (existing `NotificationService`
  behaviour).
- The scheduler catches per definition and per recipient.
- Recipient lookups that fail are logged and the trigger is dropped. Nothing
  retries; these are informational notifications, not a work queue.

## Testing

Backend (Vitest):

- `recipients`: actor excluded, inactive excluded, role filter.
- `diffEventDetails` and `classifyBooking`: unchanged, each watched field
  changed, booked → un-booked, un-booked → booked, reassigned, create, delete,
  null versus empty string, date formatting differences.
- Each catalog function: recipients, kind, title, body, link.
- `ReminderScheduler` with a fixed clock: inside window, outside window,
  already claimed, cancelled event, event with no travel date, one recipient
  failing.
- Routes: each call site invokes the right catalog function with the right
  before and after; a notifier that rejects still yields the normal response.
- Link fixture test against `linkToUrl`.
- Migration 045 is applied to a real local Postgres, including the
  `travel_reminders` carry-over, before deploy.

Frontend (Vitest):

- `notificationTarget` against the shared fixture.
- `initialPageFromHash` for the new hashes.
- `Header.notifications.test.tsx` updated for the new link pages.
- The frontend suite has roughly 90 unrelated failures on main; changes are
  judged by the touched feature directories.

Manual, in the sandbox, with a PWA installed on a phone: add a user to an
event, mark the booth ordered, book and then edit a flight, and confirm bell
row, push, and that tapping each lands on the right page both with the app
closed and with it open.

## Rollout

- One release, v2.32.0, version bumped in both `package.json` files, deployed
  with the usual sandbox-then-production path.
- First scheduler pass after deploy sends any reminder whose window an event
  is already inside (for example a show 5 days out gets its 7-day reminder).
  This is intended and produces a one-time burst.
- Rollback is the previous build. The new table and column are additive and
  can stay.

## Out of scope

- **Spec 2, expense notifications via Midas:** Midas notifies accountants on
  submission; a Midas → Argo decision feed (poll or webhook) drives
  approved / rejected / reimbursement-paid notifications for the Argo user;
  expense-message notifications move into the general bell list and the reply
  flow is verified; Argo's pending-expense bell is removed for every role.
- Notification preferences, muting, digests and email.
- A read-history view in the bell.
- Electricity-ordered and custom checklist item notifications.
- Moving `SampleRequestReminderService` onto the shared scheduler.
- Dropping the `travel_reminders` table.
