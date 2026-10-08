# Argo — Architecture

**Last verified:** 2026-09-16

## 1. Overview

Argo is a trade show expense management PWA: OCR receipt capture, event and booth-inventory logistics, automated expense approval, and an offline-first frontend backed by a background sync queue. The backend is Express/TypeScript over PostgreSQL (raw SQL, repository pattern, no ORM); the frontend is React/Vite. In production, expense data and Zoho Books posting are owned by an external system called Midas — Argo's own local expense store and Zoho client remain as a flag-gated fallback. Users authenticate via Authentik SSO (OIDC) or local password login.

## 2. Production topology

```mermaid
flowchart LR
    Browser["Browser / PWA"]

    subgraph Proxy["CT 104 — 192.168.1.160"]
        NPMplus["NPMplus reverse proxy<br/>argo.booute.duckdns.org<br/>(expapp.duckdns.org 302-redirects here)"]
    end

    subgraph FE["CT 2120 — 192.168.1.139:80"]
        Nginx["nginx<br/>serves /var/www/trade-show-app/current"]
    end

    subgraph BE["CT 2220 — 192.168.1.201:3000"]
        Backend["node backend<br/>systemd: trade-show-app-backend<br/>env: /etc/expenseapp/backend.env"]
    end

    subgraph DB["CT 2320"]
        Postgres[("PostgreSQL<br/>expense_app_production")]
    end

    Browser -->|HTTPS| NPMplus
    NPMplus -->|"/"| Nginx
    NPMplus -->|"/api"| Backend
    Backend --> Postgres

    Backend --> Midas["Midas<br/>expense SoT, picklists,<br/>Zoho posting<br/>EXPENSE_BACKEND=midas / MIDAS_MODE=live"]
    Backend --> Authentik["Authentik SSO<br/>CT 111 — OIDC"]
    Backend -.->|"optional"| Ollama["Ollama<br/>CT 103 — OCR enhancement"]
    Backend -.->|"flag-gated fallback"| Zoho["Zoho Books<br/>(reached via Midas in prod;<br/>direct client only under EXPENSE_BACKEND=local)"]
```

Sandbox is a single all-in-one container, CT 2600, running the same stack (frontend, backend, and PostgreSQL together) rather than the split topology above.

## 3. Backend architecture

Requests flow **routes → services → repositories → raw `pg` queries**. Route handlers stay thin; business logic and authorization live in services; data access is isolated behind the repository layer (`backend/src/database/repositories/`).

Key service boundaries (`backend/src/services/`):

- **`zohoIntegrationClient.ts`** — all Zoho Books OAuth and sync logic lives here; it is the only module that talks to Zoho directly.
- **`ocr/`** — Tesseract.js OCR → optional Ollama LLM enhancement (triggered when confidence < 0.70) → correction tracking (`UserCorrectionService.ts`).
- **`ExpenseService.ts`** — owns expense status transitions via 3-rule automated approval logic (regression detection back to "needs further review", auto-approve on entity assignment or reimbursement decision, no-op otherwise).
- **`EventParticipantService.ts`** — event-user relationship management.
- **`services/midas/`** (`MidasClient.ts`, `MockMidasClient.ts`, `statusMaps.ts`, `paymentMethodMap.ts`) — typed client for the external Midas API, plus the `EXPENSE_BACKEND` / `MIDAS_MODE` / `PICKLIST_SOURCE` env resolution used across the rest of the backend.
- **`services/expenseStore/`** — `ExpenseStore` is the interface that lets the rest of the backend read/write expenses without knowing which system of record is active; `LocalExpenseStore` and `MidasExpenseStore` implement it, `DualExpenseStore` fans out to both during migration, and `getExpenseStore()` picks one per `EXPENSE_BACKEND`. The local `expenses` table is frozen (no longer written) once a deployment cuts over to Midas.
- **`services/picklists/PicklistService.ts`** — resolves category/card/entity picklists; `PICKLIST_SOURCE` (`auto` | `midas` | `settings`) decides the source, where `auto` means "Midas iff `EXPENSE_BACKEND=midas`".
- **`ExpenseMessageScanner.ts`** — a pull-based poller, because Midas has no outbound webhook infrastructure. It polls for new expense messages and turns them into in-app notifications; delivery is at-least-once, collapsed to effectively-once by a unique constraint on the Midas message id.
- **`AuthentikOidcService.ts`** — OIDC login against Authentik; env-gated (dormant unless all four `AUTHENTIK_*`/`OIDC_REDIRECT_URI` vars are set), which doubles as the rollback switch.
- **`services/booth/`** (`BoothInventoryService.ts`, `BoothManifestService.ts`, `BoothMovementService.ts`, `BoothPackingService.ts`) — booth catalog, storage/manifest tracking, and the packing checklist, including idempotent replay of movement events keyed by a derived idempotency key.
- **`PushService.ts`** — Web Push notifications (VAPID); reports disabled and no-ops silently when VAPID keys are absent, so push is optional infrastructure everywhere it's called.
- **`services/badge/`** (`BadgeScanService.ts`, `BadgeCrmPushService.ts`, `badgeCrmConfig.ts`, `badgeCrmFields.ts`, `BadgeWebhookService.ts`, `badgeWebhookConfig.ts`, `BadgeExportService.ts`) — PDF417 badge-scan validation, server-side brand resolution, the per-brand Zoho CRM push worker, and the raw-payload partner webhook; see §8.

