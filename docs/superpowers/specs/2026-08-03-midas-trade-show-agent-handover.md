# Midas → Trade Show agent handover (Ext expense engine)

**Date:** 2026-08-03  
**Source:** Midas agent operational handover  
**Alignment:** COMPLETE — coding authorized  
**Midas Ext:** READY for Trade Show BFF (sandbox)

Normative API: Midas `docs/EXT_API_MERGE_LOCK.md`. This file is the operational copy absorbed into the Trade Show repo.

## Delivered by Midas (ack)

Ext OCR/CRUD/list/by-ref/receipts/import/categories; Bearer scopes; sync OCR; `source_context` / `external_user_id` / `eventId`; idempotent create; default `pending`; reimbursement `rejected`; TS category seed + mappings; import dryRun/skipOcr; `midasUrl`; auto-provision; local smoke green.

**Deferred (TS must not depend on):** Ext review / reimbursement / zoho-push routes — use `midasUrl` + Midas UI.

## Trade Show local connect

| Var | Value |
|---|---|
| `MIDAS_MODE` | `live` (local) / `mock` (CT 2600 until network Ext) |
| `MIDAS_BASE_URL` | `http://localhost:4000/api/v1` |
| `MIDAS_API_KEY` | `midas/.ext-sandbox.key` |
| `MIDAS_WEB_BASE_URL` | `http://localhost:5173` |
| `MIDAS_TIMEOUT_MS` | `120000` |

Scopes required: `expenses:create|read|update|delete`, `receipts:create`, `expenses:import`, `ocr:process`.

## Recommended intake sequence

1. `POST /ext/ocr/process`  
2. `POST /ext/expenses` (pending, eventId, sourceRefId, …)  
3. `POST /ext/expenses/:id/receipts` (bytes even if OCR already ran)  
4. List / PATCH while draft|pending|awaiting_info  
5. Accountant actions → `midasUrl` only  

## Status / reimbursement maps

Unchanged vs locked contracts (pending↔pending, needs further review↔awaiting_info, etc.; reimbursement includes rejected).

## Trade Show build status vs §10

| Item | Status |
|---|---|
| 1. MidasClient mock/live/disabled | Done |
| 2. ExpenseStore + flags | Done |
| 3. Facade `/api/expenses*` | Done (list/get/create/update/receipt; delete still local-path heavy) |
| 4. OCR facade → Ext | Done |
| 5. Permissions in TS BFF | Done (list scoping + participant checks) |
| 6. Remove local OCR/Zoho SoT when midas | Partial (409 MIDAS_OWNED; local code kept for rollback) |
| 7. Migration runner import | Scaffolded (`migrate:expenses:midas`) |
| 8. Sandbox-only deploys | CT 2600 mock deployed; live Ext when host reachable |

## Acceptance (§11) — sandbox

- [x] Engine meta + Powered by Midas / Open in Midas UI (mock)  
- [x] Create → TS list + `midasUrl` (mock in-memory)  
- [x] OCR fields via Ext mock  
- [x] Status PATCH blocked (`MIDAS_OWNED`)  
- [ ] Live Ext: appears in Midas UI  
- [ ] Edit pending / approved lock against live  
- [ ] Import dry-run + apply counts  
- [ ] No OCR microservice calls when midas (confirm on CT logs)  

## Ops note

Never reset sandbox user passwords for API smoke — use known accountant credentials.
