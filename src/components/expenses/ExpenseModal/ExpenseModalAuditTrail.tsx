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
    created: 'bg-accent-50 text-accent-800 ring-accent-200/70',
    updated: 'bg-brand-50 text-brand-700 ring-brand-200/70',
    status_changed: 'bg-purple-50 text-purple-700 ring-purple-200/70',
    entity_assigned: 'bg-orange-50 text-orange-700 ring-orange-200/70',
    pushed_to_zoho: 'bg-accent-50 text-accent-800 ring-accent-200/70',
    receipt_replaced: 'bg-cyan-50 text-cyan-700 ring-cyan-200/70',
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
    <div className="rounded-card bg-stone-50/80 p-6 ring-1 ring-inset ring-stone-200/70">
      <button
        onClick={() => setShowAuditTrail(!showAuditTrail)}
        className="w-full flex items-center justify-between mb-4 hover:opacity-80 transition-opacity"
      >
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-100">
            <History className="w-4 h-4" />
          </span>
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">Change History</h3>
          {historyCount > 0 && (
            <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-brand-600 px-2 py-0.5 text-xs font-semibold text-white">
              {historyCount}
            </span>
          )}
        </div>
        <div className="text-brand-600">{showAuditTrail ? '▼' : '▶'}</div>
      </button>

      {showAuditTrail &&
        (loadingAudit ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
            <span className="ml-2 text-sm text-stone-600">Loading history...</span>
          </div>
        ) : auditTrail.length === 0 ? (
          <div className="text-center py-8 text-stone-500 text-sm">No changes recorded yet</div>
        ) : (
          <div className="space-y-3">
            {auditTrail.map((entry) => {
              const timestamp = new Date(entry.timestamp);

              return (
                <div key={entry.id} className="card rounded-lg p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <span
                        className={`chip px-2 py-1 text-xs ${actionColors[entry.action] || 'bg-stone-50 text-stone-700 ring-stone-200'}`}
                      >
                        {actionLabels[entry.action] || entry.action}
                      </span>
                      <span className="text-sm font-medium text-stone-900">{entry.userName}</span>
                    </div>
                    <span className="text-xs text-stone-400 tabular-nums">
                      {timestamp.toLocaleDateString()} {timestamp.toLocaleTimeString()}
                    </span>
                  </div>

                  {entry.changes && Object.keys(entry.changes).length > 0 && (
                    <div className="mt-2 space-y-1">
                      {Object.entries(entry.changes).map(([field, change]) => {
                        return (
                          <div key={field} className="text-xs text-stone-700">
                            <span className="font-medium">{fieldLabels[field] || field}:</span>{' '}
                            {change.old !== null && change.old !== undefined && (
                              <span className="text-red-500/80 line-through">
                                {field === 'amount' && typeof change.old === 'number'
                                  ? `$${change.old.toFixed(2)}`
                                  : String(change.old)}
                              </span>
                            )}
                            {change.old !== null && change.old !== undefined && ' → '}
                            <span className="text-accent-700 font-medium">
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

