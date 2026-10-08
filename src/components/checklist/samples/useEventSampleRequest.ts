// src/components/checklist/samples/useEventSampleRequest.ts
/**
 * One shared sample request per event, edited by several people at once.
 *
 * THE CONSUMER MUST KEY ITS COMPONENT BY `eventId` (<Panel key={eventId} />):
 * the state below is not reset when `eventId` changes.
 *
 * Dirty tracking is per FIELD. A field is dirty from the moment it is edited
 * until a PATCH that carried its latest edit succeeds. A PATCH holds only dirty
 * fields, and the server merges them into the row, so this client can never
 * write a value the user did not type. What is shown is always
 *   dirty field → the local value;  clean field → the last applied server view.
 *
 * Ordering, the whole of it:
 *  - Saves (PATCH, and submit = flush + POST) run one at a time on a single
 *    promise chain. At most one waiting autosave exists; it sends whatever is
 *    dirty when its turn comes.
 *  - Each save snapshots the edit revision of every field it sends. On success
 *    a field becomes clean only if its revision is unchanged, so an edit made
 *    while the save was in flight stays dirty and goes out in the next one. On
 *    failure nothing is cleaned.
 *  - GETs are never queued behind saves, so they can race them. A GET response
 *    is dropped if any save is pending when it arrives, or if a save settled
 *    after it was issued (it may have read the row before that save landed), or
 *    if a later-issued GET was already applied.
 *  - Any view older (by request.lastEditedAt) than the newest applied is ignored.
 *
 * Also: offline → read-only and flush on reconnect, 403 → forbidden,
 * 409 WINDOW_CLOSED → closed.
 *
 * A save that fails:
 *  - network error, client timeout (408), 429 or 5xx: the fields stay dirty and
 *    the next poll tick (or the next edit, or reconnecting) sends them again.
 *  - any other 4xx (400, 403, ...): the server refused these values and would
 *    refuse them again, so it is terminal. The fields that request carried stop
 *    being dirty, an error says so, and one GET is issued once the save chain
 *    is idle so the form shows the server's values (a 403 there → forbidden).
 *
 * A failed initial load (`offline` / `error`) is re-run by `retry()`, and by
 * itself when the browser comes back online.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  sampleRequestApi, SampleCatalog, EventSampleRequestView, SampleRequestItem, SampleRequestMaterial, SampleRequestPatch, MAX_SAMPLE_QTY,
} from '../../../utils/sampleRequestApi';

export type SampleStatus = 'loading' | 'ready' | 'offline' | 'error' | 'forbidden';
export type ItemField = 'singles' | 'displays' | 'emptyDisplays';
export type MaterialField = 'qty' | 'notes';
interface Args { eventId: string; userId: string; role: string }

const AUTOSAVE_MS = 800;
const POLL_MS = 30_000;
const OVERRIDE = ['admin', 'coordinator', 'developer'];
const emptyItem = (productId: string): SampleRequestItem => ({ productId, singles: 0, displays: 0, emptyDisplays: 0 });
const emptyMaterial = (materialId: string): SampleRequestMaterial => ({ materialId, qty: 0, notes: null });
const clampQty = (v: number) => Math.min(MAX_SAMPLE_QTY, Math.max(0, Math.floor(v || 0)));
const statusOf = (e: unknown): number | undefined => (e as { statusCode?: number } | null)?.statusCode;
/** The API error keeps the whole response body in `details`; the backend nests its own `details` inside that. */
const isWindowClosed = (e: unknown): boolean => {
  const d = (e as { details?: { code?: string; details?: { code?: string } } } | null)?.details;
  return statusOf(e) === 409 && (d?.code === 'WINDOW_CLOSED' || d?.details?.code === 'WINDOW_CLOSED');
};
/** The server refused the values themselves, so sending them again cannot work. 408 is the client's own timeout. */
const isRejected = (e: unknown): boolean => {
  const code = statusOf(e);
  return code !== undefined && code >= 400 && code < 500 && code !== 408 && code !== 429 && !isWindowClosed(e);
};
const REJECTED_MESSAGE = 'Your changes were not accepted. Refresh to see the current list.';
const time = (iso: string | null): number => (iso ? Date.parse(iso) : -Infinity);

/** Row id → field → revision of that field's latest edit. A field is dirty iff it has an entry. */
type Dirty<F extends string> = Map<string, Map<F, number>>;

