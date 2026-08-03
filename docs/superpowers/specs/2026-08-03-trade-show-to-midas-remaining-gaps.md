# Trade Show → Midas: Remaining Gaps Report

**From:** Trade Show App agent  
**To:** Midas agent / stakeholders  
**Date:** 2026-08-03 (sandbox phase complete)  
**Prod Trade Show:** still frozen — do not execute Phase 4/5 cutover.

## Status: Sandbox phase complete

Sandbox BFF (CT 2600), migration apply/re-apply, live UAT, and OCR invalid-file mapping are **done**.  
**Next gate:** Phase 4/5 production cutover approval (frozen; runbook only — `2026-08-03-midas-rollback-and-cutover.md`).

### Midas one-liner

**Trade Show sandbox BFF is green (CRUD + OCR); OCR invalid-file closed; awaiting Phase 4/5 production cutover approval.**

## Closed (Midas-confirmed + TS UAT)

| Item | Status |
|---|---|
| Key refresh after rotation | Done |
| Apply 375 | **created 375 / failed 0** |
| Idempotent re-apply | **skipped 375 / failed 0** (by `sourceRefId`) |
| Spot-check by-ref | `midasUrl` duckdns; receipt present; Zoho id preserved |
| **M3** | **Closed.** Live Ext / BFF list = **375** (imports). Earlier transient **377** was +2 UAT smokes; both deleted. Receipts **375**; Zoho ids **244**. Re-import still skips original **375** by `sourceRefId`. |
| **M8** | **Closed.** Midas confirmed `EXT_AUTO_PROVISION_USERS=false`; API healthy. |
| TS list pagination | Live BFF `GET /api/expenses` returns migrated set via Ext cursor-loop; live total **375** after smoke cleanup |
| Live BFF UAT (CT 2600) | Blocking checks **PASS** — see `2026-08-03-midas-sandbox-validation-report.md` |
| Rollback + prod cutover docs | **Done** (draft cutover; no prod exec) — `2026-08-03-midas-rollback-and-cutover.md` |
| **OCR invalid-file** | **Closed.** Midas Ext → **400 `OCR_INVALID_FILE`**; BFF forwards **400** (not 500) + `requestId`. Real JPEG → **200**. Re-probe: `2026-08-03-trade-show-to-midas-ocr-500.md` |
| UAT smoke rows | **Done (TS).** Deleted both smokes via BFF. Live list **375**; imports untouched. |

## Remaining / next

| ID | Owner | Notes |
|---|---|---|
| Daily Expenses | TS | Out of scope / removed from this branch UI; no further work. |
| Production cutover | Both | **Frozen.** Runbook drafted in rollback/cutover doc; execute only after Phase 4/5 approval. Do not touch prod CTs. |

## Alignment one-liner

**M3, M8, and OCR invalid-file mapping are closed on both sides.** Trade Show sandbox BFF UAT (CRUD + OCR) is green; production remains frozen pending cutover approval.

## Ping docs

- Apply: `docs/superpowers/specs/2026-08-03-trade-show-to-midas-apply-complete.md`
- Validation: `docs/superpowers/specs/2026-08-03-midas-sandbox-validation-report.md`
- Rollback / cutover: `docs/superpowers/specs/2026-08-03-midas-rollback-and-cutover.md`
- OCR closed/verified: `docs/superpowers/specs/2026-08-03-trade-show-to-midas-ocr-500.md`
- Phase complete: `docs/superpowers/specs/2026-08-03-midas-sandbox-phase-complete.md`
