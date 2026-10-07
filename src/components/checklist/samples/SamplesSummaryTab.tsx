/**
 * Puller view: every rep's request for one show, aggregated per product.
 * Drafts are counted in totals but flagged, so the puller can see what is
 * still moving. Visible to the puller, admin, coordinator, developer.
 */
import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { sampleRequestApi, EventSampleSummary, SAMPLE_BRAND_LABELS, SAMPLE_BRAND_ORDER } from '../../../utils/sampleRequestApi';
import { formatCloseDate } from './sampleRequestText';
import { SampleRequestSection } from './SampleRequestSection';

interface Props { eventId: string; actorId: string; actorRole: string }

const EDIT_ROLES = ['admin', 'coordinator', 'developer'];

export const SamplesSummaryTab: React.FC<Props> = ({ eventId, actorId, actorRole }) => {
  const [summary, setSummary] = useState<EventSampleSummary | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const loadedFor = useRef<string | null>(null);
  const summaryRef = useRef(summary);
  summaryRef.current = summary;
  const canEditOthers = EDIT_ROLES.includes(actorRole);

  useEffect(() => {
    let cancelled = false;
    const fresh = loadedFor.current !== eventId;
    loadedFor.current = eventId;
    // A show switch resets; a refresh after an edit keeps the current view (and the open editor) mounted.
    if (fresh) { setSummary(null); setFailed(false); setEditingUserId(null); }
    sampleRequestApi.getSummary(eventId)
      .then((s) => { if (!cancelled) setSummary(s); })
      .catch(() => { if (!cancelled && (fresh || !summaryRef.current)) setFailed(true); });
    return () => { cancelled = true; };
  }, [eventId, version]);

  if (failed) return <div className="card p-4 text-sm text-stone-600">Couldn't load the sample summary for this show.</div>;
  if (!summary) return <div className="card p-4 text-sm text-stone-500">Loading sample summary…</div>;

  const submitted = summary.participants.filter((p) => p.status === 'submitted').length;
  const toggle = (id: string) => setOpen((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="space-y-4">
      {!summary.pullerUserId && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0" />
          <p>No sample puller set — configure one in Admin settings so submissions are routed.</p>
        </div>
      )}

      <section className="card p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display font-semibold text-stone-900">Sample requests · {summary.eventName}</h3>
          <p className="text-xs text-stone-500">
            {summary.window.closesAt ? `${summary.window.isOpen ? 'Closes' : 'Closed'} ${formatCloseDate(summary.window.closesAt)}` : 'No deadline set'}
          </p>
        </div>
        <p className="mt-1 text-sm text-stone-600">{submitted} of {summary.participants.length} submitted</p>
        <ul className="mt-2 flex flex-wrap gap-2">
          {summary.participants.map((p) => {
            const cls = `chip px-2 py-0.5 text-[11px] ring-1 ${
              p.status === 'submitted' ? 'bg-accent-50 text-accent-700 ring-accent-200'
              : p.status === 'draft' ? 'bg-amber-50 text-amber-800 ring-amber-200' : 'bg-stone-50 text-stone-500 ring-stone-200'}`;
            const label = `${p.name} · ${p.status === 'none' ? 'not started' : p.status}`;
            return canEditOthers ? (
              <li key={p.userId}>
                <button type="button" aria-label={`Edit sample request for ${p.name}`} onClick={() => setEditingUserId(p.userId)}
                  className={`${cls} ${editingUserId === p.userId ? 'ring-2 ring-brand-500' : ''} focus-visible:ring-2 focus-visible:ring-brand-500`}>
                  {label}
                </button>
              </li>
            ) : (
              <li key={p.userId} className={cls}>{label}</li>
            );
          })}
        </ul>
      </section>

      {canEditOthers && editingUserId && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-stone-900">
              Editing {summary.participants.find((p) => p.userId === editingUserId)?.name ?? 'participant'}'s request
            </p>
            <button type="button" onClick={() => setEditingUserId(null)} className="btn-secondary px-3 py-1 text-xs">Close</button>
          </div>
          <SampleRequestSection key={editingUserId} eventId={eventId} userId={editingUserId} role={actorRole}
            actorId={actorId} onChanged={() => setVersion((v) => v + 1)} />
        </div>
      )}

      {SAMPLE_BRAND_ORDER.map((brand) => {
        const rows = summary.products.filter((p) => p.brand === brand);
        if (rows.length === 0) return null;
        return (
          <section key={brand} className="card p-4 md:p-5">
            <h3 className="font-display font-semibold text-stone-900 mb-2">{SAMPLE_BRAND_LABELS[brand]}</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-stone-400">
                  <th className="pb-1 text-left font-semibold">Item</th>
                  <th className="pb-1 text-right font-semibold">Singles</th>
                  <th className="pb-1 text-right font-semibold">Displays</th>
                  <th className="pb-1 text-right font-semibold">Empty</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <React.Fragment key={p.productId}>
                    <tr className="border-t border-stone-100">
                      <td className="py-1.5">
                        <button type="button" onClick={() => toggle(p.productId)} aria-expanded={open.has(p.productId)}
                          className="inline-flex items-center gap-1 text-left">
                          {open.has(p.productId) ? <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" /> : <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />}
                          <span className="text-stone-400 text-xs">{p.lineName} ·</span> {p.productName}
                          {!p.isActive && <span className="ml-1 text-[11px] italic text-stone-400">retired</span>}
                        </button>
                      </td>
                      <td className="py-1.5 text-right tabular-nums font-semibold">{p.singles}</td>
                      <td className="py-1.5 text-right tabular-nums font-semibold">{p.displays}</td>
                      <td className="py-1.5 text-right tabular-nums font-semibold">{p.emptyDisplays}</td>
                    </tr>
                    {open.has(p.productId) && p.byUser.map((u) => (
                      <tr key={u.userId} className="bg-stone-50 text-xs text-stone-600">
                        <td className="py-1 pl-6">{u.name} {u.status === 'draft' && <span className="ml-1 rounded bg-amber-100 px-1 text-amber-800">draft</span>}</td>
                        <td className="py-1 text-right tabular-nums">{u.singles}</td>
                        <td className="py-1 text-right tabular-nums">{u.displays}</td>
                        <td className="py-1 text-right tabular-nums">{u.emptyDisplays}</td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}

      {summary.materials.length > 0 && (
        <section className="card p-4 md:p-5">
          <h3 className="font-display font-semibold text-stone-900 mb-2">Marketing &amp; booth supplies</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-stone-400">
                <th className="pb-1 text-left font-semibold">Item</th>
                <th className="pb-1 text-right font-semibold">Qty</th>
              </tr>
            </thead>
            <tbody>
              {summary.materials.map((m) => (
                <React.Fragment key={m.materialId}>
                  <tr className="border-t border-stone-100">
                    <td className="py-1.5">
                      <button type="button" onClick={() => toggle(m.materialId)} aria-expanded={open.has(m.materialId)} className="inline-flex items-center gap-1 text-left">
                        {open.has(m.materialId) ? <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" /> : <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />}
                        {m.materialName}
                      </button>
                    </td>
                    <td className="py-1.5 text-right tabular-nums font-semibold">{m.qty}</td>
                  </tr>
                  {open.has(m.materialId) && m.byUser.map((u) => (
                    <tr key={u.userId} className="bg-stone-50 text-xs text-stone-600">
                      <td className="py-1 pl-6">{u.name}{u.notes ? <span className="ml-2 text-stone-500">— <span>{u.notes}</span></span> : null}</td>
                      <td className="py-1 text-right tabular-nums">{u.qty}</td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
};
