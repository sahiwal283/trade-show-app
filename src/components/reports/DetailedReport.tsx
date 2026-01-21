import React, { useState } from 'react';
import { FileText, Calendar, MapPin, User, DollarSign, Eye, X, Store, CreditCard } from 'lucide-react';
import { Expense, TradeShow } from '../../App';
import { formatLocalDate } from '../../utils/dateUtils';
import { CATEGORY_COLORS } from '../../constants/appConstants';
import { useToast, ToastContainer } from '../common/Toast';
import { StatusBadge, CategoryBadge } from '../common';

interface DetailedReportProps {
  expenses: Expense[];
  events: TradeShow[];
  onReimbursementApproval?: (expense: Expense, status: 'approved' | 'rejected') => void;
}

export const DetailedReport: React.FC<DetailedReportProps> = ({ 
  expenses, 
  events, 
  onReimbursementApproval 
}) => {
  const { toasts, addToast, removeToast } = useToast();
  const [viewingExpense, setViewingExpense] = useState<Expense | null>(null);
  const [showFullReceipt, setShowFullReceipt] = useState(true);
  const getCategoryBarColor = (category: string) => {
    const colorConfig = CATEGORY_COLORS[category as keyof typeof CATEGORY_COLORS];
    if (!colorConfig) return 'bg-gray-500';
    
    // Convert badge colors (bg-blue-100) to chart bar colors (bg-blue-500)
    const bgClass = colorConfig.bg;
    return bgClass.replace('-100', '-500');
  };

  // Calculate category breakdown
  const categoryBreakdown = expenses.reduce((acc, expense) => {
    acc[expense.category] = (acc[expense.category] || 0) + expense.amount;
    return acc;
  }, {} as Record<string, number>);

  const categories = Object.keys(categoryBreakdown);
  const maxAmount = Math.max(...Object.values(categoryBreakdown));

  if (expenses.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
        <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">No Detailed Data Available</h3>
        <p className="text-gray-600">
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
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4 sm:p-5 md:p-6">
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900">Expenses by Category</h3>
          <p className="text-sm text-gray-600 mt-1">For selected filters</p>
        </div>
        
        {categories.length > 0 ? (
          <div className="space-y-4">
            {categories.map((category) => {
              const amount = categoryBreakdown[category];
              const percentage = (amount / maxAmount) * 100;
              
              return (
                <div key={category} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900">{category}</span>
                    <span className="text-sm font-semibold text-gray-900">
                      ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
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
            <p className="text-gray-500">No category data available</p>
          </div>
        )}
      </div>

      {/* Detailed Expense Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <FileText className="w-5 h-5 text-gray-600" />
            <h3 className="text-lg font-semibold text-gray-900">Detailed Expense Report</h3>
          </div>
          <div className="text-sm text-gray-600">
            {expenses.length} entries • ${expenses.reduce((sum, exp) => sum + exp.amount, 0).toLocaleString()} total
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 sm:px-5 md:px-6 py-2.5 sm:py-3 min-h-[44px] text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Date & Event
              </th>
              <th className="px-4 sm:px-5 md:px-6 py-2.5 sm:py-3 min-h-[44px] text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Merchant & Location
              </th>
              <th className="px-4 sm:px-5 md:px-6 py-2.5 sm:py-3 min-h-[44px] text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Category
              </th>
              <th className="px-4 sm:px-5 md:px-6 py-2.5 sm:py-3 min-h-[44px] text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Card Used
              </th>
              <th className="px-4 sm:px-5 md:px-6 py-2.5 sm:py-3 min-h-[44px] text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Amount
              </th>
              <th className="px-4 sm:px-5 md:px-6 py-2.5 sm:py-3 min-h-[44px] text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-4 sm:px-5 md:px-6 py-2.5 sm:py-3 min-h-[44px] text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Reimbursement
              </th>
              <th className="px-4 sm:px-5 md:px-6 py-2.5 sm:py-3 min-h-[44px] text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Entity
              </th>
              <th className="px-4 sm:px-5 md:px-6 py-2.5 sm:py-3 min-h-[44px] text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Description
              </th>
              <th className="px-4 sm:px-5 md:px-6 py-2.5 sm:py-3 min-h-[44px] text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Details
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {expenses.map((expense) => {
              const event = events.find(e => e.id === expense.tradeShowId);
              
              return (
                <tr key={expense.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="flex items-center text-sm text-gray-900">
                        <Calendar className="w-4 h-4 mr-1" />
                        {formatLocalDate(expense.date)}
                      </div>
                      {event && (
                        <div className="text-xs text-gray-500 mt-1">
                          {event.name}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{expense.merchant}</div>
                      {expense.location && (
                        <div className="flex items-center text-xs text-gray-500 mt-1">
                          <MapPin className="w-3 h-3 mr-1" />
                          {expense.location}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <CategoryBadge category={expense.category} size="sm" />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {expense.cardUsed}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center text-sm font-semibold text-gray-900">
                      <DollarSign className="w-4 h-4 mr-1" />
                      {expense.amount.toFixed(2)}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <StatusBadge status={expense.status} size="sm" />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                      expense.reimbursementRequired ? 'bg-orange-100 text-orange-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {expense.reimbursementRequired ? 
                        `Required (${expense.reimbursementStatus || 'pending review'})` : 
                        'Not Required'
                      }
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {expense.zohoEntity || (
                      <span className="text-gray-400 italic">Unassigned</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900 max-w-xs truncate" title={expense.description}>
                      {expense.description || (
                        <span className="text-gray-400 italic">No description</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex justify-center">
                      <button
                        onClick={() => setViewingExpense(expense)}
                        className="p-2 text-gray-600 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                        title="View Details & Receipt"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                  {onReimbursementApproval && (
                    <td className="px-6 py-4 text-right">
                      {expense.reimbursementRequired && expense.reimbursementStatus === 'pending review' && (
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            onClick={() => onReimbursementApproval(expense, 'approved')}
                            className="p-1 text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                            title="Approve Reimbursement"
                          >
                            <CheckCircle className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => onReimbursementApproval(expense, 'rejected')}
                            className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
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
      <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center space-x-3 sm:space-x-4 md:space-x-6">
            <div className="flex items-center">
              <span className="text-gray-600">Total Expenses:</span>
              <span className="ml-1 font-semibold text-gray-900">
                {expenses.length}
              </span>
            </div>
            <div className="flex items-center">
              <span className="text-gray-600">Approved:</span>
              <span className="ml-1 font-semibold text-emerald-600">
                {expenses.filter(e => e.status === 'approved').length}
              </span>
            </div>
            <div className="flex items-center">
              <span className="text-gray-600">Pending:</span>
              <span className="ml-1 font-semibold text-yellow-600">
                {expenses.filter(e => e.status === 'pending').length}
              </span>
            </div>
            <div className="flex items-center">
              <span className="text-gray-600">Reimbursement Required:</span>
              <span className="ml-1 font-semibold text-orange-600">
                {expenses.filter(e => e.reimbursementRequired).length}
              </span>
            </div>
          </div>
          <div className="flex items-center">
            <span className="text-gray-600">Total Amount:</span>
            <span className="ml-1 font-bold text-lg text-gray-900">
              ${expenses.reduce((sum, exp) => sum + exp.amount, 0).toLocaleString()}
            </span>
          </div>
        </div>
      </div>
    </div>
      </div>

      {/* View Expense Details Modal */}
      {viewingExpense && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Expense Details</h2>
                <p className="text-sm text-gray-600 mt-1">
                  {events.find(e => e.id === viewingExpense.tradeShowId)?.name || 'N/A'}
                </p>
              </div>
              <button
                onClick={() => {
                  setViewingExpense(null);
                  setShowFullReceipt(true);
                }}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Expense Info Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-start space-x-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Calendar className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Date</p>
                    <p className="font-semibold text-gray-900">{formatLocalDate(viewingExpense.date)}</p>
                  </div>
                </div>

                <div className="flex items-start space-x-3">
                  <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <DollarSign className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Amount</p>
                    <p className="font-semibold text-gray-900 text-xl">${viewingExpense.amount.toFixed(2)}</p>
                  </div>
                </div>

                <div className="flex items-start space-x-3">
                  <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <FileText className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Category</p>
                    <p className="font-semibold text-gray-900">{viewingExpense.category}</p>
                  </div>
                </div>

                <div className="flex items-start space-x-3">
                  <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Store className="w-5 h-5 text-orange-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Merchant</p>
                    <p className="font-semibold text-gray-900">{viewingExpense.merchant}</p>
                  </div>
                </div>

                <div className="flex items-start space-x-3">
                  <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <CreditCard className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Card Used</p>
                    <p className="font-semibold text-gray-900">{viewingExpense.cardUsed}</p>
                  </div>
                </div>

                {viewingExpense.location && (
                  <div className="flex items-start space-x-3">
                    <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <MapPin className="w-5 h-5 text-red-600" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Location</p>
                      <p className="font-semibold text-gray-900">{viewingExpense.location}</p>
                    </div>
                  </div>
                )}

                {viewingExpense.user_name && (
                  <div className="flex items-start space-x-3">
                    <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <User className="w-5 h-5 text-teal-600" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Submitted By</p>
                      <p className="font-semibold text-gray-900">{viewingExpense.user_name}</p>
                    </div>
                  </div>
                )}
              </div>

              {viewingExpense.description && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-500 mb-2">Description</p>
                  <p className="text-gray-900">{viewingExpense.description}</p>
                </div>
              )}

              {/* Status and Reimbursement */}
              <div className="flex flex-wrap gap-3">
                <div>
                  <p className="text-sm text-gray-500 mb-1">Status</p>
                  <StatusBadge status={viewingExpense.status} size="md" />
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-1">Reimbursement</p>
                  <span className={`px-3 py-1 text-sm font-medium rounded-full ${
                    viewingExpense.reimbursementRequired ? 'bg-orange-100 text-orange-800' : 'bg-gray-100 text-gray-800'
                  }`}>
                    {viewingExpense.reimbursementRequired ? 'Required' : 'Not Required'}
                  </span>
                </div>
                {viewingExpense.zohoEntity && (
                  <div>
                    <p className="text-sm text-gray-500 mb-1">Entity</p>
                    <span className="px-3 py-1 text-sm font-medium rounded-full bg-blue-100 text-blue-800">
                      {viewingExpense.zohoEntity}
                    </span>
                  </div>
                )}
              </div>

              {/* Receipt */}
              {viewingExpense.receiptUrl && (
                <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">Receipt</h3>
                    <button
                      onClick={() => setShowFullReceipt(!showFullReceipt)}
                      className="flex items-center space-x-2 px-4 py-2 bg-white text-gray-700 rounded-lg hover:bg-gray-50 transition-colors border border-gray-200"
                    >
                      <Eye className="w-4 h-4" />
                      <span>{showFullReceipt ? 'Hide' : 'View Full Size'}</span>
                    </button>
                  </div>
                  {showFullReceipt && (
                    <div className="bg-white rounded-lg p-4">
                      <img
                        src={viewingExpense.receiptUrl.replace(/^\/uploads/, '/api/uploads')}
                        alt="Receipt"
                        className="w-full h-auto max-h-[600px] object-contain rounded-lg border-2 border-gray-200 shadow-md"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Close Button */}
            <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4">
              <button
                onClick={() => {
                  setViewingExpense(null);
                  setShowFullReceipt(true);
                }}
                className="w-full px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors font-medium"
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