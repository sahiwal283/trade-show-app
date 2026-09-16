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
 */

import { createHash } from 'crypto';
import { badgeScanRepository, BadgeScan } from '../../database/repositories/BadgeScanRepository';
import { zohoIntegrationClient } from '../zohoIntegrationClient';
import { getPicklists } from '../picklists/PicklistService';
import { ValidationError, NotFoundError } from '../../utils/errors';

/** Contact fields a client may supply. Anything else is dropped. */
const CONTACT_FIELDS = [
  'badge_id', 'salutation', 'first_name', 'last_name', 'title', 'company',
  'email', 'phone', 'city', 'state', 'postal_code', 'country', 'attendee_type',
] as const;

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

    const contact: Record<string, unknown> = {};
    for (const field of CONTACT_FIELDS) {
      const value = input.contact?.[field];
      if (typeof value === 'string' && value.trim()) contact[field] = value.trim();
    }

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

  async list(filters: Parameters<typeof badgeScanRepository.search>[0]): Promise<BadgeScan[]> {
    return badgeScanRepository.search(filters);
  }

  async update(id: string, patch: Partial<BadgeScan>): Promise<BadgeScan> {
    return badgeScanRepository.updateFields(id, patch);
  }

  async getById(id: string): Promise<BadgeScan | null> {
    return badgeScanRepository.findById(id);
  }

  /**
   * A 'skipped' scan is never requeued: it has no brand, so there is no CRM
   * to push it to and a retry would spin forever.
   */
  async requeueForCrm(id: string): Promise<BadgeScan> {
    const scan = await badgeScanRepository.findById(id);
    if (!scan) throw new NotFoundError('Badge scan', id);
    if (!scan.brand) {
      throw new ValidationError(
        `"${scan.entity}" has no Zoho CRM configured — this lead cannot be pushed, only exported`
      );
    }
    return badgeScanRepository.requeue(id);
  }
}

export const badgeScanService = new BadgeScanService();
