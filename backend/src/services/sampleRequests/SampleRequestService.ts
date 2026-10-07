/**
 * Owns every sample request state transition and the authorization rules:
 *  - a rep may read/write only their own request, only while the window is open
 *  - admin/coordinator/developer may read/write anyone's, at any time
 *  - the puller (app_settings) may read the per-event summary
 * The puller is notified on submit and re-submit only. Draft saves are silent.
 */
import { query } from '../../config/database';
import { eventRepository } from '../../database/repositories/EventRepository';
import { sampleRequestRepository } from '../../database/repositories/SampleRequestRepository';
import { isEventParticipant } from '../EventParticipantService';
import { notificationService } from '../NotificationService';
import { NotFoundError, AuthorizationError, ConflictError } from '../../utils/errors';
import { computeSampleWindow } from './sampleRequestWindow';
import { validateSamplePayload } from './validateSamplePayload';
import {
  SampleWindow, SampleRequestView, SampleRequestPayload, OpenSampleRequest,
  EventSampleSummary, SummaryProduct, SummaryMaterial, canOverrideSampleWindow,
} from './types';

export interface Actor { id: string; role: string }

const fmtClose = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'n/a';

class SampleRequestService {
  private async loadEvent(eventId: string) {
    const event = await eventRepository.findById(eventId);
    if (!event) throw new NotFoundError('Event', eventId);
    return event;
  }

  async getWindowForEvent(eventId: string): Promise<SampleWindow> {
    return computeSampleWindow(await this.loadEvent(eventId));
  }

  /** Rep → own request only, and must be on the roster. Override roles → anyone on the roster. */
  private async authorizeTarget(eventId: string, targetUserId: string, actor: Actor): Promise<void> {
    if (!canOverrideSampleWindow(actor.role) && actor.id !== targetUserId) {
      throw new AuthorizationError('You can only access your own sample request');
    }
    if (!(await isEventParticipant(eventId, targetUserId))) {
      throw new AuthorizationError('User is not a participant of this event');
    }
  }

  private assertOpenOrOverride(window: SampleWindow, actor: Actor): void {
    if (window.isOpen || canOverrideSampleWindow(actor.role)) return;
    throw new ConflictError('Sample requests for this show are closed', { code: 'WINDOW_CLOSED', closesAt: window.closesAt });
  }

  async getRequest(eventId: string, targetUserId: string, actor: Actor): Promise<SampleRequestView> {
    const event = await this.loadEvent(eventId);
    await this.authorizeTarget(eventId, targetUserId, actor);
    const request = await sampleRequestRepository.upsertDraft(eventId, targetUserId);
    return { request, window: computeSampleWindow(event) };
  }

  async saveDraft(eventId: string, targetUserId: string, body: unknown, actor: Actor): Promise<SampleRequestView> {
    const event = await this.loadEvent(eventId);
    await this.authorizeTarget(eventId, targetUserId, actor);
    const window = computeSampleWindow(event);
    this.assertOpenOrOverride(window, actor);
    const payload: SampleRequestPayload = validateSamplePayload(body, await sampleRequestRepository.getCatalog(true));
    const request = await sampleRequestRepository.upsertDraft(eventId, targetUserId);
    await sampleRequestRepository.replaceContents(request.id, payload);
    return { request: { ...request, items: payload.items, materials: payload.materials }, window };
  }

  async submit(eventId: string, targetUserId: string, actor: Actor): Promise<SampleRequestView> {
    const event = await this.loadEvent(eventId);
    await this.authorizeTarget(eventId, targetUserId, actor);
    const window = computeSampleWindow(event);
    this.assertOpenOrOverride(window, actor);

    const before = await sampleRequestRepository.upsertDraft(eventId, targetUserId);
    const wasSubmitted = before.status === 'submitted';
    const row = await sampleRequestRepository.markSubmitted(before.id);

    const pullerId = await sampleRequestRepository.getPullerUserId();
    if (pullerId) {
      // The submit is already committed; a failed notification must not fail it.
      try {
        const who = await this.userName(targetUserId);
        await notificationService.notify(pullerId, {
          kind: 'sample_request.submitted',
          title: wasSubmitted ? `Sample request updated · ${event.name}` : `New sample request · ${event.name}`,
          body: `${who} ${wasSubmitted ? 'updated their' : 'submitted a'} sample request for ${event.name}.`,
          link: { page: 'samples', eventId },
        });
      } catch (e) {
        console.error('[SampleRequests] puller notify failed', e);
      }
    } else {
      console.warn(`[SampleRequests] No sample puller configured — submit for event ${eventId} by ${targetUserId} not routed`);
    }
    return { request: { ...before, ...row }, window };
  }

