# Trade Show → Midas Agent Handoff

**From:** Trade Show App agent  
**To:** Midas agent  
**Date:** 2026-08-03  
**Purpose:** Close remaining dual-app gaps and execute a **zero-loss** migration of all Trade Show event expenses into Midas.  
**Prod:** Frozen until Phase 4/5 — sandbox first.

**Status update (same day):** G1 satisfied by Proxmox Midas (CT **3120** / DB **3220**). Apply **created 375 / failed 0**; idempotent **skipped 375**. **M3/M8 closed** (live Ext **377** = 375 import + 2 UAT smokes; `EXT_AUTO_PROVISION_USERS=false`). Remaining Midas: OCR 500. See `2026-08-03-trade-show-to-midas-remaining-gaps.md`.

---

## 1. Executive ask

Trade Show BFF scaffolding is deployed on **CT 2600** (`http://192.168.1.144/`) in **`MIDAS_MODE=live`** against Proxmox Midas. Local laptop Trade Show may still use laptop Ext for local-only work (separate DB).

We need Midas to (mostly done for Proxmox path):

1. Confirm Ext import accepts our full migration payload (receipts + timestamps + Zoho + OCR skip). — **dry-run green**  
2. Stand up (or expose) a **network-reachable** Midas Ext endpoint for CT 2600 — **same Proxmox `192.168.1.210`**  
3. Support / validate **zero-loss migration** of **all** Trade Show `expenses` rows (~375 on current sandbox DB copy; prod historically ~377).  
4. Close the small remaining contract gaps listed in §4.

**Non-negotiable:** No Trade Show expense, receipt file, Zoho id, status, or reimbursement state may be dropped. Idempotent re-import must never duplicate.

---

## 2. Trade Show status (done)

| Area | Status |
|---|---|
| Dual-app alignment | COMPLETE / ALIGNED |
| `MidasClient` (disabled / mock / live) | Done |
| `ExpenseStore` + `MidasExpenseStore` + `DualExpenseStore` | Done |
| Facade `/api/expenses` list/get/create/update/receipt | Done |
| Facade `/api/ocr/v2/process` → Ext OCR | Done |
| Accountant SoT mutations when `EXPENSE_BACKEND=midas` | `409 MIDAS_OWNED` + Open in Midas UI |
| UI: Powered by Midas + Open in Midas | Done |
| CT 2600 deploy | Done (`v2.10.0`, mock engine) |
| Local live Ext smoke (categories/create/idempotent/list/by-ref/OCR) | Green against your key |
| Migration runner | Upgraded for receipts/`skipOcr`/timestamps/Zoho/checksums (`npm run migrate:expenses:midas`) |

**Daily Expenses:** sandbox-only WIP — **removed from scope**; not a migration source.

---

## 3. Inventory (sandbox DB on CT 2600 — prod copy)

As of 2026-08-03:

| Metric | Count |
|---|---|
| Expenses | **375** |
| With `receipt_url` | **375** (100%) |
| With `ocr_text` | 2 |
| With `zoho_expense_id` | 244 |
| With `zoho_entity` | 371 |
| Status `approved` | 290 |
| Status `pending` | 85 |
| Users | 11 |
| Events | 18 |

**Migration must cover every row**, including approved + already-pushed Zoho expenses. Receipts are filesystem paths under Trade Show uploads; runner inlines `contentBase64` + `sha256` + `skipOcr: true`.

---

## 4. Remaining gaps for Midas (please close / confirm)

### G1 — Network Ext for CT 2600 — **RESOLVED (Proxmox)**

CT 2600 cannot reach operator laptop `192.168.8.102` / localhost. That path is obsolete for sandbox CT.

**Live target:** same Proxmox host as Trade Show:

| Host | Value |
|---|---|
| Midas app | CT **3120** `midas-app-prod` → `http://192.168.1.210:4000` |
| Midas DB | CT **3220** `midas-db-prod` → `192.168.1.211` |
| Web | `http://192.168.1.210:5173` |
| Key | Proxmox `trade_show` with B4 scopes (not laptop `.ext-sandbox.key`) |
| Auto-provision | `EXT_AUTO_PROVISION_USERS=true` on 3120 for sandbox import |

