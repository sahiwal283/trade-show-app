/**
 * Badge Scan Service
 *
 * Owns what a badge scan is allowed to become. Three things are decided here
 * and nowhere else:
 *   - payload_hash is computed from raw_payload server-side; the client's is
 *     never trusted, because it is the dedupe key
 *   - brand is resolved from the company server-side; the client does not get
 *     to choose which CRM receives a lead
 *   - a company with no Zoho destination yields a captured, 'skipped' scan
 *     rather than a rejection
 *
 * It also owns who may SEE a scan. Role alone is not enough: every role in
 * SCAN_ROLES could otherwise read, edit and requeue any event's leads. Reads
 * and writes are scoped to events the caller participates in, with
 * VIEW_ALL_ROLES (admin, developer) exempt.
 */

import { createHash } from 'crypto';
import { badgeScanRepository, BadgeScan } from '../../database/repositories/BadgeScanRepository';
import { zohoIntegrationClient } from '../zohoIntegrationClient';
import { getPicklists } from '../picklists/PicklistService';
import { ValidationError, NotFoundError, AuthorizationError } from '../../utils/errors';
import { isEventParticipant } from '../EventParticipantService';
import { VIEW_ALL_ROLES } from '../../config/badgeScanRoles';

/** Contact fields a client may supply. Anything else is dropped. */
const CONTACT_FIELDS = [
  'badge_id', 'salutation', 'first_name', 'last_name', 'title', 'company',
  'email', 'phone', 'city', 'state', 'postal_code', 'country', 'attendee_type',
] as const;

/**
 * Whitelist a client-supplied contact object, telling "not supplied" apart
 * from "deliberately cleared".
 *
 * The parser is wrong often enough that clearing a field is a primary
 * workflow: the rep sees a mangled email, empties the box, and saves. Dropping
 * empty strings meant that column never reached the upsert, so the ON CONFLICT
 * set left the stale wrong value in the row and the rep's correction vanished.
 *
 * So: an absent key is left alone (a client can never null out a field it did
 * not send), and an explicitly-supplied empty string becomes NULL. Non-string
 * values are still dropped, as are fields outside the whitelist.
 */
function normalizeContact(
  supplied: Record<string, unknown> | undefined
): Record<string, string | null> {
  const contact: Record<string, string | null> = {};
  for (const field of CONTACT_FIELDS) {
    const value = supplied?.[field];
    if (typeof value !== 'string') continue; // absent, or not a string: untouched
    const trimmed = value.trim();
    contact[field] = trimmed === '' ? null : trimmed;
  }
  return contact;
}

/**
 * Same "cleared means NULL" rule for the edit path.
 *
 * The repository's own EDITABLE whitelist still decides which columns may be
 * written; this only rewrites an explicitly-emptied string to NULL so a
 * cleared field reads the same whether it was cleared at capture or later.
 */
function normalizeClearedFields(patch: Partial<BadgeScan>): Partial<BadgeScan> {
  const normalized: Record<string, unknown> = { ...patch };
  for (const [key, value] of Object.entries(normalized)) {
    if (typeof value === 'string' && value.trim() === '') normalized[key] = null;
  }
  return normalized as Partial<BadgeScan>;
}

/** Just enough of the authenticated user to decide event access. */
export interface ScanUser {
  id: string;
  role: string;
}

export interface CreateScanInput {
  eventId: string;
  entity: string;
  rawPayload: string;
  clientScanId?: string;
  scannedAt?: string;
  parserVersion?: string;
  parseConfidence?: number;
  barcodeFormat?: string;
  fields?: unknown;
  notes?: string;
  contact?: Record<string, unknown>;
}

