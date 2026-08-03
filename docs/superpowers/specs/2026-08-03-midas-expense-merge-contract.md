# Trade Show ↔ Midas Expense Merge Contract

**Document type:** Cross-repo Ext API ask (Midas implementers)  
**Audience:** Midas agent / Midas owners (primary)  
**Status:** **LOCKED / ALIGNED** — dual-app COMPLETE (2026-08-03).  
Normative Ext paths/shapes: Midas `docs/EXT_API_MERGE_LOCK.md` (Merge Contract §9 + deltas D1–D18).  
Trade Show behavior: `2026-08-03-trade-show-midas-implementation-contract.md`.  
Alignment mirror: `2026-08-03-midas-trade-show-alignment-status.md` → **COMPLETE**.

---

## 1. Executive summary

Trade Show App will stop owning expense storage, OCR, accountant review, and Zoho push. **Midas becomes the authoritative expense engine.**

Trade Show keeps:

- Events / trade shows, checklist, scheduling, authentication, users
- An **Expenses** tab that is a **live mirror** of Midas event expenses (same list/detail fields users know today)
- Intake UX: upload receipt → **sync OCR** → confirm → create/update expense tied to an event
- A small **“Powered by Midas”** badge on the Expenses experience

Midas owns:

- Expense records, receipts, OCR, categories, payment methods
- Accountant review (approve / reject / needs-info / entity / Zoho)
- Reporting for expenses (long-term)
- Non-event (“daily”) expenses — users do those **directly in Midas**, not in Trade Show

**Daily Expenses** in Trade Show is **sandbox-only WIP** (not in production; prod has no `daily_expenses` table). It will be **removed** from Trade Show; no production daily-expense migration.

---

## 2. Product decisions (locked)

| # | Decision |
|---|----------|
| 1 | Integration style: Trade Show **BFF facade** over Midas (`MIDAS_MODE=disabled\|mock\|live`) |
| 2 | Auth: **hybrid** — app API key for system/migration/list; actor identity via headers / `submitterEmail` |
| 3 | Only **event expenses** migrate into Midas from Trade Show |
| 4 | Non-event expenses live only in Midas (native UI) |
| 5 | Remove Trade Show Daily Expenses module (sandbox cleanup only) |
| 6 | Accountant actions leave Trade Show UI; review happens in **Midas** |
| 7 | Zoho push owned by **Midas** (prefer Midas accountant UI; Trade Show may deep-link “Open in Midas”) |
| 8 | Expenses tab = **live Midas mirror**, event-filtered, **same visibility rules** as today |
| 9 | OCR must feel **synchronous** on the happy path (Midas already documents this in `docs/SYNC_AND_OFFLINE.md`) |
| 10 | Sandbox-first; production Trade Show unchanged until cutover |

---

## 3. Current state (evidence)

### 3.1 Trade Show production (CT 2220 / DB 2320)

- App version: **2.10.0**
- Table `expenses`: **377** rows (`approved` 291, `pending` 86)
- **No** `daily_expenses` table
- **No** `expense_audit_log` table (code references it; not present in prod)
- Global `audit_logs` exists (~1496 rows) — may contain some expense-related events; not a clean per-expense trail
- Distinct submitters with expenses: **8** users; **0** expense submitters missing email (email is the join key to Midas users)
- Receipts stored as `receipt_url` paths under Trade Show uploads
- Categories in use (string names, not UUIDs):

```
Meal and Entertainment, Travel - Flight, Transportation - Uber / Lyft / Others,
Accommodation - Hotel, Booth / Marketing / Tools, Parking Fees,
Rental - Car / U-haul, Gas / Fuel, Travel Expenses, Show Allowances - Per Diem,
Shipping Charges, Model, Other
```

### 3.2 Trade Show sandbox (CT 2600)

- On older daily-expenses experiment (**2.4.0**); has `daily_expenses` with **1** test row
- Not authoritative for this merge — rebase Trade Show work onto current `main` / prod lineage

### 3.3 Midas today (relevant)

Repo: `/Users/sahilkhatri/Projects/Work/midas`

