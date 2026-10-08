// src/components/checklist/samples/SamplesPanel.tsx
/**
 * The event's one shared sample request. Used on the booking board (admins)
 * and under My Checklist (reps). Anyone on the show edits it; saves are
 * field-level; a puller off the roster sees it read-only. History below.
 */
import React, { useEffect, useState } from 'react';
import { Package, AlertCircle, WifiOff } from 'lucide-react';
import { SAMPLE_BRAND_LABELS, SAMPLE_BRAND_ORDER } from '../../../utils/sampleRequestApi';
import { useEventSampleRequest } from './useEventSampleRequest';
import { ProductTable } from './ProductTable';
import { MaterialsTable } from './MaterialsTable';
import { SampleHistory } from './SampleHistory';
import { formatCountdown, isUrgent, formatCloseDate, formatRelative, formatShortDate } from './sampleRequestText';

/** Render as <SamplesPanel key={eventId} … />: the hook does not reset its state when eventId changes. */
interface Props {
  eventId: string; userId: string; role: string;
  /** Lets the booking board keep its 0/1 → 1/1 tab count current. */
  onStatusChange?: (status: 'draft' | 'submitted') => void;
}

const OVERRIDE = ['admin', 'coordinator', 'developer'];
const OFFLINE_TEXT = "You're offline. Reconnect to edit the sample request.";

