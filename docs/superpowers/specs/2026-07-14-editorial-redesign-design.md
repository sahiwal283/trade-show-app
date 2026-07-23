# Editorial Finance Redesign — Design Spec

Date: 2026-07-14
Status: awaiting user approval
Owner decisions captured from brainstorming session (visual companion mockups in `.superpowers/brainstorm/59061-1784050725/`).

## Summary

Full page redesigns of the four primary surfaces of the trade-show expense app
(Dashboard, Reports, Expenses, Events) in an **Editorial Finance** direction:
warm-light luxury fintech — oversized display numbers, generous whitespace,
elegant charts, receipts presented like a well-set ledger. Pages are
**rethought around the data** (new information architecture per page);
navigation and workflows are unchanged. Admin, developer, checklist, and
account pages keep the current v1.40.0 polish until a later cycle.

## Locked decisions

| Decision | Choice |
|---|---|
| Direction | Editorial Finance (light, warm; Mercury/Ramp register) |
| Depth | Rethink page contents/IA; same navigation and workflows |
| Scope | Dashboard, Reports→Insights, Expenses, Events |
| Charts | Recharts, lazy-loaded chunks only, restyled to the editorial look |
| Typography | Instrument Sans (display: headings, hero numbers) + Inter (body), self-hosted, subset, `font-display: swap`, critical weight preloaded |

## Design language

- **Canvas**: warm off-white `#faf9f7` page background (replaces gray-50 on
  redesigned pages); white cards with warm stone borders (`#e7e5e4`),
  `rounded-card`, existing `shadow-elevation-*` tokens.
- **Typography scale**: Instrument Sans 600/700 for display — page titles,
  hero money figures (with tight tracking, `tabular-nums` for money); Inter
  400/600/700 for body/labels. Micro-labels: 10px uppercase, wide tracking,
  stone-400.
- **Color**: existing `brand` (blue) and `accent` (emerald) scales; semantic
  status chips unchanged (StatusBadge/CategoryBadge). Charts use
  brand/accent + stone neutrals only.
- **Money is the hero**: every page leads with one oversized number that
  answers the page's core question.
- **Fonts**: self-hosted woff2 in `public/fonts/` (Instrument Sans 600+700,
  Inter 400+600+700, latin subset), `@font-face` in `index.css`,
  preload for Instrument Sans 700 + Inter 400 in `index.html`.

## Page designs

### 1. Dashboard — "per-show narrative" (mockup: dashboard-design.html)

Hero = the **active show** (fallback: next upcoming show with prep framing;
fallback: all-time summary if no shows exist).

- **Hero card**: "LIVE NOW · day N of M · city" micro-label; show name in
  Instrument Sans; oversized spent-amount with %-of-budget and pace line
  ("on pace · $3.1k/day"); gradient budget-burn bar; Recharts area chart of
  spend-by-day for the show; category subtotal strip; team-activity line
  (people with receipts today).
- **Action queue** (right rail; stacks under hero on mobile): tinted notice
  rows routing to existing screens — pending approvals (amber), low-confidence
  OCR (violet), approved-but-not-pushed to Zoho (blue). Role-aware: only rows
  the user can act on. Salesperson sees "my pending / my reimbursements"
  instead of the approval queue.
- **Reimbursements card**: total owed, per-person stacked bar.
- **Up next card**: next show with dates/budget/headcount.
- **Latest receipts ledger**: merchant, category, person, time, status chip,
  amount; links to Expenses.
- Data: existing `useDashboardData` (expenses/events/users) — computed
  client-side; no new endpoints required. "Receipts today" derives from
  expense dates; team-on-floor derives from event participants.

### 2. Reports → "Insights"

- **Headline strip**: period spend, avg per show, reimbursements owed,
  Zoho pushed % — four oversized numbers with micro-labels.
- **Show vs show**: horizontal Recharts bar comparison (total + per-category
  stacked), filterable period.
- **Category trends**: Recharts stacked area over months.
- **Entity breakdown**: existing data, editorial restyle, per-entity bars.
- **Zoho pipeline**: submitted → approved → pushed funnel with counts and
  dollar totals; unassigned-entity notice carries over.
- Existing filters (date/event/entity) presented as quiet pill controls.
- CSV export button remains.

### 3. Expenses — "receipt ledger"

- Rows **grouped by day** with day subtotals (sticky day headers).
- Row anatomy: merchant (bold) + person + category chip; amount
  right-aligned tabular; compact status story — a 3-dot mini-timeline
  (scanned → approved → in Zoho) replacing scattered status columns; tap/expand
  reveals the existing detail modal (unchanged).
- Existing filters/sort/actions preserved; filters restyled as pill toolbar.
- Approval actions (approve/reject/push) stay on the row for approvers.
- Mobile: same grouped ledger, sticky day headers, existing 44px targets.
- The current table implementation (ExpenseTable) is replaced by this ledger
  view; the data hooks (`useExpenses`, `useExpenseFilters`) are reused as-is.

### 4. Events — "show cards"

- Cards per show: name in display face, dates + venue line, team avatar
  stack, budget bar (budget vs actual from expenses), receipt count, status
  chip (upcoming/active/completed).
- Sections: Live now → Upcoming → Past (collapsed).
- Event details modal gains a per-show spend summary block (category
  subtotals + burn bar) sourced from already-loaded expenses.
- Create/edit forms unchanged (v1.40.0 styling).

## Technical notes

- **Recharts** added as a dependency; imported ONLY inside lazy view chunks
  (Dashboard, Reports, Events detail). Verify post-build that the login/shell
  chunks do not grow. Restyle: no default grid/tooltip styling — custom
  tooltip component, stone-colored axes, brand/accent series.
- **Fonts**: self-hosted; no runtime Google Fonts requests (PWA offline).
- **Page canvas**: redesigned pages set the warm background locally; the app
  shell keeps gray-50 until all pages migrate (avoids clashing with
  non-redesigned pages).
- **No backend changes.** All new views compute from existing endpoints.
- **No new state libraries**; existing hooks reused.
- **Tests**: existing frontend tests under `src/**/__tests__` must keep
  passing (they exercise hooks/logic, not markup snapshots). Build + eslint
  gates as in v1.39/v1.40 (zero new lint errors).
- **Rollout**: single release (v1.41.0) after all four pages pass build/lint
  and visual review; deploy frontend-only to LXC 2120 `current/`; backend
  redeploy only for the version stamp.

## Out of scope

- Navigation/workflow changes, admin/dev/checklist/account pages, dark mode,
  backend/API changes, pagination (tracked separately from the perf audit).

## Open items intentionally deferred

- Expense-row mini-timeline exact states for edge cases (rejected, needs
  further review) — implementer picks sensible mapping from existing statuses.
- Chart empty states: show skeleton + "no data yet for this period" copy.