**Already helpful:**

- `sourceApp` + `sourceRefId` with **unique index** (idempotent imports)
- `sourceLabel`, `sourceUrl`, `sourceType` for embedder context
- Sync-primary receipt OCR (`POST .../receipts` waits for OCR; `?async=1` escape hatch) — see `docs/SYNC_AND_OFFLINE.md`
- App connections + `authenticateApiKey` on `/api/v1/ext/*`
- Minimal `/api/v1/ext/expenses` **POST** (create draft) + **GET :id** (status stub only)

**Gaps vs this contract:**

- `/ext` list/filter/update/receipt/OCR/import incomplete vs Trade Show needs
- No first-class **`eventId`** (Trade Show event UUID) — only free-text `sourceLabel` / `sourceUrl`
- Ext create requires existing Midas user by email; no provision/auto-link policy documented for Trade Show
- Ext create always `draft`; Trade Show intake usually lands as submitted/`pending`
- No bulk import with receipt bytes + preserved timestamps + status mapping
- No documented list filters for `sourceApp=trade_show` + `eventId` + `externalUserId`
- Category names in Trade Show are strings; Midas uses `categoryId` UUIDs — need mapping/seed
- Card / payment method: Trade Show `card_used` string vs Midas `paymentMethodId`
- Trade Show statuses include `needs further review` (string); Midas has `in_review` / `awaiting_info` — mapping required
- Location field exists in Trade Show expenses; not first-class on Midas expense row

---

## 4. Ownership boundary

```
┌─────────────────────────────────────────────────────────────┐
│ Trade Show App                                              │
│  • Auth (JWT), roles, sessions                              │
│  • Events / participants / checklist / CRM / telegram, etc. │
│  • Expenses UI (intake + live mirror)                        │
│  • BFF: /api/expenses*, /api/ocr/v2/process → MidasClient   │
│  • Permission filtering (who sees whose event expenses)     │
└───────────────────────────┬─────────────────────────────────┘
                            │ Bearer app key + actor headers
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Midas                                                       │
│  • Expense SoT, receipts, OCR, categories, payment methods  │
│  • Accountant queue, Zoho push, reimbursement               │
│  • Native UI for non-event expenses + review                │
│  • Ext API for Trade Show (this contract)                   │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
                   Shared OCR microservice
                   (Midas is the only Trade Show path to OCR
                    after cutover — Trade Show deletes direct OCR)
```

---

## 5. Identity & auth contract

### 5.1 App authentication

- Trade Show calls Midas with: `Authorization: Bearer <TRADE_SHOW_APP_CONNECTION_KEY>`
- Key issued via Midas admin connections (`app_connections`)
- Separate keys for **sandbox** vs **production** Midas

### 5.2 Actor / ownership

On every mutating ext call, Trade Show sends:

| Header / field | Meaning |
|---|---|
| `submitterEmail` (body) or `X-Actor-Email` | Email of Trade Show user (required for ownership) |
| `X-Actor-External-User-Id` | Trade Show `users.id` UUID (required for filters & audit) |
| `X-Actor-Name` | Display name (optional but preferred for audit) |
| `X-Request-Id` | Correlation id (optional) |

**Midas MUST:**

1. Resolve or provision a Midas user for `submitterEmail` per policy below  
2. Set `expenses.userId` to that Midas user  
3. Store `X-Actor-External-User-Id` on the expense (new field or `sourceContext`) so Trade Show can filter “own expenses” without depending on Midas UUID equality  

**User provisioning policy (required decision implemented by Midas):**

- **Recommended:** If email exists → use it. If not → **auto-create** Midas user (`role=user`, `isActive=true`, random unusable password / SSO-only) and audit `ext.user_provisioned`.  
- Reject only if email invalid or domain denylist (if any).

Trade Show will **not** hold Midas session cookies for BFF calls.

### 5.3 Deep links (“Open in Midas”)

Responses should include `midasUrl` (absolute URL to expense in Midas web). Accountants use Midas UI for review/Zoho. SSO alignment (Authentik) is a parallel track; deep link may require login until SSO is shared.

