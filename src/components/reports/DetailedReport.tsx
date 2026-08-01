import React, { useState } from 'react';
import {
  FileText,
  Calendar,
  MapPin,
  User,
  Users,
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
import { useDetailedLeads } from './hooks/useDetailedLeads';

/** Trailing "City, ST 89109[, USA]" — capture the city and state. */
const CITY_STATE_TAIL =
  /(?:^|,)\s*([^,]+?)\s*,\s*([A-Za-z]{2})\.?,?\s+\d{5}(?:-\d{4})?(?:\s*,?\s*(?:USA|US|United States(?: of America)?))?\.?\s*$/;

/** Collapse a full street address to a quiet "City, ST"; otherwise return it unchanged (the cell truncates it). */
function shortLocation(location: string): string {
  const match = location.match(CITY_STATE_TAIL);
  if (match) return `${match[1].trim()}, ${match[2].toUpperCase()}`;
  return location;
}

/** "$1,234.56" with the currency glyph inside the same text run. */
function formatUsd(amount: number): string {
  return `$${amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

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
  // CRM lead stats for the single show this report is scoped to (null when
  // multi-show, CRM disconnected, or no matching leads — panel hides itself).
  const leadStats = useDetailedLeads(expenses, events);

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

        {/* Show leads — CRM capture stats for this show; hidden when no data */}
        {leadStats && (
          <div className="card overflow-hidden">
            <div className="flex items-center gap-2 border-b border-stone-200/80 bg-stone-50/80 px-6 py-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-100">
                <Users className="h-4 w-4" />
              </span>
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">
                Leads
              </h3>
            </div>
            <dl className="grid grid-cols-2 gap-px bg-stone-100 lg:grid-cols-4">
              <div className="bg-white px-5 py-4">
                <dt className="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">
                  Leads Captured
                </dt>
                <dd className="mt-1 font-display text-lg font-bold tracking-tight tabular-nums text-stone-900">
                  {leadStats.leads.toLocaleString()}
                </dd>
              </div>
              <div className="bg-white px-5 py-4">
                <dt className="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">
                  Converted
                </dt>
                <dd className="mt-1 font-display text-lg font-bold tracking-tight tabular-nums text-stone-900">
                  {leadStats.converted.toLocaleString()}
                  {leadStats.converted > 0 && (
                    <span className="ml-1.5 text-xs font-medium tracking-normal text-stone-500">
                      ({Math.round((leadStats.converted / leadStats.leads) * 100)}%)
                    </span>
                  )}
                </dd>
              </div>
              <div className="bg-white px-5 py-4">
                <dt className="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">
                  Email Open Rate
                </dt>
                <dd className="mt-1 font-display text-lg font-bold tracking-tight tabular-nums text-stone-900">
                  {leadStats.openRate !== null ? `${Math.round(leadStats.openRate * 100)}%` : '—'}
                </dd>
              </div>
              <div className="bg-white px-5 py-4">
                <dt className="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">
                  Cost Per Lead
                </dt>
                <dd className="mt-1 font-display text-lg font-bold tracking-tight tabular-nums text-stone-900">
                  {leadStats.costPerLead !== null
                    ? `$${leadStats.costPerLead.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}`
                    : '—'}
                </dd>
              </div>
            </dl>
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
            <table className="w-full min-w-[1080px] table-fixed">
              <colgroup>
                <col className="w-36" />
                <col className="w-48" />
                <col className="w-32" />
                <col className="w-28" />
                <col className="w-28" />
                <col className="w-28" />
                <col className="w-40" />
                <col className="w-28" />
                <col className="w-52" />
                <col className="w-14" />
                {onReimbursementApproval && <col className="w-20" />}
              </colgroup>
              <thead className="bg-stone-50/80">
                <tr>
                  <th className="py-2.5 pl-5 pr-4 text-left text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400 sm:pl-6">
                    Date & Event
                  </th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">
                    Merchant & Location
                  </th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">
                    Category
                  </th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">
                    Card Used
                  </th>
                  <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">
                    Amount
                  </th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">
                    Status
                  </th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">
                    Reimbursement
                  </th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">
                    Entity
                  </th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">
                    Description
                  </th>
                  <th className="px-2 py-2.5 text-center text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">
                    <span className="sr-only">Details</span>
                  </th>
                  {onReimbursementApproval && (
                    <th className="py-2.5 pl-2 pr-5 text-right text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400 sm:pr-6">
                      Approve
                    </th>
                  )}
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
                      <td className="py-2.5 pl-5 pr-4 align-middle sm:pl-6">
                        <div className="truncate text-sm font-semibold tabular-nums text-stone-900">
                          {formatLocalDate(expense.date)}
                        </div>
                        {event && (
                          <div className="truncate text-xs text-stone-500" title={event.name}>
                            {event.name}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2.5 align-middle">
                        <div
                          className="truncate text-sm font-semibold text-stone-900"
                          title={expense.merchant}
                        >
                          {expense.merchant}
                        </div>
                        {expense.location && (
                          <div className="truncate text-xs text-stone-500" title={expense.location}>
                            {shortLocation(expense.location)}
                          </div>
                        )}
                      </td>
                      <td
                        className="overflow-hidden whitespace-nowrap px-4 py-2.5 align-middle"
                        title={expense.category}
                      >
                        <CategoryBadge
                          category={expense.category}
                          size="sm"
                          className="inline-block max-w-full truncate align-middle"
                        />
                      </td>
                      <td className="px-4 py-2.5 align-middle">
                        <div className="truncate text-sm text-stone-700" title={expense.cardUsed}>
                          {expense.cardUsed}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right align-middle text-sm font-bold tabular-nums text-stone-900">
                        {formatUsd(expense.amount)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 align-middle">
                        <StatusBadge status={expense.status} size="sm" />
                      </td>
                      <td className="px-4 py-2.5 align-middle">
                        <span
                          className={`chip max-w-full px-2 py-1 text-xs ${
                            expense.reimbursementRequired
                              ? 'bg-orange-50 text-orange-700 ring-orange-200/70'
                              : 'bg-stone-50 text-stone-500 ring-stone-200'
                          }`}
                          title={
                            expense.reimbursementRequired
                              ? `Required (${expense.reimbursementStatus || 'pending review'})`
                              : 'Not Required'
                          }
                        >
                          <span className="min-w-0 truncate">
                            {expense.reimbursementRequired
                              ? `Required (${expense.reimbursementStatus || 'pending review'})`
                              : 'Not Required'}
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-2.5 align-middle">
                        {expense.zohoEntity ? (
                          <div
                            className="truncate text-sm text-stone-700"
                            title={expense.zohoEntity}
                          >
                            {expense.zohoEntity}
                          </div>
                        ) : (
                          <span className="text-sm italic text-stone-400">Unassigned</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 align-middle">
                        <div
                          className="truncate text-sm text-stone-600"
                          title={expense.description}
                        >
                          {expense.description || (
                            <span className="italic text-stone-400">No description</span>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-2.5 text-center align-middle">
                        <button
                          onClick={() => setViewingExpense(expense)}
                          className="inline-flex items-center justify-center rounded-lg p-1.5 text-stone-400 transition-colors duration-150 hover:bg-brand-50 hover:text-brand-600 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1"
                          title="View Details & Receipt"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                      {onReimbursementApproval && (
                        <td className="py-2.5 pl-2 pr-5 text-right align-middle sm:pr-6">
                          {expense.reimbursementRequired &&
                            expense.reimbursementStatus === 'pending review' && (
                              <div className="flex items-center justify-end gap-1">
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
