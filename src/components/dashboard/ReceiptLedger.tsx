/**
 * ReceiptLedger Component
 *
 * Latest receipts for the hero show, ledger-style: merchant leads,
 * metadata stays quiet, status chip + amount close each line.
 */

import { Expense } from '../../App';
import { StatusBadge } from '../common/StatusBadge';
import { formatCurrency } from '../../constants/appConstants';
import { formatLocalDate } from '../../utils/dateUtils';

interface ReceiptLedgerProps {
  ledger: Expense[];
  onPageChange: (page: string) => void;
}

function toBadgeStatus(status: Expense['status']): 'pending' | 'approved' | 'rejected' | 'needs_further_review' {
  if (status === 'needs further review') return 'needs_further_review';
  return status;
}

export function ReceiptLedger({ ledger, onPageChange }: ReceiptLedgerProps) {
  return (
    <section aria-label="Latest receipts" className="card p-5 md:p-6">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">
          Latest receipts
        </h2>
        <button
          type="button"
          onClick={() => onPageChange('expenses')}
          className="card-link min-h-[44px] text-xs lg:min-h-0"
        >
          View all →
        </button>
      </div>

      {ledger.length === 0 ? (
        <p className="py-6 text-center text-sm text-stone-400">
          No receipts yet — they'll land here as the team submits them.
        </p>
      ) : (
        <ul className="divide-y divide-stone-100">
          {/* Fixed columns: text | status | amount — chips and amounts form
              straight vertical lines instead of trailing ragged text */}
          {ledger.map(expense => (
            <li
              key={expense.id}
              className="grid grid-cols-[minmax(0,1fr)_6rem_5.5rem] items-center gap-2 py-2.5"
            >
              <div className="min-w-0 truncate text-sm">
                <span className="font-semibold text-stone-900">{expense.merchant}</span>
                <span className="text-stone-400">
                  {' '}
                  · {expense.category}
                  {expense.user_name ? ` · ${expense.user_name}` : ''}
                  {' '}· {formatLocalDate(expense.date, { month: 'short', day: 'numeric' })}
                </span>
              </div>
              <div className="flex justify-start">
                <StatusBadge status={toBadgeStatus(expense.status)} size="xs" />
              </div>
              <span className="text-right text-sm font-bold tabular-nums text-stone-900">
                {formatCurrency(expense.amount)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
