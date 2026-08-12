# Midas Ext on Proxmox — topology + migration status

**Date:** 2026-08-03 (updated after live Ext dry-run)  
**From:** Trade Show agent  
**Topology:** Midas app + DB are on the **same Proxmox** as Trade Show (`192.168.1.190`). Operator laptop LAN (`192.168.8.102`) is **not** the CT target.

---

## Topology (authoritative for CT work)

| CT | Name | IP | Role |
|---|---|---|---|
| **3120** | `midas-app-prod` | **192.168.1.210** | Midas API `:4000` + web `:5173` (docker) |
| **3220** | `midas-db-prod` | **192.168.1.211** | Postgres `midas` |
| **2600** | `trade-show-sandbox` | **192.168.1.144** | TS sandbox BFF |
| 2220 | `trade-show-backend` | 192.168.1.201 | TS prod API + complete uploads (read-only receipt source) |
| 2120 / 2320 | frontend / db-prod | … | **Untouched** (no deploys / no password resets) |

Reachability: CT 2600 → `http://192.168.1.210:4000/api/v1/health` → **200**.

Laptop Ext (`192.168.8.102` / localhost) may still be used for local TS/Vite work; it is a **different** Midas DB than Proxmox CT 3220.

---

## Ext status on CT 3120

Earlier discovery found a legacy ~70-line Ext stub. Image was refreshed to **full Ext** (categories / list / by-ref / OCR / receipts / **import**). Import dry-run against Proxmox is green (see below).

Ops note applied for sandbox migration: `EXT_AUTO_PROVISION_USERS=true` on CT 3120 `/opt/midas/.env` (was `false`; caused per-item `USER_NOT_FOUND`). Prefer leaving this true only for sandbox import window; prod migration should use preflight or keep default false.

---

## CT 2600 env (sandbox only)

`/etc/expenseapp/backend.env`:

```bash
MIDAS_MODE=live
MIDAS_BASE_URL=http://192.168.1.210:4000/api/v1
MIDAS_API_KEY=<backend/.migration/midas-prox-trade-show.key — gitignored>
MIDAS_WEB_BASE_URL=http://192.168.1.210:5173
MIDAS_TIMEOUT_MS=120000
EXPENSE_BACKEND=midas
```

`app_connections.trade_show` on Proxmox Midas DB with B4 scopes:
`expenses:create|read|update|delete`, `receipts:create`, `expenses:import`, `ocr:process`.

---

## Migration dry-run (complete)

Ran from laptop against Proxmox Ext with `--from-json` + synced uploads (`/tmp/ts-mig-uploads/uploads`):

```bash
MIDAS_MODE=live \
MIDAS_BASE_URL=http://192.168.1.210:4000/api/v1 \
MIDAS_API_KEY=… \
npx ts-node --transpile-only src/scripts/migrateExpensesToMidas.ts \
  --dry-run --batch=15 \
  --from-json=./.migration/ts-expenses-export.json \
  --uploads-dir=/tmp/ts-mig-uploads/uploads \
  --report=./.migration/mig-dry-prox-full.json
```

| Check | Result |
|---|---|
| Inventory | **375** total; receipt_url 375; receipt files **375/375**; Zoho 244; missing email/event **0** |
| Ext dry-run batches | 25 × 15 |
| Ext totals | **created 375, skipped 0, failed 0** |
| Failures / warnings | **none** |
| Report file | `backend/.migration/mig-dry-prox-full.json` |

Receipts were synced earlier from CT **2220** → 2600 uploads and laptop `/tmp/ts-mig-uploads` (read-only copy; no prod code deploy).

---

## Midas reply absorbed (G1–G8)

| Gap | Resolution for Proxmox path |
|---|---|
| G1 network Ext | **Same Proxmox** `192.168.1.210:4000` — not laptop `192.168.8.102` |
| G2 zero-loss import | Confirmed on Midas side; TS dry-run 375/0 |
| G3 body / batch | ~100mb body; batch **≤25** recommended / 100 max — TS used **15** |
| G4 missing users | Per-item `USER_NOT_FOUND`; fixed via `EXT_AUTO_PROVISION_USERS=true` on 3120 |
| G5–G8 | midasUrl / receipt content / audit / no unilateral Ext changes — as previously aligned |

---

## Apply + M3/M8 — done

Apply ran on CT 2600: **created 375 / failed 0**; idempotent re-apply **skipped 375**. Midas confirmed **M3/M8 closed** (post-apply count 375; live now **377** = 375 import + 2 UAT smokes; receipts/Zoho on migrated set unchanged; `EXT_AUTO_PROVISION_USERS=false`). See `2026-08-03-trade-show-to-midas-apply-complete.md` and `2026-08-03-trade-show-to-midas-remaining-gaps.md`.

Remaining Midas item: OCR 500. Do **not** deploy to prod CTs 2120 / 2220 / 2320.
