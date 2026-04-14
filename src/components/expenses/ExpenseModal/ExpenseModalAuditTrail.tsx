/**
 * ExpenseModalAuditTrail Component
 * 
 * Extracted from ExpenseSubmission.tsx (was lines 1546-1656, ~115 lines)
 * Displays audit trail / change history for an expense
 * Only visible to users with approval permissions
 */

import React, { useState } from 'react';
import { History, Loader2 } from 'lucide-react';
import { AuditTrailEntry } from '../../../types/types';

interface AuditEntry extends AuditTrailEntry {
  userName: string;
}

interface ExpenseModalAuditTrailProps {
  auditTrail: AuditEntry[];
  loadingAudit: boolean;
  hasApprovalPermission: boolean;
}

export const ExpenseModalAuditTrail: React.FC<ExpenseModalAuditTrailProps> = ({
  auditTrail,
  loadingAudit,
  hasApprovalPermission,
}) => {
  const [showAuditTrail, setShowAuditTrail] = useState(false);

  if (!hasApprovalPermission) return null;

  const historyCount = auditTrail.filter((entry) => entry.action !== 'created').length;

  const actionLabels: Record<string, string> = {
    created: 'Created',
    updated: 'Updated',
    status_changed: 'Status Changed',
    entity_assigned: 'Entity Assigned',
    pushed_to_zoho: 'Pushed to Zoho',
    receipt_replaced: 'Receipt Replaced',
  };

  const actionColors: Record<string, string> = {
    created: 'bg-green-100 text-green-800',
    updated: 'bg-blue-100 text-blue-800',
    status_changed: 'bg-purple-100 text-purple-800',
    entity_assigned: 'bg-orange-100 text-orange-800',
    pushed_to_zoho: 'bg-emerald-100 text-emerald-800',
    receipt_replaced: 'bg-cyan-100 text-cyan-800',
  };

  const fieldLabels: Record<string, string> = {
    merchant: 'Merchant',
    amount: 'Amount',
    date: 'Date',
    category: 'Category',
    description: 'Description',
    location: 'Location',
    card_used: 'Card Used',
    reimbursement_required: 'Reimbursement Required',
    reimbursement_status: 'Reimbursement',
    zoho_entity: 'Entity',
    zoho_expense_id: 'Zoho Expense ID',
    status: 'Status',
    event: 'Event',
    receipt_url: 'Receipt',
  };

  return (
    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-6">
      <button
        onClick={() => setShowAuditTrail(!showAuditTrail)}
        className="w-full flex items-center justify-between mb-4 hover:opacity-80 transition-opacity"
      >
        <div className="flex items-center space-x-2">
          <History className="w-5 h-5 text-blue-600" />
          <h3 className="font-semibold text-gray-900">Change History</h3>
          {historyCount > 0 && (
            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-600 text-white">
              {historyCount}
            </span>
          )}
        </div>
        <div className="text-blue-600">{showAuditTrail ? '▼' : '▶'}</div>
      </button>

      {showAuditTrail &&
        (loadingAudit ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            <span className="ml-2 text-sm text-gray-600">Loading history...</span>
          </div>
        ) : auditTrail.length === 0 ? (
          <div className="text-center py-8 text-gray-500 text-sm">No changes recorded yet</div>
        ) : (
          <div className="space-y-3">
            {auditTrail.map((entry) => {
              const timestamp = new Date(entry.timestamp);

              return (
                <div key={entry.id} className="bg-white rounded-lg p-4 border border-gray-200">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded ${actionColors[entry.action] || 'bg-gray-100 text-gray-800'}`}
                      >
                        {actionLabels[entry.action] || entry.action}
                      </span>
                      <span className="text-sm font-medium text-gray-900">{entry.userName}</span>
                    </div>
                    <span className="text-xs text-gray-500">
                      {timestamp.toLocaleDateString()} {timestamp.toLocaleTimeString()}
                    </span>
                  </div>

                  {entry.changes && Object.keys(entry.changes).length > 0 && (
                    <div className="mt-2 space-y-1">
                      {Object.entries(entry.changes).map(([field, change]) => {
                        return (
                          <div key={field} className="text-xs text-gray-700">
                            <span className="font-medium">{fieldLabels[field] || field}:</span>{' '}
                            {change.old !== null && change.old !== undefined && (
                              <span className="text-red-600 line-through">
                                {field === 'amount' && typeof change.old === 'number'
                                  ? `$${change.old.toFixed(2)}`
                                  : String(change.old)}
                              </span>
                            )}
                            {change.old !== null && change.old !== undefined && ' → '}
                            <span className="text-green-600 font-medium">
                              {field === 'amount' && typeof change.new === 'number'
                                ? `$${change.new.toFixed(2)}`
                                : String(change.new)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
    </div>
  );
};

