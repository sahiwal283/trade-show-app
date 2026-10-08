// src/components/checklist/samples/useEventSampleRequest.ts
/**
 * One shared sample request per event. Rows are tracked individually:
 * only dirty rows are PATCHed, and every server response, poll or focus
 * reconciles the rows the user is not touching (dirty or focused rows keep
 * their local values). Carries over v2.30.0 behaviour: offline → read-only
 * and flush on reconnect, 403 → forbidden, 409 → closed, submit flushes first.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  sampleRequestApi, SampleCatalog, EventSampleRequestView, SampleRequestItem, SampleRequestMaterial, SampleRequestPatch, MAX_SAMPLE_QTY,
} from '../../../utils/sampleRequestApi';

export type SampleStatus = 'loading' | 'ready' | 'offline' | 'error' | 'forbidden';
export type ItemField = 'singles' | 'displays' | 'emptyDisplays';
interface Args { eventId: string; userId: string; role: string }

const AUTOSAVE_MS = 800;
const POLL_MS = 30_000;
const OVERRIDE = ['admin', 'coordinator', 'developer'];
const emptyItem = (productId: string): SampleRequestItem => ({ productId, singles: 0, displays: 0, emptyDisplays: 0 });
const emptyMaterial = (materialId: string): SampleRequestMaterial => ({ materialId, qty: 0, notes: null });
const clampQty = (v: number) => Math.min(MAX_SAMPLE_QTY, Math.max(0, Math.floor(v || 0)));
const isWindowClosed = (e: unknown): boolean =>
  !!e && typeof e === 'object' && (e as any).statusCode === 409 &&
  ((e as any).details?.code === 'WINDOW_CLOSED' || (e as any).details?.details?.code === 'WINDOW_CLOSED');
/** Canonical form of a request's contents (zero rows dropped, notes trimmed) for submitted-vs-current comparison. */
const contentKey = (its: Iterable<SampleRequestItem>, mts: Iterable<SampleRequestMaterial>) => JSON.stringify({
  i: [...its].filter((i) => i.singles || i.displays || i.emptyDisplays).sort((a, b) => a.productId.localeCompare(b.productId)),
  m: [...mts].filter((m) => m.qty || (m.notes && m.notes.trim())).sort((a, b) => a.materialId.localeCompare(b.materialId)).map((m) => ({ ...m, notes: m.notes?.trim() || null })),
});
const isForbidden = (e: unknown): boolean => !!e && typeof e === 'object' && (e as any).statusCode === 403;

