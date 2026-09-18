/**
 * Post-scan review.
 *
 * Below the confidence threshold the fields are presented as corrections to
 * make, not facts to accept. This is also where the badge-identity problem
 * gets handled: the one confirmed sample decoded to a different person than
 * the name printed on the badge, so the rep must always be able to fix the
 * record while that person is still standing in front of them.
 */

import React, { useEffect, useState } from 'react';
import { AlertTriangle, Copy } from 'lucide-react';
import { ScannedBadge } from './BadgeScanner';
import { REVIEW_CONFIDENCE_THRESHOLD, BadgeField } from '../../utils/badge/parseBadgePayload';
import { BadgeScanRecord } from '../../utils/badgeApi';
import { formatLabel } from '../../utils/badge/decodeBadge';

const EDITABLE_FIELDS: Array<{ key: BadgeField; label: string }> = [
  { key: 'first_name', label: 'First name' },
  { key: 'last_name', label: 'Last name' },
  { key: 'company', label: 'Organization' },
  { key: 'title', label: 'Title' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'postal_code', label: 'ZIP' },
  { key: 'country', label: 'Country' },
  { key: 'badge_id', label: 'Badge ID' },
  { key: 'attendee_type', label: 'Attendee type' },
];

interface ScanReviewSheetProps {
  entity: string;
  badge: ScannedBadge | null;
  duplicateOf: BadgeScanRecord | null;
  onSave: (contact: Record<string, string>, notes: string, andScanNext: boolean) => void;
  onCancel: () => void;
}

export const ScanReviewSheet: React.FC<ScanReviewSheetProps> = ({
  entity, badge, duplicateOf, onSave, onCancel,
}) => {
  const [contact, setContact] = useState<Record<string, string>>(
    () => ({ ...(badge?.parsed.fields ?? {}) } as Record<string, string>)
  );
  const [notes, setNotes] = useState('');

  // Defensive reset: if this component is ever reused for a different badge
  // without unmounting (today's LeadsPage always unmounts between scans, but
  // a future render-cost optimisation could change that), the form must not
  // keep showing the previous person's edited fields. Keying on
  // `badge?.rawPayload` — rather than the badge object reference — means a
  // re-render with an equivalent badge (same payload, new object identity)
  // does not clobber in-progress edits the rep is mid-typing.
  useEffect(() => {
    setContact({ ...(badge?.parsed.fields ?? {}) } as Record<string, string>);
    setNotes('');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed on payload identity only
  }, [badge?.rawPayload]);

  if (!badge) return null;

  const lowConfidence = badge.parsed.confidence < REVIEW_CONFIDENCE_THRESHOLD;
  // A vendor profile URL or an opaque registration code maps to nothing. The
  // rep needs to see that the scan worked and what it held before typing.
  const nothingMapped =
    badge.parsed.parserVersion !== 'manual' && Object.keys(badge.parsed.fields).length === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
      <div className="max-h-[90vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 sm:max-w-lg sm:rounded-2xl">
        <p className="text-sm text-stone-500">
          Lead for <strong>{entity}</strong>
        </p>

        {duplicateOf && (
          <div className="mt-3 flex gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900" role="alert">
            <Copy className="h-4 w-4 shrink-0" />
            <span>
              Already scanned - {duplicateOf.first_name} {duplicateOf.last_name}. Saving
              updates that lead instead of creating a second one.
            </span>
          </div>
        )}

        {nothingMapped ? (
          <div className="mt-3 rounded-lg bg-stone-100 p-3 text-sm" role="status">
            <span className="block text-stone-600">
              Scanned a {formatLabel(badge.format)} but recognized no contact fields. Fill them in from the badge.
            </span>
            <code className="mt-1 block break-all text-stone-800">{badge.rawPayload}</code>
          </div>
        ) : lowConfidence && (
          <div className="mt-3 flex gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900" role="status">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>Low-confidence decode - check these fields before saving.</span>
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {EDITABLE_FIELDS.map(({ key, label }) => (
            <label key={key} className="text-sm">
              <span className="mb-1 block text-stone-600">{label}</span>
              <input
                aria-label={label}
                value={contact[key] ?? ''}
                onChange={(e) => setContact((c) => ({ ...c, [key]: e.target.value }))}
                className="w-full rounded-lg border border-stone-300 px-3 py-2"
              />
            </label>
          ))}
        </div>

        <label className="mt-3 block text-sm">
          <span className="mb-1 block text-stone-600">Notes</span>
          <textarea
            aria-label="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-stone-300 px-3 py-2"
          />
        </label>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            onClick={() => onSave(contact, notes, true)}
            className="flex-1 rounded-lg bg-brand-600 px-4 py-3 font-medium text-white"
          >
            Save &amp; scan next
          </button>
          <button
            onClick={() => onSave(contact, notes, false)}
            className="rounded-lg border border-stone-300 px-4 py-3"
          >
            Save
          </button>
          <button onClick={onCancel} className="rounded-lg px-4 py-3 text-stone-600">
            Discard
          </button>
        </div>
      </div>
    </div>
  );
};
