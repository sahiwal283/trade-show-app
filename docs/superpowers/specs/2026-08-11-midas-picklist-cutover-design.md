# Midas picklist cutover: categories, entities, and cards

**Date:** 2026-08-11
**Branch:** `feature/midas-expense-bff`
**Status:** Approved design, ready for implementation planning

## Problem

Trade Show maintains its own editable lists of expense categories, Zoho entities, and
payment cards. Midas now maintains the same lists and, once cut over, owns posting
expenses to Zoho Books. Keeping both is a standing source of drift: an option added in
one system is invisible to the other.

The drift is already causing silent data loss. Midas serves two categories Trade Show
has never heard of — `Stationaries` and `Storage charges`. Any expense in either lands
in Trade Show's list as `Other`, because `resolveCategoryName` falls through to `Other`
for unrecognized input (`backend/src/services/midas/categoryMap.ts:23-48`).

This design makes Midas the single source of truth for all three lists and removes the
Trade Show admin screens that edit them.

## Goals

- Midas is the sole source of truth for categories, payment methods, and entities.
- Every write path (expense create, OCR confirm, expense edit, checklist receipt) offers
  exactly the options Midas currently serves.
- Removing the admin sections does not break production, which has not yet cut over.
- An expense is never written with a category or card that Midas cannot resolve.

## Non-goals

- Cutting production over to `EXPENSE_BACKEND=midas`. Sandbox only.
- Retiring `zohoIntegrationClient` or the `app_settings` table. Other settings keys
  still use the table, and production still uses the Zoho client.
- Changing how expenses themselves are stored, synced, or approved.

## Findings that shaped the design

Verified against the live Midas Ext API (read-only `GET`s) and the codebase on
`feature/midas-expense-bff`.

### Midas readiness differs per list

Midas shipped cutover prep on 2026-08-11 that changed this picture materially. All three
lists are now first-class.

| List | Midas endpoint | Status |
| --- | --- | --- |
| Categories | `GET /ext/categories` | 200, **vocabulary-scoped per connection**. The `trade_show` connection sees 15 of 26 active categories. |
| Payment methods | `GET /ext/payment-methods` | 200, 11 methods. Now returns `defaultCompany` (preferred) alongside `defaultZohoEntity` (deprecated alias), plus `requiresReimbursement` and `zohoPaymentAccountId`. |
| Companies | `GET /ext/companies` | 200, 4 companies. **New** — this is what Trade Show calls entities. |
| Vocabulary health | `GET /ext/health/vocabulary` | 200. Cutover self-check returning the three counts. |

**Entities are now companies.** `GET /ext/companies` returns `{ name, zohoEnabled,
sortOrder }`, keyed by `name` rather than id — `expenses.zoho_entity` already stores the
name and Midas accepts names on write, so there is no id translation to get wrong. This
supersedes the earlier plan to derive entities from `defaultZohoEntity`, which could not
have seen a company with no card.

Live values: `Haute Brands` (1), `Nirvana Kulture` (2), `Boomin Brands` (3), all
`zohoEnabled: true`; and `Summitt Labs` (4) with `zohoEnabled: false`. Summitt Labs is a
real, chargeable company that does not sync to Zoho Books, and two active cards default
to it. Trade Show therefore offers all four and does not filter on `zohoEnabled` — an
expense on a Summitt card must be assignable even though it will not reach Zoho.

**Categories are curated, not drifting.** `health/vocabulary` reports `scoped: true` for
`trade_show`. The 15 visible categories are a deliberate allowlist, so `Stationaries` and
`Storage charges` are intended for Trade Show rather than stray extras. The real defect
is on the Trade Show side: `resolveCategoryName` maps both to `Other` because they are
absent from the hardcoded `TRADE_SHOW_CATEGORY_NAMES`.

**Card drift is already real.** `Sameer Summitt Card OLD` (...3019) has been deactivated
in Midas but is still present in Trade Show's hardcoded
`TRADE_SHOW_PAYMENT_METHOD_SEED`. Live payment methods went from 12 to 11 during this
investigation.

### Zoho ownership is already enforced in code

`backend/src/routes/expenses.ts:33-41` rejects local review and Zoho push with
`409 MIDAS_OWNED` whenever `EXPENSE_BACKEND=midas`. There is no double-posting risk, and
Trade Show does not need the per-brand `zohoExpenseAccountIds` that `categoryOptions`
carries once Midas owns posting.

