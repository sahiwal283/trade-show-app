import React from 'react';
import { X, Receipt, FileText, MapPin, User } from 'lucide-react';
import { Expense } from '../../../App';
import { StatusBadge, CategoryBadge } from '../../common';
import { formatLocalDate } from '../../../utils/dateUtils';

interface ApprovalViewModalProps {
  expense: Expense;
  entityOptions: string[];
  showFullReceipt: boolean;
  onClose: () => void;
  onToggleReceipt: () => void;
  onAssignEntity: (expense: Expense, entity: string) => void;
  onEdit?: (expense: Expense) => void;
}

export const ApprovalViewModal: React.FC<ApprovalViewModalProps> = ({
  expense,
  entityOptions,
  showFullReceipt,
  onClose,
  onToggleReceipt,
  onAssignEntity,
  onEdit,
}) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-purple-500 to-blue-500 text-white rounded-t-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Receipt className="w-6 h-6" />
              <div>
                <h2 className="text-xl font-bold">Expense Details</h2>
                <p className="text-sm text-purple-100">Review expense and receipt</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1 hover:bg-white/20 rounded-lg transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column: Expense Details */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                <FileText className="w-5 h-5 mr-2" />
                Expense Information
              </h3>
              
              <div className="space-y-3">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs font-medium text-gray-500 mb-1">Merchant</p>
                  <p className="text-sm font-semibold text-gray-900">{expense.merchant}</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs font-medium text-gray-500 mb-1">Amount</p>
                    <p className="text-sm font-semibold text-gray-900">${expense.amount.toFixed(2)}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs font-medium text-gray-500 mb-1">Date</p>
                    <p className="text-sm font-semibold text-gray-900">{formatLocalDate(expense.date)}</p>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs font-medium text-gray-500 mb-1">Category</p>
                  <CategoryBadge category={expense.category} size="sm" />
                </div>

                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs font-medium text-gray-500 mb-1">Description</p>
                  <p className="text-sm text-gray-900">{expense.description || 'No description provided'}</p>
                </div>

                {expense.location && (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs font-medium text-gray-500 mb-1 flex items-center">
                      <MapPin className="w-3 h-3 mr-1" />
                      Location
                    </p>
                    <p className="text-sm text-gray-900">{expense.location}</p>
                  </div>
                )}

                {expense.user_name && (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs font-medium text-gray-500 mb-1 flex items-center">
                      <User className="w-3 h-3 mr-1" />
                      Submitted By
                    </p>
                    <p className="text-sm text-gray-900">{expense.user_name}</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs font-medium text-gray-500 mb-1">Status</p>
                    <StatusBadge status={expense.status} size="sm" />
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs font-medium text-gray-500 mb-1">Reimbursement</p>
                    <p className="text-xs text-gray-900">
                      {expense.reimbursementRequired ? `Required (${expense.reimbursementStatus || 'pending'})` : 'Not Required'}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs font-medium text-gray-500 mb-1">Card Used</p>
                    <p className="text-sm text-gray-900">{expense.cardUsed || 'N/A'}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs font-medium text-gray-500 mb-1">Entity</p>
                    <select
                      value={expense.zohoEntity || ''}
                      onChange={(e) => onAssignEntity(expense, e.target.value)}
                      className="text-sm border border-gray-300 rounded px-2 py-1 focus:ring-2 focus:ring-purple-500 focus:border-transparent w-full bg-white"
                    >
                      <option value="">Unassigned</option>
                      {expense.zohoEntity && !entityOptions.includes(expense.zohoEntity) && (
                        <option value={expense.zohoEntity}>{expense.zohoEntity}</option>
                      )}
                      {entityOptions.map((entity, index) => (
                        <option key={index} value={entity}>{entity}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {expense.zohoExpenseId && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                    <p className="text-xs font-medium text-emerald-700 mb-1">Zoho Books Status</p>
                    <p className="text-sm text-emerald-900">
                      ✅ Pushed to {expense.zohoEntity} (ID: {expense.zohoExpenseId})
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Receipt */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                <Receipt className="w-5 h-5 mr-2" />
                Receipt
              </h3>
              
              {expense.receiptUrl ? (
                <div className="bg-gray-50 rounded-lg overflow-hidden">
                  {showFullReceipt ? (
                    <div className="relative">
                      <img
                        src={expense.receiptUrl.replace(/^\/uploads/, '/api/uploads')}
                        alt="Receipt"
                        className="w-full h-auto"
                      />
                      <button
                        onClick={onToggleReceipt}
                        className="absolute top-2 right-2 px-3 py-1 bg-white rounded-lg shadow-md text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
                      >
                        Hide
                      </button>
                    </div>
                  ) : (
                    <div className="p-8 text-center">
                      <Receipt className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                      <button
                        onClick={onToggleReceipt}
                        className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors"
                      >
                        View Receipt
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-gray-50 rounded-lg p-8 text-center">
                  <Receipt className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-sm text-gray-500">No receipt uploaded</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 rounded-b-xl flex items-center justify-end space-x-3 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-100 transition-colors"
          >
            Close
          </button>
          {onEdit && (
            <button
              onClick={() => {
                onEdit(expense);
                onClose();
              }}
              className="px-6 py-2 bg-gradient-to-r from-blue-500 to-emerald-500 text-white rounded-lg font-medium hover:from-blue-600 hover:to-emerald-600 transition-all duration-200"
            >
              Edit Expense
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

