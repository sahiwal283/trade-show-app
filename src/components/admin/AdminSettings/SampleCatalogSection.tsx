// src/components/admin/AdminSettings/SampleCatalogSection.tsx
/**
 * Admin editor for the sample catalog (brand → line → product, plus the
 * shared materials list) and the sample puller setting. Retire = inactive;
 * nothing here deletes a row, because old requests still point at it.
 */
import React, { useEffect, useState } from 'react';
import { Package } from 'lucide-react';
import { api } from '../../../utils/api';
import {
  sampleRequestApi, SampleCatalog, SampleBrand, SAMPLE_BRAND_LABELS, SAMPLE_BRAND_ORDER,
} from '../../../utils/sampleRequestApi';

interface SimpleUser { id: string; name: string; is_active?: boolean }

interface RowActionsProps { busy: boolean; name: string; active: boolean; onRename: () => void; onToggle: () => void }

const RowActions: React.FC<RowActionsProps> = ({ busy, name, active, onRename, onToggle }) => (
  <span className="flex shrink-0 items-center gap-2 text-xs">
    <button type="button" disabled={busy} onClick={onRename} aria-label={`Rename ${name}`} className="text-brand-700 hover:underline">Rename</button>
    <button type="button" disabled={busy} onClick={onToggle} aria-label={`${active ? 'Retire' : 'Restore'} ${name}`} className="text-stone-500 hover:underline">
      {active ? 'Retire' : 'Restore'}
    </button>
  </span>
);

interface AddRowProps {
  busy: boolean; id: string; label: string; buttonLabel: string; draftKey: string;
  draft: Record<string, string>; onDraft: (key: string, value: string) => void; onAdd: () => void;
}

