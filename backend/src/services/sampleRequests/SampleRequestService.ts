/**
 * One shared sample request per event, owned by the event's roster.
 *  - any participant edits (and submits) while the window is open; override roles (admin/coordinator/developer) any time, even after close
 *  - the puller (app_settings) can read but not write unless also on the roster or an override role
 *  - the puller is notified on submit and re-submit only. Row patches are silent.
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
  SampleWindow, SampleRequestRow, EventSampleRequest, EventSampleRequestView, SampleRequestPayload,
  OpenSampleRequest, SampleChangeRow, canOverrideSampleWindow,
} from './types';

export interface Actor { id: string; role: string }

const fmtClose = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'n/a';

interface Access { isParticipant: boolean; isOverride: boolean; isPuller: boolean; pullerId: string | null }

class SampleRequestService {
  private async loadEvent(eventId: string) {
    const event = await eventRepository.findById(eventId);
    if (!event) throw new NotFoundError('Event', eventId);
    return event;
  }

  private async access(eventId: string, actor: Actor): Promise<Access> {
    const [isParticipant, pullerId] = await Promise.all([
      isEventParticipant(eventId, actor.id),
      sampleRequestRepository.getPullerUserId(),
    ]);
    return { isParticipant, isOverride: canOverrideSampleWindow(actor.role), isPuller: pullerId === actor.id, pullerId };
  }

  private canView(a: Access): boolean { return a.isParticipant || a.isOverride || a.isPuller; }
  private canEdit(a: Access, window: SampleWindow): boolean {
    if (a.isOverride) return true;
    return a.isParticipant && window.isOpen;
  }

  async getWindowForEvent(eventId: string): Promise<SampleWindow> {
    return computeSampleWindow(await this.loadEvent(eventId));
  }

  async canViewSamples(eventId: string, actor: Actor): Promise<boolean> {
    await this.loadEvent(eventId);
    return this.canView(await this.access(eventId, actor));
  }

  async canEditSamples(eventId: string, actor: Actor): Promise<boolean> {
    const [event, a] = await Promise.all([this.loadEvent(eventId), this.access(eventId, actor)]);
    return this.canEdit(a, computeSampleWindow(event));
  }

  private async toView(row: SampleRequestRow, window: SampleWindow, canEdit: boolean): Promise<EventSampleRequestView> {
    const [contents, users] = await Promise.all([
      sampleRequestRepository.getContents(row.id),
      sampleRequestRepository.userRefs([row.submitted_by, row.last_edited_by]),
    ]);
    const request: EventSampleRequest = {
      id: row.id, eventId: row.event_id, status: row.status,
      submittedAt: row.submitted_at, submittedBy: row.submitted_by ? users.get(row.submitted_by) ?? null : null,
      lastEditedAt: row.last_edited_at, lastEditedBy: row.last_edited_by ? users.get(row.last_edited_by) ?? null : null,
      items: contents.items, materials: contents.materials,
    };
    return { request, window, canEdit };
  }

  private async ensureRow(eventId: string, actor: Actor): Promise<SampleRequestRow> {
    return (await sampleRequestRepository.findByEvent(eventId)) ?? sampleRequestRepository.upsertEventDraft(eventId, actor.id);
  }

  async getForEvent(eventId: string, actor: Actor): Promise<EventSampleRequestView> {
    const event = await this.loadEvent(eventId);
    const a = await this.access(eventId, actor);
    if (!this.canView(a)) throw new AuthorizationError('You are not on this show');
    const window = computeSampleWindow(event);
    const row = await this.ensureRow(eventId, actor);
    return this.toView(row, window, this.canEdit(a, window));
  }

  private async guardEdit(eventId: string, actor: Actor) {
    const event = await this.loadEvent(eventId);
    const a = await this.access(eventId, actor);
    if (!this.canView(a)) throw new AuthorizationError('You are not on this show');
    const window = computeSampleWindow(event);
    if (!a.isOverride && !a.isParticipant) throw new AuthorizationError('Only participants can edit the sample request');
    if (!a.isOverride && !window.isOpen) {
      throw new ConflictError('Sample requests for this show are closed', { code: 'WINDOW_CLOSED', closesAt: window.closesAt });
    }
    return { event, window, a };
  }

  async patchRows(eventId: string, body: unknown, actor: Actor): Promise<EventSampleRequestView> {
    const { window, a } = await this.guardEdit(eventId, actor);
    const patch: SampleRequestPayload = validateSamplePayload(body, await sampleRequestRepository.getCatalog(true));
    const row = await this.ensureRow(eventId, actor);
    await sampleRequestRepository.applyRows(row.id, actor.id, patch);
    const fresh = (await sampleRequestRepository.findByEvent(eventId)) ?? row;
    return this.toView(fresh, window, this.canEdit(a, window));
  }

  async submit(eventId: string, actor: Actor): Promise<EventSampleRequestView> {
    const { event, window, a } = await this.guardEdit(eventId, actor);
    const before = await this.ensureRow(eventId, actor);
    const wasSubmitted = before.status === 'submitted';
    const row = await sampleRequestRepository.markSubmitted(before.id, actor.id);

    const pullerId = a.pullerId;
    if (pullerId) {
      try {
        const who = await this.userName(actor.id);
        await notificationService.notify(pullerId, {
          kind: 'sample_request.submitted',
          title: wasSubmitted ? `Sample request updated · ${event.name}` : `New sample request · ${event.name}`,
          body: `${who} ${wasSubmitted ? 'updated the' : 'submitted the'} sample request for ${event.name}.`,
          link: { page: 'samples', eventId },
        });
      } catch (error) {
        console.error('[SampleRequests] puller notify failed', error);
      }
    } else {
      console.warn(`[SampleRequests] No sample puller configured — submit for event ${eventId} by ${actor.id} not routed`);
    }
    return this.toView(row, window, this.canEdit(a, window));
  }

  async getHistory(eventId: string, actor: Actor): Promise<SampleChangeRow[]> {
    await this.loadEvent(eventId);
    const a = await this.access(eventId, actor);
    if (!this.canView(a)) throw new AuthorizationError('You are not on this show');
    const row = await sampleRequestRepository.findByEvent(eventId);
    if (!row) return [];
    return sampleRequestRepository.listChanges(row.id, 200);
  }

  async listMyOpenRequests(userId: string): Promise<OpenSampleRequest[]> {
    const events = await query(
      `SELECT e.id, e.name, e.created_at, e.travel_start_date, e.show_start_date
       FROM events e JOIN event_participants ep ON ep.event_id = e.id
       WHERE ep.user_id = $1 AND e.status <> 'cancelled'`,
      [userId]
    );
    const open = events.rows.map((e: any) => ({ e, w: computeSampleWindow(e) })).filter(({ w }) => w.isOpen && w.closesAt);
    const statuses = new Map((await sampleRequestRepository.findStatusByEvents(open.map(({ e }) => e.id))).map((s) => [s.event_id, s]));
    return open
      .map(({ e, w }) => {
        const s = statuses.get(e.id);
        // An auto-created draft nobody has touched is not "started" for the dashboard.
        const untouched = !s || (s.status === 'draft' && s.last_edited_at == null);
        return { eventId: e.id, eventName: e.name, closesAt: w.closesAt as string, status: (untouched || !s ? 'none' : s.status) as OpenSampleRequest['status'], submittedAt: s?.submitted_at ?? null };
      })
      .sort((x, y) => x.closesAt.localeCompare(y.closesAt));
  }

  /** Called on event create/update and participant add. Ledger-first so re-adds never double-notify. */
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
        body: `Tell us which samples the team needs for ${event.name}. Closes ${fmtClose(window.closesAt)} ET.`,
        link: { page: 'samples', eventId },
      }).catch((e) => console.error('[SampleRequests] announce failed', e));
    }
  }

  private async userName(userId: string): Promise<string> {
    const r = await query(`SELECT name FROM users WHERE id = $1`, [userId]);
    return r.rows[0]?.name ?? 'A participant';
  }
}

export const sampleRequestService = new SampleRequestService();
