# Trade Show App — Midas Expense Implementation Contract

**Status:** AUTHORITATIVE for Trade Show App work  
**Date:** 2026-08-03  
**Coding:** **FORBIDDEN** until dual-app alignment is marked COMPLETE in  
`docs/superpowers/specs/2026-08-03-midas-trade-show-alignment-status.md`

This document consolidates the Trade Show Implementation Contract and agent prompt.  
Cross-repo API details for Midas remain in  
`docs/superpowers/specs/2026-08-03-midas-expense-merge-contract.md` (Ext API ask).  
If those conflict, **this file wins for Trade Show behavior**; Ext API shapes require  
explicit dual-app agreement before implementation.

---

## 1. Purpose

The Trade Show App will delegate all expense functionality to Midas while preserving
the existing user experience.

After cutover:

- Midas is the System of Record for all expenses.
- Trade Show remains the System of Record for events, booths, exhibitors, trips,
  logistics, authentication, and permissions.
- Users should experience little to no workflow changes.

---

## 2. Design Principles

Trade Show remains the primary application.

Midas becomes the expense engine.

Trade Show must never duplicate:

- Expense storage
- OCR
- Receipt storage
- Expense review
- Reimbursement logic
- Zoho expense integration

Trade Show communicates with Midas exclusively through the Ext API.

---

## 3. Expense Integration

Replace the existing expense subsystem with Midas.

Internally route all expense operations through Midas while preserving:

- Routes
- Navigation
- API responses
- Permissions
- UI behavior

The existing `/api/expenses` API remains unchanged externally.

---

## 4. OCR

Trade Show will remove its OCR implementation after migration.

Trade Show uploads receipts to Midas.

Midas performs synchronous OCR.

Trade Show immediately displays the OCR results returned by Midas.

Trade Show must not call the OCR microservice directly after cutover.

---

## 5. Expense Adapter

Implement:

- `MidasClient`
- `ExpenseStore` interface
- `MidasExpenseStore`
- `LocalExpenseStore` (migration/rollback only)
- Feature flag support

Modes (`MIDAS_MODE`):

- `disabled`
- `mock`
- `live`

Feature flag (`EXPENSE_BACKEND`):

- `local`
- `dual`
- `midas`

---

## 6. Data Migration

Migrate all existing **event** expenses (production `expenses` table).

Requirements:

- idempotent
- resumable
- dry-run support
- preserve IDs where possible
- preserve timestamps
- preserve receipts
- preserve OCR metadata
- preserve attachments
- preserve notes
- preserve audit history
- preserve Zoho IDs
- preserve reimbursement status

Migration must never create duplicates.

**Note:** Trade Show Daily Expenses is sandbox-only WIP (not in production). Remove
that module; do not treat it as a production migration source.

---

## 7. Receipt Migration

Copy all receipt files into Midas.

Requirements:

- preserve filenames
- preserve metadata
- preserve OCR data
- preserve receipt timestamps
- verify checksums

Do not rerun OCR during migration.

---

## 8. User Mapping

Users resolve by email.

Before production:

- verify every expense owner exists in Midas
- provision missing users
- report unresolved users

---

## 9. Category Mapping

Map existing Trade Show categories into Midas categories.

Maintain a mapping table.

Support unmapped categories without data loss.

---

## 10. Status Mapping

Use the agreed status translation.

Support:

- `pending`
- `approved`
- `rejected`
- `awaiting_info`
- `in_review`
- `draft`
- `zoho_sync_failed`

---

## 11. Reimbursement Mapping

Support:

- `not_requested`
- `pending`
- `approved`
- `rejected`
- `paid`

Preserve existing reimbursement history.

---

## 12. UI Requirements

Users should notice no workflow changes.

Preserve:

- expense lists
- expense detail
- receipt upload
- OCR experience
- searching
- filtering
- reports
- exports

Open in Midas is allowed for advanced accountant workflows.

---

## 13. Remove Duplicate Logic

Remove or deprecate (after cutover / `EXPENSE_BACKEND=midas`):

- OCR providers
- receipt processors
- expense services (as SoT)
- expense repositories (as SoT)
- reimbursement logic
- Zoho expense push
- accountant review workflow (as local SoT)

Only Midas performs these functions. `LocalExpenseStore` may remain solely for
rollback until rollback window closes.

---

## 14. Environment Variables

Required:

```bash
MIDAS_MODE=disabled|mock|live
MIDAS_BASE_URL=https://...
MIDAS_API_KEY=...
MIDAS_WEB_BASE_URL=https://...
EXPENSE_BACKEND=local|dual|midas
MIDAS_TIMEOUT_MS=10000
```

---

## 15. Sandbox Rollout

**Phase 0**

- Freeze contract
- Configure sandbox keys
- Seed categories

**Phase 1**

- Connect to Midas sandbox
- Verify Ext API
- Enable mock mode

**Phase 2**

- Perform migration dry run
- Resolve mapping issues
- Execute migration
- Verify data

**Phase 3**

- Sandbox validation
- User acceptance testing

**Phase 4**

- Production migration
- Enable live mode
- Monitor

Production Trade Show stays unchanged until Phase 4 is explicitly approved.

---

## 16. Validation

Verify:

- Expense creation
- Receipt upload
- OCR results
- Expense editing
- Expense search
- Filtering
- Reports
- Exports
- Permissions
- Open in Midas
- Receipt viewing
- OCR preservation
- Import counts
- Idempotent imports
- Zoho IDs
- Timestamp preservation

---

## 17. Rollback

Rollback is performed using feature flags.

If required:

- switch back to `LocalExpenseStore` (`EXPENSE_BACKEND=local`)
- disable live mode (`MIDAS_MODE=disabled` or keep mock)
- preserve all Midas data
- never delete imported expenses

Rollback must not result in data loss.

---

## 18. Deliverables

The Trade Show agent must deliver:

- `MidasClient`
- `ExpenseStore` abstraction
- `MidasExpenseStore`
- Migration runner
- Receipt migration
- User provisioning validation
- Category mapping
- Status mapping
- Reimbursement mapping
- Feature flags
- Sandbox deployment
- Validation report
- Rollback plan
- Removal of duplicate OCR
- Removal of duplicate expense logic
- Production deployment documentation

---

## 19. Constraints

- Do not modify the Midas repository.
- Do not change the agreed API contract unilaterally.
- Do not introduce duplicate expense logic after cutover.
- If implementation requires clarification, document assumptions rather than
  inventing behavior.
- Do not begin coding until both apps are in complete alignment
  (see alignment status doc).

---

## 20. Integration Acceptance Criteria

The migration is complete when all of the following are true:

- Existing Trade Show expenses appear in Midas
- No expense data was lost
- No duplicate expenses exist
- Receipt images are preserved
- OCR output matches the previous Trade Show implementation
- Trade Show performs no direct OCR calls
- Trade Show performs no direct Zoho expense calls
- Expense creation works from Trade Show
- Expense editing works from Trade Show
- Receipt upload works from Trade Show
- Search/filter/reporting continue to work
- Role permissions are unchanged
- All tests pass
- Migration is idempotent
- Rollback has been validated
