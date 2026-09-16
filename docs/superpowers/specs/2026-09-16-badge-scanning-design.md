# Badge Scanning (PDF417) — Design

**Date:** September 16, 2026
**Status:** Approved, pending implementation plan
**Target version:** 2.23.0

## Problem

NACS (and most show decorators) rent exhibitors a badge scanner per show to
capture attendee leads. The badges carry a **PDF417 barcode** whose payload is
self-contained — name, organization, address, title, email — not an opaque
registration ID that only the decorator's database can resolve. A confirmed
decode of a real badge recovered:

    badge/registration id, first name, last name, organization, city, state,
    ZIP+4, country, a secondary id, title, salutation, email, a
    classification code

Because the payload is self-contained, a free open-source decoder fully
replaces the rented hardware. This feature puts that decoder in Argo.

**Note on badge identity:** the decoded record does not necessarily describe
the person whose name is printed on the badge — the confirmed sample decoded
to a different registrant than the printed name. Scans are therefore always
reviewable and editable before they are trusted.

## Goals

- Scan PDF417 badges with a phone camera from inside Argo, no per-show fee
- Show the decoded contact immediately, editable on the spot
- Persist scans as leads per event, exportable to CSV/Excel
- Attribute every lead to the company/brand the rep is representing, which
  determines which Zoho CRM receives it
- Push scans into the Zoho CRM Tradeshows module, feeding the existing
  lead-conversion and revenue-attribution pipeline
- Keep scanning usable when show-floor wifi is unreliable

## Non-goals

- Server-side decode fallback (deferred; see Deferred Work)
- Full offline cold start — the service worker has no fetch handler
- Scanning any symbology other than PDF417
- Replacing the read path of `crm_leads` (it stays a CRM mirror)

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Decoder | `zxing-wasm` (zxing-cpp/WASM, Apache-2.0), client-side | On-device, ~10-50ms, no network at scan time, no license cost |
| Capture | Live `getUserMedia` viewfinder, continuous decode | Instant feedback; matches how rented scanners behave |
| Parser location | Client-side only, one pure TS module | Single source of truth; offline scans still show real fields |
| Storage | New `badge_scans` table | `crm_leads` is a read-only CRM mirror and must stay one |
| CRM push | Backend queue, background worker, retry + backoff | Scanning never blocks on Zoho or on wifi |
| Placement | New top-level "Leads" page | Booth staff need one tap mid-conversation |
| Brand routing | Explicit per-session company pick, reusing the `entityOptions` picklist | The company owns the lead and selects the destination CRM; a wrong default silently misroutes it |

## Architecture

    company/brand selected for the scanning session
        |
    camera frame
        -> zxing-wasm readBarcodes(formats: ['PDF417'], tryHarder: true)
        -> raw payload string
        -> parseBadgePayload()            [pure TS, client-side]
        -> { fields, confidence, parserVersion } + raw payload
        -> review sheet (editable)
        -> Dexie queue -> POST /api/badge-scans -> badge_scans
        -> BadgeCrmPushService (interval worker, grouped by brand)
        -> that brand's CRM credentials
        -> POST /crm/v2/{module}/upsert -> crm_record_id

Downstream, the pushed record is picked up by the existing nightly
`ZohoCrmLeadsService` sync into `crm_leads`, where `LeadConversionService`
matches it against Zoho Books invoices. Scanned leads therefore acquire
per-show revenue attribution in Reports with no additional work.

## Data model