---

## 6. Data model extensions Midas must support

### 6.1 Source identity (mostly exists)

| Field | Value for Trade Show |
|---|---|
| `sourceApp` | **`trade_show`** (exact string; add to docs enum list) |
| `sourceRefId` | Trade Show `expenses.id` UUID (stable forever) |
| Unique `(sourceApp, sourceRefId)` | Idempotency key for create/import |

### 6.2 Event linkage (**GAP — required**)

Add a structured, filterable event reference. Preferred:

```text
eventId UUID NULL          -- Trade Show events.id when sourceApp=trade_show
```

Alternatively (acceptable if indexed for filter):

```json
sourceContext: {
  "eventId": "uuid",
  "eventName": "string",
  "location": "string | null",
  "cardUsed": "string | null",
  "externalUserId": "uuid",
  "tradeShowStatus": "pending|approved|rejected|needs further review",
  "legacy": { ... }
}
```

**Requirement:** `GET /ext/expenses?sourceApp=trade_show&eventId=` must be efficient (index on `eventId` or expression index on `sourceContext->>'eventId'`).

Also set:

- `sourceLabel` = event name (e.g. `"Expo West 2026"`)
- `sourceUrl` = deep link back to Trade Show event (optional)
- `sourceType` = `"trade_show_event"`

### 6.3 Field mapping (Trade Show → Midas)

| Trade Show `expenses` | Midas |
|---|---|
| `id` | `sourceRefId` (preserve); Midas `id` is new UUID unless import API allows `preserveId` (optional) |
| `event_id` | `eventId` / `sourceContext.eventId` |
| `user_id` + user email | Midas `userId` via email; store `externalUserId` |
| `merchant` | `merchant` |
| `amount` | `amount` |
| `date` | `date` |
| `description` | `description` |
| `category` (string) | `categoryId` via **category name map** (see §8) |
| `card_used` | `paymentMethodId` if matchable, else `sourceContext.cardUsed` / description suffix |
| `location` | `sourceContext.location` or new `location` text column |
| `reimbursement_required` + `reimbursement_status` | `reimbursementStatus` enum map |
| `status` | Midas `status` via §7 |
| `receipt_url` + file bytes | `receipts[]` row + stored file |
| `ocr_text`, `extracted_data` | receipt `ocrText` / `ocrData` |
| `zoho_entity`, `zoho_expense_id` | `zohoEntity`, `zohoExpenseId` (+ `zohoSyncedAt` if known) |
| `created_at`, `updated_at`, `submitted_at`, `reviewed_at` | Preserve on **import**; normal now() on live creates |
| `reviewed_by` | Best-effort map to Midas user by email; else null + note in import audit |
| `comments` | expense message or `sourceContext.comments` |

**ID preservation policy:**

- Prefer: Midas generates new UUIDs; Trade Show BFF stores/returns Midas id to UI after cutover; `sourceRefId` keeps legacy id for redirects & idempotency  
- Optional stretch: import accepts `id` to reuse UUID (only if Midas wants zero URL breakage) — **nice-to-have**, not blocking if `sourceRefId` is queryable

---

## 7. Status & reimbursement mapping

### 7.1 Expense status

| Trade Show | Midas | Notes |
|---|---|---|
| `pending` | `pending` | Default after Trade Show intake submit |
| `needs further review` | `awaiting_info` or `in_review` | **Midas picks one canonical**; document it. Recommend `awaiting_info` |
| `approved` | `approved` | |
| `rejected` | `rejected` | |
| *(no draft in TS UI today)* | `draft` | Allowed for unfinished Midas-native; Trade Show intake should create **`pending`** (submitted) |
| — | `zoho_sync_failed` | Midas-only; Trade Show BFF maps display to approved/pending + badge via Zoho fields |

Trade Show BFF will translate Midas → UI labels for the mirror table.

### 7.2 Reimbursement

