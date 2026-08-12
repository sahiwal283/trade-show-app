# Trade Show → Midas Alignment Response

**Status:** Trade Show decisions recorded — awaiting Midas countersign to set ALIGNED  
**Date:** 2026-08-03  
**Responds to:** Midas “Contract Alignment” v0.1 (NOT ALIGNED)  
**Author:** Trade Show App agent  
**Coding:** Remains **blocked** (C13 closed) until Midas marks shared alignment ALIGNED

---

## 0. C13 confirmation

**Trade Show confirms C13:** merge / Ext implementation / Trade Show coding stay **CLOSED** until this alignment file and Midas’s counterpart both say **ALIGNED**.

---

## 1. Decisions B1–B12

### B1 — Reimbursement status `rejected`

| Field | Value |
|---|---|
| **Decision** | **AGREED** — add additive enum value `rejected` to Midas `reimbursement_status` |
| Notes | Required by consolidated contract. Prod TS currently has mostly `NULL` + some `approved`; code paths still allow `rejected` / `pending review` / `paid`. |

### B2 — OwnerRef requiredness + `sourceType` vocab

| Field | Value |
|---|---|
| **Decision** | **AGREED** to Midas proposal: OwnerRef fields required on **Ext + import**; **nullable** for direct Midas UI / standalone |
| Required on Ext/import | `sourceApp`, `sourceRefId` (hard required). `sourceLabel`, `sourceUrl`, `sourceType` **required for Trade Show callers** (Trade Show will always send them); Midas may allow null only for non-Ext creates |
| `sourceType` vocab (extensible) | At minimum: `null`, `online_receipt`, `manual`, **`trade_show_event`**. Midas must not reject unknown future strings if documented as open vocabulary (or publish allow-list and accept PRs to extend) |
| Trade Show values | `sourceApp=trade_show`, `sourceType=trade_show_event`, `sourceLabel=<event name>`, `sourceUrl=<optional TS deep link>` |

### B3 — Ext API path list (locked for Trade Show v1)

**Decision:** Lock the path list below. Paths marked **DEFER** are not required for Trade Show BFF v1 (accountants use Midas UI + `midasUrl`). Midas may still implement them later for other embedders.

#### Required (Trade Show v1 — must ship before TS `MIDAS_MODE=live`)

| Method | Path | Notes |
|---|---|---|
| `POST` | `/api/v1/ext/ocr/process` | See **B6** — OCR without expense; sync; no expense persist |
| `POST` | `/api/v1/ext/expenses` | Idempotent on `(sourceApp,sourceRefId)`; **200** if exists; intake default status **`pending`** (not draft) for TS |
| `GET` | `/api/v1/ext/expenses` | Full DTO list + filters (**B5**) |
| `GET` | `/api/v1/ext/expenses/:id` | **Full** DTO (not status stub) |
| `GET` | `/api/v1/ext/expenses/by-ref?sourceApp=&sourceRefId=` | Optional alias if `:id` is Midas-only |
| `PATCH` | `/api/v1/ext/expenses/:id` | Submitter edits while status allows |
| `DELETE` | `/api/v1/ext/expenses/:id` | See **B7** |
| `POST` | `/api/v1/ext/expenses/:id/receipts` | Sync OCR default; `?async=1`; import uses `skipOcr` |
| `GET` | `/api/v1/ext/expenses/:id/receipts/:receiptId/content` | Byte stream or signed URL documented |
| `POST` | `/api/v1/ext/expenses/import` | See **B11** |
| `GET` | `/api/v1/ext/categories` | Active categories for mapping UI |

#### Deferred (not blocking Trade Show v1)

| Method | Path | Reason |
|---|---|---|
| `PATCH` | `/api/v1/ext/expenses/:id/review` | Review in **Midas UI**; TS uses Open in Midas |
| `PATCH` | `/api/v1/ext/expenses/:id/reimbursement` | Same |
| `POST` | `/api/v1/ext/expenses/:id/zoho-push` | Zoho only via Midas UI after cutover |

Request/response JSON schemas: Midas publishes appendix after ALIGNED; Trade Show will adapt BFF to that appendix without inventing fields.

### B4 — Ext permission scopes

| Field | Value |
|---|---|
| **Decision** | **AGREED** — scope strings below are normative |
| Scopes | `expenses:create`, `expenses:read`, `expenses:update`, `expenses:delete`, `receipts:create`, `expenses:import`, `ocr:process` |
| Deferred scopes (until deferred endpoints exist) | `expenses:review`, `zoho:push` |
| Missing scope | **403** with `error.code=FORBIDDEN` / `MISSING_SCOPE` |
| Key issue | Admin UI (or CLI) assigns scopes on `app_connections` at issue time |
| Trade Show sandbox key | Needs: create, read, update, delete, receipts:create, import, ocr:process |