### Expense submission under Midas

```mermaid
sequenceDiagram
    participant U as User (browser)
    participant FE as Frontend
    participant API as Backend API
    participant OCR as OCR pipeline
    participant ES as ExpenseStore (Midas)
    participant Midas as Midas
    participant Acct as Accountant (in Midas)
    participant Scan as ExpenseMessageScanner
    participant Push as PushService

    U->>FE: Upload receipt, fill form
    FE->>API: POST /api/ocr/v2/process (receipt)
    API->>OCR: Tesseract, then Ollama if confidence < 0.70
    OCR-->>FE: Extracted fields + confidence
    U->>FE: Review / correct fields, submit
    FE->>API: POST /api/expenses
    API->>ES: getExpenseStore().create(...)
    ES->>Midas: create expense
    Midas-->>ES: Midas expense id
    ES-->>API: normalized expense (Trade Show id)
    API-->>FE: 201 Created

    Acct->>Midas: Review expense, post message to thread
    loop every MIDAS_MESSAGE_SCAN_INTERVAL_MS
        Scan->>Midas: poll for new messages
        Midas-->>Scan: message batch
        Scan->>Scan: persist notifications, advance cursor
        Scan->>Push: notify submitter
    end
    Push-->>U: Web Push notification
    U->>FE: Open message thread, reply
```

## 4. Frontend architecture

`src/App.tsx` is a single-page app that renders by role, not by route: `currentPage` is plain `useState`, not React Router, and each page section is gated by `user.role` checks in JSX (e.g. `events`/`checklist`/`booths` are hidden for `accountant`). Data-access hooks are colocated with the features that use them (e.g. `src/components/expenses/ExpenseSubmission/hooks/`, `src/components/reports/hooks/`), with `src/hooks/useAuth.ts` as the shared authentication/session hook used app-wide and `src/hooks/useExpenseMessages.ts` for the message-thread bell. All API calls go through `src/utils/apiClient.ts`, an Axios instance whose request interceptor injects the JWT `Authorization` header. Feature components live in folders under `src/components/`: `admin/`, `auth/`, `checklist/`, `expenses/`, `events/`, `reports/`, `developer/`, `booths/` (booth inventory and packing), and others.

## 5. Offline-first

```mermaid
flowchart TD
    SW["Service worker<br/>(public/service-worker.js)"] -->|cache-first / network-first| Assets["Static assets + API responses"]
    User["User action while offline"] --> Queue["IndexedDB queue<br/>(src/utils/offlineDb.ts, Dexie)"]
    Queue -->|each item carries an idempotency key| Sync["syncManager<br/>(src/utils/syncManager.ts)"]
    Online["Connection restored"] --> Sync
    Sync -->|replay queued mutations| API["Backend API"]
    API -->|dedupes on idempotency_key,<br/>returns original on replay| Sync
    Checklist["Booth packing checklist<br/>check-offs"] --> Queue
```

The service worker caches static assets and uses a network-first strategy for API calls. Offline writes are queued in IndexedDB via Dexie (`src/utils/offlineDb.ts`); each queued mutation carries an idempotency key. `syncManager` replays the queue automatically on reconnect. Booth movement events and packing checklist check-offs are append-only and keyed so a replayed sync is safe — the backend dedupes on the idempotency key and returns the original result rather than erroring.

## 6. AuthN/AuthZ