| Trade Show | Midas |
|---|---|
| `reimbursement_required=false` | `not_requested` |
| required + `pending review` / null | `pending` |
| `approved` | `approved` |
| `paid` | `paid` |
| `rejected` | *(no rejected in Midas enum)* → keep `pending` + flag in `sourceContext` **or** extend Midas enum — **GAP** |

**Ask to Midas:** either add `rejected` to `reimbursement_status` or document how rejected reimbursements are represented.

---

## 8. Categories & payment methods

### 8.1 Categories

Midas must expose:

`GET /api/v1/ext/categories` → `{ categories: [{ id, name, description, isActive }] }`

Seed/ensure these names exist (match Trade Show production usage):

```
Booth / Marketing / Tools
Travel - Flight
Accommodation - Hotel
Transportation - Uber / Lyft / Others
Parking Fees
Rental - Car / U-haul
Meal and Entertainment
Gas / Fuel
Shipping Charges
Show Allowances - Per Diem
Travel Expenses
Model
Other
```

Import resolves category by **exact name** (case-sensitive recommended); unknown → `Other` + warning in import report.

### 8.2 Payment methods / cards

Trade Show stores free-text `card_used` (e.g. `"Amex …1234"`).  
Midas: best-effort match on `payment_methods.lastFour` + label; else store raw string in `sourceContext.cardUsed`.

---

## 9. Target Ext API (Midas must implement)

Base: `/api/v1/ext`  
Auth: Bearer app key  
Error shape: `{ "error": { "code": "SNAKE_CASE", "message": "..." } }` (match existing Midas)

### 9.1 Sync OCR (standalone — for Trade Show pre-create form)

```
POST /api/v1/ext/ocr/process
Content-Type: multipart/form-data
field: file (jpeg/png/webp/pdf/heic-as-converted)
```

**Behavior:** Synchronously call shared OCR service; return extraction **without** requiring an expense id (Trade Show fills form, then creates expense).

Response 200:

```json
{
  "ocrMode": "sync",
  "fields": {
    "merchant": { "value": "string|null", "confidence": 0.0 },
    "amount": { "value": "number|null", "confidence": 0.0 },
    "date": { "value": "YYYY-MM-DD|null", "confidence": 0.0 },
    "category": { "value": "string|null", "confidence": 0.0 },
    "location": { "value": "string|null", "confidence": 0.0 },
    "cardLastFour": { "value": "string|null", "confidence": 0.0 }
  },
  "ocr": { "text": "string", "confidence": 0.0, "provider": "string" },
  "quality": { "overallConfidence": 0.0, "needsReview": false, "reviewReasons": [] },
  "warnings": []
}
```

Timeouts/errors must return actionable messages (auth misconfig, timeout, unsupported PDF) — Trade Show surfaces these in UI.

**Note:** If Midas prefers “create draft expense → upload receipt sync → patch fields → submit” as the only path, that is acceptable **only if** Trade Show can keep the same UX timing (user still sees fields before final confirm). Standalone OCR is preferred for parity with today’s `/api/ocr/v2/process`.

### 9.2 Create expense (intake)

```
POST /api/v1/ext/expenses
```

Body (JSON) — extend today’s stub:

```json
{
  "sourceApp": "trade_show",
  "sourceRefId": "<trade-show-expense-uuid-or-client-uuid>",
  "submitterEmail": "user@example.com",
  "externalUserId": "<trade-show-user-uuid>",
  "eventId": "<trade-show-event-uuid>",
  "sourceLabel": "Event Name",
  "sourceUrl": "https://...",
  "sourceType": "trade_show_event",
  "merchant": "string",
  "amount": 12.34,
  "currency": "USD",
  "date": "YYYY-MM-DD",
  "description": "string|null",
  "categoryId": "uuid|null",
  "categoryName": "string|null",
  "paymentMethodId": "uuid|null",
  "cardUsed": "string|null",
  "location": "string|null",
  "reimbursementRequired": false,
  "status": "pending",
  "zohoEntity": null,
  "metadata": {}
}
```

**Rules:**

- Idempotent on `(sourceApp, sourceRefId)`: second POST returns **200** with existing expense (not 409), unless `If-None-Match` / `overwrite` semantics documented
- Default intake status: **`pending`** (not `draft`)
- Optional multipart variant or follow-up receipt upload

