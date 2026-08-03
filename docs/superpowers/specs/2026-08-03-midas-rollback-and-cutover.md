# Midas Expense BFF — Rollback & Production Cutover

**Date:** 2026-08-03  
**Branch:** `feature/midas-expense-bff`  
**Scope:** Sandbox rollback is operable now. Production cutover is **draft only** — do **not** touch prod CTs until Phase 4/5 explicit approval.

**Verified flags** (`backend/src/services/midas/index.ts`, `expenseStore/index.ts`):

| Var | Values | Notes |
|---|---|---|
| `EXPENSE_BACKEND` | `local` \| `dual` \| `midas` (default `local`) | Selects store: `LocalExpenseStore` / `DualExpenseStore` / `MidasExpenseStore` |
| `MIDAS_MODE` | `disabled` \| `mock` \| `live` (default `disabled`) | `midas` and `dual` **require** `mock` or `live` (startup/request throws otherwise) |
| `MIDAS_BASE_URL` | e.g. `http://192.168.1.210:4000/api/v1` | Required when `MIDAS_MODE=live` |
| `MIDAS_API_KEY` | Ext connection key | Required when `MIDAS_MODE=live` |
| `MIDAS_WEB_BASE_URL` | e.g. `https://midas.booute.duckdns.org` | Builds `midasUrl` / Open in Midas |
| `MIDAS_TIMEOUT_MS` | default `10000` in code; sandbox templates use `120000` | Import/OCR may need the higher value |

Env templates: `backend/env.example`, `backend/env.sandbox.template`.  
Sandbox deploy: `./deploy-sandbox-2600.sh` → CT **2600** only.

---

## 1. Sandbox rollback (CT 2600 → local)

Use this if live BFF misbehaves and you need Trade Show to serve expenses from its own Postgres again. **Never delete Midas imported rows on rollback** (feature-flag only).

### 1.1 Env flip

On CT 2600, edit `/etc/expenseapp/backend.env`:

```bash
EXPENSE_BACKEND=local
MIDAS_MODE=disabled
```

Leave `MIDAS_BASE_URL` / `MIDAS_API_KEY` / `MIDAS_WEB_BASE_URL` in place (harmless while disabled; needed for re-enable).

### 1.2 Restart

```bash
# from Proxmox host, or inside CT 2600:
systemctl restart trade-show-app-backend
sleep 5
systemctl is-active trade-show-app-backend
curl -s http://127.0.0.1:3000/api/health
curl -s -H "Authorization: Bearer <jwt>" http://127.0.0.1:3000/api/expenses/engine
# expect backend=local, midasMode=disabled (or equivalent)
```

Or redeploy backend only: `./deploy-sandbox-2600.sh backend` (restart is included; still set env **before** restart).

### 1.3 What still works / what doesn’t

| Area | After rollback to `local` |
|---|---|
| List / get / create / edit against **TS Postgres** | Works — original sandbox expenses still in local DB |
| Receipts on disk under TS `UPLOAD_DIR` | Works for local rows |
| Local OCR / Zoho push / accountant approve-reject | Local paths available again (pre-Midas SoT) |
| Rows created **only** in Midas during UAT (e.g. smoke `UAT Cafe`) | **Not** in local DB — invisible until midas re-enabled |
| Migrated copies in Midas (375+) | **Remain** in Midas; untouched |
| Open in Midas / `midasUrl` / `MIDAS_OWNED` | Gone (UI returns to local review controls) |
| Dual mode notes | `EXPENSE_BACKEND=dual` writes both, reads prefer Midas. Not the recommended emergency rollback — prefer `local` + `disabled` |

### 1.4 Re-enable Midas (sandbox)

```bash
EXPENSE_BACKEND=midas
MIDAS_MODE=live
# MIDAS_BASE_URL / MIDAS_API_KEY / MIDAS_WEB_BASE_URL already set
systemctl restart trade-show-app-backend
```

Confirm:

```bash
GET /api/expenses/engine  → backend=midas, midasMode=live, reviewInMidas=true
GET /api/expenses         → ~375+ (Midas Ext cursor pagination)
```