CT 2600 `/etc/expenseapp/backend.env` already set to `MIDAS_MODE=live` + that base URL.

### G2 — Import payload confirmation (zero-loss)

Trade Show will call:

`POST /api/v1/ext/expenses/import`

with items shaped as:

```json
{
  "sourceApp": "trade_show",
  "dryRun": true,
  "items": [{
    "sourceRefId": "<expenses.id UUID>",
    "submitterEmail": "<users.email>",
    "externalUserId": "<users.id UUID>",
    "eventId": "<events.id UUID>",
    "sourceLabel": "<event name>",
    "sourceType": "trade_show_event",
    "merchant": "...",
    "amount": 12.34,
    "currency": "USD",
    "date": "YYYY-MM-DD",
    "description": "...",
    "categoryName": "<exact TS name>",
    "cardUsed": "...",
    "location": "...",
    "status": "pending|approved|rejected|awaiting_info",
    "reimbursementRequired": true,
    "reimbursementStatus": "not_requested|pending|approved|rejected|paid",
    "zohoEntity": "...",
    "zohoExpenseId": "...",
    "ocrText": "...",
    "extractedData": {},
    "createdAt": "ISO-8601",
    "updatedAt": "ISO-8601",
    "submittedAt": "ISO-8601|null",
    "reviewedAt": "ISO-8601|null",
    "comments": "...",
    "receipt": {
      "filename": "....jpg",
      "mimeType": "image/jpeg",
      "contentBase64": "...",
      "skipOcr": true,
      "sha256": "hex"
    }
  }]
}
```

**Please confirm / fix if Ext currently drops any of:**

| Field | Must preserve |
|---|---|
| `sourceRefId` | Exact TS expense UUID; unique with `sourceApp` |
| Receipt bytes | Stored; openable via content endpoint / Midas UI |
| `skipOcr` | No OCR re-bill; keep `ocrText` / `extractedData` when provided |
| Status | Including `approved` / `awaiting_info` |
| Reimbursement | Including `rejected` |
| `zohoEntity` / `zohoExpenseId` | Exact strings |
| Timestamps | `createdAt` / `updatedAt` / `submittedAt` / `reviewedAt` |
| Category | Exact name → seeded category; unknown → `Other` + warning (**do not fail row**) |
| Idempotent re-run | Existing `(sourceApp,sourceRefId)` → `skipped` (0 duplicates) |

**Ask:** Publish a short import-acceptance note (or extend smoke) that asserts count-in = count-out for a 375-row dryRun+apply on a clean sandbox.

### G3 — Batch size / payload limits

Receipts make batches large (base64). Runner default batch = **25**.

**Need:** Documented max JSON body size / timeout for import (we use `MIDAS_TIMEOUT_MS=120000`). If nginx/API gateway limits &lt; ~20–50MB, tell us preferred batch size or chunked import.

### G4 — User preflight

Sandbox: auto-provision OK.  

**Prod:** Prefer `EXT_AUTO_PROVISION_USERS=false` + preflight report.

**Need from Midas:** Endpoint or documented query to list unresolved emails after a dry-run import (or return `USER_NOT_FOUND` per item in import results without aborting the whole batch). Prefer **per-item fail** over whole-batch fail.

### G5 — `midasUrl` for migrated + Ext-created rows

Must be absolute URL using configured web base, e.g. `https://midas…/expenses/<midas-id>`.

Trade Show UI opens this for all accountant review/Zoho work.

### G6 — Receipt content for BFF proxy

Trade Show serves:

`GET /api/expenses/midas-receipt/:midasExpenseId/:receiptId`

→ Ext `GET /ext/expenses/:id/receipts/:receiptId/content`

**Confirm** content endpoint works for **imported** receipts (not only live uploads).

### G7 — Audit trail (nice-to-have, not blocking v1 UI)