function markDirty<F extends string>(dirty: Dirty<F>, id: string, field: F, rev: number) {
  const fields = dirty.get(id) ?? new Map<F, number>();
  fields.set(field, rev);
  dirty.set(id, fields);
}
/** After a save that succeeded or was rejected for good: a sent field is clean unless it was edited again (its revision moved on). */
function markSaved<F extends string>(dirty: Dirty<F>, sent: Dirty<F>) {
  for (const [id, sentFields] of sent) {
    const fields = dirty.get(id);
    if (!fields) continue;
    for (const [field, rev] of sentFields) if (fields.get(field) === rev) fields.delete(field);
    if (fields.size === 0) dirty.delete(id);
  }
}
const snapshot = <F extends string>(dirty: Dirty<F>): Dirty<F> => new Map([...dirty].map(([id, fields]) => [id, new Map(fields)]));
/** Just the dirty fields of each dirty row. */
function dirtyFields<R, F extends keyof R & string>(dirty: Dirty<F>, local: Map<string, R>, empty: (id: string) => R) {
  return [...dirty].map(([id, fields]) => {
    const row = local.get(id) ?? empty(id);
    const out: Partial<Pick<R, F>> = {};
    for (const field of fields.keys()) out[field] = row[field];
    return { id, fields: out };
  });
}
/** The server's rows with this client's dirty fields laid over them. A row the server does not list is zeros. */
function overlay<R, F extends keyof R & string>(
  server: R[], idOf: (r: R) => string, empty: (id: string) => R, local: Map<string, R>, dirty: Dirty<F>,
): Map<string, R> {
  const next = new Map<string, R>(server.map((r) => [idOf(r), r]));
  for (const [id, fields] of dirty) {
    const row = { ...(next.get(id) ?? empty(id)) };
    const mine = local.get(id) ?? empty(id);
    for (const field of fields.keys()) row[field] = mine[field];
    next.set(id, row);
  }
  return next;
}