Migration `041_create_badge_scans.sql`. Conventions follow migration 039
(UUID PKs, `TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`, idempotency key
present from day one because offline clients replay).

    CREATE TABLE IF NOT EXISTS badge_scans (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_id          UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      scanned_by        UUID REFERENCES users(id) ON DELETE SET NULL,
      entity            VARCHAR(255) NOT NULL,
      brand             VARCHAR(50) NOT NULL,
      client_scan_id    UUID UNIQUE,
      raw_payload       TEXT NOT NULL,
      payload_hash      TEXT NOT NULL,
      barcode_format    VARCHAR(20) NOT NULL DEFAULT 'PDF417',
      parser_version    VARCHAR(20),
      parse_confidence  NUMERIC(3,2),
      badge_id          VARCHAR(100),
      salutation        VARCHAR(50),
      first_name        VARCHAR(255),
      last_name         VARCHAR(255),
      title             VARCHAR(255),
      company           VARCHAR(255),
      email             VARCHAR(255),
      phone             VARCHAR(50),
      city              VARCHAR(100),
      state             VARCHAR(100),
      postal_code       VARCHAR(20),
      country           VARCHAR(100),
      attendee_type     VARCHAR(50),
      fields            JSONB,
      notes             TEXT,
      crm_status        VARCHAR(20) NOT NULL DEFAULT 'pending'
                          CHECK (crm_status IN ('pending','synced','failed')),
      crm_record_id     TEXT,
      crm_error         TEXT,
      crm_attempts      INTEGER NOT NULL DEFAULT 0,
      crm_last_attempt_at TIMESTAMPTZ,
      scanned_at        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT badge_scans_event_entity_payload_unique
        UNIQUE (event_id, entity, payload_hash)
    );
    CREATE INDEX IF NOT EXISTS idx_badge_scans_event ON badge_scans(event_id);
    CREATE INDEX IF NOT EXISTS idx_badge_scans_crm_status ON badge_scans(crm_status, brand);
    CREATE INDEX IF NOT EXISTS idx_badge_scans_scanned_by ON badge_scans(scanned_by);

Three load-bearing properties:

1. **`raw_payload` is never discarded.** Parsers improve; barcodes do not
   change. Any scan can be re-parsed later without re-scanning the badge.
2. **Dedupe uses a plain (not partial) unique index,** so
   `ON CONFLICT (event_id, entity, payload_hash) DO UPDATE` works without
   repeating a `WHERE` predicate. Re-scanning the same badge updates the row
   and preserves existing notes rather than erroring at the booth.
   `entity` is part of the key deliberately: two brands sharing a booth may
   both legitimately claim the same attendee, and those are two leads bound
   for two different CRMs, not a duplicate.
3. **`fields` JSONB retains every token,** mapped or not, as
   `{ index, value, mappedTo }`. Unrecognized vendor data is never lost.

`payload_hash` is `sha256(raw_payload)`, computed client-side and re-verified
server-side (never trusted from the client).

## Brand routing

The company a rep represents determines which Zoho CRM org receives the lead,
so it is required data, not a nicety.

- **`entity`** is the human-readable company name, chosen from the same
  `entityOptions` picklist that expenses already use via `PicklistContext`
  (served as `companies` by `PicklistService`). No new configuration surface.
- **`brand`** is the normalized routing key, resolved **server-side** through
  the existing `ENTITY_TO_BRAND` map in `zohoIntegrationClient`
  (`haute_brands`, `boomin_brands`, `nirvana_kulture`). Storing both mirrors
  how expenses carry `zohoEntity`, and keeps the routing decision auditable
  after the fact.
- An entity with no brand mapping is **rejected at the API with a 400**. A
  lead that can never be routed must not be accepted silently and discovered
  weeks later.
- Each brand carries its own CRM credentials and module mapping. Scans for a
  brand with no configured CRM stay `pending` with an explicit reason rather
  than burning through five retry attempts against a token that does not
  exist.

## Parser

`src/utils/badge/parseBadgePayload.ts` — pure, synchronous, dependency-free,
never throws. Signature:

    parseBadgePayload(raw: string): {
      fields: Record<string, string>,
      tokens: Array<{ index: number, value: string, mappedTo: string | null }>,
      confidence: number,      // 0..1
      parserVersion: string,   // e.g. 'v1'
    }

Badge payload formats are vendor-specific and no real samples are available
yet, so the parser classifies tokens **by content, not by position**:

1. Normalize — strip control characters, trim, collapse repeated delimiters
2. Detect delimiter by frequency among `|`, `^`, `\t`, `~`, `;`
3. If tokens look like `key=value` or `KEY:value`, use the keyed path
4. Otherwise classify each token independently:
   - email regex -> `email`
   - phone regex -> `phone`
   - `\d{5}(-\d{4})?` -> `postal_code`
   - two uppercase letters in the US state/territory set -> `state`
   - country name/ISO set -> `country`
   - `\d{4,}-\d{2,}` or leading long numeric -> `badge_id`
   - salutation set (`Mr.`, `Mrs.`, `Ms.`, `Dr.`) -> `salutation`
   - job-title keyword list (President, Owner, VP, Director, Manager, ...) -> `title`
   - company suffix keywords (Inc, LLC, Corp, Co, Association, Distributors) -> `company`
   - remaining short alphabetic tokens, in order -> `first_name`, `last_name`