Response 201/200:

```json
{
  "expense": { /* full expense DTO including receipts, user, category, eventId, midasUrl */ },
  "midasUrl": "https://midas.../expenses/<id>",
  "created": true
}
```

### 9.3 Attach / replace receipt (sync OCR)

```
POST /api/v1/ext/expenses/:id/receipts
PUT  /api/v1/ext/expenses/:id/receipts/primary   # replace primary receipt
```

Multipart `file`. Default **sync OCR** (same as session receipts API). Query `async=1` allowed.

### 9.4 Get expense (full DTO)

```
GET /api/v1/ext/expenses/:id
```

Must return **full** expense (not status stub only), including:

- merchant, amount, date, description, status, reimbursementStatus  
- category, paymentMethod  
- user `{ id, name, email }`  
- `eventId`, `sourceApp`, `sourceRefId`, `sourceLabel`  
- `externalUserId`  
- receipts (with signed/download URL or byte proxy strategy)  
- `midasUrl`  
- timestamps  

Lookup by Midas id **or** `?sourceApp=trade_show&sourceRefId=`.

### 9.5 List expenses (live mirror)

```
GET /api/v1/ext/expenses
```

Query params:

| Param | Required | Description |
|---|---|---|
| `sourceApp` | yes for TS | `trade_show` |
| `eventId` | no | filter one event |
| `eventIds` | no | comma-separated |
| `externalUserId` | no | Trade Show user id |
| `status` | no | Midas status or mapped |
| `q` | no | search merchant/description |
| `dateFrom` / `dateTo` | no | |
| `limit` / `cursor` | no | pagination |

Response:

```json
{
  "expenses": [ /* full DTOs */ ],
  "nextCursor": "string|null"
}
```

### 9.6 Update (submitter edit window)

```
PATCH /api/v1/ext/expenses/:id
```

Allowed while status ∈ (`draft`, `pending`, `awaiting_info`) — exact set documented by Midas.  
Forbidden after `approved` / `rejected` (unless admin key + flag).

### 9.7 Delete

```
DELETE /api/v1/ext/expenses/:id
```

Only if status allows (recommend: `draft` or `pending` unreviewed). Trade Show today allows privileged deletes — document parity.

### 9.8 Bulk import (migration) — **critical**

```
POST /api/v1/ext/expenses/import
```

**Idempotent.** Accepts batch of expenses + receipt references.

Recommended shape:

```json
{
  "sourceApp": "trade_show",
  "dryRun": false,
  "items": [
    {
      "sourceRefId": "uuid",
      "submitterEmail": "string",
      "externalUserId": "uuid",
      "eventId": "uuid",
      "sourceLabel": "string",
      "merchant": "string",
      "amount": 1.23,
      "currency": "USD",
      "date": "YYYY-MM-DD",
      "description": "string|null",
      "categoryName": "string",
      "cardUsed": "string|null",
      "location": "string|null",
      "status": "pending|approved|rejected|needs further review",
      "reimbursementRequired": true,
      "reimbursementStatus": "pending review|approved|rejected|paid|null",
      "zohoEntity": "string|null",
      "zohoExpenseId": "string|null",
      "ocrText": "string|null",
      "extractedData": {},
      "createdAt": "ISO8601",
      "updatedAt": "ISO8601",
      "submittedAt": "ISO8601|null",
      "reviewedAt": "ISO8601|null",
      "comments": "string|null",
      "receipt": {
        "filename": "string",
        "mimeType": "string",
        "contentBase64": "string",
        "skipOcr": true
      },
      "auditTrail": [
        {
          "at": "ISO8601",
          "actorEmail": "string|null",
          "actorName": "string|null",
          "action": "string",
          "changes": {}
        }
      ]
    }
  ]
}
```

**Import rules:**

