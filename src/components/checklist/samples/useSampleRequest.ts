/**
 * Draft state for one user's sample request on one show. Autosaves ~800ms
 * after the last change; submit flushes any pending save first. The draft
 * is a Map keyed by product/material id so the table can render every
 * catalog row and read its numbers in O(1).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  sampleRequestApi, SampleCatalog, SampleRequestView, SampleRequestPayload,
  SampleRequestItem, SampleRequestMaterial,
} from '../../../utils/sampleRequestApi';

export type SampleStatus = 'loading' | 'ready' | 'offline' | 'error';
export type ItemField = 'singles' | 'displays' | 'emptyDisplays';

interface Args { eventId: string; userId: string; role: string; actorId?: string }

const AUTOSAVE_MS = 800;
const OVERRIDE = ['admin', 'coordinator', 'developer'];

const emptyItem = (productId: string): SampleRequestItem => ({ productId, singles: 0, displays: 0, emptyDisplays: 0 });
const emptyMaterial = (materialId: string): SampleRequestMaterial => ({ materialId, qty: 0, notes: null });

function toPayload(items: Map<string, SampleRequestItem>, materials: Map<string, SampleRequestMaterial>): SampleRequestPayload {
  return {
    items: [...items.values()].filter((i) => i.singles > 0 || i.displays > 0 || i.emptyDisplays > 0),
    materials: [...materials.values()].filter((m) => m.qty > 0 || (m.notes && m.notes.trim().length > 0)),
  };
}
const serialize = (p: SampleRequestPayload): string =>
  JSON.stringify({
    items: [...p.items].sort((a, b) => a.productId.localeCompare(b.productId)),
    materials: [...p.materials].sort((a, b) => a.materialId.localeCompare(b.materialId)).map((m) => ({ ...m, notes: m.notes?.trim() || null })),
  });

/**
 * The frontend AppError carries the WHOLE response body as `details`, and the
 * backend wraps the code as `{ error, details: { code } }`, so the code sits
 * at `details.details.code` in the browser. Accept both shapes.
 */
const isWindowClosed = (e: unknown): boolean => {
  if (!e || typeof e !== 'object') return false;
  const err = e as { statusCode?: number; details?: { code?: string; details?: { code?: string } } };
  return err.statusCode === 409 &&
    (err.details?.code === 'WINDOW_CLOSED' || err.details?.details?.code === 'WINDOW_CLOSED');
};

export function useSampleRequest({ eventId, userId, role, actorId }: Args) {
  const onBehalf = !!actorId && actorId !== userId && OVERRIDE.includes(role);
  const api = useMemo(() => ({
    get: () => (onBehalf ? sampleRequestApi.getForUser(eventId, userId) : sampleRequestApi.getMine(eventId)),
    save: (p: SampleRequestPayload) => (onBehalf ? sampleRequestApi.saveForUser(eventId, userId, p) : sampleRequestApi.saveMine(eventId, p)),
    submit: () => (onBehalf ? sampleRequestApi.submitForUser(eventId, userId) : sampleRequestApi.submitMine(eventId)),
  }), [eventId, userId, onBehalf]);

  const [status, setStatus] = useState<SampleStatus>('loading');
  const [catalog, setCatalog] = useState<SampleCatalog | null>(null);
  const [view, setView] = useState<SampleRequestView | null>(null);
  const [items, setItems] = useState<Map<string, SampleRequestItem>>(new Map());
  const [materials, setMaterials] = useState<Map<string, SampleRequestMaterial>>(new Map());
  const [savedKey, setSavedKey] = useState('');          // last payload persisted as draft
  const [submittedKey, setSubmittedKey] = useState<string | null>(null); // payload at last submit
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [closed, setClosed] = useState(false);
  const [override, setOverride] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<Promise<void> | null>(null);

  const payload = useMemo(() => toPayload(items, materials), [items, materials]);
  const key = useMemo(() => serialize(payload), [payload]);
  const dirty = key !== savedKey;
  const canSubmit = status === 'ready' && !submitting && (submittedKey === null || key !== submittedKey);
  const canEdit = status === 'ready' && (!closed || (OVERRIDE.includes(role) && override));

  const applyView = useCallback((v: SampleRequestView) => {
    const im = new Map(v.request.items.map((i) => [i.productId, i]));
    const mm = new Map(v.request.materials.map((m) => [m.materialId, m]));
    setView(v);
    setItems(im);
    setMaterials(mm);
    const k = serialize(toPayload(im, mm));
    setSavedKey(k);
    setSubmittedKey(v.request.status === 'submitted' ? k : null);
    setClosed(!v.window.isOpen);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    (async () => {
      try {
        const [c, v] = await Promise.all([sampleRequestApi.getCatalog(), api.get()]);
        if (cancelled) return;
        setCatalog(c);
        applyView(v);
        setStatus('ready');
      } catch {
        if (cancelled) return;
        setStatus(typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'error');
      }
    })();
    return () => { cancelled = true; };
  }, [api, applyView]);

  const persist = useCallback(async (): Promise<void> => {
    if (!dirty) return;
    setSaving(true);
    setError(null);
    try {
      const v = await api.save(payload);
      setSavedKey(key);
      setView((prev) => (prev ? { ...prev, window: v.window } : v));
    } catch (e) {
      if (isWindowClosed(e)) setClosed(true);
      else setError('Could not save your changes. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  }, [api, dirty, payload, key]);

  // Debounced autosave
  useEffect(() => {
    if (!dirty || !canEdit) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { pending.current = persist(); }, AUTOSAVE_MS);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [dirty, canEdit, persist]);

  const setItem = useCallback((productId: string, field: ItemField, value: number) => {
    setItems((prev) => {
      const next = new Map(prev);
      next.set(productId, { ...(prev.get(productId) ?? emptyItem(productId)), [field]: Math.max(0, Math.floor(value || 0)) });
      return next;
    });
  }, []);

  const setMaterial = useCallback((materialId: string, patch: Partial<Pick<SampleRequestMaterial, 'qty' | 'notes'>>) => {
    setMaterials((prev) => {
      const next = new Map(prev);
      const cur = prev.get(materialId) ?? emptyMaterial(materialId);
      next.set(materialId, { ...cur, ...patch, qty: patch.qty === undefined ? cur.qty : Math.max(0, Math.floor(patch.qty || 0)) });
      return next;
    });
  }, []);

  const submit = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      if (timer.current) clearTimeout(timer.current);
      await persist();
      if (pending.current) await pending.current;
      const v = await api.submit();
      setView(v);
      setSubmittedKey(key);
      setSavedKey(key);
      setClosed(!v.window.isOpen);
    } catch (e) {
      if (isWindowClosed(e)) setClosed(true);
      else setError('Could not submit. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }, [api, canSubmit, persist, key]);

  return {
    status, catalog, view, items, materials, dirty, saving, submitting, closed, override, setOverride,
    canEdit, canSubmit, error, setItem, setMaterial, submit,
  };
}