5. `confidence` = weighted fraction of high-signal fields resolved, with
   `email` and name weighted heaviest
6. Unclaimed tokens are kept in `tokens` with `mappedTo: null`

`parserVersion` is stamped on every scan so a future re-parse is traceable.

Below a confidence threshold (initially 0.6) the review sheet presents the
fields as **pre-filled and editable** rather than asserting success. Operator
corrections at the booth are the tuning data for the next parser version.

## Frontend

New feature folder `src/components/leads/`, lazily imported in `App.tsx` like
every other view:

    LeadsPage.tsx          event + company selectors, "Scan Badge" CTA, list, search, export
    BadgeScanner.tsx       fullscreen viewfinder modal
    ScanReviewSheet.tsx    editable fields + notes, "Save & scan next"
    LeadList.tsx / LeadRow.tsx / LeadDetailModal.tsx
    hooks/useBadgeDecoder.ts   zxing-wasm lifecycle, lazy import, prefetch
    hooks/useBadgeScans.ts     list + optimistic add

**Scanning loop.** `getUserMedia({ video: { facingMode: { ideal: 'environment' },
width: { ideal: 1920 } } })`, frames drawn to an `OffscreenCanvas`, decode
throttled to ~8fps to bound CPU and battery. On a successful lock: haptic
feedback via the existing `haptics` util, freeze the frame, parse, open the
review sheet.

**Required behaviors:**

- *Save & scan next* keeps the camera stream warm between badges. Per-lead
  time is the feature's success metric at a busy booth.
- *Torch toggle* via the video track's `torch` capability where supported.
  Convention halls are dim and PDF417 is dense.
- *Duplicate catch at scan time*: a `payload_hash` already present for this
  event shows "Already scanned — <name>, <relative time>" and offers to open
  the existing lead rather than creating a twin.
- *Camera denied* and *cannot lock* both route to manual entry. Neither is a
  dead end.
- *The active company is always visible* as a chip in the viewfinder chrome
  ("Scanning for — Haute Brands"), tappable to switch without leaving the
  scanner. A rep working two brands at one booth must never have to guess
  where the last twenty leads went.

**Company selection.** The company is chosen once per scanning session and
applies to every scan until changed. It must be picked explicitly before the
first scan of a session — the last-used company per event is pre-highlighted
for convenience but never silently applied, because an unnoticed default
sends leads to the wrong CRM, which is worse than an extra tap. Manual entry
and any future import path share the same required selector.

**Offline.** `offlineDb` advances to `version(5)` adding a `badgeScans` table;
a new `badgeScan` sync entity is registered with `syncManager.queueAction` and
replayed by `syncItem`, following the expense precedent.

Known limitation, stated plainly: `public/service-worker.js` is a 28-line
cache kill-switch with no fetch handler, so the app shell is not cached. The
~1MB WASM re-downloads once per session (prefetched on page mount so the first
tap is instant), and a cold start with no network will not boot the app at
all. "Offline" here means the tab stays open through flaky wifi, not airplane
mode from cold.

**Navigation.** Sidebar gains `{ id: 'leads', label: 'Leads' }` under
"Workspace" for `admin`, `coordinator`, `salesperson`, `developer`. On mobile,
where four tabs plus the camera button are already full, Leads takes the
fourth tab for `salesperson` and `coordinator` (Checklist moves to the
drawer); `admin` and `accountant` keep Reports.

## Backend

Routes — `backend/src/routes/badgeScans.ts`, mounted at `/api/badge-scans`:

| Method | Path | Purpose |
|---|---|---|
| POST | `/` | Create or upsert a scan; idempotent on `client_scan_id` |
| GET | `/` | List by `eventId`, with search, company, and `crm_status` filters |
| GET | `/:id` | Single scan detail |
| PATCH | `/:id` | Edit parsed fields and notes |
| POST | `/:id/push` | Manual CRM retry for a failed scan |
| GET | `/export` | CSV/XLSX for an event (via existing `exceljs`) |

