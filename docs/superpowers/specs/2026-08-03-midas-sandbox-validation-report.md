# Midas Expense BFF — Sandbox Validation Report (CT 2600)

**Date:** 2026-08-03  
**Branch:** `feature/midas-expense-bff`  
**Target:** Trade Show sandbox CT **2600** (`http://192.168.1.144/`) → Midas Ext CT **3120** (`http://192.168.1.210:4000`)  
**Prod:** untouched / frozen  

## Deploy

| Step | Result |
|---|---|
| `./deploy-sandbox-2600.sh both` | Backend + frontend deployed; health `2.10.0` ok |
| Sandbox env (`/etc/expenseapp/backend.env`) | `EXPENSE_BACKEND=midas`, `MIDAS_MODE=live`, `MIDAS_WEB_BASE_URL=https://midas.booute.duckdns.org` |
| Auth for probes | JWT minted from `JWT_SECRET` + existing admin user (**no password resets**) |

## Live HTTP UAT (`uatHttpBffProbe.ts`)

| Check | Result | Detail |
|---|---|---|
| Health | **PASS** | `200` |
| `GET /api/expenses/engine` | **PASS** | `backend=midas`, `midasMode=live`, `reviewInMidas=true` |
| `GET /api/expenses` list count | **PASS** | **≥375** (proves Ext cursor pagination in BFF). Import baseline **375**; live Ext may show **376/377** when UAT smoke creates remain — see count note below. |
| `GET /api/expenses/:id` midasUrl | **PASS** | `https://midas.booute.duckdns.org/expenses/...` |
| Receipt proxy | **PASS** | `200`, ~2.8MB via `/api/expenses/midas-receipt/...` |
| Create smoke expense | **PASS** | `201` + duckdns `midasUrl` |
| `PATCH .../status` accountant SoT | **PASS** | `409` `MIDAS_OWNED` |
| `POST .../push-to-zoho` | **PASS** | `409` `MIDAS_OWNED` |
| `POST /api/ocr/v2/process` (tiny PDF) | **PASS** | **400** `OCR_INVALID_FILE` (+ `requestId`); invalid input is client error |
| `POST /api/ocr/v2/process` (real JPEG) | **PASS** | **200** merchant Hughes Center / amount 37.87 / `rapidocr` |

**Blocking summary:** allPass=true (8/8 blocking; OCR checks also green after Ext fix).

### Store / Ext probe (`uatLiveBffProbe.ts`) — same host

| Check | Result |
|---|---|
| Ext list (cursor-all) | **376** at probe time (375 imported + 1 HTTP smoke); later **377** after store smoke (`UAT Cafe` + `UAT HTTP Cafe`) — not import drift |
| Store list | Matches Ext; pagination OK |
| Receipt bytes via Ext | **PASS** (~2.8MB) |
| OCR Ext / BFF | **PASS** — invalid tiny PDF → **400** `OCR_INVALID_FILE`; real JPEG → **200** |
| Store create smoke | **PASS** + duckdns `midasUrl` |

## Code shipped this pass

- `MidasExpenseStore.list` cursor-loops (`limit=100`) until `nextCursor` null  
- `ExpenseStore.delete` + `DELETE /api/expenses/:id` midas/dual path  
- `MidasApiError` mapped in Express error handler (`status` → HTTP status; optional `requestId` / `X-Request-Id`)  
- OCR: `ocrV2` rethrows `MidasApiError` unchanged; probes expect tiny PDF **400 `OCR_INVALID_FILE`**  
- Probes: `uatLiveBffProbe.ts`, `uatHttpBffProbe.ts`

## Task 8 notes (flag cleanup)

| Item | Status |
|---|---|
| OCR path when midas | Uses Midas Ext only (no `OCR_SERVICE_*` on request path) |
| Zoho push / review when midas | Blocked with `409 MIDAS_OWNED` |
| `LocalExpenseStore` | Retained for rollback |
| Daily Expenses UI | Already absent on this branch |

## Count note (375 vs 376/377)

| Layer | Count | Meaning |
|---|---|---|
| Import / migrated set | **375** | Apply created 375; receipts on migrated set **375**; Zoho ids **244** |
| Live Ext after UAT | **377** | **375 import** + **2 UAT smoke creates** (`UAT Cafe`, `UAT HTTP Cafe`) |
| Mid-probe snapshots | **376** | Intermediate (one smoke already created) — same explanation |

Midas re-check confirmed M3/M8 **closed**; +2 are expected UAT creates, not import drift. Idempotent re-import still skips the original **375** by `sourceRefId`.

## Remaining gaps

1. **OCR invalid-file** — **Closed / verified** (Ext 400 + BFF forward). See `2026-08-03-trade-show-to-midas-ocr-500.md`.  
2. **Daily Expenses** — out of scope.  
3. **Production** — still frozen; no CT other than 2600. Cutover draft only: `2026-08-03-midas-rollback-and-cutover.md`.  
4. Optional: cleanup UAT smoke expenses (`UAT Cafe` / `UAT HTTP Cafe`) to bring live count back to **375** — see below; **not** deleted this session. **M3/M8 closed** — see `2026-08-03-trade-show-to-midas-remaining-gaps.md`.

## Follow-on docs (Task 9 Step 3)

- Rollback (sandbox → local) + production cutover draft: `docs/superpowers/specs/2026-08-03-midas-rollback-and-cutover.md`
- OCR closed/verified: `docs/superpowers/specs/2026-08-03-trade-show-to-midas-ocr-500.md`
- Gaps bookkeeping: `docs/superpowers/specs/2026-08-03-trade-show-to-midas-remaining-gaps.md`

## Optional: delete UAT smoke expenses

Rows were created during live probes (`merchant` / description like **UAT Cafe**, **UAT HTTP Cafe**). Prefer documenting over ad-hoc deletes without a confirmed id list.

Safe options (sandbox only; **no password resets**):

1. **Midas UI** — Open expense via `midasUrl` from list (filter by merchant) → delete if role allows.  
2. **TS BFF** (while `EXPENSE_BACKEND=midas`) — `DELETE /api/expenses/:id` with a normal accountant/admin JWT (same auth as UAT; no password reset). Confirm id from `GET /api/expenses` search first.  
3. **Ext** — `DELETE` via Ext expense API with sandbox `MIDAS_API_KEY` if your Ext contract exposes delete for `source_app=trade_show` test rows.

Do **not** bulk-delete migrated `trade_show` imports (the 375). Do **not** touch production.

## How to re-run

On CT 2600:

```bash
set -a
# load KEY=VAL lines from /etc/expenseapp/backend.env carefully (avoid unquoted spaces)
set +a
cd /opt/trade-show-app/backend
BASE_URL=http://127.0.0.1:3000 node dist/scripts/uatHttpBffProbe.js
```
