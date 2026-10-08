// src/components/checklist/samples/SamplesPanel.tsx
/**
 * The event's one shared sample request. Used on the booking board (admins)
 * and under My Checklist (reps). Anyone on the show edits it; saves are
 * field-level; a puller off the roster sees it read-only. History below.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Package, AlertCircle, WifiOff, Clock, Lock, Eye, Check, Loader2, RefreshCw, CircleDashed } from 'lucide-react';
import { SAMPLE_BRAND_LABELS, SAMPLE_BRAND_ORDER } from '../../../utils/sampleRequestApi';
import { useEventSampleRequest } from './useEventSampleRequest';
import { ProductTable } from './ProductTable';
import type { ProductGroup } from './ProductTable';
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

const Notice: React.FC<{ tone: 'neutral' | 'warning'; icon: React.ReactNode; onRetry?: () => void; action?: React.ReactNode; children: React.ReactNode }> = ({ tone, icon, onRetry, action, children }) => (
  <div className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border px-3.5 py-3 text-sm ${
    tone === 'warning' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-stone-200 bg-stone-50 text-stone-700'}`}>
    <div className="flex min-w-0 items-start gap-2.5">
      <span className={`mt-0.5 shrink-0 ${tone === 'warning' ? 'text-amber-600' : 'text-stone-500'}`}>{icon}</span>
      <p className="min-w-0 leading-snug">{children}</p>
    </div>
    {action}
    {onRetry && <button type="button" onClick={onRetry} className="btn-secondary px-4">Retry</button>}
  </div>
);

const ICON = 'h-4 w-4';

const SectionHeader: React.FC<{ title: string; count: number; noun: string }> = ({ title, count, noun }) => (
  <div className="mb-3 flex items-baseline justify-between gap-3">
    <h4 className="font-display text-base font-semibold tracking-tight text-stone-900">{title}</h4>
    <p className={`text-xs tabular-nums ${count > 0 ? 'font-medium text-brand-700' : 'text-stone-500'}`}>
      {count > 0 ? `${count} ${noun}${count === 1 ? '' : 's'} requested` : 'Nothing requested yet'}
    </p>
  </div>
);

const Stat: React.FC<{ label: string; short?: string; value: number }> = ({ label, short, value }) => (
  <div className="min-w-0 px-2.5 py-2.5 sm:px-4">
    <dt className="truncate text-[10px] font-semibold uppercase tracking-wide text-stone-500 sm:text-[11px] sm:tracking-wider">
      {short ? <><span className="sm:hidden">{short}</span><span className="hidden sm:inline">{label}</span></> : label}
    </dt>
    <dd className={`mt-0.5 font-display text-xl font-semibold tabular-nums ${value > 0 ? 'text-stone-900' : 'text-stone-400'}`}>{value}</dd>
  </div>
);

const Skeleton: React.FC = () => (
  <div role="status" className="animate-pulse space-y-4 motion-reduce:animate-none">
    <p className="sr-only">Loading sample request…</p>
    <div className="h-16 rounded-xl bg-stone-100" />
    <div className="grid gap-x-10 gap-y-6 lg:grid-cols-2">
      {[0, 1].map((c) => (
        <div key={c} className="space-y-2.5">
          <div className="h-5 w-32 rounded bg-stone-100" />
          {[0, 1, 2, 3, 4, 5].map((r) => <div key={r} className="h-9 rounded-lg bg-stone-100" />)}
        </div>
      ))}
    </div>
  </div>
);

export const SamplesPanel: React.FC<Props> = ({ eventId, userId, role, onStatusChange }) => {
  const s = useEventSampleRequest({ eventId, userId, role });
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(t); }, []);

  const req = s.view?.request ?? null;
  const reqStatus = req?.status;
  // Reported once per status value. The callback lives in a ref so a parent passing a new function on every
  // render (and setting state in it) cannot make this fire again and loop.
  const onStatusChangeRef = useRef(onStatusChange);
  useEffect(() => { onStatusChangeRef.current = onStatusChange; });
  useEffect(() => { if (reqStatus) onStatusChangeRef.current?.(reqStatus); }, [reqStatus]);

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
   * override role. They get no Submit button; an override role always has canEdit true. The save-state line
   * is a separate matter: an error or unsaved fields are shown to everyone.
   */
  const serverReadOnly = s.view?.canEdit === false;
  const viewOnly = s.status === 'ready' && !closed && !s.isOffline && serverReadOnly;
  /**
   * Error first, then what is happening to the user's edits. Offline edits are sent on reconnect, so they are
   * merely unsaved; edits stranded by a closed window or lost access will not be sent. A viewer who cannot
   * edit and has nothing pending gets no line.
   */
  const stateLine = (icon: React.ReactNode, text: string, cls: string) => (
    <span className={`inline-flex items-center gap-1.5 ${cls}`}>{icon}<span>{text}</span></span>
  );
  const saveState: React.ReactNode = s.error ? stateLine(<AlertCircle aria-hidden="true" className={`${ICON} shrink-0`} />, s.error, 'font-medium text-red-700')
    : s.saving ? stateLine(<Loader2 aria-hidden="true" className={`${ICON} shrink-0 animate-spin motion-reduce:animate-none`} />, 'Saving…', 'text-stone-600')
    : s.dirtyCount > 0 ? (canEdit || s.isOffline
        ? stateLine(<CircleDashed aria-hidden="true" className={`${ICON} shrink-0`} />, 'Unsaved changes', 'text-stone-600')
        : stateLine(<AlertCircle aria-hidden="true" className={`${ICON} shrink-0`} />, 'These changes were not saved.', 'font-medium text-amber-800'))
    : serverReadOnly ? null : stateLine(<Check aria-hidden="true" className={`${ICON} shrink-0 text-accent-600`} />, 'All changes saved', 'text-stone-600');

  const statusPill = closed
    ? { text: 'Closed', cls: 'bg-stone-100 text-stone-700 ring-stone-200', dot: 'bg-stone-400' }
    : submitted
      ? { text: 'Submitted', cls: 'bg-accent-50 text-accent-800 ring-accent-200/70', dot: 'bg-accent-500' }
      : { text: 'Draft', cls: 'bg-amber-50 text-amber-800 ring-amber-200/70', dot: 'bg-amber-500' };

  const statusLine = !req ? null
    : [
        submitted && req.submittedAt ? `Submitted by ${req.submittedBy?.name ?? 'someone'} on ${formatShortDate(req.submittedAt)}` : 'Not yet submitted',
        req.lastEditedAt ? `last edited by ${req.lastEditedBy?.name ?? 'someone'} ${formatRelative(req.lastEditedAt, now)}` : null,
      ].filter(Boolean).join(' · ');

  const catalog = s.catalog;

  // What is on the request right now, for the summary strip and the per-section counts.
  const itemRows = [...s.items.values()];
  const requestedIds = new Set(itemRows.filter((i) => i.singles > 0 || i.displays > 0 || i.emptyDisplays > 0).map((i) => i.productId));
  const totals = itemRows.reduce((t, i) => ({ singles: t.singles + i.singles, displays: t.displays + i.displays, empty: t.empty + i.emptyDisplays }),
    { singles: 0, displays: 0, empty: 0 });
  const suppliesRequested = [...s.materials.values()].filter((m) => m.qty > 0).length;
  const urgent = !!closesAt && isUrgent(closesAt, now);

  return (
    <section aria-label="Sample request" className="p-4 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 ring-1 ring-inset ring-brand-100">
            <Package aria-hidden="true" className="h-5 w-5 text-brand-600" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <h3 className="font-display text-lg font-semibold tracking-tight text-stone-900">Sample Request</h3>
              {req && (
                <span className={`chip px-2 py-0.5 text-xs ${statusPill.cls}`}>
                  <span aria-hidden="true" className={`chip-dot ${statusPill.dot}`} />{statusPill.text}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-sm leading-snug text-stone-600">One list for the whole show. Anyone attending can update it.</p>
            {statusLine && <p className="mt-1 text-xs text-stone-500">{statusLine}</p>}
          </div>
        </div>
        {req && closesAt && !closed && (
          <div className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 ${urgent ? 'border-red-200 bg-red-50' : 'border-stone-200 bg-stone-50'}`}>
            <Clock aria-hidden="true" className={`h-4 w-4 shrink-0 ${urgent ? 'text-red-600' : 'text-stone-500'}`} />
            <div className="leading-tight">
              <p className={`text-sm font-semibold tabular-nums ${urgent ? 'text-red-700' : 'text-stone-900'}`}>Closes in {formatCountdown(closesAt, now)}</p>
              <p className={`text-xs ${urgent ? 'text-red-700' : 'text-stone-500'}`}>{formatCloseDate(closesAt)}</p>
            </div>
          </div>
        )}
      </header>

      <div className="mt-5 space-y-5">
      {s.status === 'loading' && <Skeleton />}

      {s.status === 'offline' && (
        <Notice tone="neutral" icon={<WifiOff aria-hidden="true" className={ICON} />} onRetry={s.retry}>{OFFLINE_TEXT}</Notice>
      )}

      {s.status === 'error' && (
        <Notice tone="warning" icon={<AlertCircle aria-hidden="true" className={ICON} />} onRetry={s.retry}>
          Couldn't load the sample request.
        </Notice>
      )}

      {s.status === 'ready' && catalog && (
        <>
          {s.isOffline && <Notice tone="neutral" icon={<WifiOff aria-hidden="true" className={ICON} />}>{OFFLINE_TEXT}</Notice>}
          {viewOnly && (
            <Notice tone="neutral" icon={<Eye aria-hidden="true" className={ICON} />}>
              View only. People attending this show can edit the list.
            </Notice>
          )}
          {closed && (
            <Notice tone="neutral" icon={<Lock aria-hidden="true" className={ICON} />}
              action={isOverride && (
                <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg px-1 text-sm font-medium text-stone-800 lg:min-h-0">
                  <input type="checkbox" className="h-4 w-4 rounded border-stone-300 accent-brand-600" checked={s.override} onChange={(e) => s.setOverride(e.target.checked)} />
                  Edit anyway
                </label>
              )}>
              Sample requests for this show closed on {closesAt ? formatCloseDate(closesAt) : 'the deadline'}. Contact your coordinator for changes.
            </Notice>
          )}

          <dl aria-label="Request totals" className="grid grid-cols-4 divide-x divide-stone-200 rounded-xl border border-stone-200 bg-stone-50/70">
            <Stat label="Products" value={requestedIds.size} />
            <Stat label="Singles" value={totals.singles} />
            <Stat label="Displays" value={totals.displays} />
            <Stat label="Empty displays" short="Empty" value={totals.empty} />
          </dl>

          {s.updatedBy && (
            <p className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700" aria-live="polite">
              <RefreshCw aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
              <span>Updated by {s.updatedBy.name} {formatRelative(s.updatedBy.at, now)}</span>
            </p>
          )}

          {/* Two columns at lg: brand one with supplies beneath it, brand two alongside. One column, in reading order, below that. */}
          <div className="grid gap-x-10 gap-y-8 lg:grid-cols-2 lg:grid-rows-[auto_1fr]">
            {SAMPLE_BRAND_ORDER.map((brand, idx) => {
              const onRequest = (lineId: string) => catalog.products.some((p) => p.product_line_id === lineId && s.items.has(p.id));
              const groups: ProductGroup[] = catalog.lines
                .filter((l) => l.brand === brand && (l.is_active || onRequest(l.id)))
                .sort((a, b) => a.position - b.position)
                .map((line) => ({
                  line,
                  products: catalog.products
                    .filter((p) => p.product_line_id === line.id && ((p.is_active && line.is_active) || s.items.has(p.id)))
                    .sort((a, b) => a.position - b.position),
                }))
                .filter((g) => g.products.length > 0);
              const count = groups.reduce((n, g) => n + g.products.filter((p) => requestedIds.has(p.id)).length, 0);
              return (
                <div key={brand} className={idx === 0 ? 'lg:col-start-1 lg:row-start-1' : 'lg:col-start-2 lg:row-span-2 lg:row-start-1'}>
                  <SectionHeader title={SAMPLE_BRAND_LABELS[brand]} count={count} noun="product" />
                  <ProductTable groups={groups} items={s.items} disabled={!canEdit} onChange={s.setItem} />
                </div>
              );
            })}

            <div className="lg:col-start-1 lg:row-start-2">
              <SectionHeader title="Marketing &amp; booth supplies" count={suppliesRequested} noun="item" />
              <MaterialsTable
                materials={catalog.materials.filter((m) => m.is_active || s.materials.has(m.id)).sort((a, b) => a.position - b.position)}
                values={s.materials} disabled={!canEdit} onChange={s.setMaterial} />
            </div>
          </div>

          {(saveState || !serverReadOnly) && (
            <footer className="sticky bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-10 -mx-4 flex flex-col gap-x-4 gap-y-2 border-y sm:flex-row sm:items-center sm:justify-between border-stone-200 bg-white/95 px-4 py-3 backdrop-blur-sm md:-mx-6 md:px-6 lg:bottom-0">
              <p className="text-sm" aria-live="polite">{saveState}</p>
              {!serverReadOnly && (
                <button type="button" onClick={() => { void s.submit(); }} disabled={!s.canSubmit || !canEdit} className="btn-primary w-full px-5 sm:w-auto">
                  {s.submitting ? 'Submitting…' : submitted ? 'Resubmit changes' : 'Submit sample request'}
                </button>
              )}
            </footer>
          )}

          <SampleHistory eventId={eventId} refreshKey={req?.lastEditedAt ?? null} />
        </>
      )}
      </div>
    </section>
  );
};