1. Upsert on `(sourceApp, sourceRefId)` — never duplicate  
2. Preserve timestamps when provided  
3. Map status per §7  
4. `receipt.skipOcr=true` stores file + existing `ocrText`/`extractedData` **without** re-billing OCR (required for zero-loss cost control)  
5. Return per-item results: `created|updated|skipped|failed` + errors  
6. `dryRun=true` validates without writes  
7. Batch size: support ≥ 50 items/request; Trade Show will page  

**Prod scale:** ~377 expenses — small; still design for idempotent re-runs.

### 9.9 Receipt byte access for Trade Show UI

Trade Show detail view opens receipts. Options (pick one, document):

- **A.** Midas returns time-limited signed URL  
- **B.** `GET /api/v1/ext/expenses/:id/receipts/:receiptId/content` streams bytes with app key  

Trade Show BFF will proxy to browser with user JWT either way.

---

## 10. What Trade Show will implement (for Midas awareness)

1. New branch from current main (prod lineage **2.10.x**), sandbox-only deploys to CT **2600**  
2. `MidasClient` with `disabled|mock|live`  
3. Replace `ExpenseService` persistence with Midas calls; keep `/api/expenses` shapes  
4. Facade `/api/ocr/v2/process` → `POST /ext/ocr/process` (then delete local OCR providers + direct `OCR_SERVICE_*` usage from Trade Show backend)  
5. Remove accountant approve/reject/entity/Zoho actions from UI → “Open in Midas”  
6. Remove Daily Expenses feature from codebase  
7. Migration runner: export prod/sandbox event expenses → `POST /ext/expenses/import`  
8. Permission filtering remains in Trade Show BFF:

| Role | Sees |
|---|---|
| salesperson (typical) | Own expenses only |
| coordinator / admin / accountant / developer | Broader / all event expenses (match current Trade Show rules) |

Midas list API must return enough fields for BFF to filter; BFF may pass `externalUserId` when scoping to self.

---

## 11. Merge / cutover plan

### Phase 0 — Contract freeze
- Midas + Trade Show agree this doc (or a revision with explicit deltas)
- Issue sandbox app connection key
- Seed categories in Midas sandbox

### Phase 1 — Midas delivers Ext API (sandbox)
- Implement §9 endpoints + §6 eventId + user provisioning
- Publish short changelog + example curl collection
- Pass contract conformance checklist (§13)

### Phase 2 — Trade Show BFF against mock, then live sandbox
- UI intake + mirror on sandbox Trade Show → sandbox Midas
- No production Trade Show deploy

### Phase 3 — Data migration (sandbox copy of prod first)
1. Snapshot Trade Show DB expenses (+ receipt files)  
2. `dryRun` import → fix mapping issues  
3. Real import → verify counts, spot-check receipts/OCR/status/Zoho ids  
4. Re-run import → confirm idempotent (0 creates, N skipped)  

### Phase 4 — Validation report (§14)
- Sign-off on sandbox

### Phase 5 — Production cutover (explicit approval later)
1. Freeze Trade Show expense writes briefly **or** dual-read with feature flag  
2. Ensure all users exist in Midas (email)  
3. Import prod expenses  
4. Flip `MIDAS_MODE=live` on Trade Show prod  
5. Monitor; rollback = flip mode to previous build (expenses remain in Midas; do not delete)  

**Rollback note:** After cutover, Midas remains SoT. Rolling back Trade Show UI without a reverse sync loses in-flight Midas-only edits — document operationally.

---

## 12. Explicit non-goals / out of scope for this merge

- Migrating Trade Show Daily Expenses (sandbox junk only; delete)  
- Building Trade Show accountant Zoho push against Midas  
- Moving Trade Show auth into Midas  
- Moving events/checklist into Midas  
- OpenAPI file (nice-to-have; this contract + curl examples suffice for v1)  
- Argo’s older `/api/submissions` path — **do not** resurrect; use `/api/v1/ext/*`

---

## 13. Conformance checklist (Midas)

