# Midas ↔ Trade Show Alignment Status

**Date:** 2026-08-03  
**Alignment state:** **COMPLETE / ALIGNED**  
**Coding gate:** **OPEN** (both apps may begin sandbox implementation)  
**Production Trade Show:** remains **frozen** until Phase 4/5 explicit approval.

| Field | Value |
|---|---|
| Alignment state | **COMPLETE / ALIGNED** |
| Normative Ext lock | Midas `docs/EXT_API_MERGE_LOCK.md` (as pasted 2026-08-03 with scopes) |
| Trade Show behavior | `2026-08-03-trade-show-midas-implementation-contract.md` |
| Trade Show response | `2026-08-03-trade-show-midas-alignment-response.md` |
| Last updated by | Trade Show agent |

---

## Explicit countersign (Trade Show)

**Trade Show App is fully aligned** with Midas’s ALIGNED contract and the Ext API Merge Lock (including auth scopes).

| Topic | Trade Show |
|---|---|
| SoR split / event-only / Open in Midas for review+Zoho | **ALIGNED** |
| `sourceApp=trade_show`, `sourceRefId=expenses.id`, `sourceType=trade_show_event` | **ALIGNED** |
| **D1** `sourceContext` jsonb for `eventId` (no TS `event_id` column) | **ALIGNED** |
| Ext paths § Required endpoints 1–11 | **ALIGNED** |
| Deferred Ext review / reimbursement / zoho-push | **ALIGNED** |
| Expense + reimbursement status maps (incl. `rejected`) | **ALIGNED** |
| Standalone sync `POST /ocr/process` | **ALIGNED** |
| Import idempotent + `skipOcr` + checksums | **ALIGNED** |
| DELETE / PATCH rules | **ALIGNED** |
| Category seed + mappings | **ALIGNED** |
| **Scope enforcement** (`ocr:process`, `expenses:*`, `receipts:create`, `expenses:import`) + 403 `MISSING_SCOPE` | **ALIGNED** (supersedes prior D14 “defer scopes”; TS prefers enforcement) |
| `EXT_AUTO_PROVISION_USERS` default false; sandbox ops → true | **ALIGNED** |
| Sandbox key scopes at Phase 0 | **ALIGNED** — expect: create/read/update/delete, receipts:create, import, ocr:process |

No open blockers from the Trade Show side.

---

## Begin work (authorized)

| Who | May begin now |
|---|---|
| **Midas** | Implement Ext + schema per Merge Lock on **sandbox**; issue Phase 0 app key; seed categories |
| **Trade Show** | Implementation plan → `MidasClient` / `ExpenseStore` / BFF / migration against **mock**, then Midas sandbox (CT **2600** only) |

**Not authorized yet:** production Trade Show deploy or prod expense cutover.

---

## Alignment log

| When | Who | Note |
|---|---|---|
| 2026-08-03 | Both | COMPLETE mirrored; D1–D18 ack |
| 2026-08-03 | Midas | Countersign B1–B12; ALIGNED; Ext lock + **scope enforcement** |
| 2026-08-03 | Trade Show | **Explicit ALIGNED**; scopes ACK; **coding gate OPEN** for sandbox |

---

## Document control

| Version | Date | Author | Change |
|---|---|---|---|
| 0.3 | 2026-08-03 | Trade Show | COMPLETE + D1–D18 |
| 0.4 | 2026-08-03 | Trade Show | Countersign Ext lock w/ scopes; gate OPEN; begin sandbox work authorized |
