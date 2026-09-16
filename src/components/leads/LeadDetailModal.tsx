/**
 * One captured lead, editable, with its CRM outcome.
 *
 * The CRM error is shown verbatim: "failed" alone tells a rep nothing they can
 * act on, while "MANDATORY_NOT_FOUND: Last Name" tells them exactly which
 * field to fill before retrying.
 */

import React, { useState } from 'react';
import { BadgeScanRecord } from '../../utils/badgeApi';

const FIELDS: Array<{ key: keyof BadgeScanRecord; label: string }> = [
  { key: 'first_name', label: 'First name' },
  { key: 'last_name', label: 'Last name' },
  { key: 'company', label: 'Organization' },
  { key: 'title', label: 'Title' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'notes', label: 'Notes' },
];

interface LeadDetailModalProps {
  scan: BadgeScanRecord;
  onSave: (id: string, patch: Record<string, string>) => void;
  onRetry: (id: string) => void;
  onClose: () => void;
}

export const LeadDetailModal: React.FC<LeadDetailModalProps> = ({ scan, onSave, onRetry, onClose }) => {
  const [patch, setPatch] = useState<Record<string, string>>({});
  const value = (key: keyof BadgeScanRecord) =>
    patch[key as string] ?? ((scan[key] as string | null) ?? '');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5">
        <p className="text-sm text-stone-500">Lead for <strong>{scan.entity}</strong></p>

        {scan.crm_error && (
          <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{scan.crm_error}</p>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {FIELDS.map(({ key, label }) => (
            <label key={String(key)} className="text-sm">
              <span className="mb-1 block text-stone-600">{label}</span>
              <input
                aria-label={label}
                value={value(key)}
                onChange={(e) => setPatch((p) => ({ ...p, [key as string]: e.target.value }))}
                className="w-full rounded-lg border border-stone-300 px-3 py-2"
              />
            </label>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            onClick={() => onSave(scan.id, patch)}
            className="flex-1 rounded-lg bg-brand-600 px-4 py-3 font-medium text-white"
          >
            Save
          </button>
          {/* A skipped lead has no brand, so there is no CRM to retry against. */}
          {scan.crm_status === 'failed' && (
            <button onClick={() => onRetry(scan.id)} className="rounded-lg border border-stone-300 px-4 py-3">
              Retry CRM push
            </button>
          )}
          <button onClick={onClose} className="rounded-lg px-4 py-3 text-stone-600">Close</button>
        </div>
      </div>
    </div>
  );
};