export class BadgeScanService {
  async create(input: CreateScanInput, userId: string): Promise<BadgeScan> {
    const rawPayload = (input.rawPayload ?? '').trim();
    if (!rawPayload) {
      throw new ValidationError('Badge payload is empty — nothing to record');
    }
    if (!input.eventId) {
      throw new ValidationError('eventId is required');
    }

    // Replayed offline queue item: return what we already stored.
    if (input.clientScanId) {
      const existing = await badgeScanRepository.findByClientScanId(input.clientScanId);
      if (existing) return existing;
    }

    const entity = (input.entity ?? '').trim();
    const { companies } = await getPicklists();
    const known = companies.find(
      (c) => c.name.toLowerCase() === entity.toLowerCase()
    );
    if (!known) {
      throw new ValidationError(
        `Unknown company "${entity}" — pick one of: ${companies.map((c) => c.name).join(', ')}`
      );
    }

    const brand = zohoIntegrationClient.resolveBrand(entity);

    const contact = normalizeContact(input.contact);

    return badgeScanRepository.upsert({
      event_id: input.eventId,
      scanned_by: userId,
      entity: known.name, // canonical casing from the picklist
      brand,
      client_scan_id: input.clientScanId ?? null,
      raw_payload: rawPayload,
      payload_hash: createHash('sha256').update(rawPayload).digest('hex'),
      barcode_format: input.barcodeFormat || 'PDF417',
      parser_version: input.parserVersion ?? null,
      parse_confidence: input.parseConfidence ?? null,
      fields: input.fields ? JSON.stringify(input.fields) : null,
      notes: input.notes ?? null,
      scanned_at: input.scannedAt || new Date().toISOString(),
      crm_status: brand ? 'pending' : 'skipped',
      crm_error: brand
        ? null
        : `No Zoho CRM is configured for "${known.name}" — lead captured locally and included in exports`,
      ...contact,
    } as Partial<BadgeScan>);
  }

  /**
   * Whether `user` may touch leads belonging to `eventId`.
   *
   * Admins and developers (VIEW_ALL_ROLES) see every show. Everyone else —
   * including coordinators and salespeople, who all hold SCAN_ROLES — must be
   * on that event's roster. Membership is read through
   * EventParticipantService, the single owner of that relationship; this
   * service does not carry its own copy of the query.
   *
   * Refusal is 403, not 404: the caller asked about a real scan and is simply
   * not entitled to it, and masking that as "not found" would make a genuinely
   * missing row indistinguishable from a permissions problem in support.
   */
  private async assertEventAccess(user: ScanUser, eventId: string): Promise<void> {
    if ((VIEW_ALL_ROLES as readonly string[]).includes(user.role)) return;
    if (await isEventParticipant(eventId, user.id)) return;
    throw new AuthorizationError(
      'You can only view leads for events you participate in'
    );
  }

  async list(
    filters: Parameters<typeof badgeScanRepository.search>[0],
    user: ScanUser
  ): Promise<BadgeScan[]> {
    // The route already rejects an unscoped list; this is the belt to that
    // braces, so a future caller cannot bypass the check by omitting eventId.
    if (!filters.eventId) throw new ValidationError('eventId is required');
    await this.assertEventAccess(user, filters.eventId);
    return badgeScanRepository.search(filters);
  }

  async update(id: string, patch: Partial<BadgeScan>, user: ScanUser): Promise<BadgeScan> {
    const scan = await badgeScanRepository.findById(id);
    if (!scan) throw new NotFoundError('Badge scan', id);
    await this.assertEventAccess(user, scan.event_id);
    return badgeScanRepository.updateFields(id, normalizeClearedFields(patch));
  }

  async getById(id: string, user: ScanUser): Promise<BadgeScan | null> {
    const scan = await badgeScanRepository.findById(id);
    if (!scan) return null;
    await this.assertEventAccess(user, scan.event_id);
    return scan;
  }

  /**
   * A 'skipped' scan is never requeued: it has no brand, so there is no CRM
   * to push it to and a retry would spin forever.
   */
  async requeueForCrm(id: string, user: ScanUser): Promise<BadgeScan> {
    const scan = await badgeScanRepository.findById(id);
    if (!scan) throw new NotFoundError('Badge scan', id);
    await this.assertEventAccess(user, scan.event_id);
    if (!scan.brand) {
      throw new ValidationError(
        `"${scan.entity}" has no Zoho CRM configured — this lead cannot be pushed, only exported`
      );
    }
    return badgeScanRepository.requeue(id);
  }
}

export const badgeScanService = new BadgeScanService();
