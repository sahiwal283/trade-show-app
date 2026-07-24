import React, { useState } from 'react';
import {
  FileText,
  Calendar,
  MapPin,
  User,
  DollarSign,
  Eye,
  X,
  Store,
  CreditCard,
  CheckCircle,
} from 'lucide-react';
import { Expense, TradeShow } from '../../App';
import { formatLocalDate } from '../../utils/dateUtils';
import { isPdfReceiptUrl } from '../../utils/fileValidation';
import { CATEGORY_COLORS } from '../../constants/appConstants';
import { useToast, ToastContainer } from '../common/Toast';
import { StatusBadge, CategoryBadge } from '../common';
import { useEscapeKey } from '../../hooks/useEscapeKey';

interface DetailedReportProps {
  expenses: Expense[];
  events: TradeShow[];
  onReimbursementApproval?: (expense: Expense, status: 'approved' | 'rejected') => void;
  /** Hide the built-in category chart when an entity-aware one is rendered above */
  showCategoryChart?: boolean;
}

export const DetailedReport: React.FC<DetailedReportProps> = ({
  expenses,
  events,
  onReimbursementApproval,
  showCategoryChart = true,
}) => {
  const { toasts, removeToast } = useToast();
  const [viewingExpense, setViewingExpense] = useState<Expense | null>(null);
  const [showFullReceipt, setShowFullReceipt] = useState(true);

  // Escape closes the expense-details dialog
  useEscapeKey(() => {
    setViewingExpense(null);
    setShowFullReceipt(true);
  }, !!viewingExpense);
  // Literal bar classes (not derived strings) so Tailwind's scanner generates them.
  const CATEGORY_BAR_COLORS: Record<string, string> = {
    'bg-blue-50': 'bg-blue-500',
    'bg-emerald-50': 'bg-emerald-500',
    'bg-orange-50': 'bg-orange-500',
    'bg-purple-50': 'bg-purple-500',
    'bg-yellow-50': 'bg-yellow-500',
    'bg-pink-50': 'bg-pink-500',
    'bg-indigo-50': 'bg-indigo-500',
    'bg-cyan-50': 'bg-cyan-500',
    'bg-teal-50': 'bg-teal-500',
    'bg-amber-50': 'bg-amber-500',
    'bg-lime-50': 'bg-lime-500',
    'bg-fuchsia-50': 'bg-fuchsia-500',
    'bg-gray-50': 'bg-gray-400',
  };

  const getCategoryBarColor = (category: string) => {
    const colorConfig = CATEGORY_COLORS[category as keyof typeof CATEGORY_COLORS];
    if (!colorConfig) return 'bg-gray-400';
    return CATEGORY_BAR_COLORS[colorConfig.bg] || 'bg-gray-400';
  };

  // Calculate category breakdown
  const categoryBreakdown = expenses.reduce(
    (acc, expense) => {
      acc[expense.category] = (acc[expense.category] || 0) + expense.amount;
      return acc;
    },
    {} as Record<string, number>
  );

  const categories = Object.keys(categoryBreakdown);
  const maxAmount = Math.max(...Object.values(categoryBreakdown));

  if (expenses.length === 0) {
    return (
      <div className="card p-12 text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-500 ring-1 ring-inset ring-brand-100">
          <FileText className="w-8 h-8" />
        </div>
        <h3 className="font-display text-lg font-semibold tracking-tight text-stone-900 mb-1.5">
          No Detailed Data Available
        </h3>
        <p className="mx-auto max-w-md text-sm text-stone-500">
          Apply filters to see detailed expense reports or submit some expenses to get started.
        </p>
      </div>
    );
  }

  return (
    <>
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      <div className="space-y-6">
        {/* Category Breakdown Chart */}
        {showCategoryChart && (
          <div className="card p-3 sm:p-5 md:p-6">
            <div className="mb-6">
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">
                Expenses by Category
              </h3>
              <p className="mt-1 text-sm text-stone-500">For selected filters</p>
            </div>

            {categories.length > 0 ? (
              <div className="space-y-4">
                {categories.map((category) => {
                  const amount = categoryBreakdown[category];
                  const percentage = (amount / maxAmount) * 100;

                  return (
                    <div key={category} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-stone-900">{category}</span>
                        <span className="text-sm font-semibold tabular-nums text-stone-900">
                          $
                          {amount.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      </div>
                      <div className="w-full bg-stone-100 rounded-full h-2 ring-1 ring-inset ring-stone-200/60">
                        <div
                          className={`h-2 rounded-full ${getCategoryBarColor(category)} transition-all duration-500`}
                          style={{ width: `${percentage}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-stone-500">No category data available</p>
              </div>
            )}
          </div>
        )}

        {/* Detailed Expense Table */}
        <div className="card overflow-hidden">
          <div className="px-6 py-4 bg-stone-50/80 border-b border-stone-200/80">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-100">
                  <FileText className="w-4 h-4" />
                </span>
                <h3 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">
                  Detailed Expense Report
                </h3>
              </div>
              <div className="text-sm text-stone-500 tabular-nums">
                {expenses.length} entries • $
                {expenses.reduce((sum, exp) => sum + exp.amount, 0).toLocaleString()} total
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-stone-50/80">
                <tr>
                  <th className="px-4 sm:px-5 md:px-6 py-2.5 sm:py-3 min-h-[44px] text-left text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">
                    Date & Event
                  </th>
                  <th className="px-4 sm:px-5 md:px-6 py-2.5 sm:py-3 min-h-[44px] text-left text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">
                    Merchant & Location
                  </th>
                  <th className="px-4 sm:px-5 md:px-6 py-2.5 sm:py-3 min-h-[44px] text-left text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">
                    Category
                  </th>
                  <th className="px-4 sm:px-5 md:px-6 py-2.5 sm:py-3 min-h-[44px] text-left text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">
                    Card Used
                  </th>
                  <th className="px-4 sm:px-5 md:px-6 py-2.5 sm:py-3 min-h-[44px] text-right text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">
                    Amount
                  </th>
                  <th className="px-4 sm:px-5 md:px-6 py-2.5 sm:py-3 min-h-[44px] text-left text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">
                    Status
                  </th>
                  <th className="px-4 sm:px-5 md:px-6 py-2.5 sm:py-3 min-h-[44px] text-left text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">
                    Reimbursement
                  </th>
                  <th className="px-4 sm:px-5 md:px-6 py-2.5 sm:py-3 min-h-[44px] text-left text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">
                    Entity
                  </th>
                  <th className="px-4 sm:px-5 md:px-6 py-2.5 sm:py-3 min-h-[44px] text-left text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">
                    Description
                  </th>
                  <th className="px-4 sm:px-5 md:px-6 py-2.5 sm:py-3 min-h-[44px] text-center text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">
                    Details
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-stone-100">
                {expenses.map((expense) => {
                  const event = events.find((e) => e.id === expense.tradeShowId);

                  return (
                    <tr
                      key={expense.id}
                      className="transition-colors duration-150 hover:bg-brand-50/40"
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="flex items-center text-sm text-stone-900">
                            <Calendar className="w-4 h-4 mr-1" />
                            {formatLocalDate(expense.date)}
                          </div>
                          {event && <div className="text-xs text-stone-500 mt-1">{event.name}</div>}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <div className="text-sm font-medium text-stone-900">
                            {expense.merchant}
                          </div>
                          {expense.location && (
                            <div className="flex items-center text-xs text-stone-500 mt-1">
                              <MapPin className="w-3 h-3 mr-1" />
                              {expense.location}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <CategoryBadge category={expense.category} size="sm" />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-stone-900">
                        {expense.cardUsed}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="inline-flex items-center text-sm font-semibold tabular-nums text-stone-900">
                          <DollarSign className="w-4 h-4 mr-0.5 text-stone-400" />
                          {expense.amount.toFixed(2)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <StatusBadge status={expense.status} size="sm" />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`chip px-2 py-1 text-xs ${
                            expense.reimbursementRequired
                              ? 'bg-orange-50 text-orange-700 ring-orange-200/70'
                              : 'bg-stone-50 text-stone-500 ring-stone-200'
                          }`}
                        >
                          {expense.reimbursementRequired
                            ? `Required (${expense.reimbursementStatus || 'pending review'})`
                            : 'Not Required'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-stone-900">
                        {expense.zohoEntity || (
                          <span className="text-stone-400 italic">Unassigned</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div
                          className="text-sm text-stone-900 max-w-xs truncate"
                          title={expense.description}
                        >
                          {expense.description || (
                            <span className="text-stone-400 italic">No description</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex justify-center">
                          <button
                            onClick={() => setViewingExpense(expense)}
                            className="inline-flex items-center justify-center rounded-lg p-2 text-stone-400 transition-colors duration-150 hover:bg-brand-50 hover:text-brand-600 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1"
                            title="View Details & Receipt"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                      {onReimbursementApproval && (
                        <td className="px-6 py-4 text-right">
                          {expense.reimbursementRequired &&
                            expense.reimbursementStatus === 'pending review' && (
                              <div className="flex items-center justify-end space-x-2">
                                <button
                                  onClick={() => onReimbursementApproval(expense, 'approved')}
                                  className="inline-flex items-center justify-center rounded-md p-1 text-accent-600 transition-colors duration-150 hover:bg-accent-50 hover:text-accent-700 focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-1"
                                  title="Approve Reimbursement"
                                >
                                  <CheckCircle className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => onReimbursementApproval(expense, 'rejected')}
                                  className="inline-flex items-center justify-center rounded-md p-1 text-red-600 transition-colors duration-150 hover:bg-red-50 hover:text-red-700 focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-1"
                                  title="Reject Reimbursement"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Summary Footer */}
          <div className="px-6 py-4 bg-stone-50/80 border-t border-stone-200/80">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center space-x-3 sm:space-x-4 md:space-x-6">
                <div className="flex items-center">
                  <span className="text-stone-600">Total Expenses:</span>
                  <span className="ml-1 font-semibold text-stone-900">{expenses.length}</span>
                </div>
                <div className="flex items-center">
                  <span className="text-stone-600">Approved:</span>
                  <span className="ml-1 font-semibold tabular-nums text-accent-600">
                    {expenses.filter((e) => e.status === 'approved').length}
                  </span>
                </div>
                <div className="flex items-center">
                  <span className="text-stone-600">Pending:</span>
                  <span className="ml-1 font-semibold tabular-nums text-amber-600">
                    {expenses.filter((e) => e.status === 'pending').length}
                  </span>
                </div>
                <div className="flex items-center">
                  <span className="text-stone-600">Reimbursement Required:</span>
                  <span className="ml-1 font-semibold tabular-nums text-orange-600">
                    {expenses.filter((e) => e.reimbursementRequired).length}
                  </span>
                </div>
              </div>
              <div className="flex items-center">
                <span className="text-stone-600">Total Amount:</span>
                <span className="ml-1 font-display text-lg font-bold tracking-tight tabular-nums text-stone-900">
                  ${expenses.reduce((sum, exp) => sum + exp.amount, 0).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* View Expense Details Modal */}
      {viewingExpense && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-xl bg-white shadow-elevation-3">
            <div className="sticky top-0 z-10 flex items-center justify-between overflow-hidden rounded-t-xl bg-gradient-to-r from-brand-700 via-brand-600 to-accent-600 px-6 py-4 text-white">
              <div>
                <h2 className="font-display text-xl font-bold tracking-tight">Expense Details</h2>
                <p className="mt-1 text-sm text-brand-100">
                  {events.find((e) => e.id === viewingExpense.tradeShowId)?.name || 'N/A'}
                </p>
              </div>
              <button
                onClick={() => {
                  setViewingExpense(null);
                  setShowFullReceipt(true);
                }}
                className="rounded-lg p-2 transition-colors duration-150 hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white/70"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Expense Info Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-start space-x-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-blue-50 ring-1 ring-inset ring-black/5">
                    <Calendar className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">
                      Date
                    </p>
                    <p className="font-semibold text-stone-900">
                      {formatLocalDate(viewingExpense.date)}
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-50 ring-1 ring-inset ring-black/5">
                    <DollarSign className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">
                      Amount
                    </p>
                    <p className="font-display text-xl font-bold tracking-tight tabular-nums text-stone-900">
                      ${viewingExpense.amount.toFixed(2)}
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-purple-50 ring-1 ring-inset ring-black/5">
                    <FileText className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">
                      Category
                    </p>
                    <p className="font-semibold text-stone-900">{viewingExpense.category}</p>
                  </div>
                </div>

                <div className="flex items-start space-x-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-orange-50 ring-1 ring-inset ring-black/5">
                    <Store className="w-5 h-5 text-orange-600" />
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">
                      Merchant
                    </p>
                    <p className="font-semibold text-stone-900">{viewingExpense.merchant}</p>
                  </div>
                </div>

                <div className="flex items-start space-x-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-50 ring-1 ring-inset ring-black/5">
                    <CreditCard className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">
                      Card Used
                    </p>
                    <p className="font-semibold text-stone-900">{viewingExpense.cardUsed}</p>
                  </div>
                </div>

                {viewingExpense.location && (
                  <div className="flex items-start space-x-3">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-red-50 ring-1 ring-inset ring-black/5">
                      <MapPin className="w-5 h-5 text-red-600" />
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">
                        Location
                      </p>
                      <p className="font-semibold text-stone-900">{viewingExpense.location}</p>
                    </div>
                  </div>
                )}

                {viewingExpense.user_name && (
                  <div className="flex items-start space-x-3">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-teal-50 ring-1 ring-inset ring-black/5">
                      <User className="w-5 h-5 text-teal-600" />
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">
                        Submitted By
                      </p>
                      <p className="font-semibold text-stone-900">{viewingExpense.user_name}</p>
                    </div>
                  </div>
                )}
              </div>

              {viewingExpense.description && (
                <div className="rounded-lg bg-stone-50/80 p-4 ring-1 ring-inset ring-stone-200/70">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400 mb-1.5">
                    Description
                  </p>
                  <p className="text-sm text-stone-900">{viewingExpense.description}</p>
                </div>
              )}

              {/* Status and Reimbursement */}
              <div className="flex flex-wrap gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400 mb-1">
                    Status
                  </p>
                  <StatusBadge status={viewingExpense.status} size="md" />
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400 mb-1">
                    Reimbursement
                  </p>
                  <span
                    className={`chip px-3 py-1 text-sm ${
                      viewingExpense.reimbursementRequired
                        ? 'bg-orange-50 text-orange-700 ring-orange-200/70'
                        : 'bg-stone-50 text-stone-500 ring-stone-200'
                    }`}
                  >
                    {viewingExpense.reimbursementRequired ? 'Required' : 'Not Required'}
                  </span>
                </div>
                {viewingExpense.zohoEntity && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400 mb-1">
                      Entity
                    </p>
                    <span className="chip px-3 py-1 text-sm bg-brand-50 text-brand-700 ring-brand-200/70">
                      {viewingExpense.zohoEntity}
                    </span>
                  </div>
                )}
              </div>

              {/* Receipt */}
              {viewingExpense.receiptUrl && (
                <div className="rounded-card bg-stone-50/80 p-6 ring-1 ring-inset ring-stone-200/70">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">
                      Receipt
                    </h3>
                    <button
                      onClick={() => setShowFullReceipt(!showFullReceipt)}
                      className="btn-secondary px-4 py-2"
                    >
                      <Eye className="w-4 h-4" />
                      <span>{showFullReceipt ? 'Hide' : 'View Full Size'}</span>
                    </button>
                  </div>
                  {showFullReceipt && (
                    <div className="card rounded-lg p-4">
                      {(() => {
                        const displayUrl = viewingExpense.receiptUrl.replace(
                          /^\/uploads/,
                          '/api/uploads'
                        );
                        const isPdf = isPdfReceiptUrl(viewingExpense.receiptUrl || '');
                        if (isPdf) {
                          return (
                            <a
                              href={displayUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-stone-300 bg-stone-50 px-4 py-8 text-stone-700 no-underline transition-colors duration-150 hover:border-brand-300 hover:bg-brand-50/40"
                            >
                              <FileText className="w-14 h-14 text-red-600" />
                              <span className="font-medium">PDF Receipt</span>
                              <span className="text-sm text-stone-500">
                                Click to open in a new tab
                              </span>
                            </a>
                          );
                        }
                        return (
                          <img
                            src={displayUrl}
                            alt="Receipt"
                            className="w-full h-auto max-h-[600px] object-contain rounded-lg ring-1 ring-stone-200"
                          />
                        );
                      })()}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Close Button */}
            <div className="sticky bottom-0 rounded-b-xl border-t border-stone-200 bg-stone-50/95 px-6 py-4 backdrop-blur-sm">
              <button
                onClick={() => {
                  setViewingExpense(null);
                  setShowFullReceipt(true);
                }}
                className="btn-secondary w-full px-4 py-2"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
