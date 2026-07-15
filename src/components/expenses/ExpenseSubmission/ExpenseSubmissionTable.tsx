/**
 * ExpenseSubmissionTable Component
 *
 * Expenses table with filter toolbar, sortable columns, bulk selection
 * (entity assignment), and client-side pagination.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown } from 'lucide-react';
import { Expense, TradeShow, User } from '../../../App';
import { ExpenseToolbar, ExpenseTableRow, ExpenseCardList } from '../ExpenseTable';

const PAGE_SIZES = [10, 25, 50];

interface ExpenseSubmissionTableProps {
  expenses: Expense[];
  filteredExpenses: Expense[];
  events: TradeShow[];
  users: User[];
  hasApprovalPermission: boolean;
  entityOptions: string[];
  pushingExpenseId: string | null;
  pushedExpenses: Set<string>;
  showFilters: boolean;
  setShowFilters: (show: boolean) => void;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
  dateFilter: string;
  setDateFilter: (filter: string) => void;
  eventFilter: string;
  setEventFilter: (filter: string) => void;
  categoryFilter: string;
  setCategoryFilter: (filter: string) => void;
  merchantFilter: string;
  setMerchantFilter: (filter: string) => void;
  cardFilter: string;
  setCardFilter: (filter: string) => void;
  statusFilter: string;
  setStatusFilter: (filter: string) => void;
  reimbursementFilter: string;
  setReimbursementFilter: (filter: string) => void;
  sortBy: string;
  setSortBy: (sort: string) => void;
  uniqueCategories: string[];
  uniqueCards: string[];
  onReimbursementApproval: (expense: Expense, status: 'approved' | 'rejected') => void;
  onMarkAsPaid: (expense: Expense) => void;
  onAssignEntity: (expense: Expense, entity: string) => void;
  onBulkAssignEntity: (targets: Expense[], entity: string) => Promise<void>;
  onPushToZoho: (expense: Expense) => void;
  onViewExpense: (expense: Expense) => void;
  onDeleteExpense: (expenseId: string) => void;
  currentUserId: string;
}

interface SortableThProps {
  label: string;
  primaryKey: string;
  secondaryKey: string;
  sortBy: string;
  setSortBy: (sort: string) => void;
  align?: 'left' | 'right';
}

const thBase =
  'px-2 sm:px-3 lg:px-4 py-2.5 sm:py-3 min-h-[44px] text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-500 whitespace-nowrap';

// Clickable column header: first click applies primaryKey, second flips to
// secondaryKey; the arrow shows which direction is active.
function SortableTh({ label, primaryKey, secondaryKey, sortBy, setSortBy, align = 'left' }: SortableThProps) {
  const isPrimary = sortBy === primaryKey;
  const isSecondary = sortBy === secondaryKey;
  const isActive = isPrimary || isSecondary;

  return (
    <th className={`${thBase} ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <button
        type="button"
        onClick={() => setSortBy(isPrimary ? secondaryKey : primaryKey)}
        className={`inline-flex min-h-[44px] items-center gap-1 rounded uppercase tracking-[0.15em] transition-colors hover:text-stone-700 focus-visible:ring-2 focus-visible:ring-brand-500 lg:min-h-0 ${
          isActive ? 'text-brand-600' : ''
        }`}
      >
        {label}
        {isActive ? (
          isPrimary ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />
        ) : (
          <ChevronsUpDown className="h-3 w-3 text-stone-300" />
        )}
      </button>
    </th>
  );
}

export const ExpenseSubmissionTable: React.FC<ExpenseSubmissionTableProps> = (props) => {
  const {
    expenses,
    filteredExpenses,
    events,
    users,
    hasApprovalPermission,
    entityOptions,
    showFilters,
    setShowFilters,
    hasActiveFilters,
    onClearFilters,
    sortBy,
    setSortBy,
    onBulkAssignEntity,
  } = props;

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkEntity, setBulkEntity] = useState('');
  const [isBulkAssigning, setIsBulkAssigning] = useState(false);

  // Filter changes invalidate the current page and the selection.
  useEffect(() => {
    setPage(1);
    setSelectedIds(new Set());
  }, [
    props.dateFilter,
    props.eventFilter,
    props.categoryFilter,
    props.merchantFilter,
    props.cardFilter,
    props.statusFilter,
    props.reimbursementFilter,
  ]);

  // Data reloads (approve, entity assign, delete) can swap the rows without
  // changing any filter — prune selections that no longer exist so the bulk
  // bar's count always matches what a bulk action would actually touch.
  useEffect(() => {
    setSelectedIds(prev => {
      if (prev.size === 0) return prev;
      const validIds = new Set(filteredExpenses.map(e => e.id));
      const next = new Set([...prev].filter(id => validIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [filteredExpenses]);

  const pageCount = Math.max(1, Math.ceil(filteredExpenses.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageRows = useMemo(
    () => filteredExpenses.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filteredExpenses, safePage, pageSize]
  );

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allPageSelected = pageRows.length > 0 && pageRows.every(e => selectedIds.has(e.id));
  const togglePageSelection = () => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allPageSelected) pageRows.forEach(e => next.delete(e.id));
      else pageRows.forEach(e => next.add(e.id));
      return next;
    });
  };

  const selectedExpenses = useMemo(
    () => filteredExpenses.filter(e => selectedIds.has(e.id)),
    [filteredExpenses, selectedIds]
  );
  const assignableCount = selectedExpenses.filter(e => !e.zohoEntity).length;

  const handleBulkAssign = async () => {
    if (!bulkEntity || assignableCount === 0 || isBulkAssigning) return;
    setIsBulkAssigning(true);
    try {
      await onBulkAssignEntity(selectedExpenses, bulkEntity);
      setSelectedIds(new Set());
      setBulkEntity('');
    } finally {
      setIsBulkAssigning(false);
    }
  };

  // Compact page-number window: first, last, and neighbors of the current page.
  const pageNumbers = useMemo(() => {
    const pages: Array<number | '…'> = [];
    for (let p = 1; p <= pageCount; p++) {
      if (p === 1 || p === pageCount || Math.abs(p - safePage) <= 1) {
        pages.push(p);
      } else if (pages[pages.length - 1] !== '…') {
        pages.push('…');
      }
    }
    return pages;
  }, [pageCount, safePage]);

  const showingFrom = (safePage - 1) * pageSize + 1;
  const showingTo = Math.min(safePage * pageSize, filteredExpenses.length);

  return (
    <div className="card overflow-hidden">
      <ExpenseToolbar
        expenses={expenses}
        events={events}
        uniqueCategories={props.uniqueCategories}
        uniqueCards={props.uniqueCards}
        hasActiveFilters={hasActiveFilters}
        onClearFilters={onClearFilters}
        searchQuery={props.merchantFilter}
        setSearchQuery={props.setMerchantFilter}
        dateFilter={props.dateFilter}
        setDateFilter={props.setDateFilter}
        eventFilter={props.eventFilter}
        setEventFilter={props.setEventFilter}
        categoryFilter={props.categoryFilter}
        setCategoryFilter={props.setCategoryFilter}
        statusFilter={props.statusFilter}
        setStatusFilter={props.setStatusFilter}
        cardFilter={props.cardFilter}
        setCardFilter={props.setCardFilter}
        reimbursementFilter={props.reimbursementFilter}
        setReimbursementFilter={props.setReimbursementFilter}
        showMoreFilters={showFilters}
        setShowMoreFilters={setShowFilters}
      />

      {/* Bulk action bar */}
      {hasApprovalPermission && selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-brand-100 bg-brand-50/60 px-3 py-2">
          <span className="text-xs font-semibold text-brand-800">
            {selectedIds.size} selected
          </span>
          <span className="text-xs text-stone-500">
            {assignableCount > 0
              ? `${assignableCount} without an entity`
              : 'all already have entities'}
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <select
              value={bulkEntity}
              onChange={e => setBulkEntity(e.target.value)}
              className="rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 min-h-[44px] text-base sm:min-h-0 sm:text-xs text-stone-700 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/15"
              aria-label="Entity to assign"
            >
              <option value="">Choose entity…</option>
              {entityOptions.map(entity => (
                <option key={entity} value={entity}>{entity}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleBulkAssign}
              disabled={!bulkEntity || assignableCount === 0 || isBulkAssigning}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:pointer-events-none disabled:opacity-50 sm:min-h-0"
            >
              {isBulkAssigning ? 'Assigning…' : `Assign entity${assignableCount > 0 ? ` (${assignableCount})` : ''}`}
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="min-h-[44px] rounded-lg px-2 py-1.5 text-xs font-medium text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-700 sm:min-h-0"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Mobile (< lg): tappable card list — the detail modal carries all
          row actions. Desktop keeps the full table. */}
      <div className="lg:hidden">
        <ExpenseCardList
          expenses={pageRows}
          events={events}
          users={users}
          hasApprovalPermission={hasApprovalPermission}
          onViewExpense={props.onViewExpense}
        />
      </div>

      <div className={`hidden overflow-x-auto lg:block ${hasApprovalPermission ? 'table-sticky-2' : 'table-sticky-first'}`}>
        <table className="w-full min-w-max">
          <thead className="bg-stone-50/80">
            <tr>
              {hasApprovalPermission && (
                <th className="w-10 px-2 py-2.5 text-center sm:px-3 sm:py-3">
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    onChange={togglePageSelection}
                    aria-label="Select all on this page"
                    className="h-4 w-4 cursor-pointer rounded border-stone-300 accent-brand-600"
                  />
                </th>
              )}
              <SortableTh label="Date" primaryKey="date-newest" secondaryKey="date-oldest" sortBy={sortBy} setSortBy={setSortBy} />
              {hasApprovalPermission && (
                <SortableTh label="User" primaryKey="user-az" secondaryKey="user-za" sortBy={sortBy} setSortBy={setSortBy} />
              )}
              <th className={`${thBase} text-left`}>Event</th>
              <SortableTh label="Category" primaryKey="category-az" secondaryKey="category-za" sortBy={sortBy} setSortBy={setSortBy} />
              <SortableTh label="Merchant" primaryKey="merchant-az" secondaryKey="merchant-za" sortBy={sortBy} setSortBy={setSortBy} />
              <SortableTh label="Amount" primaryKey="amount-highest" secondaryKey="amount-lowest" sortBy={sortBy} setSortBy={setSortBy} align="right" />
              <th className={`${thBase} text-left`}>Card Used</th>
              <th className={`${thBase} text-left`}>Status</th>
              <th className={`${thBase} text-left`}>Reimbursement</th>
              <th className={`${thBase} text-left`}>Receipt</th>
              {hasApprovalPermission && (
                <>
                  <th className={`${thBase} text-left`}>Entity</th>
                  <th className={`${thBase} text-center`}>Zoho</th>
                </>
              )}
              <th className={`${thBase} text-right`}>Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {pageRows.map((expense) => {
              const event = events.find(e => e.id === expense.tradeShowId);
              const userName = expense.user_name || users.find(u => u.id === expense.userId)?.name || 'Unknown User';

              return (
                <ExpenseTableRow
                  key={expense.id}
                  expense={expense}
                  event={event}
                  userName={userName}
                  hasApprovalPermission={hasApprovalPermission}
                  entityOptions={entityOptions}
                  pushingExpenseId={props.pushingExpenseId}
                  pushedExpenses={props.pushedExpenses}
                  onReimbursementApproval={props.onReimbursementApproval}
                  onMarkAsPaid={props.onMarkAsPaid}
                  onAssignEntity={props.onAssignEntity}
                  onPushToZoho={props.onPushToZoho}
                  onViewExpense={props.onViewExpense}
                  onDeleteExpense={props.onDeleteExpense}
                  currentUserId={props.currentUserId}
                  isSelected={selectedIds.has(expense.id)}
                  onToggleSelect={hasApprovalPermission ? toggleSelect : undefined}
                />
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 px-3 py-2.5">
        <p className="text-xs text-stone-400">
          Showing <span className="font-semibold text-stone-600">{showingFrom}</span> to{' '}
          <span className="font-semibold text-stone-600">{showingTo}</span> of{' '}
          <span className="font-semibold text-stone-600">{filteredExpenses.length}</span> expenses
        </p>
        <div className="flex items-center gap-1.5">
          <select
            value={pageSize}
            onChange={e => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
            className="mr-2 rounded-lg border border-stone-200 bg-white px-2 py-1.5 min-h-[44px] text-base sm:min-h-0 sm:text-xs text-stone-600 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/15"
            aria-label="Rows per page"
          >
            {PAGE_SIZES.map(size => (
              <option key={size} value={size}>{size} / page</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setPage(safePage - 1)}
            disabled={safePage <= 1}
            className="tap-target rounded-lg p-1.5 text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-700 disabled:pointer-events-none disabled:opacity-40"
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          {pageNumbers.map((p, i) =>
            p === '…' ? (
              <span key={`gap-${i}`} className="px-1 text-xs text-stone-400">…</span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => setPage(p)}
                aria-current={p === safePage ? 'page' : undefined}
                className={`min-h-[44px] min-w-[44px] rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors lg:min-h-0 lg:min-w-[2rem] ${
                  p === safePage
                    ? 'bg-brand-600 text-white'
                    : 'text-stone-500 hover:bg-stone-100 hover:text-stone-700'
                }`}
              >
                {p}
              </button>
            )
          )}
          <button
            type="button"
            onClick={() => setPage(safePage + 1)}
            disabled={safePage >= pageCount}
            className="tap-target rounded-lg p-1.5 text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-700 disabled:pointer-events-none disabled:opacity-40"
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
