# Midas Expense BFF — Trade Show Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Sandbox status (2026-08-03):** Tasks **1–9 sandbox complete** — live store, migration (375), CT 2600 UAT, OCR mapping, validation + rollback/cutover docs. **Next gate:** Phase 4/5 production cutover approval (frozen; do not execute). See `docs/superpowers/specs/2026-08-03-midas-sandbox-phase-complete.md`.

**Goal:** Replace Trade Show’s local expense/OCR SoT with a Midas-backed BFF while keeping `/api/expenses`, `/api/ocr/v2/process`, UI, and permissions unchanged externally; sandbox-only until Phase 4/5.

**Architecture:** `ExpenseStore` interface with `LocalExpenseStore` (rollback) and `MidasExpenseStore` (live). `MidasClient` talks to `/api/v1/ext` per `EXT_API_MERGE_LOCK.md`. `EXPENSE_BACKEND=local|dual|midas` + `MIDAS_MODE=disabled|mock|live`. Routes keep today’s response shapes via adapters.

**Tech Stack:** Express/TypeScript backend, existing Vitest, React/Vite frontend (minimal UI: Powered by Midas + Open in Midas), deploy to CT 2600 only.

## Global Constraints

- Do not modify the Midas repository.
- Do not deploy to production Trade Show until explicit Phase 4/5 approval.
- Normative Ext API: Midas `docs/EXT_API_MERGE_LOCK.md` + TS contracts under `docs/superpowers/specs/2026-08-03-*`.
- `sourceApp` = `trade_show`; `sourceRefId` = TS expense UUID; `eventId` required; D1 = `sourceContext`.
- Preserve external `/api/expenses` and `/api/ocr/v2/process` shapes.
- Remove Daily Expenses WIP; base branch = `origin/main` (v2.10.0 lineage).
- Never delete Midas imported data on rollback; use feature flags only.

## File map (create)

| Path | Responsibility |
|---|---|
| `backend/src/services/midas/MidasClient.ts` | HTTP client for Ext API |
| `backend/src/services/midas/MidasTypes.ts` | DTOs / errors matching lock |
| `backend/src/services/midas/MockMidasClient.ts` | In-memory mock for `MIDAS_MODE=mock` |
| `backend/src/services/midas/statusMaps.ts` | Status + reimbursement maps |
| `backend/src/services/midas/categoryMap.ts` | TS category name ↔ Midas id helpers |
| `backend/src/services/expenseStore/ExpenseStore.ts` | Interface |
| `backend/src/services/expenseStore/LocalExpenseStore.ts` | Wraps existing ExpenseService/repo |
| `backend/src/services/expenseStore/MidasExpenseStore.ts` | Midas-backed store + DTO adapter |
| `backend/src/services/expenseStore/DualExpenseStore.ts` | dual-write/read policy |
| `backend/src/services/expenseStore/getExpenseStore.ts` | Factory from env |
| `backend/src/scripts/migrateExpensesToMidas.ts` | Import runner (dry-run/resume) |
| `backend/tests/...` | Unit tests for client, maps, store |
| `docs/.../validation-report.md` | Filled during sandbox UAT |
| `docs/.../2026-08-03-midas-rollback-and-cutover.md` | Flag rollback + Phase 4/5 cutover draft |

## File map (modify)

| Path | Change |
|---|---|
| `backend/src/routes/expenses.ts` | Call `ExpenseStore` instead of repo/service directly where possible |
| `backend/src/routes/ocrV2.ts` | Facade → Midas OCR when not `local` |
| `backend/env.example`, `env.sandbox.template` | `MIDAS_*`, `EXPENSE_BACKEND` |
| `backend/src/server.ts` | No daily-expenses mount |
| `src/components/expenses/*` | Badge + Open in Midas; hide accountant SoT actions |
| `src/components/layout/Sidebar.tsx` | Remove daily-expenses nav |
| `src/App.tsx` | Remove daily-expenses page |
| `src/utils/api.ts` | Keep shapes; optional `midasUrl` passthrough |