const AddRow: React.FC<AddRowProps> = ({ busy, id, label, buttonLabel, draftKey, draft, onDraft, onAdd }) => (
  <div className="mt-2 flex gap-2">
    <input id={id} aria-label={label} value={draft[draftKey] || ''} placeholder={label}
      onChange={(e) => onDraft(draftKey, e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') onAdd(); }}
      className="min-w-0 flex-1 rounded-lg border border-stone-200 px-2 py-1 text-sm" />
    <button type="button" disabled={busy} onClick={onAdd} aria-label={buttonLabel} className="btn-secondary px-3 text-sm">Add</button>
  </div>
);

export const SampleCatalogSection: React.FC = () => {
  const [catalog, setCatalog] = useState<SampleCatalog | null>(null);
  const [users, setUsers] = useState<SimpleUser[]>([]);
  const [pullerId, setPullerId] = useState<string>('');
  const [drafts, setDrafts] = useState<Record<string, string>>({}); // keyed by `line:<brand>`, `product:<lineId>`, `material`
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [c, u, s] = await Promise.all([sampleRequestApi.getCatalog(true), api.getUsers(), api.getSettings()]);
        if (cancelled) return;
        setCatalog(c);
        setUsers((Array.isArray(u) ? u : []).filter((x: SimpleUser) => x.is_active !== false));
        setPullerId((s as any)?.sample_puller_user_id?.userId ?? '');
      } catch {
        if (!cancelled) setError('Could not load the sample catalog.');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const setDraft = (key: string, value: string) => setDrafts((d) => ({ ...d, [key]: value }));

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError(null);
    try { await fn(); } catch { setError('That change did not save. Try again.'); } finally { setBusy(false); }
  };

  const savePuller = (userId: string) => run(async () => {
    setPullerId(userId);
    await api.updateSettings({ sample_puller_user_id: { userId: userId || null } });
  });

  const addLine = (brand: SampleBrand) => run(async () => {
    const name = (drafts[`line:${brand}`] || '').trim();
    if (!name) return;
    const line = await sampleRequestApi.createLine(brand, name);
    setCatalog((c) => c && { ...c, lines: [...c.lines, line] });
    setDrafts((d) => ({ ...d, [`line:${brand}`]: '' }));
  });

  const toggleLine = (id: string, isActive: boolean) => run(async () => {
    const line = await sampleRequestApi.updateLine(id, { isActive });
    setCatalog((c) => c && { ...c, lines: c.lines.map((l) => (l.id === id ? line : l)) });
  });

  const addProduct = (lineId: string) => run(async () => {
    const name = (drafts[`product:${lineId}`] || '').trim();
    if (!name) return;
    const p = await sampleRequestApi.createProduct(lineId, name);
    setCatalog((c) => c && { ...c, products: [...c.products, p] });
    setDrafts((d) => ({ ...d, [`product:${lineId}`]: '' }));
  });

  const toggleProduct = (id: string, isActive: boolean) => run(async () => {
    const p = await sampleRequestApi.updateProduct(id, { isActive });
    setCatalog((c) => c && { ...c, products: c.products.map((x) => (x.id === id ? p : x)) });
  });

  const addMaterial = () => run(async () => {
    const name = (drafts.material || '').trim();
    if (!name) return;
    const m = await sampleRequestApi.createMaterial(name);
    setCatalog((c) => c && { ...c, materials: [...c.materials, m] });
    setDrafts((d) => ({ ...d, material: '' }));
  });

  const toggleMaterial = (id: string, isActive: boolean) => run(async () => {
    const m = await sampleRequestApi.updateMaterial(id, { isActive });
    setCatalog((c) => c && { ...c, materials: c.materials.map((x) => (x.id === id ? m : x)) });
  });

  const rename = (kind: 'line' | 'product' | 'material', id: string, current: string) => run(async () => {
    const name = window.prompt('Rename', current)?.trim();
    if (!name || name === current) return;
    if (kind === 'line') { const r = await sampleRequestApi.updateLine(id, { name }); setCatalog((c) => c && { ...c, lines: c.lines.map((l) => (l.id === id ? r : l)) }); }
    if (kind === 'product') { const r = await sampleRequestApi.updateProduct(id, { name }); setCatalog((c) => c && { ...c, products: c.products.map((p) => (p.id === id ? r : p)) }); }
    if (kind === 'material') { const r = await sampleRequestApi.updateMaterial(id, { name }); setCatalog((c) => c && { ...c, materials: c.materials.map((m) => (m.id === id ? r : m)) }); }
  });

  return (
    <section className="card p-4 md:p-5 space-y-5" aria-label="Sample products">
      <header className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50">
          <Package aria-hidden="true" className="h-5 w-5 text-brand-600" />
        </span>
        <div>
          <h3 className="font-display font-semibold tracking-tight text-stone-900">Sample products</h3>
          <p className="mt-0.5 text-sm text-stone-500">What reps can request for a show, and who pulls the samples.</p>
        </div>
      </header>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <label className="block">
        <span className="micro-label">Sample puller</span>
        <select aria-label="Sample puller" value={pullerId} disabled={busy} onChange={(e) => savePuller(e.target.value)}
          className="mt-1 w-full max-w-sm rounded-lg border border-stone-200 px-3 py-2 text-sm">
          <option value="">— Not set —</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <span className="mt-1 block text-xs text-stone-500">Gets a notification every time a rep submits or re-submits a sample request.</span>
      </label>

      {catalog && (
        <div className="grid gap-4 xl:grid-cols-2">
          {SAMPLE_BRAND_ORDER.map((brand) => (
            <div key={brand} className="rounded-xl border border-stone-100 p-3 space-y-3">
              <h4 className="font-display font-semibold text-stone-900">{SAMPLE_BRAND_LABELS[brand]}</h4>
              {catalog.lines.filter((l) => l.brand === brand).sort((a, b) => a.position - b.position).map((line) => (
                <div key={line.id} className={line.is_active ? '' : 'opacity-60'}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="micro-label">{line.name}{!line.is_active && ' (retired)'}</span>
                    <RowActions busy={busy} name={line.name} active={line.is_active} onRename={() => rename('line', line.id, line.name)} onToggle={() => toggleLine(line.id, !line.is_active)} />
                  </div>
                  <ul className="mt-1 divide-y divide-stone-100">
                    {catalog.products.filter((p) => p.product_line_id === line.id).sort((a, b) => a.position - b.position).map((p) => (
                      <li key={p.id} className={`flex items-center justify-between gap-2 py-1 text-sm ${p.is_active ? '' : 'text-stone-400 line-through'}`}>
                        <span>{p.name}</span>
                        <RowActions busy={busy} name={p.name} active={p.is_active} onRename={() => rename('product', p.id, p.name)} onToggle={() => toggleProduct(p.id, !p.is_active)} />
                      </li>
                    ))}
                  </ul>
                  <AddRow busy={busy} draft={drafts} onDraft={setDraft} id={`new-product-${line.id}`} label={`New product in ${line.name}`} buttonLabel={`Add product to ${line.name}`} draftKey={`product:${line.id}`} onAdd={() => addProduct(line.id)} />
                </div>
              ))}
              <AddRow busy={busy} draft={drafts} onDraft={setDraft} id={`new-line-${brand}`} label={`New product line for ${SAMPLE_BRAND_LABELS[brand]}`} buttonLabel={`Add product line to ${SAMPLE_BRAND_LABELS[brand]}`} draftKey={`line:${brand}`} onAdd={() => addLine(brand)} />
            </div>
          ))}

          <div className="rounded-xl border border-stone-100 p-3 xl:col-span-2">
            <h4 className="font-display font-semibold text-stone-900">Marketing &amp; booth supplies</h4>
            <ul className="mt-1 divide-y divide-stone-100">
              {catalog.materials.sort((a, b) => a.position - b.position).map((m) => (
                <li key={m.id} className={`flex items-center justify-between gap-2 py-1 text-sm ${m.is_active ? '' : 'text-stone-400 line-through'}`}>
                  <span>{m.name}</span>
                  <RowActions busy={busy} name={m.name} active={m.is_active} onRename={() => rename('material', m.id, m.name)} onToggle={() => toggleMaterial(m.id, !m.is_active)} />
                </li>
              ))}
            </ul>
            <AddRow busy={busy} draft={drafts} onDraft={setDraft} id="new-material" label="New material" buttonLabel="Add material" draftKey="material" onAdd={addMaterial} />
          </div>
        </div>
      )}
    </section>
  );
};
