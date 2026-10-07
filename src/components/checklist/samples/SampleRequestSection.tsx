/**
 * "Sample Request" on My Checklist: one card per brand with its product
 * lines, a marketing materials card, autosaving draft, one Submit button.
 * Read-only after close (reps) with an "Edit anyway" toggle for override roles.
 */
import React, { useEffect, useState } from 'react';
import { Package, AlertCircle, WifiOff, CheckCircle2 } from 'lucide-react';
import { SAMPLE_BRAND_LABELS, SAMPLE_BRAND_ORDER, SampleBrand } from '../../../utils/sampleRequestApi';
import { useSampleRequest } from './useSampleRequest';
import { ProductTable } from './ProductTable';
import { MaterialsTable } from './MaterialsTable';
import { formatCountdown, isUrgent, formatCloseDate } from './sampleRequestText';

interface Props { eventId: string; userId: string; role: string; actorId?: string }

const OVERRIDE = ['admin', 'coordinator', 'developer'];

export const SampleRequestSection: React.FC<Props> = ({ eventId, userId, role, actorId }) => {
  const s = useSampleRequest({ eventId, userId, role, actorId });
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(t); }, []);

  const closesAt = s.view?.window.closesAt ?? null;
  const submitted = s.view?.request.status === 'submitted';

  const statusPill = s.closed
    ? { text: 'Closed', cls: 'bg-stone-100 text-stone-600 ring-stone-200' }
    : submitted
      ? { text: 'Submitted', cls: 'bg-accent-50 text-accent-700 ring-accent-200' }
      : { text: 'Draft', cls: 'bg-amber-50 text-amber-800 ring-amber-200' };

  return (
    <section aria-label="Sample request" className="card p-4 md:p-5 space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50">
            <Package aria-hidden="true" className="h-5 w-5 text-brand-600" />
          </span>
          <div>
            <h3 className="font-display font-semibold tracking-tight text-stone-900">Sample Request</h3>
            <p className="mt-0.5 text-sm text-stone-500">Products and marketing materials you need pulled for this show.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`chip px-2 py-0.5 text-[11px] ring-1 ${statusPill.cls}`}>{statusPill.text}</span>
          {closesAt && !s.closed && (
            <span className={`text-xs font-semibold tabular-nums ${isUrgent(closesAt, now) ? 'text-red-600' : 'text-stone-600'}`}>
              Closes in {formatCountdown(closesAt, now)}
            </span>
          )}
        </div>
      </header>

      {s.status === 'loading' && <p className="text-sm text-stone-500">Loading sample request…</p>}

      {s.status === 'offline' && (
        <div className="flex items-start gap-2 rounded-xl border border-stone-200 bg-stone-50 p-3 text-sm text-stone-600">
          <WifiOff aria-hidden="true" className="h-4 w-4 shrink-0" />
          <p>You're offline. Reconnect to edit your sample request.</p>
        </div>
      )}

      {s.status === 'error' && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0" />
          <p>Couldn't load the sample request. Try refreshing.</p>
        </div>
      )}

      {s.status === 'ready' && s.catalog && (
        <>
          {s.isOffline && (
            <div className="flex items-start gap-2 rounded-xl border border-stone-200 bg-stone-50 p-3 text-sm text-stone-600">
              <WifiOff aria-hidden="true" className="h-4 w-4 shrink-0" />
              <p>You're offline. Reconnect to edit your sample request.</p>
            </div>
          )}
          {s.closed && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-stone-200 bg-stone-50 p-3 text-sm text-stone-700">
              <p>
                Sample requests for this show closed on {closesAt ? formatCloseDate(closesAt) : 'the deadline'}. Contact your coordinator for changes.
              </p>
              {OVERRIDE.includes(role) && (
                <label className="inline-flex items-center gap-2 text-xs font-semibold">
                  <input type="checkbox" checked={s.override} onChange={(e) => s.setOverride(e.target.checked)} />
                  Edit anyway
                </label>
              )}
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            {SAMPLE_BRAND_ORDER.map((brand: SampleBrand) => {
              const lines = s.catalog!.lines.filter((l) => l.brand === brand);
              return (
                <div key={brand} className="rounded-xl border border-stone-100 p-3 md:p-4 space-y-4">
                  <h4 className="font-display font-semibold text-stone-900">{SAMPLE_BRAND_LABELS[brand]}</h4>
                  {lines.map((line) => {
                    const products = s.catalog!.products
                      .filter((p) => p.product_line_id === line.id && (p.is_active || s.items.has(p.id)))
                      .sort((a, b) => a.position - b.position);
                    if (products.length === 0) return null;
                    return (
                      <ProductTable key={line.id} lineName={line.name} products={products}
                        items={s.items} disabled={!s.canEdit} onChange={s.setItem} />
                    );
                  })}
                </div>
              );
            })}
          </div>

          <div className="rounded-xl border border-stone-100 p-3 md:p-4">
            <h4 className="font-display font-semibold text-stone-900 mb-2">Marketing &amp; booth supplies</h4>
            <MaterialsTable
              materials={s.catalog.materials.filter((m) => m.is_active || s.materials.has(m.id))}
              values={s.materials} disabled={!s.canEdit} onChange={s.setMaterial} />
          </div>

          <footer className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-stone-500" aria-live="polite">
              {s.error ? <span className="text-red-600">{s.error}</span>
                : s.saving ? 'Saving…' : s.dirty ? 'Unsaved changes' : submitted && s.view?.request.submitted_at
                  ? <span className="inline-flex items-center gap-1"><CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5 text-accent-600" /> Submitted {new Date(s.view.request.submitted_at).toLocaleString()}</span>
                  : 'Draft saved'}
            </p>
            <button type="button" onClick={s.submit} disabled={!s.canSubmit || !s.canEdit}
              className="btn-primary min-h-[44px] px-5 lg:min-h-0">
              {s.submitting ? 'Submitting…' : submitted ? 'Resubmit changes' : 'Submit sample request'}
            </button>
          </footer>
        </>
      )}
    </section>
  );
};