---

### Task 1: Branch + docs baseline

**Files:**
- Create branch `feature/midas-expense-bff` from `origin/main`
- Restore/copy alignment specs into tree

- [x] **Step 1:** Create branch from `origin/main` (discard daily-expenses WIP from working tree; keep docs)
- [x] **Step 2:** Ensure `docs/superpowers/specs/2026-08-03-*` present + this plan
- [ ] **Step 3:** Verify `npm` / backend builds on clean main tip

---

### Task 2: Env + types + status maps

**Files:**
- Create: `backend/src/services/midas/MidasTypes.ts`
- Create: `backend/src/services/midas/statusMaps.ts`
- Create: `backend/src/services/midas/categoryMap.ts`
- Modify: `backend/env.example`, `backend/env.sandbox.template`
- Test: `backend/tests/unit/midas/statusMaps.test.ts`

**Produces:** `mapTsStatusToMidas`, `mapMidasStatusToTs`, reimbursement maps, env var names.

- [ ] **Step 1:** Write failing tests for status/reimbursement maps
- [ ] **Step 2:** Implement maps per Ext lock
- [ ] **Step 3:** Add env vars to examples (`MIDAS_MODE`, `MIDAS_BASE_URL`, `MIDAS_API_KEY`, `MIDAS_WEB_BASE_URL`, `MIDAS_TIMEOUT_MS`, `EXPENSE_BACKEND`, `EXT_AUTO_PROVISION` note)
- [ ] **Step 4:** Run unit tests

---

### Task 3: MidasClient + MockMidasClient

**Files:**
- Create: `backend/src/services/midas/MidasClient.ts`
- Create: `backend/src/services/midas/MockMidasClient.ts`
- Create: `backend/src/services/midas/index.ts`
- Test: `backend/tests/unit/midas/MidasClient.test.ts` (mock server or Mock client)

**Produces:**
```ts
class MidasClient {
  processOcr(file: Buffer, filename: string, mime: string): Promise<MidasOcrResult>
  createExpense(body: MidasCreateExpenseBody, actor: MidasActor): Promise<MidasCreateResult>
  listExpenses(query: MidasListQuery): Promise<MidasListResult>
  getExpense(id: string): Promise<MidasExpenseDto>
  getExpenseByRef(sourceApp: string, sourceRefId: string): Promise<MidasExpenseDto>
  updateExpense(id: string, patch: MidasPatchBody, actor: MidasActor): Promise<MidasExpenseDto>
  deleteExpense(id: string, actor: MidasActor): Promise<void>
  uploadReceipt(id: string, file: Buffer, filename: string, mime: string, opts?: { async?: boolean }): Promise<MidasReceiptDto>
  getReceiptContent(expenseId: string, receiptId: string): Promise<Buffer>
  importExpenses(payload: MidasImportPayload): Promise<MidasImportResult>
  listCategories(): Promise<MidasCategory[]>
}
```

- [ ] **Step 1:** Define types matching Ext lock DTO
- [ ] **Step 2:** Implement live client (axios/fetch, Bearer key, actor headers, MISSING_SCOPE handling)
- [ ] **Step 3:** Implement MockMidasClient (in-memory, idempotent create, sync OCR stub)
- [ ] **Step 4:** Factory `getMidasClient()` from `MIDAS_MODE`
- [ ] **Step 5:** Unit tests for mock idempotency + OCR shape

---

### Task 4: ExpenseStore abstraction

**Files:**
- Create: `backend/src/services/expenseStore/*`
- Test: `backend/tests/unit/expenseStore/*.test.ts`

**Produces:** Interface methods mirroring route needs: `list`, `get`, `create`, `update`, `updateStatus` (no-op / deep-link only for midas), `replaceReceipt`, `delete`, mapping to TS expense JSON.