- [ ] App key auth on all `/ext/*`  
- [ ] `sourceApp=trade_show` + unique `sourceRefId`  
- [ ] Filterable `eventId`  
- [ ] `externalUserId` stored & filterable  
- [ ] User auto-provision by email (or documented alternative)  
- [ ] Sync OCR standalone **or** equivalent sync intake path  
- [ ] Sync receipt upload (default); `async=1` optional  
- [ ] Full GET + list DTOs for mirror UI  
- [ ] PATCH rules for submitter edits  
- [ ] Idempotent bulk import with `skipOcr` + preserved timestamps  
- [ ] Category seed/map for Trade Show names  
- [ ] Status mapping table published  
- [ ] Reimbursement `rejected` handling decided  
- [ ] `midasUrl` on responses  
- [ ] Receipt content access strategy  
- [ ] Sandbox + prod connection keys  

---

## 14. Validation report template (Trade Show fills after sandbox)

| Check | Method | Pass? |
|---|---|---|
| OCR sync feel | Upload receipt in TS → fields populate before save | |
| Create event expense | Appears in TS list + Midas UI | |
| Mirror fields | date, person, show, expense, amount, status, receipt detail | |
| Permissions | salesperson sees only own; admin sees all | |
| Edit pending | PATCH works; approved locked | |
| Search/filter | merchant/status/event | |
| Import count | TS expenses = Midas `sourceApp=trade_show` count | |
| Idempotent re-import | 0 duplicates | |
| Receipts open | image/PDF viewable | |
| OCR data preserved | import `skipOcr` keeps text/fields | |
| Zoho ids preserved | `zohoExpenseId` present where expected | |
| Open in Midas | deep link works for accountant | |
| No direct TS OCR calls | backend env unused / code removed | |
| Daily expenses gone | no nav/routes/tables in TS sandbox build | |

---

## 15. Environment & config (both sides)

**Trade Show (sandbox):**

```bash
MIDAS_MODE=mock|live|disabled
MIDAS_BASE_URL=https://<midas-sandbox>/api/v1
MIDAS_API_KEY=...
MIDAS_WEB_BASE_URL=https://<midas-web-sandbox>
```

**Midas:**

- App connection named `trade_show` (sandbox) / `trade_show_prod` (later)
- OCR service token already used by Midas (Trade Show stops using its own after cutover)

---

## 16. Contact / ownership

| Workstream | Owner |
|---|---|
| This contract + Trade Show BFF + migration runner + sandbox validation | Trade Show App agent / team |
| Ext API, schema fields, import, categories, user provision, Midas UI review/Zoho | Midas agent / team |
| Shared OCR microservice | Existing OCR service owners (no duplicate engines) |

---

## 17. Appendix A — Minimal curl sketches (for Midas implementers)

```bash
# Sync OCR
curl -sS -X POST "$MIDAS/ext/ocr/process" \
  -H "Authorization: Bearer $KEY" \
  -F "file=@receipt.jpg"

# Create
curl -sS -X POST "$MIDAS/ext/expenses" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -H "X-Actor-External-User-Id: $TS_USER_ID" \
  -d '{"sourceApp":"trade_show","sourceRefId":"...", "submitterEmail":"...", "eventId":"...", "merchant":"...", "amount":10, "date":"2026-08-01", "status":"pending", "categoryName":"Meal and Entertainment"}'

# List
curl -sS "$MIDAS/ext/expenses?sourceApp=trade_show&eventId=$EVENT" \
  -H "Authorization: Bearer $KEY"

# Import dry-run
curl -sS -X POST "$MIDAS/ext/expenses/import" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"sourceApp":"trade_show","dryRun":true,"items":[...]}'
```

---

## 18. Appendix B — Trade Show expense columns (prod)

`id, event_id, user_id, category, merchant, amount, date, description, card_used, reimbursement_required, reimbursement_status, receipt_url, ocr_text, extracted_data, status, zoho_entity, location, submitted_at, reviewed_at, reviewed_by, comments, created_at, updated_at, zoho_expense_id, version, device_id, last_sync_at`

---

**End of contract.**  
Midas: implement Ext API + schema gaps; reply with conformance checklist progress and any proposed deltas.  
Trade Show: will not call live Midas from production until Phases 1–4 pass on sandbox.