const Notice: React.FC<{ tone: 'neutral' | 'warning'; icon: React.ReactNode; onRetry?: () => void; children: React.ReactNode }> = ({ tone, icon, onRetry, children }) => (
  <div className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-sm ${
    tone === 'warning' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-stone-200 bg-stone-50 text-stone-600'}`}>
    <div className="flex items-start gap-2">{icon}<p>{children}</p></div>
    {onRetry && <button type="button" onClick={onRetry} className="btn-secondary min-h-[44px] px-4 lg:min-h-0">Retry</button>}
  </div>
);

export const SamplesPanel: React.FC<Props> = ({ eventId, userId, role, onStatusChange }) => {
  const s = useEventSampleRequest({ eventId, userId, role });
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(t); }, []);

  const req = s.view?.request ?? null;
  const reqStatus = req?.status;
  useEffect(() => { if (reqStatus) onStatusChange?.(reqStatus); }, [reqStatus, onStatusChange]);

  if (s.status === 'forbidden') return null;

  const closesAt = s.view?.window.closesAt ?? null;
  const submitted = reqStatus === 'submitted';
  const isOverride = OVERRIDE.includes(role);
  const pastDeadline = !!closesAt && new Date(closesAt).getTime() <= now.getTime();
  const closed = s.closed || pastDeadline;
  // Never more permissive than the hook: its canEdit, and additionally read-only once the deadline passes on this clock.
  const canEdit = s.canEdit && (!pastDeadline || (isOverride && s.override));
  /**
   * The server says this viewer cannot edit: a puller off the roster, or (window closed) anyone without an
   * override role. They get no Submit button at all; an override role always has canEdit true.
   */
  const serverReadOnly = s.view?.canEdit === false;
  const viewOnly = s.status === 'ready' && !closed && !s.isOffline && serverReadOnly;

  const statusPill = closed
    ? { text: 'Closed', cls: 'bg-stone-100 text-stone-600 ring-stone-200' }
    : submitted
      ? { text: 'Submitted', cls: 'bg-accent-50 text-accent-700 ring-accent-200' }
      : { text: 'Draft', cls: 'bg-amber-50 text-amber-800 ring-amber-200' };

  const statusLine = !req ? null
    : [
        submitted && req.submittedAt ? `Submitted by ${req.submittedBy?.name ?? 'someone'} on ${formatShortDate(req.submittedAt)}` : 'Not yet submitted',
        req.lastEditedAt ? `last edited by ${req.lastEditedBy?.name ?? 'someone'} ${formatRelative(req.lastEditedAt, now)}` : null,
      ].filter(Boolean).join(' · ');

  const catalog = s.catalog;

  return (
    <section aria-label="Sample request" className="space-y-4 p-4 md:p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50">
            <Package aria-hidden="true" className="h-5 w-5 text-brand-600" />
          </span>
          <div>
            <h3 className="font-display font-semibold tracking-tight text-stone-900">Sample Request</h3>
            <p className="mt-0.5 text-sm text-stone-500">One list for the whole show. Anyone attending can update it.</p>
            {statusLine && <p className="mt-1 text-xs text-stone-500">{statusLine}</p>}
          </div>
        </div>
        {req && (
          <div className="flex items-center gap-2">
            <span className={`chip px-2 py-0.5 text-[11px] ring-1 ${statusPill.cls}`}>{statusPill.text}</span>
            {closesAt && !closed && (
              <span className={`text-xs font-semibold tabular-nums ${isUrgent(closesAt, now) ? 'text-red-600' : 'text-stone-600'}`}>
                Closes in {formatCountdown(closesAt, now)}
              </span>
            )}
          </div>
        )}
      </header>

      {s.status === 'loading' && <p className="text-sm text-stone-500">Loading sample request…</p>}

      {s.status === 'offline' && (
        <Notice tone="neutral" icon={<WifiOff aria-hidden="true" className="h-4 w-4 shrink-0" />} onRetry={s.retry}>{OFFLINE_TEXT}</Notice>
      )}

      {s.status === 'error' && (
        <Notice tone="warning" icon={<AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0" />} onRetry={s.retry}>
          Couldn't load the sample request.
        </Notice>
      )}

      {s.status === 'ready' && catalog && (
        <>
          {s.isOffline && <Notice tone="neutral" icon={<WifiOff aria-hidden="true" className="h-4 w-4 shrink-0" />}>{OFFLINE_TEXT}</Notice>}
          {viewOnly && (
            <p className="rounded-xl border border-stone-200 bg-stone-50 p-3 text-sm text-stone-600">
              View only. People attending this show can edit the list.
            </p>
          )}
          {closed && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-stone-200 bg-stone-50 p-3 text-sm text-stone-700">
              <p>Sample requests for this show closed on {closesAt ? formatCloseDate(closesAt) : 'the deadline'}. Contact your coordinator for changes.</p>
              {isOverride && (
                <label className="inline-flex items-center gap-2 text-xs font-semibold">
                  <input type="checkbox" checked={s.override} onChange={(e) => s.setOverride(e.target.checked)} />
                  Edit anyway
                </label>
              )}
            </div>
          )}
          {s.updatedBy && (
            <p className="text-xs text-brand-700" aria-live="polite">Updated by {s.updatedBy.name} {formatRelative(s.updatedBy.at, now)}</p>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            {SAMPLE_BRAND_ORDER.map((brand) => {
              const onRequest = (lineId: string) => catalog.products.some((p) => p.product_line_id === lineId && s.items.has(p.id));
              const lines = catalog.lines
                .filter((l) => l.brand === brand && (l.is_active || onRequest(l.id)))
                .sort((a, b) => a.position - b.position);
              return (
                <div key={brand} className="space-y-4 rounded-xl border border-stone-100 p-3 md:p-4">
                  <h4 className="font-display font-semibold text-stone-900">{SAMPLE_BRAND_LABELS[brand]}</h4>
                  {lines.map((line) => {
                    const products = catalog.products
                      .filter((p) => p.product_line_id === line.id && ((p.is_active && line.is_active) || s.items.has(p.id)))
                      .sort((a, b) => a.position - b.position);
                    if (products.length === 0) return null;
                    return (
                      <ProductTable key={line.id} lineName={line.name} products={products} items={s.items}
                        disabled={!canEdit} onChange={s.setItem} />
                    );
                  })}
                </div>
              );
            })}
          </div>

          <div className="rounded-xl border border-stone-100 p-3 md:p-4">
            <h4 className="mb-2 font-display font-semibold text-stone-900">Marketing &amp; booth supplies</h4>
            <MaterialsTable
              materials={catalog.materials.filter((m) => m.is_active || s.materials.has(m.id)).sort((a, b) => a.position - b.position)}
              values={s.materials} disabled={!canEdit} onChange={s.setMaterial} />
          </div>

          {!serverReadOnly && (
            <footer className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-stone-500" aria-live="polite">
                {s.error ? <span className="text-red-600">{s.error}</span>
                  : s.saving ? 'Saving…' : s.dirtyCount > 0 ? 'Unsaved changes' : 'All changes saved'}
              </p>
              <button type="button" onClick={() => { void s.submit(); }} disabled={!s.canSubmit || !canEdit} className="btn-primary min-h-[44px] px-5 lg:min-h-0">
                {s.submitting ? 'Submitting…' : submitted ? 'Resubmit changes' : 'Submit sample request'}
              </button>
            </footer>
          )}

          <SampleHistory eventId={eventId} refreshKey={req?.lastEditedAt ?? null} />
        </>
      )}
    </section>
  );
};
