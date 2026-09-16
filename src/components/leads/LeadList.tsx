/**
 * The scanned-lead list. CRM status is shown per row because a 'failed' or
 * 'skipped' lead that looks identical to a synced one is how a show's leads
 * quietly go missing.
 */

import React from 'react';
import { BadgeScanRecord } from '../../utils/badgeApi';

const STATUS_STYLES: Record<BadgeScanRecord['crm_status'], string> = {
  synced: 'bg-green-100 text-green-800',
  pending: 'bg-stone-100 text-stone-700',
  failed: 'bg-red-100 text-red-800',
  skipped: 'bg-amber-100 text-amber-900',
};

const STATUS_LABELS: Record<BadgeScanRecord['crm_status'], string> = {
  synced: 'In CRM',
  pending: 'Queued',
  failed: 'CRM failed',
  skipped: 'Not synced',
};

interface LeadListProps {
  scans: BadgeScanRecord[];
  onSelect: (scan: BadgeScanRecord) => void;
}

export const LeadList: React.FC<LeadListProps> = ({ scans, onSelect }) => {
  if (scans.length === 0) {
    return <p className="py-10 text-center text-stone-500">No leads scanned yet.</p>;
  }

  return (
    <ul className="divide-y divide-stone-200">
      {scans.map((scan) => (
        <li key={scan.id}>
          <button
            onClick={() => onSelect(scan)}
            className="flex w-full items-center justify-between gap-3 py-3 text-left"
          >
            <span className="min-w-0">
              <span className="block truncate font-medium text-stone-900">
                {[scan.first_name, scan.last_name].filter(Boolean).join(' ') || 'Unnamed lead'}
              </span>
              <span className="block truncate text-sm text-stone-500">
                {scan.company || scan.email || 'No organization decoded'}
              </span>
              <span className="block text-xs text-stone-400">{scan.entity}</span>
            </span>
            <span className={`shrink-0 rounded-full px-2 py-1 text-xs ${STATUS_STYLES[scan.crm_status]}`}>
              {STATUS_LABELS[scan.crm_status]}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
};
