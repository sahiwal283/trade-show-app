/**
 * StatusBadge Component
 * 
 * Reusable badge component for displaying expense status with consistent
 * styling across the application. Eliminates duplicate status badge logic
 * found in 5+ components.
 * 
 * Usage:
 *   <StatusBadge status="pending" />
 *   <StatusBadge status="approved" size="sm" />
 *   <StatusBadge status="rejected" showIcon />
 */

import React from 'react';
import { CheckCircle, XCircle, Clock, AlertCircle, FileCheck } from 'lucide-react';

type ExpenseStatus = 
  | 'pending' 
  | 'approved' 
  | 'rejected' 
  | 'paid' 
  | 'reimbursed'
  | 'needs_further_review';

interface StatusBadgeProps {
  status: ExpenseStatus;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  showIcon?: boolean;
  className?: string;
}

const statusConfig = {
  pending: {
    color: 'bg-amber-50 text-amber-800 ring-amber-200/70',
    dot: 'bg-amber-500',
    icon: Clock,
    label: 'Pending'
  },
  approved: {
    color: 'bg-accent-50 text-accent-800 ring-accent-200/70',
    dot: 'bg-accent-500',
    icon: CheckCircle,
    label: 'Approved'
  },
  rejected: {
    color: 'bg-red-50 text-red-700 ring-red-200/70',
    dot: 'bg-red-500',
    icon: XCircle,
    label: 'Rejected'
  },
  paid: {
    color: 'bg-brand-50 text-brand-700 ring-brand-200/70',
    dot: 'bg-brand-500',
    icon: FileCheck,
    label: 'Paid'
  },
  reimbursed: {
    color: 'bg-violet-50 text-violet-700 ring-violet-200/70',
    dot: 'bg-violet-500',
    icon: CheckCircle,
    label: 'Reimbursed'
  },
  needs_further_review: {
    color: 'bg-orange-50 text-orange-700 ring-orange-200/70',
    dot: 'bg-orange-500',
    icon: AlertCircle,
    label: 'Needs Review'
  }
};

const sizeClasses = {
  xs: 'px-1.5 py-0.5 text-[10px]',
  sm: 'px-2 py-1 text-xs',
  md: 'px-3 py-1.5 text-sm',
  lg: 'px-4 py-2 text-base'
};

const iconSizes = {
  xs: 'w-2.5 h-2.5',
  sm: 'w-3 h-3',
  md: 'w-4 h-4',
  lg: 'w-5 h-5'
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  size = 'sm',
  showIcon = false,
  className = ''
}) => {
  // Normalize space-separated statuses from the API ("needs further review")
  // to the underscore keys used in statusConfig.
  const normalizedStatus = (typeof status === 'string'
    ? status.replace(/\s+/g, '_')
    : status) as ExpenseStatus;
  const config = statusConfig[normalizedStatus];
  
  if (!config) {
    console.warn(`[StatusBadge] Unknown status: ${status}`);
    return (
      <span className={`chip ${sizeClasses['sm']} bg-gray-50 text-gray-700 ring-gray-200 ${className}`}>
        <span className="chip-dot bg-gray-400" />
        {status}
      </span>
    );
  }

  const Icon = config.icon;

  return (
    <span
      className={`
        chip
        ${sizeClasses[size]}
        ${config.color}
        ${className}
      `}
    >
      {showIcon ? <Icon className={iconSizes[size]} /> : <span className={`chip-dot ${config.dot}`} />}
      {config.label}
    </span>
  );
};