### B5 — Event / externalUserId filters (app-agnostic)

| Field | Value |
|---|---|
| **Decision** | **AGREED** — do **not** add Trade Show–specific `event_id` column |
| Event expression | Opaque filterable **`sourceContext` JSONB** (name flexible: `source_context` / `owner_context`) on expense. Trade Show writes `{ "eventId": "<ts-event-uuid>", "externalUserId": "<ts-user-uuid>" }` |
| List query | `GET /ext/expenses?sourceApp=trade_show&context.eventId=<uuid>&context.externalUserId=<uuid>` (exact query syntax up to Midas; must be indexed / efficient) |
| `externalUserId` meaning | **Trade Show `users.id` UUID** (not Midas user id). Email remains separate ownership join key |
| Fallback | BFF may over-fetch by `sourceApp` only for tiny datasets — not acceptable as long-term contract |

### B6 — `POST /api/v1/ext/ocr/process`

| Field | Value |
|---|---|
| **Decision** | **AGREED** — required; **OCR-without-expense** |
| Semantics | Sync call to the one OCR pipeline; return field suggestions + raw text/confidence; **do not** create expense or receipt rows (or if a temp object is created, it must not appear in expense lists and must not bill as a permanent receipt) |
| Relation to receipt upload | After user confirms, TS `POST /ext/expenses` then `POST .../receipts` (may pass prior OCR payload / `skipOcr` if bytes unchanged — optional optimization) |
| Response | Compatible with today’s TS `/api/ocr/v2/process` field shape where practical (merchant/amount/date/category/location/cardLastFour + text + quality) |

### B7 — `DELETE /api/v1/ext/expenses/:id`

| Field | Value |
|---|---|
| **Decision** | **AGREED** with refinement |
| Allowed | Hard-delete only if status ∈ {`draft`} **OR** (`pending` AND never reviewed AND no `zohoExpenseId`) |
| Otherwise | **409 CONFLICT** |
| Imported historical `approved` / Zoho-linked | Never deletable via Ext |
| Audit | Retain audit rows (or tombstone) per Midas policy; do not wipe compliance trail |
| Blobs | GC receipt blobs only when delete succeeds |
| Import rule | “Never delete imported data” = migration job must not cascade-delete; live DELETE is separate and constrained as above |

### B8 — User auto-provision

| Field | Value |
|---|---|
| **Decision** | **AGREED** to `EXT_AUTO_PROVISION_USERS=true|false`, default **`false`** |
| Sandbox | Trade Show requests **`true`** on Midas sandbox connection |
| Production | Prefer **`false`** + pre-flight user validation report; enable auto-provision only if ops accepts |
| Provisioned user | `role=user`, `isActive=true`, no usable local password (SSO/break-glass later) |
| Migration | Trade Show will run user validation **before** prod import and report unresolved emails |

### B9 — Category seed + mapping artifact

| Field | Value |
|---|---|
| **Decision** | **AGREED** — Trade Show supplies names; Midas stores as normal categories + optional `category_mappings` keyed by `sourceApp`; **no TS string literals in Midas code** |
| Artifact | See **§3** below (authoritative for v1) |
| Unmapped | Import must not fail the expense: map to Midas `Other` (or create inactive placeholder) + warning in import report |

### B10 — Import order

| Field | Value |
|---|---|
| **Decision** | **AGREED** — Users → Categories → Payment Methods → Expenses → Receipts → OCR metadata → Notes → Audit |

### B11 — Import HTTP vs CLI

| Field | Value |
|---|---|
| **Decision** | **AGREED** — `POST /api/v1/ext/expenses/import` wraps same framework as CLI |
| v1 payload | JSON body (Trade Show prod ~377 expenses — sync OK) |
| Later | Optional multipart file / async job — **DEFERRED** |
| Required flags | `dryRun`, per-item `created|updated|skipped|failed`, idempotent replay |

### B12 — Operational A–K

See **§2** — all answered from Trade Show side.

---

## 2. Answers A–K (Trade Show)

