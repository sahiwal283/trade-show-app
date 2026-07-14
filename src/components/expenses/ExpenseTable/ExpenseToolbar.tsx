/**
 * ExpenseToolbar Component
 *
 * Filter toolbar above the expenses table: free-text search, the primary
 * dropdowns (month, event, category, status), and a "More filters" toggle
 * revealing the long-tail controls (card, reimbursement).
 */

import React from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { Expense, TradeShow } from '../../../App';

// Shared control recipe: quiet at rest, brand-focused when active.
// 16px text + 44px height below sm prevents iOS zoom; compact on desktop.
const control =
  'rounded-lg border border-stone-200 bg-white px-2.5 py-2 min-h-[44px] text-base sm:py-1.5 sm:min-h-0 sm:text-xs text-stone-600 placeholder-stone-400 shadow-sm transition-all duration-150 hover:border-stone-300 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15';

interface ExpenseToolbarProps {
  expenses: Expense[];
  events: TradeShow[];
  uniqueCategories: string[];
  uniqueCards: string[];
  hasActiveFilters: boolean;
  onClearFilters: () => void;

  searchQuery: string;
  setSearchQuery: (value: string) => void;
  dateFilter: string;
  setDateFilter: (value: string) => void;
  eventFilter: string;
  setEventFilter: (value: string) => void;
  categoryFilter: string;
  setCategoryFilter: (value: string) => void;
  statusFilter: string;
  setStatusFilter: (value: string) => void;
  cardFilter: string;
  setCardFilter: (value: string) => void;
  reimbursementFilter: string;
  setReimbursementFilter: (value: string) => void;
  showMoreFilters: boolean;
  setShowMoreFilters: (show: boolean) => void;
}

function monthOptions(expenses: Expense[]): Array<{ value: string; label: string }> {
  const months = new Set<string>();
  const today = new Date();
  months.add(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`);
  for (const exp of expenses) {
    if (exp.date) months.add(exp.date.substring(0, 7));
  }
  return [...months]
    .sort()
    .reverse()
    .map(month => {
      const [year, monthNum] = month.split('-');
      const date = new Date(parseInt(year), parseInt(monthNum) - 1);
      return { value: month, label: date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' }) };
    });
}

export const ExpenseToolbar: React.FC<ExpenseToolbarProps> = ({
  expenses,
  events,
  uniqueCategories,
  uniqueCards,
  hasActiveFilters,
  onClearFilters,
  searchQuery,
  setSearchQuery,
  dateFilter,
  setDateFilter,
  eventFilter,
  setEventFilter,
  categoryFilter,
  setCategoryFilter,
  statusFilter,
  setStatusFilter,
  cardFilter,
  setCardFilter,
  reimbursementFilter,
  setReimbursementFilter,
  showMoreFilters,
  setShowMoreFilters,
}) => {
  return (
    <div className="border-b border-stone-100 p-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <label className="relative min-w-[180px] flex-1">
          <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-400" />
          <span className="sr-only">Search expenses</span>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search merchant, category, or note..."
            className={`${control} w-full pl-8`}
          />
        </label>

        {/* Primary dropdowns — collapse into the More panel on small screens */}
        <select
          value={dateFilter.substring(0, 7) || ''}
          onChange={e => setDateFilter(e.target.value)}
          className={`${control} hidden md:block`}
          aria-label="Filter by month"
        >
          <option value="">All Months</option>
          {monthOptions(expenses).map(m => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
        <select
          value={eventFilter}
          onChange={e => setEventFilter(e.target.value)}
          className={`${control} hidden max-w-[180px] md:block`}
          aria-label="Filter by event"
        >
          <option value="all">All Events</option>
          {events.map(event => (
            <option key={event.id} value={event.id}>{event.name}</option>
          ))}
        </select>
        <select
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value)}
          className={`${control} hidden max-w-[170px] md:block`}
          aria-label="Filter by category"
        >
          <option value="all">All Categories</option>
          {uniqueCategories.map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className={`${control} hidden md:block`}
          aria-label="Filter by status"
        >
          <option value="all">All Status</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="needs further review">Needs Review</option>
        </select>

        <button
          type="button"
          onClick={() => setShowMoreFilters(!showMoreFilters)}
          className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium shadow-sm transition-colors duration-150 sm:min-h-0 ${
            showMoreFilters
              ? 'border-brand-200 bg-brand-50 text-brand-700'
              : 'border-stone-200 bg-white text-stone-600 hover:border-stone-300'
          }`}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          <span className="md:hidden">Filters</span>
          <span className="hidden md:inline">More Filters</span>
        </button>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={onClearFilters}
            className="inline-flex min-h-[44px] items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-700 sm:min-h-0"
          >
            <X className="h-3.5 w-3.5" />
            Clear
          </button>
        )}
      </div>

      {/* Expanded filters: long tail on desktop, everything on mobile */}
      {showMoreFilters && (
        <div className="mt-2 grid grid-cols-2 gap-2 border-t border-stone-100 pt-2 md:flex md:flex-wrap">
          <select
            value={dateFilter.substring(0, 7) || ''}
            onChange={e => setDateFilter(e.target.value)}
            className={`${control} md:hidden`}
            aria-label="Filter by month"
          >
            <option value="">All Months</option>
            {monthOptions(expenses).map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          <select
            value={eventFilter}
            onChange={e => setEventFilter(e.target.value)}
            className={`${control} md:hidden`}
            aria-label="Filter by event"
          >
            <option value="all">All Events</option>
            {events.map(event => (
              <option key={event.id} value={event.id}>{event.name}</option>
            ))}
          </select>
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className={`${control} md:hidden`}
            aria-label="Filter by category"
          >
            <option value="all">All Categories</option>
            {uniqueCategories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className={`${control} md:hidden`}
            aria-label="Filter by status"
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="needs further review">Needs Review</option>
          </select>
          <select
            value={cardFilter}
            onChange={e => setCardFilter(e.target.value)}
            className={control}
            aria-label="Filter by card"
          >
            <option value="all">All Cards</option>
            {uniqueCards.map(card => (
              <option key={card} value={card}>{card}</option>
            ))}
          </select>
          <select
            value={reimbursementFilter}
            onChange={e => setReimbursementFilter(e.target.value)}
            className={control}
            aria-label="Filter by reimbursement"
          >
            <option value="all">All Reimbursement</option>
            <option value="required">Required</option>
            <option value="not-required">Not Required</option>
          </select>
        </div>
      )}
    </div>
  );
};
