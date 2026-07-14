/**
 * ExpenseTableFilters Component
 * 
 * Extracted from ExpenseSubmission.tsx (was lines 714-860, ~146 lines)
 * Inline filter row that appears below table headers
 */

import React from 'react';
import { Expense, TradeShow } from '../../../App';

// One shared recipe for every inline filter control so the toolbar reads as
// a single grouped system (quiet at rest, brand-focused when active).
// Mobile-first: 16px text + 44px height below sm so iOS doesn't zoom and
// controls are thumb-friendly; sm: restores the original compact desktop recipe.
const filterControl =
  'w-full rounded-md border border-gray-200 bg-white px-2 py-2 min-h-[44px] text-base sm:py-1 sm:min-h-0 sm:text-xs text-gray-600 placeholder-gray-400 shadow-sm transition-all duration-150 hover:border-gray-300 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15';

interface ExpenseTableFiltersProps {
  // Filter values
  dateFilter: string;
  eventFilter: string;
  categoryFilter: string;
  merchantFilter: string;
  cardFilter: string;
  statusFilter: string;
  reimbursementFilter: string;
  sortBy: string;

  // Filter setters
  setDateFilter: (value: string) => void;
  setEventFilter: (value: string) => void;
  setCategoryFilter: (value: string) => void;
  setMerchantFilter: (value: string) => void;
  setCardFilter: (value: string) => void;
  setStatusFilter: (value: string) => void;
  setReimbursementFilter: (value: string) => void;
  setSortBy: (value: string) => void;

  // Data
  expenses: Expense[];
  events: TradeShow[];
  uniqueCategories: string[];
  uniqueCards: string[];

  // Display options
  hasApprovalPermission: boolean;
  showFilters: boolean;
}

export const ExpenseTableFilters: React.FC<ExpenseTableFiltersProps> = ({
  dateFilter,
  eventFilter,
  categoryFilter,
  merchantFilter,
  cardFilter,
  statusFilter,
  reimbursementFilter,
  sortBy,
  setDateFilter,
  setEventFilter,
  setCategoryFilter,
  setMerchantFilter,
  setCardFilter,
  setStatusFilter,
  setReimbursementFilter,
  setSortBy,
  expenses,
  events,
  uniqueCategories,
  uniqueCards,
  hasApprovalPermission,
  showFilters,
}) => {
  // Hide filters when showFilters is false
  if (!showFilters) {
    return null;
  }

  return (
    <tr className="border-t border-gray-200/80 bg-gray-50/60">
      {/* Date Filter (Month Dropdown) */}
      <th className="px-2 sm:px-3 lg:px-4 py-2">
        <select
          value={dateFilter.substring(0, 7) || ''}
          onChange={(e) => setDateFilter(e.target.value)}
          className={filterControl}
        >
          <option value="">All</option>
          {(() => {
            // Generate list of months from oldest expense to current month
            const months = new Set<string>();
            const today = new Date();
            const currentYearMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
            months.add(currentYearMonth);

            // Add months from all expenses
            expenses.forEach((exp) => {
              if (exp.date) {
                const yearMonth = exp.date.substring(0, 7);
                months.add(yearMonth);
              }
            });

            // Convert to sorted array (newest first)
            const sortedMonths = Array.from(months).sort().reverse();

            return sortedMonths.map((month) => {
              const [year, monthNum] = month.split('-');
              const date = new Date(parseInt(year), parseInt(monthNum) - 1);
              const monthName = date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
              return (
                <option key={month} value={month}>
                  {monthName}
                </option>
              );
            });
          })()}
        </select>
      </th>

      {/* User Filter Placeholder (Approval Users) */}
      {hasApprovalPermission && <th className="px-2 sm:px-3 lg:px-4 py-2"></th>}

      {/* Event Filter */}
      <th className="px-2 sm:px-3 lg:px-4 py-2">
        <select
          value={eventFilter}
          onChange={(e) => setEventFilter(e.target.value)}
          className={filterControl}
        >
          <option value="all">All Events</option>
          {events.map((event) => (
            <option key={event.id} value={event.id}>
              {event.name}
            </option>
          ))}
        </select>
      </th>

      {/* Category Filter */}
      <th className="px-2 sm:px-3 lg:px-4 py-2">
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className={filterControl}
        >
          <option value="all">All</option>
          {uniqueCategories.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
      </th>

      {/* Merchant Filter */}
      <th className="px-2 sm:px-3 lg:px-4 py-2">
        <input
          type="text"
          value={merchantFilter}
          onChange={(e) => setMerchantFilter(e.target.value)}
          className={filterControl}
          placeholder="Search..."
        />
      </th>

      {/* Amount - No Filter */}
      <th className="px-2 sm:px-3 lg:px-4 py-2"></th>

      {/* Card Filter */}
      <th className="px-2 sm:px-3 lg:px-4 py-2">
        <select
          value={cardFilter}
          onChange={(e) => setCardFilter(e.target.value)}
          className={filterControl}
        >
          <option value="all">All</option>
          {uniqueCards.map((card) => (
            <option key={card} value={card}>
              {card}
            </option>
          ))}
        </select>
      </th>

      {/* Status Filter */}
      <th className="px-2 sm:px-3 lg:px-4 py-2">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className={filterControl}
        >
          <option value="all">All</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </th>

      {/* Reimbursement Filter */}
      <th className="px-2 sm:px-3 lg:px-4 py-2">
        <select
          value={reimbursementFilter}
          onChange={(e) => setReimbursementFilter(e.target.value)}
          className={filterControl}
        >
          <option value="all">All</option>
          <option value="required">Required</option>
          <option value="not-required">Not Required</option>
        </select>
      </th>

      {/* Entity and Zoho Filter Placeholders (Approval Users) */}
      {hasApprovalPermission && (
        <>
          <th className="px-2 sm:px-3 lg:px-4 py-2"></th>
          <th className="px-2 sm:px-3 lg:px-4 py-2"></th>
        </>
      )}

      {/* Actions Column - Sort By */}
      <th className="px-2 sm:px-3 lg:px-4 py-2">
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className={filterControl}
        >
          <option value="default">Default</option>
          <option value="date-newest">Newest First</option>
          <option value="date-oldest">Oldest First</option>
          <option value="amount-highest">Highest Amount</option>
          <option value="amount-lowest">Lowest Amount</option>
          <option value="merchant-az">Merchant A-Z</option>
          <option value="merchant-za">Merchant Z-A</option>
          <option value="category-az">Category A-Z</option>
          <option value="category-za">Category Z-A</option>
        </select>
      </th>
    </tr>
  );
};