Optional: re-run `uatHttpBffProbe` on CT 2600 (see validation report).

---

## 2. Production cutover (DRAFT — do not execute)

**Explicit:** do **not** deploy to or change production Trade Show / Midas prod CTs in this session. Prod remains frozen until Phase 4/5 approval.

### 2.1 Preconditions

- [ ] Midas Ext green on production (or agreed prod Ext host) — health, auth, import, receipt get
- [ ] OCR: fixed **or** accepted risk (receipt-scan UX may 500 until Midas `OCR_MODE` triage — see OCR handoff)
- [ ] Sandbox validation report green for blocking checks — `2026-08-03-midas-sandbox-validation-report.md`
- [ ] Key rotation process agreed: separate sandbox vs prod Ext keys; rotate → refresh `MIDAS_API_KEY` on TS → restart; no password resets for UAT users
- [ ] `EXT_AUTO_PROVISION_USERS=false` on prod Ext (prefer preflight missing users); sandbox may temporarily use `true` for import only
- [ ] Freeze window + comms approved (target ≤2h write-freeze on TS expense mutations)

### 2.2 Prod env vars (placeholders — no real secrets)

```bash
MIDAS_MODE=live
MIDAS_BASE_URL=https://<midas-prod-api-host>/api/v1
MIDAS_API_KEY=<prod-ext-connection-key>
MIDAS_WEB_BASE_URL=https://<midas-prod-web-host>
MIDAS_TIMEOUT_MS=120000

# Flip only AFTER migrate verify:
EXPENSE_BACKEND=midas
```

Keep `EXPENSE_BACKEND=local` (and optionally `MIDAS_MODE=disabled`) until apply+verify succeed.

### 2.3 Migration apply sequence

On the **production** Trade Show backend host (when authorized):

1. **Write-freeze** expense create/update in TS (comms + optional feature flag / maintenance).
2. Final dump of `expenses` + upload tree.
3. **Dry-run:**

```bash
cd /opt/trade-show-app/backend   # or prod path
npx ts-node --transpile-only src/scripts/migrateExpensesToMidas.ts \
  --dry-run --batch=15 --report=/tmp/mig-prod-dry.json
```

4. **Apply:**

```bash
npx ts-node --transpile-only src/scripts/migrateExpensesToMidas.ts \
  --batch=15 --report=/tmp/mig-prod-apply.json
```

5. **Verify:** Ext `count` / by-ref spot-checks; idempotent re-apply → all skipped; receipts open.
6. **Flip:** set `EXPENSE_BACKEND=midas`, `MIDAS_MODE=live`; restart backend.
7. Smoke: list count, `midasUrl`, receipt proxy, create one test row, confirm `409 MIDAS_OWNED` on local approve/Zoho push.
8. Keep TS DB as **read-only rollback copy**; never delete Midas imports on rollback.

### 2.4 Frontend expectations after flip

- Engine badge / “Powered by Midas” when backend is midas/dual
- **Open in Midas** via `midasUrl` for accountant review / Zoho
- Local approve / reject / entity / Zoho push → **`409 MIDAS_OWNED`** (SoT is Midas)
- Permissions (who can create/edit pending) unchanged at the TS BFF layer

### 2.5 Freeze window / communication

- Announce start/end of write-freeze to accountants and sales
- During freeze: no TS expense mutations; migration runs; flip; brief smoke
- After: accountants use Midas UI for review; intake remains in Trade Show
- Rollback if needed: same flag flip as §1 (`local` + `disabled`) — note any Midas-only edits during the live window will not appear in local DB

### 2.6 Out of scope this session

- Any change to production CTs / prod env / prod keys
- Password resets
- Deleting migrated Midas data

---

## Related

- Validation: `docs/superpowers/specs/2026-08-03-midas-sandbox-validation-report.md`
- OCR handoff: `docs/superpowers/specs/2026-08-03-trade-show-to-midas-ocr-500.md`
- Remaining gaps: `docs/superpowers/specs/2026-08-03-trade-show-to-midas-remaining-gaps.md`
- Plan Task 9: `docs/superpowers/plans/2026-08-03-midas-expense-bff.md`