Two login paths: local password auth (JWT, stored in `localStorage`, injected by the `apiClient` interceptor) and Authentik SSO via OIDC (`AuthentikOidcService.ts`), which is off by default and enabled only when its env vars are set. The `sessionTracker` middleware (`backend/src/middleware/sessionTracker.ts`) updates `last_activity` on authenticated requests, throttled for coarse freshness. Roles are database-driven (`roles` table, migration `003_create_roles_table.sql`): the system roles are `admin`, `accountant`, `coordinator`, `salesperson`, `developer`, `temporary`, `pending`, and custom roles can be created from the Admin UI. `developer` is the only role with access to `/dev-dashboard`.

## 7. Environments & config

| Environment | Topology | Key vars |
|---|---|---|
| Local | `npm run start:all`, single PostgreSQL DB | `EXPENSE_BACKEND=local` (default), `MIDAS_MODE=disabled` (default) |
| Sandbox | CT 2600, all-in-one (frontend + backend + PostgreSQL) | `EXPENSE_BACKEND`, `MIDAS_MODE`, `PICKLIST_SOURCE` set per current sandbox test scenario |
| Production | CT 2120 (frontend) / CT 2220 (backend) / CT 2320 (PostgreSQL), fronted by NPMplus on CT 104 | `EXPENSE_BACKEND=midas`, `MIDAS_MODE=live`, `PICKLIST_SOURCE=auto` (default; resolves to Midas), `AUTHENTIK_ISSUER`/`AUTHENTIK_CLIENT_ID`/`AUTHENTIK_CLIENT_SECRET`/`OIDC_REDIRECT_URI` (OIDC login), `ZOHO_*` (present only as the disabled fallback path) |

The authoritative env file in every deployed container is `/etc/expenseapp/backend.env` — not the repo's `backend/.env` or `env.example`, which are templates only.

Migrations auto-run at startup (`backend/src/database/migrate.ts`). A Postgres `42501` (insufficient privilege) error during a migration is caught and skipped rather than failing startup, so a deploy can silently ship without a migration actually applying. After any deploy that ships a new migration, verify it landed by checking the `schema_migrations` table on the target database rather than trusting a clean startup log.

## 8. Badge scanning

Leads are captured by scanning a trade-show attendee's PDF417 badge in a live camera viewfinder (`src/components/leads/BadgeScanner.tsx`). Decoding runs entirely on-device via zxing-wasm — no per-scan vendor fee, no server round-trip, and it works offline. The raw barcode payload is handed to a client-side parser (`src/utils/badge/parseBadgePayload.ts`) that classifies each token by what it looks like (email shape, ZIP shape, name-like, etc.) rather than by position, because badge formats vary by show vendor. The parser never throws: a token it cannot classify is simply left unmapped, and the raw payload is always retained so a future parser version can re-derive fields from a scan without re-scanning the badge.

```mermaid
sequenceDiagram
    participant U as User (rep)
    participant Cam as BadgeScanner (zxing-wasm)
    participant P as parseBadgePayload (client)
    participant Queue as IndexedDB queue
    participant API as POST /api/badge-scans
    participant BSS as BadgeScanService
    participant DB as badge_scans
    participant Push as BadgeCrmPushService (worker)
    participant CRM as Zoho CRM (per brand)
    participant Hook as BadgeWebhookService
    participant NK as Nirvana Kulture CRM function

    U->>Cam: Scan badge (company already selected)
    Cam->>P: raw PDF417 payload
    P-->>Cam: parsed fields (never throws)
    Cam->>Queue: enqueue scan (offline-safe)
    Queue->>API: replay on reconnect
    API->>BSS: create(eventId, entity, rawPayload, fields)
    BSS->>BSS: hash raw_payload server-side (dedupe key)
    BSS->>BSS: resolve brand from entity (client's choice is not trusted)
    BSS->>DB: insert (crm_status = pending, or 'skipped' if no Zoho destination)
    DB-->>API: stored scan
    API-->>U: lead appears in Leads list
    API-)Hook: deliver(scan) — off the request path
    Hook->>NK: POST {"data": raw_payload} (Nirvana Kulture scans only)
    Hook->>DB: webhook_status = delivered | failed (+ reason)

    loop every PUSH_INTERVAL_MS
        Push->>DB: claim pending scans, group by brand
        Push->>CRM: upsert batch with that brand's refresh token
        CRM-->>Push: success, or transient/permanent failure
        Push->>DB: record crm_status + reason (transient token failure does not consume a retry attempt)
    end

    loop every SWEEP_INTERVAL_MS
        Hook->>DB: claim webhook rows still pending (past the immediate-attempt grace) or failed within backoff
        Hook->>NK: retry POST
        Hook->>DB: record webhook_status
    end
```