  async listMyOpenRequests(userId: string): Promise<OpenSampleRequest[]> {
    const events = await query(
      `SELECT e.id, e.name, e.created_at, e.travel_start_date, e.show_start_date
       FROM events e JOIN event_participants ep ON ep.event_id = e.id
       WHERE ep.user_id = $1 AND e.status <> 'cancelled'`,
      [userId]
    );
    const mine = new Map((await sampleRequestRepository.findRequestsForUser(userId)).map((r) => [r.event_id, r]));
    const out: OpenSampleRequest[] = [];
    for (const e of events.rows) {
      const w = computeSampleWindow(e);
      if (!w.isOpen || !w.closesAt) continue;
      const r = mine.get(e.id);
      out.push({ eventId: e.id, eventName: e.name, closesAt: w.closesAt, status: r?.status ?? 'none', submittedAt: r?.submitted_at ?? null });
    }
    return out.sort((a, b) => a.closesAt.localeCompare(b.closesAt));
  }

  async canViewSummary(actor: Actor): Promise<boolean> {
    if (canOverrideSampleWindow(actor.role)) return true;
    return (await sampleRequestRepository.getPullerUserId()) === actor.id;
  }

  async getEventSummary(eventId: string, actor: Actor): Promise<EventSampleSummary> {
    if (!(await this.canViewSummary(actor))) throw new AuthorizationError('Only the sample puller or a coordinator can view this summary');
    const event = await this.loadEvent(eventId);
    const [catalog, requests, items, materials, pullerUserId] = await Promise.all([
      sampleRequestRepository.getCatalog(true),
      sampleRequestRepository.findEventRequests(eventId),
      sampleRequestRepository.findEventItems(eventId),
      sampleRequestRepository.findEventMaterials(eventId),
      sampleRequestRepository.getPullerUserId(),
    ]);
    const lineById = new Map(catalog.lines.map((l) => [l.id, l]));
    const productById = new Map(catalog.products.map((p) => [p.id, p]));
    const materialById = new Map(catalog.materials.map((m) => [m.id, m]));

    const products = new Map<string, SummaryProduct>();
    for (const row of items) {
      const p = productById.get(row.product_id);
      const l = p ? lineById.get(p.product_line_id) : undefined;
      if (!p || !l) continue;
      const entry = products.get(p.id) ?? {
        productId: p.id, productName: p.name, lineId: l.id, lineName: l.name, brand: l.brand, isActive: p.is_active,
        singles: 0, displays: 0, emptyDisplays: 0, byUser: [],
      };
      entry.singles += row.singles; entry.displays += row.displays; entry.emptyDisplays += row.empty_displays;
      entry.byUser.push({ userId: row.user_id, name: row.user_name, status: row.status, singles: row.singles, displays: row.displays, emptyDisplays: row.empty_displays });
      products.set(p.id, entry);
    }

    const mats = new Map<string, SummaryMaterial>();
    for (const row of materials) {
      const m = materialById.get(row.material_id);
      if (!m) continue;
      const entry = mats.get(m.id) ?? { materialId: m.id, materialName: m.name, isActive: m.is_active, qty: 0, byUser: [] };
      entry.qty += row.qty;
      entry.byUser.push({ userId: row.user_id, name: row.user_name, status: row.status, qty: row.qty, notes: row.notes });
      mats.set(m.id, entry);
    }

    const order = (a: SummaryProduct, b: SummaryProduct) => {
      const la = lineById.get(a.lineId)!, lb = lineById.get(b.lineId)!;
      return la.brand.localeCompare(lb.brand) || la.position - lb.position || productById.get(a.productId)!.position - productById.get(b.productId)!.position;
    };

    return {
      eventId, eventName: event.name, window: computeSampleWindow(event), pullerUserId,
      participants: requests.map((r) => ({ userId: r.user_id, name: r.user_name, status: r.status ?? 'none', submittedAt: r.submitted_at })),
      products: [...products.values()].sort(order),
      materials: [...mats.values()].sort((a, b) => materialById.get(a.materialId)!.position - materialById.get(b.materialId)!.position),
    };
  }

  /** Called on event create and participant add. Ledger-first so re-adds never double-notify. */
  async announceIfOpen(eventId: string, userIds: string[]): Promise<void> {
    const event = await eventRepository.findById(eventId);
    if (!event) return;
    const window = computeSampleWindow(event);
    if (!window.isOpen || !window.closesAt) return;
    for (const userId of userIds) {
      const claimed = await query(
        `INSERT INTO sample_request_reminders (event_id, user_id, kind) VALUES ($1, $2, 'form_open')
         ON CONFLICT (event_id, user_id, kind) DO NOTHING RETURNING event_id`,
        [eventId, userId]
      );
      if (claimed.rows.length === 0) continue;
      await notificationService.notify(userId, {
        kind: 'sample_request.open',
        title: `Sample request open · ${event.name}`,
        body: `Tell us which samples you need for ${event.name}. Closes ${fmtClose(window.closesAt)} ET.`,
        link: { page: 'checklist', eventId },
      }).catch((e) => console.error('[SampleRequests] announce failed', e));
    }
  }

  private async userName(userId: string): Promise<string> {
    const r = await query(`SELECT name FROM users WHERE id = $1`, [userId]);
    return r.rows[0]?.name ?? 'A participant';
  }
}

export const sampleRequestService = new SampleRequestService();