- [ ] **Step 1:** Define `ExpenseStore` interface in TS expense API shapes
- [ ] **Step 2:** `LocalExpenseStore` delegates to existing repository/service
- [ ] **Step 3:** `MidasExpenseStore` maps Midas DTO ↔ TS expense (incl. `event_name`, `user_name`, `midasUrl`)
- [ ] **Step 4:** `DualExpenseStore`: write both; read prefer Midas with local fallback (document policy)
- [ ] **Step 5:** `getExpenseStore()` from `EXPENSE_BACKEND`
- [ ] **Step 6:** Tests with MockMidasClient

---

### Task 5: Wire routes (expenses + OCR facade)

**Files:**
- Modify: `backend/src/routes/expenses.ts`
- Modify: `backend/src/routes/ocrV2.ts`
- Modify: accountant endpoints → return 410/redirect payload or strip to “open in midas” guidance without local SoT mutation when `EXPENSE_BACKEND=midas`

- [ ] **Step 1:** GET/POST/PUT list/create/update use store
- [ ] **Step 2:** OCR process uses Midas when backend ≠ local
- [ ] **Step 3:** Status/entity/zoho/reimbursement mutations: when midas mode, do not mutate local SoT; return clear error or `{ midasUrl }` for Open in Midas
- [ ] **Step 4:** Keep permission middleware identical
- [ ] **Step 5:** Integration smoke with mock mode

---

### Task 6: Frontend UX (preserve workflows + badge)

**Files:**
- Modify: Expenses submission header / modal
- Modify: Sidebar / App — remove daily-expenses
- Remove or stop shipping `src/components/dailyExpenses/**` from routes

- [ ] **Step 1:** Add “Powered by Midas” badge on Expenses
- [ ] **Step 2:** “Open in Midas” when `midasUrl` present (accountant)
- [ ] **Step 3:** Hide/disable local approve/reject/entity/Zoho push when flag says midas (or always on this branch once midas default for sandbox)
- [ ] **Step 4:** Remove Daily Expenses nav + routes
- [ ] **Step 5:** Manual UI check against mock

---

### Task 7: Migration runner

**Files:**
- Create: `backend/src/scripts/migrateExpensesToMidas.ts`
- Create: checkpoint file support under `backend/.migration/` (gitignored)

- [ ] **Step 1:** Export expenses + receipt files from local DB
- [ ] **Step 2:** Build import batches (≤50–100); dry-run
- [ ] **Step 3:** Execute import with resume/checkpoint
- [ ] **Step 4:** Verify counts + checksums report
- [ ] **Step 5:** Document CLI: `npx ts-node` / `npm run migrate:expenses:midas -- --dry-run`

---

### Task 8: Cleanup local OCR/Zoho SoT paths (behind flag)

- [x] **Step 1:** When `EXPENSE_BACKEND=midas`, ensure no `OCR_SERVICE_*` calls from request path
- [x] **Step 2:** When midas, no Zoho push from expenses routes
- [x] **Step 3:** Leave LocalExpenseStore code for rollback until window closes
- [x] **Step 4:** Delete daily-expenses migration/routes/UI from this branch

---

### Task 9: Sandbox deploy + validation docs

- [x] **Step 1:** Deploy backend+frontend to CT 2600 with live Midas (`MIDAS_MODE=live`, `EXPENSE_BACKEND=midas`)
- [x] **Step 2:** Fill validation report checklist — `docs/superpowers/specs/2026-08-03-midas-sandbox-validation-report.md`
- [x] **Step 3:** Write rollback + production cutover docs — `docs/superpowers/specs/2026-08-03-midas-rollback-and-cutover.md` (prod still frozen; draft only)
- [x] **Step 4:** Do **not** touch production

---

## Execution order

Tasks 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9.  
Commits after each task when user requests commits (default: implement continuously; commit on request).

## Done when

- [x] Mock mode: create/list/OCR work in sandbox UI without Midas up
- [x] Live mode: same against Midas sandbox Ext (when key available)
- [x] Migration dry-run / apply works against sandbox (375 created; re-apply skip 375)
- [x] Validation report drafted
- [x] Production unchanged (sandbox-only; cutover frozen)
