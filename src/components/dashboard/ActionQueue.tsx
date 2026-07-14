/**
 * ActionQueue Component
 *
 * "Needs your attention" — role-aware. Managers (admin/accountant/
 * developer) see the approval backlog, OCR verifications, and the Zoho
 * push queue. Everyone else sees the state of their own submissions.
 */

import { CheckCircle } from 'lucide-react';

interface ActionQueueProps {
  canManage: boolean;
  pendingCount: number;
  ocrReviewCount: number;
  zohoQueueCount: number;
  onPageChange: (page: string) => void;
}

interface QueueItemProps {
  label: string;
  action: string;
  tone: 'amber' | 'violet' | 'blue';
  onClick: () => void;
}

const toneClasses = {
  amber: {
    wrap: 'border-amber-200 bg-amber-50 hover:border-amber-300',
    label: 'text-amber-900',
    action: 'text-amber-700',
  },
  violet: {
    wrap: 'border-violet-200 bg-violet-50 hover:border-violet-300',
    label: 'text-violet-900',
    action: 'text-violet-700',
  },
  blue: {
    wrap: 'border-brand-200 bg-brand-50 hover:border-brand-300',
    label: 'text-brand-900',
    action: 'text-brand-700',
  },
};

function QueueItem({ label, action, tone, onClick }: QueueItemProps) {
  const classes = toneClasses[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-[44px] w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left transition-colors lg:min-h-0 ${classes.wrap}`}
    >
      <span className={`text-xs font-semibold ${classes.label}`}>{label}</span>
      <span className={`shrink-0 text-xs font-medium ${classes.action}`}>{action} →</span>
    </button>
  );
}

export function ActionQueue({
  canManage,
  pendingCount,
  ocrReviewCount,
  zohoQueueCount,
  onPageChange,
}: ActionQueueProps) {
  const goToExpenses = () => onPageChange('expenses');

  const items: QueueItemProps[] = [];
  if (pendingCount > 0) {
    items.push({
      label: canManage
        ? `${pendingCount} expense${pendingCount === 1 ? '' : 's'} awaiting approval`
        : `${pendingCount} of your expense${pendingCount === 1 ? '' : 's'} awaiting approval`,
      action: canManage ? 'Review' : 'View',
      tone: 'amber',
      onClick: goToExpenses,
    });
  }
  if (ocrReviewCount > 0) {
    items.push({
      label: `${ocrReviewCount} low-confidence OCR scan${ocrReviewCount === 1 ? '' : 's'}`,
      action: 'Verify',
      tone: 'violet',
      onClick: goToExpenses,
    });
  }
  if (canManage && zohoQueueCount > 0) {
    items.push({
      label: `${zohoQueueCount} approved, not yet in Zoho`,
      action: 'Push',
      tone: 'blue',
      onClick: goToExpenses,
    });
  }

  return (
    <section aria-label="Needs your attention" className="card p-4 md:p-5">
      <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">
        Needs your attention
      </h2>
      {items.length === 0 ? (
        <div className="flex items-center gap-2 rounded-xl border border-stone-100 bg-stone-50 px-3 py-2.5">
          <CheckCircle aria-hidden="true" className="h-4 w-4 shrink-0 text-accent-500" />
          <p className="text-xs font-medium text-stone-500">All clear — nothing waiting on you.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(item => (
            <QueueItem key={item.label} {...item} />
          ))}
        </div>
      )}
    </section>
  );
}
