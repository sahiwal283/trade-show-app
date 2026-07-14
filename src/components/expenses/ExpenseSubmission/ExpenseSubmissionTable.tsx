/**
 * ExpenseSubmissionTable Component
 * 
 * Table wrapper for displaying expenses with filters.
 */

import React from 'react';
import { Filter } from 'lucide-react';
import { Expense, TradeShow, User } from '../../../App';
import { ExpenseTableFilters, ExpenseTableRow } from '../ExpenseTable';

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
  onPushToZoho: (expense: Expense) => void;
  onViewExpense: (expense: Expense) => void;
  onDeleteExpense: (expenseId: string) => void;
  currentUserId: string;
}

export const ExpenseSubmissionTable: React.FC<ExpenseSubmissionTableProps> = ({
  expenses,
  filteredExpenses,
  events,
  users,
  hasApprovalPermission,
  entityOptions,
  pushingExpenseId,
  pushedExpenses,
  showFilters,
  setShowFilters,
  dateFilter,
  setDateFilter,
  eventFilter,
  setEventFilter,
  categoryFilter,
  setCategoryFilter,
  merchantFilter,
  setMerchantFilter,
  cardFilter,
  setCardFilter,
  statusFilter,
  setStatusFilter,
  reimbursementFilter,
  setReimbursementFilter,
  sortBy,
  setSortBy,
  uniqueCategories,
  uniqueCards,
  onReimbursementApproval,
  onMarkAsPaid,
  onAssignEntity,
  onPushToZoho,
  onViewExpense,
  onDeleteExpense,
  currentUserId
}) => {
  return (
    <div className="card overflow-hidden">
      {/* Mobile scroll affordance: the Date column stays pinned, rest scrolls */}
      <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-3 py-1.5 text-[11px] text-gray-400 lg:hidden" aria-hidden="true">
        <span>Swipe sideways for more columns</span>
        <span className="tracking-widest">&rsaquo;&rsaquo;</span>
      </div>
      <div className="overflow-x-auto table-sticky-first">
        <table className="w-full min-w-max">
          <thead className="bg-gray-50/80">
            {/* Column Headers */}
            <tr>
              <th className="px-2 sm:px-3 lg:px-4 py-2.5 sm:py-3 min-h-[44px] text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 whitespace-nowrap">Date</th>
              {hasApprovalPermission && (
                <th className="px-2 sm:px-3 lg:px-4 py-2.5 sm:py-3 min-h-[44px] text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 whitespace-nowrap">User</th>
              )}
              <th className="px-2 sm:px-3 lg:px-4 py-2.5 sm:py-3 min-h-[44px] text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 whitespace-nowrap">Event</th>
              <th className="px-2 sm:px-3 lg:px-4 py-2.5 sm:py-3 min-h-[44px] text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 whitespace-nowrap">Category</th>
              <th className="px-2 sm:px-3 lg:px-4 py-2.5 sm:py-3 min-h-[44px] text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 whitespace-nowrap">Merchant</th>
              <th className="px-2 sm:px-3 lg:px-4 py-2.5 sm:py-3 min-h-[44px] text-right text-[11px] font-semibold uppercase tracking-wider text-gray-500 whitespace-nowrap">Amount</th>
              <th className="px-2 sm:px-3 lg:px-4 py-2.5 sm:py-3 min-h-[44px] text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 whitespace-nowrap">Card Used</th>
              <th className="px-2 sm:px-3 lg:px-4 py-2.5 sm:py-3 min-h-[44px] text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 whitespace-nowrap">Status</th>
              <th className="px-2 sm:px-3 lg:px-4 py-2.5 sm:py-3 min-h-[44px] text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 whitespace-nowrap">Reimbursement</th>
              {hasApprovalPermission && (
                <>
                  <th className="px-2 sm:px-3 lg:px-4 py-2.5 sm:py-3 min-h-[44px] text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 whitespace-nowrap">Entity</th>
                  <th className="px-2 sm:px-3 lg:px-4 py-2.5 sm:py-3 min-h-[44px] text-center text-[11px] font-semibold uppercase tracking-wider text-gray-500 whitespace-nowrap">Zoho</th>
                </>
              )}
              <th className="px-2 sm:px-3 lg:px-4 py-2.5 sm:py-3 min-h-[44px] text-right text-[11px] font-semibold uppercase tracking-wider text-gray-500 whitespace-nowrap">
                <div className="flex items-center justify-end space-x-2">
                  <span>Actions</span>
                  <button
                    onClick={() => setShowFilters(!showFilters)}
                    className={`tap-target rounded-md p-1 transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1 ${
                      showFilters
                        ? 'bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-200/70'
                        : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                    }`}
                    title={showFilters ? 'Hide Filters' : 'Show Filters'}
                  >
                    <Filter className="w-3.5 h-3.5" />
                  </button>
                </div>
              </th>
            </tr>
            <ExpenseTableFilters
              expenses={expenses}
              events={events}
              users={users}
              hasApprovalPermission={hasApprovalPermission}
              showFilters={showFilters}
              dateFilter={dateFilter}
              setDateFilter={setDateFilter}
              eventFilter={eventFilter}
              setEventFilter={setEventFilter}
              categoryFilter={categoryFilter}
              setCategoryFilter={setCategoryFilter}
              merchantFilter={merchantFilter}
              setMerchantFilter={setMerchantFilter}
              cardFilter={cardFilter}
              setCardFilter={setCardFilter}
              statusFilter={statusFilter}
              setStatusFilter={setStatusFilter}
              reimbursementFilter={reimbursementFilter}
              setReimbursementFilter={setReimbursementFilter}
              sortBy={sortBy}
              setSortBy={setSortBy}
              uniqueCategories={uniqueCategories}
              uniqueCards={uniqueCards}
            />
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredExpenses.map((expense) => {
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
                  pushingExpenseId={pushingExpenseId}
                  pushedExpenses={pushedExpenses}
                  onReimbursementApproval={onReimbursementApproval}
                  onMarkAsPaid={onMarkAsPaid}
                  onAssignEntity={onAssignEntity}
                  onPushToZoho={onPushToZoho}
                  onViewExpense={onViewExpense}
                  onDeleteExpense={onDeleteExpense}
                  currentUserId={currentUserId}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

