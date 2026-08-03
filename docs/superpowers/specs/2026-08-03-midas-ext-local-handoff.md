# Midas Ext — local sandbox handoff (Trade Show)

**Date:** 2026-08-03  
**Source:** Midas Ext API sandbox handoff

## Wired on Trade Show

Local `backend/.env` (gitignored):

| Var | Value |
|---|---|
| `MIDAS_MODE` | `live` |
| `MIDAS_BASE_URL` | `http://localhost:4000/api/v1` |
| `MIDAS_API_KEY` | from `midas/.ext-sandbox.key` |
| `MIDAS_WEB_BASE_URL` | `http://localhost:5173` |
| `MIDAS_TIMEOUT_MS` | `120000` |
| `EXPENSE_BACKEND` | `midas` |

Client appends `/ext` → calls `http://localhost:4000/api/v1/ext/...`.

## Smoke (Trade Show `MidasClient`, 2026-08-03)

```
PASS  listCategories (22)
PASS  createExpense + idempotent same id
PASS  listExpenses?eventId=
PASS  getExpenseByRef
PASS  processOcr (mock)
```

## Local ports

- Midas API: `4000`
- Midas web (`midasUrl`): `5173`
- Trade Show API: `5000`
- Trade Show Vite defaults to `5173` — if both UIs run locally, shift one (e.g. `npm run dev -- --port 5174` for Trade Show)

## Sandbox CT 2600 → Proxmox Midas (2026-08-03)

| Item | Value |
|---|---|
| Midas app CT | `3120` midas-app-prod @ `192.168.1.210` |
| Midas DB CT | `3220` midas-db-prod |
| `MIDAS_BASE_URL` | `http://192.168.1.210:4000/api/v1` |
| `MIDAS_WEB_BASE_URL` | `http://192.168.1.210:5173` (LAN; duckdns optional for browsers) |
| `MIDAS_API_KEY` | Proxmox `trade_show` key (`backend/.migration/midas-prox-trade-show.key`; not laptop `.ext-sandbox.key`) |
| `EXPENSE_BACKEND` | `midas` |
| `MIDAS_MODE` | `live` |
| Reachability | CT 2600 → `192.168.1.210:4000` health **200**; full Ext (import OK) |

### Dry-run findings (2026-08-03)

- Full Ext dry-run vs Proxmox: **375 created / 0 skipped / 0 failed** (`backend/.migration/mig-dry-prox-full.json`).
- `EXT_AUTO_PROVISION_USERS` was **true** for sandbox import (was false → `USER_NOT_FOUND`); Midas later set **false** (**M8 closed**).
- Receipts: 375/375 files (synced from CT 2220). Batch size used: **15**.
- **Done:** apply **created 375 / failed 0**; re-apply **skipped 375**; **M3/M8 closed** (live Ext may be **377** = 375 + 2 UAT smokes). See `2026-08-03-midas-proxmox-ext-gap.md` and `2026-08-03-trade-show-to-midas-remaining-gaps.md`.

### Laptop key note

Laptop `.ext-sandbox.key` / `192.168.8.102` targets a **different** Midas DB than Proxmox CT 3220. Do not use laptop key on CT 2600.

## Rotate key

On Midas:

```bash
set -a && source .env && set +a
npm run ext:create-connection --workspace=@midas/api -- trade_show
```

Then update Trade Show `backend/.env` `MIDAS_API_KEY`.
