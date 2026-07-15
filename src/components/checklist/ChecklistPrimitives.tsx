/**
 * Checklist UI primitives — the Editorial Finance vocabulary shared by every
 * checklist section: the done-toggle, the booked/pending status chip, quiet
 * field labels, and the receipt chip + view/upload action cluster.
 */

import React from 'react';
import { CheckCircle2, Circle, Eye, Receipt } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/* ===== Done toggle ===== */

interface CheckToggleProps {
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
  /** Accessible name, e.g. "Mark flight for Jane as booked" */
  label: string;
}

export const CheckToggle: React.FC<CheckToggleProps> = ({ checked, onToggle, disabled, label }) => (
  <button
    type="button"
    onClick={onToggle}
    disabled={disabled}
    aria-pressed={checked}
    aria-label={label}
    className="tap-target shrink-0 rounded-full disabled:cursor-not-allowed disabled:opacity-50"
  >
    {checked ? (
      <CheckCircle2 aria-hidden="true" className="w-6 h-6 text-green-600 transition-transform hover:scale-110" />
    ) : (
      <Circle aria-hidden="true" className="w-6 h-6 text-stone-400 transition-colors hover:text-stone-600" />
    )}
  </button>
);

/* ===== Booked / pending status chip ===== */

interface StatusChipProps {
  done: boolean;
  doneLabel?: string;
  pendingLabel?: string;
  className?: string;
}

export const StatusChip: React.FC<StatusChipProps> = ({
  done,
  doneLabel = 'Booked',
  pendingLabel = 'Not booked',
  className = '',
}) => (
  <span
    className={`chip px-2 py-1 text-xs ${
      done
        ? 'bg-accent-50 text-accent-800 ring-accent-200/70'
        : 'bg-amber-50 text-amber-800 ring-amber-200/70'
    } ${className}`}
  >
    <span aria-hidden="true" className={`chip-dot ${done ? 'bg-accent-500' : 'bg-amber-500'}`} />
    {done ? doneLabel : pendingLabel}
  </span>
);

/* ===== Quiet form field label ===== */

export const FieldLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <label className="mb-1 block text-xs font-medium text-stone-500">{children}</label>
);

/* ===== Quiet inline action (brand ghost button) ===== */

interface InlineActionProps {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  title?: string;
}

export const InlineAction: React.FC<InlineActionProps> = ({ icon: Icon, label, onClick, title }) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-brand-600 transition-colors hover:bg-brand-50 hover:text-brand-700 lg:min-h-0"
  >
    <Icon aria-hidden="true" className="w-4 h-4" />
    {label}
  </button>
);

/* ===== Receipt count + view + upload cluster ===== */

interface ReceiptActionsProps {
  receiptCount: number;
  onView: () => void;
  onUpload: () => void;
}

export const ReceiptActions: React.FC<ReceiptActionsProps> = ({ receiptCount, onView, onUpload }) => (
  <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
    {receiptCount > 0 && (
      <>
        <span className="chip bg-accent-50 px-2 py-1 text-xs text-accent-800 ring-accent-200/70">
          <Receipt aria-hidden="true" className="w-3 h-3" />
          {receiptCount} Receipt{receiptCount !== 1 ? 's' : ''}
        </span>
        <InlineAction icon={Eye} label="View" onClick={onView} title="View receipt" />
      </>
    )}
    <InlineAction
      icon={Receipt}
      label={receiptCount > 0 ? 'Add Another' : 'Upload Receipt'}
      onClick={onUpload}
    />
  </div>
);