export function useEventSampleRequest({ eventId, userId, role }: Args) {
  const [status, setStatus] = useState<SampleStatus>('loading');
  const [catalog, setCatalog] = useState<SampleCatalog | null>(null);
  const [view, setView] = useState<EventSampleRequestView | null>(null);
  const [items, setItems] = useState<Map<string, SampleRequestItem>>(new Map());
  const [materials, setMaterials] = useState<Map<string, SampleRequestMaterial>>(new Map());
  const [dirtyCount, setDirtyCount] = useState(0);
  const [editTick, setEditTick] = useState(0);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [closed, setClosed] = useState(false);
  const [override, setOverride] = useState(false);
  const [isOffline, setIsOffline] = useState(() => typeof navigator !== 'undefined' && navigator.onLine === false);
  const [error, setError] = useState<string | null>(null);
  const [updatedBy, setUpdatedBy] = useState<{ name: string; at: string } | null>(null);

  // The refs are the truth (always current, also inside async code); state mirrors them for rendering.
  const local = useRef({ items: new Map<string, SampleRequestItem>(), materials: new Map<string, SampleRequestMaterial>() });
  const dirty = useRef({ items: new Map() as Dirty<ItemField>, materials: new Map() as Dirty<MaterialField>, rev: 0 });
  /** The last applied view's identity and stamp; undefined until the initial load is applied. */
  const applied = useRef<{ id: string; at: string | null } | undefined>(undefined);
  const chain = useRef<Promise<boolean>>(Promise.resolve(true));   // every save, in order
  const pendingSaves = useRef(0);                                  // links on the chain that have not settled
  const waitingFlush = useRef<Promise<boolean> | null>(null);      // the one autosave that has not started yet
  const getTicket = useRef(0);                                     // number of the latest GET issued
  const getFloor = useRef(0);                                      // GETs numbered at or below this are stale
  const submittingRef = useRef(false);
  const loadTicket = useRef(0);                                    // number of the latest initial load started
  const statusRef = useRef<SampleStatus>('loading');
  statusRef.current = status;
  /** A save was rejected and the GET that restores the server's values has not been issued yet. */
  const refreshOwed = useRef(false);

  const isOverride = OVERRIDE.includes(role);
  const canEdit = status === 'ready' && !isOffline && (view?.canEdit ?? false) && (!closed || (isOverride && override));
  const request = view?.request;
  const unsubmitted = !!request && (request.status !== 'submitted' || time(request.lastEditedAt) > time(request.submittedAt) || dirtyCount > 0);
  const canSubmit = canEdit && !submitting && unsubmitted;
  const latest = useRef({ canEdit, canSubmit });
  latest.current = { canEdit, canSubmit };

  const syncDirty = useCallback(() => setDirtyCount(dirty.current.items.size + dirty.current.materials.size), []);

  /** Take a server view: clean fields follow it, dirty fields stay local. Views older than the newest applied are ignored. */
  const applyView = useCallback((v: EventSampleRequestView) => {
    const prev = applied.current;
    const at = v.request.lastEditedAt;
    if (prev && prev.id === v.request.id && time(at) < time(prev.at)) return;
    applied.current = { id: v.request.id, at };
    local.current = {
      items: overlay(v.request.items, (i) => i.productId, emptyItem, local.current.items, dirty.current.items),
      materials: overlay(v.request.materials, (m) => m.materialId, emptyMaterial, local.current.materials, dirty.current.materials),
    };
    setItems(local.current.items); setMaterials(local.current.materials);
    setView(v);
    setClosed(!v.window.isOpen);
    const by = v.request.lastEditedBy;
    // Not on the initial load (prev is undefined), but yes when the previous stamp was null (never edited).
    if (prev && at && at !== prev.at && by && by.id !== userId) setUpdatedBy({ name: by.name, at });
  }, [userId]);

  const refresh = useCallback(async () => {
    const ticket = ++getTicket.current;
    try {
      const v = await sampleRequestApi.getEvent(eventId);
      if (pendingSaves.current > 0 || ticket <= getFloor.current) return;
      getFloor.current = ticket;
      applyView(v);
    } catch (e) {
      // Access was taken away: stop showing a form. Anything else keeps the last state; the next poll tries again.
      if (statusOf(e) === 403) setStatus('forbidden');
    }
  }, [eventId, applyView]);

  /** The initial load: catalog + event. Only the latest one started may report; unmounting retires them all. */
  const load = useCallback(async () => {
    const ticket = ++loadTicket.current;
    try {
      const [c, v] = await Promise.all([sampleRequestApi.getCatalog(true), sampleRequestApi.getEvent(eventId)]);
      if (ticket !== loadTicket.current) return;
      setCatalog(c); applyView(v); setStatus('ready');
    } catch (e) {
      if (ticket !== loadTicket.current) return;
      setStatus(statusOf(e) === 403 ? 'forbidden' : (typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'error'));
    }
  }, [eventId, applyView]);

  useEffect(() => {
    void load();
    return () => { loadTicket.current += 1; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once; the consumer keys the component by eventId
  }, [eventId]);

  /** Run the initial load again after it failed. Does nothing in any other state. */
  const retry = useCallback(() => {
    if (statusRef.current !== 'offline' && statusRef.current !== 'error') return;
    statusRef.current = 'loading';
    setStatus('loading');
    void load();
  }, [load]);

  const buildPatch = useCallback((): SampleRequestPatch => ({
    items: dirtyFields(dirty.current.items, local.current.items, emptyItem).map(({ id, fields }) => ({ productId: id, ...fields })),
    materials: dirtyFields(dirty.current.materials, local.current.materials, emptyMaterial).map(({ id, fields }) => ({ materialId: id, ...fields })),
  }), []);

  /**
   * One PATCH with everything dirty right now. Never rejects; resolves false on failure. The fields stay dirty
   * unless the server rejected them for good, in which case they are dropped and a refresh is owed.
   */
  const saveOnce = useCallback(async (): Promise<boolean> => {
    const patch = buildPatch();
    if (patch.items.length === 0 && patch.materials.length === 0) return true;
    const sent = { items: snapshot(dirty.current.items), materials: snapshot(dirty.current.materials) };
    setSaving(true); setError(null);
    try {
      const v = await sampleRequestApi.patchEvent(eventId, patch);
      markSaved(dirty.current.items, sent.items); markSaved(dirty.current.materials, sent.materials);
      syncDirty();
      applyView(v);
      return true;
    } catch (e) {
      if (isWindowClosed(e)) setClosed(true);
      else if (isRejected(e)) {
        markSaved(dirty.current.items, sent.items); markSaved(dirty.current.materials, sent.materials);
        syncDirty();
        setError(REJECTED_MESSAGE);
        refreshOwed.current = true;
      } else setError('Could not save your changes. Check your connection and try again.');
      return false;
    } finally {
      setSaving(false);
    }
  }, [buildPatch, eventId, applyView, syncDirty]);

  /**
   * Run `op` after every earlier save. When it settles, every GET issued so far is stale. The refresh owed after
   * a rejected save is issued here, once no save is pending: any earlier and its response would be dropped.
   */
  const enqueue = useCallback((op: () => Promise<boolean>): Promise<boolean> => {
    pendingSaves.current += 1;
    const link = chain.current.then(op).catch(() => false).finally(() => {
      pendingSaves.current -= 1;
      getFloor.current = getTicket.current;
      if (refreshOwed.current && pendingSaves.current === 0) { refreshOwed.current = false; void refresh(); }
    });
    chain.current = link;
    return link;
  }, [refresh]);

  /** Save what is dirty, after any save in flight. Callers that arrive while one is already waiting share it. */
  const flush = useCallback((): Promise<boolean> => {
    if (waitingFlush.current) return waitingFlush.current;
    const p = enqueue(() => { waitingFlush.current = null; return saveOnce(); });
    waitingFlush.current = p;
    return p;
  }, [enqueue, saveOnce]);

  // Debounced autosave. Re-armed only by an edit or by becoming editable (reconnect, override), never by a failure.
  useEffect(() => {
    if (dirtyCount === 0 || !canEdit) return;
    const id = setTimeout(() => { void flush(); }, AUTOSAVE_MS);
    return () => clearTimeout(id);
  }, [editTick, dirtyCount, canEdit, flush]);

  // Poll + focus, once ready. With unsaved fields the tick retries the save instead (its response is a fresh view).
  useEffect(() => {
    if (status !== 'ready') return;
    const tick = () => {
      const hasDirty = dirty.current.items.size + dirty.current.materials.size > 0;
      if (hasDirty && latest.current.canEdit) void flush(); else void refresh();
    };
    window.addEventListener('focus', tick);
    const id = setInterval(tick, POLL_MS);
    return () => { window.removeEventListener('focus', tick); clearInterval(id); };
  }, [status, refresh, flush]);

  // Online / offline. Coming back online makes the form editable again, which re-arms the autosave above,
  // and re-runs an initial load that failed.
  const retryRef = useRef(retry);
  retryRef.current = retry;
  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => { setIsOffline(false); retryRef.current(); };
    window.addEventListener('offline', goOffline); window.addEventListener('online', goOnline);
    return () => { window.removeEventListener('offline', goOffline); window.removeEventListener('online', goOnline); };
  }, []);

  // Best-effort save on unmount: after whatever is in flight, send what is still dirty then.
  useEffect(() => () => {
    if (!latest.current.canEdit || dirty.current.items.size + dirty.current.materials.size === 0) return;
    void chain.current.then(() => {
      const patch = buildPatch();
      if (patch.items.length + patch.materials.length === 0) return;
      return sampleRequestApi.patchEvent(eventId, patch).then(() => undefined, () => undefined);
    });
  }, [eventId, buildPatch]);

  const edited = useCallback(() => { syncDirty(); setEditTick((t) => t + 1); }, [syncDirty]);

  const setItem = useCallback((productId: string, field: ItemField, value: number) => {
    const next = new Map(local.current.items);
    next.set(productId, { ...(next.get(productId) ?? emptyItem(productId)), [field]: clampQty(value) });
    local.current.items = next; setItems(next);
    markDirty(dirty.current.items, productId, field, ++dirty.current.rev);
    edited();
  }, [edited]);

  const setMaterial = useCallback((materialId: string, patch: Partial<Pick<SampleRequestMaterial, MaterialField>>) => {
    const row = { ...(local.current.materials.get(materialId) ?? emptyMaterial(materialId)) };
    if (patch.qty !== undefined) { row.qty = clampQty(patch.qty); markDirty(dirty.current.materials, materialId, 'qty', ++dirty.current.rev); }
    if (patch.notes !== undefined) { row.notes = patch.notes; markDirty(dirty.current.materials, materialId, 'notes', ++dirty.current.rev); }
    const next = new Map(local.current.materials).set(materialId, row);
    local.current.materials = next; setMaterials(next);
    edited();
  }, [edited]);

  /** After any save in flight: flush what is dirty; only if that worked, submit and take the returned view. */
  const submit = useCallback(async () => {
    if (!latest.current.canSubmit || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true); setError(null);
    await enqueue(async () => {
      if (!(await saveOnce())) {
        // A rejected save has already said why; do not replace its message.
        if (!refreshOwed.current) setError('Could not submit: your latest changes did not save.');
        return false;
      }
      try {
        applyView(await sampleRequestApi.submitEvent(eventId));
        return true;
      } catch (e) {
        if (isWindowClosed(e)) setClosed(true);
        else setError('Could not submit. Check your connection and try again.');
        return false;
      }
    });
    submittingRef.current = false;
    setSubmitting(false);
  }, [enqueue, saveOnce, applyView, eventId]);

  return {
    status, catalog, view, items, materials, dirtyCount, saving, submitting, closed, override, setOverride,
    canEdit, canSubmit, isOffline, error, updatedBy, setItem, setMaterial, submit, refresh, retry,
  };
}