`ENTITY_TO_BRAND` (`backend/src/services/zohoIntegrationClient.ts:24-31`) maps only
`haute_brands`, `boomin_brands`, and `nirvana_kulture`. Two live Midas cards point at
`Summitt Labs`, which has no mapping. Midas reporting `zohoEnabled: false` for that
company explains why: it is not meant to reach Zoho at all. This is latent breakage on
the *local* backend path only; it becomes moot under Midas. Noted, not fixed here.

### Trade Show's current storage

All three lists are JSONB rows in one `app_settings` key/value table
(`backend/src/database/schema.sql:69-75`), served by a generic settings route
(`backend/src/routes/settings.ts:10-25`) and edited in one screen
(`src/components/admin/AdminSettings.tsx`, sections at `:458` cards, `:486` entities,
`:501` categories). There is no dedicated categories/entities/cards endpoint or table.

Five separate hardcoded category lists exist and disagree with each other:
`AdminSettings.tsx:73-86`, `ExpenseForm.tsx:38-51`, `ReceiptUpload.tsx:97-111`,
`TelegramReceiptService.ts:9-18` (a different legacy set entirely), and
`midas/categoryMap.ts:5-18`.

### An existing bug this cutover fixes

Create and edit paths read from different sources. `ExpenseForm` reads the
admin-managed list, but `ExpenseModalDetailsEdit` renders `uniqueCategories` and
`uniqueCards` scraped from existing expense rows
(`src/components/expenses/ExpenseSubmission/hooks/useExpenseFilters.ts:116-117`). A newly
added option is therefore unselectable when editing until some expense already uses it.
Moving both paths onto one source resolves this.

## Architecture

### Backend: `GET /api/picklists`

New `backend/src/routes/picklists.ts` mounted at `/api/picklists`, backed by
`backend/src/services/picklists/PicklistService.ts`.

Response:

```json
{
  "categories":     [{ "id": "...", "name": "...", "description": null }],
  "paymentMethods": [{ "id": "...", "label": "Haute Amex", "lastFour": "1002",
                       "company": "Haute Brands",
                       "requiresReimbursement": false,
                       "zohoPaymentAccountId": "..." }],
  "companies":      [{ "name": "Haute Brands", "zohoEnabled": true, "sortOrder": 1 }],
  "source":         "midas",
  "stale":          false,
  "fetchedAt":      "2026-08-11T17:00:00.000Z"
}
```

`PicklistService` behavior:

- Fetches categories, payment methods, and companies in parallel through the existing
  Midas client factory (`backend/src/services/midas/index.ts`). The API key never leaves
  the server.
- Normalizes the company field once, via `paymentMethodCompany()`, which prefers
  `defaultCompany` and falls back to the `defaultZohoEntity` alias. Callers never read
  either field directly, so the alias can be dropped in one place when Midas removes it.
- Sorts companies by `sortOrder`, and does not filter on `zohoEnabled`.
- Caches in memory for 60s, matching the TTL `paymentMethodMap.ts` already uses
  (`backend/src/services/midas/paymentMethodMap.ts:8,30-46`).
- Serves both backends. When `getExpenseBackend() !== 'midas'`, it returns the same shape
  assembled from `app_settings` with `source: "settings"`. This is what allows a single
  build to run correctly in sandbox and production at once. On that path companies are
  reported `zohoEnabled: true`, because Trade Show itself posts to Zoho for every entity
  it knows about.

### Frontend: `usePicklists()`

New `src/hooks/usePicklists.ts` returning
`{ categories, paymentMethods, companies, source, isStale, isUnavailable, isLoading }`.

The UI keeps the user-facing label "Entity" for now — renaming the field the accountants
see is a separate decision from changing where the data comes from, and bundling them
would make the cutover harder to verify. Internally the field is `companies`, matching
Midas.

Responses are cached in a new `picklists` Dexie table in `src/utils/offlineDb.ts` so
offline expense entry keeps working. On mount the hook serves the cached copy
immediately, then revalidates.

Seven components consume the hook, so it must not fetch seven times. State is shared
through a `PicklistProvider` context mounted once in `App.tsx`; `usePicklists()` reads
from that context and performs no fetching of its own. In-flight requests are
deduplicated and the 60s server cache absorbs the rest.

Write paths that switch to the hook:

- `src/components/expenses/ExpenseForm.tsx` — categories, cards
- `src/components/expenses/ReceiptUpload.tsx` and `ReceiptUpload/OcrResultsForm.tsx`
- `src/components/checklist/ChecklistReceiptUpload.tsx`
- `src/components/expenses/ExpenseModal/ExpenseModalDetailsEdit.tsx` — replaces
  `uniqueCategories` / `uniqueCards`
