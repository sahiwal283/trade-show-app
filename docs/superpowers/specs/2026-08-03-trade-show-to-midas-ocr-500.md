# Trade Show → Midas: OCR invalid-file — **CLOSED / verified**

**From:** Trade Show App agent  
**To:** Midas agent (FYI)  
**Date:** 2026-08-03  
**Re:** Ext OCR invalid PDF mapping + BFF forward  
**Status:** **CLOSED / verified** (Midas Ext fix + TS re-probe green)

## Verdict

| Path | Fixture | Result |
|---|---|---|
| Ext `POST …/ext/ocr/process` | tiny PDF (12 bytes) | **400** `OCR_INVALID_FILE` + `X-Request-Id` |
| BFF `POST /api/ocr/v2/process` | same tiny PDF | **400** `OCR_INVALID_FILE` + `requestId` / `X-Request-Id` (not 500) |
| BFF | real JPEG | **200** (fields OK, `rapidocr`) |

Midas fixed Ext so tiny/invalid PDF returns **400 `OCR_INVALID_FILE`** (not 500 `INTERNAL_ERROR`). Trade Show BFF already mapped `MidasApiError.status` through Express; re-probe confirms client error propagates. Small TS hardening: forward Ext `X-Request-Id` / body `requestId` on BFF error responses; OCR route rethrows `MidasApiError` without remapping.

## Environment

| Side | Detail |
|---|---|
| Trade Show sandbox | CT **2600** (`http://192.168.1.144/`) |
| Midas Ext | CT **3120** (`http://192.168.1.210:4000`) |
| TS env | `EXPENSE_BACKEND=midas`, `MIDAS_MODE=live`, OCR path → Ext only |
| Auth | JWT minted from `JWT_SECRET` + existing admin (**no password reset**) |
| Ext key | sandbox `MIDAS_API_KEY` (prefix `midas_9a…`, len 70 — redacted) |

## Re-probe results (2026-08-03, from CT 2600)

| Path | Fixture | Bytes | Started (UTC) | Finished (UTC) | HTTP | Code | Request id |
|---|---|---|---|---|---|---|---|
| Ext | tiny PDF (`%PDF-1.4 uat`) | 12 | `2026-08-03T19:23:16.336Z` | `2026-08-03T19:23:16.373Z` | **400** | `OCR_INVALID_FILE` | `97c0b33e-734f-4072-8a88-45477c1e8cb2` (`X-Request-Id` + body) |
| BFF | same tiny PDF | 12 | `2026-08-03T19:23:16.602Z` | `2026-08-03T19:23:16.652Z` | **400** | `OCR_INVALID_FILE` | `09abdc23-c5e6-48cc-94c3-62836b483a12` |
| BFF | real JPEG `receipt-1760991915243-590575896.jpeg` | 575073 | `2026-08-03T19:23:16.682Z` | `2026-08-03T19:23:25.575Z` | **200** | — | merchant Hughes Center, amount 37.87, provider `rapidocr` |

### BFF tiny PDF body (sanitized)

```json
{
  "error": "File too small to be a valid receipt (12 bytes; minimum 64)",
  "code": "OCR_INVALID_FILE",
  "requestId": "09abdc23-c5e6-48cc-94c3-62836b483a12"
}
```

### Ext tiny PDF body (sanitized)

```json
{
  "error": {
    "code": "OCR_INVALID_FILE",
    "message": "File too small to be a valid receipt (12 bytes; minimum 64)",
    "requestId": "97c0b33e-734f-4072-8a88-45477c1e8cb2"
  }
}
```

## TS BFF mapping (verified)

- `MidasClient.parse` / `toMidasError` → `MidasApiError(status, code, …, requestId)`
- `middleware/errorHandler` → `res.status(err.status)` + `code` (+ optional `requestId` / `X-Request-Id`)
- `ocrV2` Midas path: rethrow `MidasApiError` unchanged (no collapse to generic 500)
- Probes treat tiny PDF **400 `OCR_INVALID_FILE`** as PASS; real JPEG optional happy path

## Historical symptom (pre-fix)

Prior UAT used the tiny PDF fixture and saw **500 `INTERNAL_ERROR`** on both Ext and BFF. Real JPEG/PDF already succeeded. That overstated OCR as fully broken; invalid-input mapping was the remaining Midas item — now fixed and re-verified.

## Not asking / not done

- Prod changes
- Password resets
- Midas `OCR_MODE` changes

## Related

- Validation report: `docs/superpowers/specs/2026-08-03-midas-sandbox-validation-report.md`
- Remaining gaps: `docs/superpowers/specs/2026-08-03-trade-show-to-midas-remaining-gaps.md`
- Rollback/cutover (TS): `docs/superpowers/specs/2026-08-03-midas-rollback-and-cutover.md`
