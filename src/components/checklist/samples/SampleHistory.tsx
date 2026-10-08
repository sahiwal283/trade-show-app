// src/components/checklist/samples/SampleHistory.tsx
/**
 * Collapsible change history for an event's sample request. Loads when
 * opened and again whenever refreshKey changes while open. A failure here
 * never affects editing.
 */
import React, { useEffect, useState } from 'react';
import { ChevronDown, History } from 'lucide-react';
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
    <div>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="-mx-2 inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-stone-700 transition-colors hover:bg-stone-100 hover:text-stone-900 lg:min-h-0 lg:py-1.5">
        <History aria-hidden="true" className="h-4 w-4 text-stone-500" />
        History
        <ChevronDown aria-hidden="true" className={`h-4 w-4 text-stone-500 transition-transform duration-200 motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        failed ? <p className="mt-2 text-sm text-stone-600">History unavailable.</p>
        : changes === null ? <p className="mt-2 text-sm text-stone-600">Loading history…</p>
        : changes.length === 0 ? <p className="mt-2 text-sm text-stone-600">No changes yet.</p>
        : (
          <ul className="mt-2 divide-y divide-stone-100 text-sm">
            {changes.map((c) => (
              <li key={c.id} className="flex items-baseline justify-between gap-4 py-2">
                <span className="min-w-0 leading-snug text-stone-700">{describeChange(c)}</span>
                <span className="shrink-0 whitespace-nowrap text-xs tabular-nums text-stone-500">{formatRelative(c.changedAt)}</span>
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
};