Every scan is attributed to the company the rep represents at the moment of scanning; `BadgeScanService` resolves that company to a `brand` server-side — the client never chooses which Zoho CRM org receives a lead. A company with no Zoho destination (`zohoEnabled: false`) still yields a captured, exportable lead, stored with `crm_status = 'skipped'` rather than rejected. Scans dedupe on `(event_id, entity, payload_hash)`: the same badge scanned again for the same company at the same event is a no-op, but two brands sharing a booth can each legitimately capture the same attendee as two separate leads.

`BadgeCrmPushService` runs as a background worker (not on the request path — scanning never blocks on Zoho) that claims eligible rows, groups them per brand, and upserts each batch into that brand's Zoho CRM Tradeshows module using that brand's own refresh token, retrying transient failures with backoff. CRM field API names are discovered per brand and cached (`badgeCrmFields.ts`) rather than hardcoded, since the Tradeshows module is a custom module whose field names vary by org. Pushed records are later pulled back into `crm_leads` by the existing nightly `ZohoCrmLeadsService` sync, so a scanned lead flows through the same revenue-attribution pipeline (`LeadConversionService`) as any other lead.

Separately from the CRM upsert, `BadgeWebhookService` forwards each scan taken on behalf of a **webhook brand** — today only Nirvana Kulture, fixed in `badgeWebhookConfig.ts` — to that partner's own endpoint as the raw badge string plus the rep's note, `{"data": "<raw_payload>", "notes": "<note or empty>"}`, with no reshaping: the partner runs its own transcription. For the 13-field pipe-delimited format the scanning rep's email is appended to `data` as field 14. The note is sent as it stood at delivery; later edits are not re-sent. The URL (a Zoho CRM function carrying the partner's API key in its query string) comes from `NIRVANA_KULTURE_SCAN_WEBHOOK_URL` and is never logged. The create route fires one attempt immediately after the row is stored, without holding the 201; a five-minute sweep retries rows that attempt could not settle, with backoff and a five-attempt cap. `webhook_status` is decided by brand at capture — `pending` for a webhook brand, `skipped` for everyone else — so other companies' attendee data never leaves the app, and the upsert never resets it, so a rescan or an offline replay cannot send a badge twice.

Routes live at `/api/badge-scans` (list, create, get, patch, retry-push, export); export (`BadgeExportService`) produces CSV or XLSX with every captured field plus CRM status, so a show's leads are usable even when no CRM push ever succeeds. New table: `badge_scans` (migration `041_create_badge_scans.sql`), `raw_payload` never discarded; webhook bookkeeping columns added in `042_add_badge_scan_webhook_columns.sql`.

## 9. Sample requests

One shared sample order per show. `backend/src/services/sampleRequests/`
owns the rules: `sampleRequestWindow.ts` is the only place that computes the
open/close window (created_at → 23:59:59 America/New_York on
`(travel_start_date ?? show_start_date) − 10 days`; never stored);
`SampleRequestService.ts` owns access (participants and override roles edit;
the puller reads), row-level patches, submit and the puller notification;
`SampleRequestReminderService.ts` sends one 48h reminder per participant
through the `sample_request_reminders` ledger (insert-before-send).

`sample_requests` has one row per event (`UNIQUE (event_id)`). A PATCH carries, per row, only the FIELDS the client changed; `SampleRequestRepository.applyRows` locks the request row, merges those fields into the current row, and writes one `sample_request_changes` row per field that changed, all in one transaction, so concurrent edits to the same product both survive and the history is what was stored.

`NotificationService` writes a `notifications` row and a push in one call.

Frontend: `src/components/checklist/samples/` — `SamplesPanel` (the form,
status line, history) driven by `useEventSampleRequest` (dirty-field tracking, one save at a time, stale responses dropped, 30 s / on-focus reconciliation). The panel is a `BookingBoard` tab for
admins and sits under My Checklist for reps. Deep link
`#event=<id>&tab=samples` opens it in either place; `tab=my` selects My
Checklist.