TS has `expense_audit_log`. Import item may send `auditTrail[]`.  

**Ask:** If Ext ignores it today, acknowledge; optional later preserve. Zero-loss for **expense+receipt+zoho+status** is hard-required; audit history is soft.

### G8 — Do not change Ext unilaterally

If any path/field must change, update `EXT_API_MERGE_LOCK.md` + alignment first and notify Trade Show.

---

## 5. Zero-loss migration plan (joint)

### Phase A — Sandbox (CT 2600 ↔ Midas sandbox)

1. Midas: network Ext ready + key issued (G1).  
2. Trade Show: point CT 2600 to live Ext.  
3. Trade Show:  
   ```bash
   cd backend
   npm run migrate:expenses:midas -- --dry-run --report=/tmp/mig-dry.json
   ```  
4. Fix mapping / missing receipt files / missing emails.  
5. Trade Show: apply import (resumable):  
   ```bash
   npm run migrate:expenses:midas -- --report=/tmp/mig-apply.json
   npm run migrate:expenses:midas -- --resume   # if interrupted
   ```  
6. **Verify together:**  
   - Midas count where `sourceApp=trade_show` **=** TS `expenses` count  
   - Re-run import → all `skipped`, 0 new  
   - Spot-check ≥20 rows: amount, status, zoho id, receipt opens, midasUrl  
   - Approved expenses remain approved; pending remain pending  

### Phase B — Acceptance (Merge Contract §14)

- [ ] Create from TS UI → visible in TS list **and** Midas UI  
- [ ] OCR → form → save (Ext OCR, no TS OCR microservice)  
- [ ] Edit pending; approved locked  
- [ ] Permissions unchanged  
- [ ] Import count match; re-import 0 duplicates  
- [ ] Receipts open; OCR preserved with `skipOcr`  
- [ ] Zoho ids preserved  
- [ ] Open in Midas works  
- [ ] No data loss vs pre-migration snapshot  

### Phase C — Production (only after explicit Phase 4/5 approval)

1. Write-freeze TS expense mutations (≤2h window).  
2. Final dump of `expenses` + upload tree.  
3. dryRun → apply → verify counts.  
4. Flip `EXPENSE_BACKEND=midas` / `MIDAS_MODE=live`.  
5. Keep TS DB as read-only rollback copy; **never delete Midas imports on rollback**.  

---

## 6. What Trade Show will *not* call (confirmed)

Per lock: no Ext `review` / `reimbursement` / `zoho-push`. Accountants use **Midas UI** via `midasUrl`.

---

## 7. Trade Show contacts / artifacts

| Artifact | Location (Trade Show repo) |
|---|---|
| Implementation contract | `docs/superpowers/specs/2026-08-03-trade-show-midas-implementation-contract.md` |
| Alignment status | `docs/superpowers/specs/2026-08-03-midas-trade-show-alignment-status.md` |
| Local Ext handoff | `docs/superpowers/specs/2026-08-03-midas-ext-local-handoff.md` |
| This handoff | `docs/superpowers/specs/2026-08-03-trade-show-to-midas-agent-handoff.md` |
| Migration runner | `backend/src/scripts/migrateExpensesToMidas.ts` |
| Deploy (sandbox only) | `./deploy-sandbox-2600.sh` → CT **2600** only |

---

## 8. Reply checklist for Midas agent

Please respond with:

1. **G1** host URL + key issuance status for CT 2600  
2. **G2** confirmation that import preserves all fields in §4 (or a diff of dropped fields)  
3. **G3** max body size / recommended batch size  
4. **G4** per-item vs batch failure behavior for missing users  
5. **G6** imported receipt content endpoint verified  
6. ETA for sandbox Ext reachable from `192.168.1.144`  
7. Any blockers before Trade Show runs dry-run import against live Ext  

---

**Bottom line:** Trade Show will migrate **every** event expense (receipts + Zoho + status). We need Midas Ext reachable from CT 2600 and written confirmation that import is zero-loss and idempotent at full inventory scale.
