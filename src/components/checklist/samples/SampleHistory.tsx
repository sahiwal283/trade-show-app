// src/components/checklist/samples/SampleHistory.tsx
/**
 * Collapsible change history for an event's sample request. Loads when
 * opened and again whenever refreshKey changes while open. A failure here
 * never affects editing.
 */
import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { sampleRequestApi } from '../../../utils/sampleRequestApi';
import type { SampleChangeRow } from '../../../utils/sampleRequestApi';
import { describeChange, formatRelative } from './sampleRequestText';

interface Props { eventId: string; refreshKey: string | null }

export const SampleHistory: React.FC<Props> = ({ eventId, refreshKey }) => {
  const [open, setOpen] = useState(false);
  const [changes, setChanges] = useState<SampleChangeRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    sampleRequestApi.getHistory(eventId)
      .then((r) => { if (!cancelled) { setChanges(r.changes || []); setFailed(false); } })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [open, eventId, refreshKey]);

  return (
    <div className="rounded-xl border border-stone-100 p-3 md:p-4">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="inline-flex items-center gap-1 font-display font-semibold text-stone-900">
        {open ? <ChevronDown aria-hidden="true" className="h-4 w-4" /> : <ChevronRight aria-hidden="true" className="h-4 w-4" />}
        History
      </button>
      {open && (
        failed ? <p className="mt-2 text-sm text-stone-500">History unavailable.</p>
        : changes === null ? <p className="mt-2 text-sm text-stone-500">Loading history…</p>
        : changes.length === 0 ? <p className="mt-2 text-sm text-stone-500">No changes yet.</p>
        : (
          <ul className="mt-2 divide-y divide-stone-100 text-sm">
            {changes.map((c) => (
              <li key={c.id} className="flex flex-wrap items-baseline justify-between gap-2 py-1.5">
                <span className="text-stone-700">{describeChange(c)}</span>
                <span className="text-[11px] text-stone-400">{formatRelative(c.changedAt)}</span>
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
};
