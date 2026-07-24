# Show Summaries + Reports Redesign (Direction B)

**Date:** 2026-07-24 · **Approved by:** Nabeel (terminal, brainstorming session)
**Pinned for later:** Zoho CRM lead pull / ROI funnel (leads → pipeline → closed revenue).

## Goal
Arm the accountant to present trade shows as an investment: import 2025 historical
show totals (aggregates only — NO synthetic expense line items) and rebuild the
Reports page as a polished analytics dashboard with year-over-year comparison.

## Data layer
- `show_summaries` table (migration 032): one row per show × year × company ×
  category, columns: `show_name`, `show_key` (normalized name for YoY joins),
  `year`, `company`, `category`, `amount`, `source` ('imported' | 'live'),
  `city`, `start_date`/`end_date` nullable. App-user-owned (new table → no
  ownership issues on prod).
- Migration 033 seeds the 2025 data parsed from
  `Account of Trade Show -2025 .xlsx` (16 sheets; only 2025 tables from the
  stacked 2025/2026 sheets; per-diem/refund/summary sheets excluded).
  Idempotent (`ON CONFLICT DO NOTHING` on unique key). Reconciliation: parsed
  totals must match each sheet's own Total column before the seed is generated.
- Company normalization: “Haute Brand” → “Haute Brands”; “Boomin Brand” kept
  as-is (new company). Category mapping to app categories (Hotel, Booth,
  Meals, Transportation, Rental, Travel-Flight, Show Allowances).
- Live shows: `GET /api/show-summaries` merges imported rows with the same
  aggregate computed on the fly from real `expenses` (source='live'), so 2026+
  needs no import. Authorize: admin, accountant, developer.

## Reports redesign (Direction B — polished dashboard, single page)
1. **KPI band** (new): Total invested for selected year scope, show count,
   avg per show, largest cost center — hero numbers, tabular figures.
2. **Show Comparison** (new section): grouped bar chart per show (2025 vs
   2026) + table with YoY delta %, company filter; entity colors follow the
   established fixed palette. “skipped” state for shows without a counterpart.
3. Existing sections stay (Who Paid donut+bars, Category × Company matrix,
   trend, averages) with visual polish; year-scope selector (2025 / 2026 /
   Compare) added to the filter system.
4. Frontend reads summaries via a `useShowSummaries` hook; no changes to the
   expense register.

## Testing / rollout
- Import validated against sheet totals (script prints reconciliation table).
- Playwright screenshots phone+desktop; lint/build both tiers.
- v1.56.0, deploy backend (auto-migrates 032/033) + frontend.