export function useEventSampleRequest({ eventId, userId, role }: Args) {
  const [status, setStatus] = useState<SampleStatus>('loading');
  const [catalog, setCatalog] = useState<SampleCatalog | null>(null);
  const [view, setView] = useState<EventSampleRequestView | null>(null);
  const [items, setItems] = useState<Map<string, SampleRequestItem>>(new Map());
  const [materials, setMaterials] = useState<Map<string, SampleRequestMaterial>>(new Map());
  const [dirtyItems, setDirtyItems] = useState<Set<string>>(new Set());
  const [dirtyMaterials, setDirtyMaterials] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [closed, setClosed] = useState(false);
  const [override, setOverride] = useState(false);
  const [isOffline, setIsOffline] = useState(() => typeof navigator !== 'undefined' && navigator.onLine === false);
  const [error, setError] = useState<string | null>(null);
  const [updatedBy, setUpdatedBy] = useState<{ name: string; at: string } | null>(null);
  const [submittedKey, setSubmittedKey] = useState<string | null>(null);

  const focused = useRef<Set<string>>(new Set());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<Promise<boolean> | null>(null);
  const lastEditedAt = useRef<string | null>(null);
  // Dirty sets live in refs (synchronously current) and are mirrored to state for rendering, so a
  // reconcile that runs right after a save or an edit never sees a stale set.
  const dirtyI = useRef<Set<string>>(new Set());
  const dirtyM = useRef<Set<string>>(new Set());
  const latest = useRef({ items, materials, dirtyItems, dirtyMaterials, canEdit: false });

  const isOverride = OVERRIDE.includes(role);
  const serverCanEdit = view?.canEdit ?? false;
  const canEdit = status === 'ready' && !isOffline && serverCanEdit && (!closed || (isOverride && override));
  const dirtyCount = dirtyItems.size + dirtyMaterials.size;
  const snapshotKey = useMemo(() => contentKey(items.values(), materials.values()), [items, materials]);
  const canSubmit = status === 'ready' && !submitting && canEdit && (submittedKey === null || snapshotKey !== submittedKey);

  /** Merge a server view into local state, keeping dirty/focused rows. */
  const reconcile = useCallback((v: EventSampleRequestView) => {
    const di = dirtyI.current, dm = dirtyM.current;
    setItems((prev) => {
      const next = new Map<string, SampleRequestItem>();
      for (const i of v.request.items) next.set(i.productId, i);
      for (const [id, local] of prev) if (di.has(id) || focused.current.has(id)) next.set(id, local);
      return next;
    });
    setMaterials((prev) => {
      const next = new Map<string, SampleRequestMaterial>();
      for (const m of v.request.materials) next.set(m.materialId, m);
      for (const [id, local] of prev) if (dm.has(id) || focused.current.has(id)) next.set(id, local);
      return next;
    });
    setView(v);
    setClosed(!v.window.isOpen);
    if (v.request.status === 'submitted' && submittedKey === null) {
      setSubmittedKey(contentKey(v.request.items, v.request.materials));
    }
    const at = v.request.lastEditedAt;
    if (at && at !== lastEditedAt.current && v.request.lastEditedBy && v.request.lastEditedBy.id !== userId && lastEditedAt.current !== null) {
      setUpdatedBy({ name: v.request.lastEditedBy.name, at });
    }
    lastEditedAt.current = at;
  }, [userId, submittedKey]);

  latest.current = { items, materials, dirtyItems: dirtyI.current, dirtyMaterials: dirtyM.current, canEdit };

  const refresh = useCallback(async () => {
    try { reconcile(await sampleRequestApi.getEvent(eventId)); } catch { /* keep last state */ }
  }, [eventId, reconcile]);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    (async () => {
      try {
        const [c, v] = await Promise.all([sampleRequestApi.getCatalog(true), sampleRequestApi.getEvent(eventId)]);
        if (cancelled) return;
        setCatalog(c); reconcile(v); setStatus('ready');
      } catch (e) {
        if (cancelled) return;
        setStatus(isForbidden(e) ? 'forbidden' : (typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'error'));
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  // Poll + focus
  useEffect(() => {
    if (status !== 'ready') return;
    const onFocus = () => { void refresh(); };
    window.addEventListener('focus', onFocus);
    const id = setInterval(() => { void refresh(); }, POLL_MS);
    return () => { window.removeEventListener('focus', onFocus); clearInterval(id); };
  }, [status, refresh]);

  const buildPatch = useCallback((): SampleRequestPatch => {
    const { items: it, materials: mt, dirtyItems: di, dirtyMaterials: dm } = latest.current;
    return {
      items: [...di].map((id) => it.get(id) ?? emptyItem(id)),
      materials: [...dm].map((id) => mt.get(id) ?? emptyMaterial(id)),
    };
  }, []);

  const persist = useCallback(async (): Promise<boolean> => {
    const patch = buildPatch();
    if (patch.items.length === 0 && patch.materials.length === 0) return true;
    const sentItems = new Set(patch.items.map((i) => i.productId));
    const sentMaterials = new Set(patch.materials.map((m) => m.materialId));
    setSaving(true); setError(null);
    try {
      const v = await sampleRequestApi.patchEvent(eventId, patch);
      // Rows edited again while in flight stay dirty; the rest are clean now.
      for (const id of sentItems) if (latest.current.items.get(id) === patch.items.find((i) => i.productId === id)) dirtyI.current.delete(id);
      for (const id of sentMaterials) if (latest.current.materials.get(id) === patch.materials.find((m) => m.materialId === id)) dirtyM.current.delete(id);
      setDirtyItems(new Set(dirtyI.current)); setDirtyMaterials(new Set(dirtyM.current));
      reconcile(v);
      return true;
    } catch (e) {
      if (isWindowClosed(e)) setClosed(true);
      else setError('Could not save your changes. Check your connection and try again.');
      return false;
    } finally {
      setSaving(false);
    }
  }, [buildPatch, eventId, reconcile]);

  // Debounced autosave
  useEffect(() => {
    if (dirtyCount === 0 || !canEdit) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const p = persist();
      pending.current = p;
      void p.finally(() => { if (pending.current === p) pending.current = null; });
    }, AUTOSAVE_MS);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [dirtyCount, canEdit, persist, snapshotKey]);

  // Online / offline
  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => { setIsOffline(false); if (latest.current.dirtyItems.size + latest.current.dirtyMaterials.size > 0) void persist(); };
    window.addEventListener('offline', goOffline); window.addEventListener('online', goOnline);
    return () => { window.removeEventListener('offline', goOffline); window.removeEventListener('online', goOnline); };
  }, [persist]);

  // Best-effort save on unmount
  useEffect(() => () => {
    const { dirtyItems: di, dirtyMaterials: dm, canEdit: ce } = latest.current;
    if (!ce || di.size + dm.size === 0) return;
    void sampleRequestApi.patchEvent(eventId, buildPatch()).catch(() => undefined);
  }, [eventId, buildPatch]);

  const setItem = useCallback((productId: string, field: ItemField, value: number) => {
    setItems((prev) => { const next = new Map(prev); next.set(productId, { ...(prev.get(productId) ?? emptyItem(productId)), [field]: clampQty(value) }); return next; });
    dirtyI.current.add(productId); setDirtyItems(new Set(dirtyI.current));
  }, []);

  const setMaterial = useCallback((materialId: string, patch: Partial<Pick<SampleRequestMaterial, 'qty' | 'notes'>>) => {
    setMaterials((prev) => {
      const next = new Map(prev); const cur = prev.get(materialId) ?? emptyMaterial(materialId);
      next.set(materialId, { ...cur, ...patch, qty: patch.qty === undefined ? cur.qty : clampQty(patch.qty) });
      return next;
    });
    dirtyM.current.add(materialId); setDirtyMaterials(new Set(dirtyM.current));
  }, []);

  const markFocused = useCallback((id: string, isFocused: boolean) => {
    if (isFocused) focused.current.add(id); else focused.current.delete(id);
  }, []);

  const submit = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true); setError(null);
    try {
      if (timer.current) clearTimeout(timer.current);
      if (pending.current) await pending.current;
      if (!(await persist())) { setError('Could not submit: your latest changes did not save.'); return; }
      const v = await sampleRequestApi.submitEvent(eventId);
      // Key off what the server holds as submitted, so reconciling the response cannot make it look edited.
      setSubmittedKey(contentKey(v.request.items, v.request.materials));
      reconcile(v);
    } catch (e) {
      if (isWindowClosed(e)) setClosed(true);
      else setError('Could not submit. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, persist, eventId, reconcile]);

  return {
    status, catalog, view, items, materials, dirtyCount, saving, submitting, closed, override, setOverride,
    canEdit, canSubmit, isOffline, error, updatedBy, setItem, setMaterial, markFocused, submit, refresh,
  };
}