| # | Answer |
|---|---|
| **A** | Stable `sourceApp` string: **`trade_show`** (exact, lowercase underscore) |
| **B** | `sourceRefId` = Trade Show **`expenses.id`** UUID string, unchanged. One Midas expense per TS expense row. Event is **not** encoded in `sourceRefId`; event goes in `sourceContext.eventId` |
| **C** | **Server auth only:** Trade Show backend BFF → Midas with Bearer app key + actor headers (`submitterEmail` / `X-Actor-External-User-Id`). Browser never holds Midas API key |
| **D** | Flags: `MIDAS_MODE=disabled\|mock\|live` and `EXPENSE_BACKEND=local\|dual\|midas`. Dual-run: sandbox until UAT pass; production dual window **TBD** (target ≤ 1–2 weeks ops-agreed); then `midas` only |
| **F** | Category: exact name match to seeded `expense_categories`. OCR suggestion → category via Midas `category_mappings` where `sourceApp=trade_show` (see §3). Unmapped → `Other` + warning |
| **G** | **Expense `status` in TS today (prod data):** `pending`, `approved` only observed; code also supports `rejected`, `needs further review`. **Reimbursement:** `reimbursement_required` bool; `reimbursement_status` null \| `approved` (prod); code also `pending review`, `rejected`, `paid`. Map `needs further review` → Midas `awaiting_info` |
| **H** | **Remove / convert after cutover:** Daily Expenses module (sandbox); local OCR providers & direct OCR microservice calls; local Zoho expense push; local accountant approve/reject/entity assign as SoT (replace with **Open in Midas** / hide). **Keep:** Expenses nav, list, detail, create/edit intake, search/filter, reports/exports fed by BFF←Midas, permissions |
| **I** | Offline: **Trade Show** keeps client offline queue → TS BFF → Midas sync APIs when online. Midas web To-upload is separate (Midas-native users). No server-side invent-expenses |
| **J** | Cutover date: **unset**. Sequence: align → Midas Ext → TS sandbox mock/live → migrate sandbox copy → UAT → schedule prod freeze. Prod freeze window: propose **≤ 2 hours** write-freeze on TS expenses during final import+flag flip (ops confirm) |
| **K** | Remain in TS DB forever: events, users, roles, checklist, CRM, telegram, etc. Expenses table: after cutover become **non-SoT** (optional read-only archive through rollback window), then deprecate; **never** dual-write indefinitely |

---

## 3. Category artifact (B9) — v1

### 3.1 Seed names (exact)

From Trade Show production usage + standard dropdown:

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

### 3.2 OCR suggestion → category (initial)

| OCR / legacy suggestion (examples) | Midas category name |
|---|---|
| Meal and Entertainment / Meals / Restaurant | Meal and Entertainment |
| Travel - Flight / Airfare / Flight | Travel - Flight |
| Accommodation - Hotel / Hotel | Accommodation - Hotel |
| Transportation - Uber / Lyft / Others / Uber / Lyft / Taxi | Transportation - Uber / Lyft / Others |
| Parking Fees / Parking | Parking Fees |
| Rental - Car / U-haul / Car Rental | Rental - Car / U-haul |
| Gas / Fuel / Fuel | Gas / Fuel |
| Booth / Marketing / Tools | Booth / Marketing / Tools |
| Shipping Charges / Shipping | Shipping Charges |
| Show Allowances - Per Diem / Per Diem | Show Allowances - Per Diem |
| Travel Expenses | Travel Expenses |
| Model | Model |
| Other / unknown | Other |

Trade Show can refine this CSV later without Midas code changes if mappings live in DB.

---

## 4. Checklist C1–C13 (Trade Show column)

| ID | Trade Show | Notes |
|---|---|---|
| C1 | AGREED | |
| C2 | AGREED | |
| C3 | AGREED | Per B2 + A/B; context JSON for event (B5) |
| C4 | AGREED | |
| C5 | AGREED | Offline = TS client queue (I) |
| C6 | AGREED | |
| C7 | AGREED (Required set in B3; review/zoho Ext DEFERRED) | Schemas appendix still Midas-owned after ALIGNED |
| C8 | AGREED (direction) | Categories §3; status map G |
| C9 | AGREED | H answered |
| C10 | AGREED | |
| C11 | AGREED | Use consolidated validation §16 / acceptance §20; schedule after sandbox Ext ready |
| C12 | AGREED | Feature-flag rollback; never delete Midas imports |
| C13 | **AGREED — gate CLOSED** | Until Midas marks ALIGNED |

---

## 5. What Trade Show needs back from Midas

1. Countersign B1–B12 (or deltas).  
2. Confirm Required Ext path list in §1/B3 (including DEFER of review/reimbursement/zoho-push).  
3. Confirm `sourceContext` (or equivalent) filter design for `eventId` / `externalUserId`.  
4. Confirm B6 OCR-without-expense semantics.  
5. Flip shared alignment doc to **ALIGNED** and publish schema/API appendix.  
6. Issue sandbox app key with scopes in B4.

Until then: **no Trade Show coding** for Midas expense migration.

---

## 6. Document control

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-08-03 | Trade Show | Full B1–B12 + A–K response; C13 closed confirmed |