Authorization: `admin`, `coordinator`, `salesperson`, `developer`. A
salesperson sees scans for events they participate in; admins and developers
see all.

Services:

- `BadgeScanService` — validation, hash re-computation, brand resolution,
  upsert/dedupe. It whitelists field names and lengths and rejects unmappable
  entities; the client's parsed output is untrusted input.
- `BadgeCrmPushService` — interval worker started from `server.ts` beside
  `travelReminderService.start()`, logging and idling when unconfigured.

**Push worker loop:**

1. Claim scans with `crm_status = 'pending'`, plus `'failed'` scans whose
   backoff has elapsed and `crm_attempts < 5`, **grouped by `brand`**; brands
   with no configured CRM are skipped with a logged reason
2. Batch up to 100 per request per brand to `POST /crm/v2/{module}/upsert`,
   using that brand's credentials, with email as the duplicate-check field, so
   a re-push never creates a CRM twin
3. Exponential backoff per scan; after 5 attempts `crm_status = 'failed'`
   sticks, with `crm_error` surfaced in the lead row behind a manual retry
4. On success record `crm_record_id` and set `crm_status = 'synced'`

## Operational prerequisites

Both are external to the code and block only the CRM push, not the scanner.

1. **Write-scoped CRM token per brand.** `ZohoCrmLeadsService` is read-only
   today (GET only) and single-tokened. Pushing requires a refresh token
   minted with `ZohoCRM.modules.ALL` **for each brand that will receive
   leads**, configured as `<BRAND>_ZOHO_CRM_REFRESH_TOKEN` (for example
   `HAUTE_BRANDS_ZOHO_CRM_REFRESH_TOKEN`), following the existing
   `<BRAND>_ZOHO_COMPANY_ID` convention. The current single
   `ZOHO_CRM_REFRESH_TOKEN` remains as the fallback so today's read sync keeps
   working unchanged. Until a brand's token exists, that brand's scans remain
   `pending` — the feature still functions as a local lead list with
   CSV/Excel export, which already replaces the rented scanner.
2. **Real CRM field API names, per brand.** `ZohoCrmLeadsService` currently
   notes that custom-module field names are "best-effort candidates until real
   field API names are known". A one-time discovery call to
   `GET /crm/v2/settings/fields?module={module}` per brand caches the mapping
   in `app_settings` keyed by brand; both the push and the existing sync read
   from it. This retires the heuristic. Brands may use different module names,
   so the module is configurable per brand rather than one global
   `ZOHO_CRM_TRADESHOWS_MODULE`.

## Testing

- **Parser** — table-driven tests across each supported payload shape,
  including the confirmed field set above; plus truncated, empty, and garbage
  payloads that must never throw and must always preserve `raw_payload`.
- **Decoder hook** — `zxing-wasm` mocked; lock, no-lock, and camera-denied paths.
- **Backend** — dedupe on `(event_id, entity, payload_hash)` including the
  case where two brands scan the same badge and both rows must survive;
  `client_scan_id` idempotency under replay; rejection of an unmappable
  entity; role authorization; export shape.
- **Push service** — mocked axios: grouping by brand with per-brand
  credentials, batching at 100, backoff progression, upsert dedupe, sticky
  failure after 5 attempts, and a brand with no configured CRM leaving its
  scans `pending` without consuming attempts.
- **Schema** — extend `tests/integration/database-schema.test.ts`.

## Deployment

- Bump version in both `package.json` and `backend/package.json` to 2.23.0
- `migrate.ts` silently skips on a `42501` permission error, so **verify
  migration 041 actually applied** rather than trusting a clean startup log;
  apply as the `postgres` role if ownership blocks it
- Restart `trade-show-app-backend`; clear the NPMplus proxy cache after the
  frontend deploy
- Sandbox first via `deploy-sandbox-2600.sh` (`deploy-sandbox.sh` points at
  production containers)

## Deferred work

- **Server-side decode fallback.** If the first real show shows a poor lock
  rate, capture the still after ~8s of failed attempts and decode on the
  backend with perspective correction and upscaling. Additive — the client
  path and schema are unchanged.
- **Re-parse action.** A frontend admin action that pulls stored
  `raw_payload`s through a newer parser version and re-submits the fields.
- **WASM caching.** A narrow service-worker cache entry for the decoder
  module, if session re-download proves annoying.