- `src/components/expenses/ExpenseSubmission/ExpenseSubmissionTable.tsx`,
  `ExpenseTable/ExpenseTableRow.tsx`, `ExpenseModal/ExpenseModalStatusManagement.tsx` —
  entities
- `src/components/reports/hooks/useReportsData.ts` — entities

**Filters deliberately do not change.** `ExpenseToolbar` keeps deriving its options from
observed expense rows. Filtering should offer what exists in the data, including retired
categories on historical expenses; only write paths are constrained to the live list.

### Admin UI

`CategoryOptionsSection`, `EntityOptionsSection`, and `CardOptionsSection` render only
when the backend reports `source: "settings"`. Under Midas they disappear, since the data
is not Trade Show's to edit.

## Error handling

| Condition | Behavior |
| --- | --- |
| Midas reachable | Fresh list, `stale: false`. |
| Midas down, cache present | Last known good list, `stale: true`. A non-blocking inline notice appears above the category and card fields on the entry forms; submission proceeds. |
| Midas down, no cache | `503 PICKLISTS_UNAVAILABLE`. Submission is **blocked** with an inline reason on all entry points. |
| Browser offline, cache present | Normal entry; queues through `syncManager` as today. |
| Browser offline, no cache | Submission blocked, same as above. |

Blocking on an empty cache is a deliberate choice. The alternative — falling back to a
hardcoded list — is the exact mechanism that turns `Stationaries` into `Other` today. A
hard stop is recoverable; silently mis-mapped accounting data is not.

No fallback to hardcoded category or card lists is permitted anywhere in the write path.

## Sequencing

**Phase 1 (this work, sandbox only).** Add the endpoint, hook, and offline cache. Move
all write paths onto the hook. Gate the three admin sections on `source === "settings"`.
Sandbox immediately shows no Categories, Entities, or Cards sections; production is
untouched and keeps editing `app_settings` as before.

**Phase 2 (after production cuts over to `EXPENSE_BACKEND=midas`).** Delete the three
section components and their handlers in `AdminSettings.tsx`, the `cardOptions` and
`entityOptions` seeds in `backend/src/database/seed.ts:51-67`, the five hardcoded
category lists, and the `TelegramReceiptService` fallbacks. Phase 2 is a separate change
and is out of scope here.

## Testing

Backend unit tests for `PicklistService`: company sort order and `zohoEnabled`
preservation, `defaultCompany` winning over the `defaultZohoEntity` alias and the
fallback when it is absent, cache hit inside the TTL, re-fetch after it, stale-serve when
Midas errors, `PICKLISTS_UNAVAILABLE` with a cold cache, no hardcoded substitution on
that path, and the `app_settings` path when `EXPENSE_BACKEND` is not `midas` including
the legacy bare-string category shape.

Backend integration test for `GET /api/picklists` against a mocked Midas client covering
both `source` values.

Frontend tests for `usePicklists`: cache-then-revalidate, stale flag propagation, and the
unavailable state disabling submission.

Manual sandbox UAT on CT 2600: confirm the three admin sections are gone, that category
and card dropdowns match the live Midas lists (including `Stationaries` and
`Storage charges`), that an expense created from a Midas card resolves the right entity,
and that submission blocks when the Midas base URL is pointed at a dead port.

## Risks

**Sandbox writes reach Midas production.** CT 2600 runs `MIDAS_MODE=live` against
`192.168.1.210:4000`, which is CT 3120 `midas-app-prod`. There is no Midas sandbox
instance. Any UAT that creates or mutates expenses writes into Midas production data.
Read-only verification is safe; write testing needs a decision from the Midas side first.

**`defaultZohoEntity` is deprecated.** Midas serves both keys today but intends to drop
the alias. `paymentMethodCompany()` is the single read point, so the removal is a
one-line change — provided nothing starts reading the raw fields again.

**Category vocabulary is a Midas-side allowlist.** What Trade Show sees is controlled by
the `trade_show` connection's scoping, not by Trade Show. Adding a category is a Midas
operation now. `GET /ext/health/vocabulary` is the way to confirm what the connection can
actually see.

**Phase 2 is required, not optional.** Until it lands, the hardcoded lists and dead admin
components remain in the tree behind a flag. Leaving them indefinitely recreates the
drift this design exists to remove.
