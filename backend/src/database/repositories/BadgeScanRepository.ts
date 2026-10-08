/**
 * Badge Scan Repository
 *
 * All SQL for badge_scans. Two invariants live here rather than in callers:
 * raw_payload is never written empty, and the dedupe conflict target is all
 * three columns (event_id, entity, payload_hash) — two brands at one booth
 * may both legitimately claim the same attendee.
 */

import { BaseRepository } from './BaseRepository';

export interface BadgeScan {
  id: string;
  event_id: string;
  scanned_by: string | null;
  entity: string;
  brand: string | null;
  client_scan_id: string | null;
  raw_payload: string;
  payload_hash: string;
  barcode_format: string;
  parser_version: string | null;
  parse_confidence: string | null;
  badge_id: string | null;
  salutation: string | null;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  attendee_type: string | null;
  fields: unknown;
  notes: string | null;
  crm_status: 'pending' | 'synced' | 'failed' | 'skipped';
  crm_record_id: string | null;
  crm_error: string | null;
  crm_attempts: number;
  crm_last_attempt_at: string | null;
  webhook_status: 'pending' | 'delivered' | 'failed' | 'skipped';
  webhook_error: string | null;
  webhook_attempts: number;
  webhook_last_attempt_at: string | null;
  scanned_at: string;
  created_at: string;
  updated_at: string;
}

export interface BadgeScanFilters {
  eventId?: string;
  entity?: string;
  crmStatus?: string;
  q?: string;
}

/** What the failure notification needs to name a lead. */
export interface ExhaustedScan {
  id: string;
  scanned_by: string | null;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
}

export interface PushResult {
  status: 'synced' | 'failed';
  crmRecordId?: string;
  error?: string;
  /**
   * Stop auto-retry by burning the whole attempt budget at once.
   *
   * For an outcome Zoho never confirmed (a timeout mid-call) on a record that
   * carries no dedupe key, retrying is how you get two CRM records for one
   * attendee. Such a row is parked as 'failed' for a human to inspect; the
   * manual retry button still works, because requeue() resets attempts to 0
   * and that is a deliberate decision rather than a blind replay.
   */
  terminal?: boolean;
}

export type WebhookResult =
  | { status: 'delivered' }
  | { status: 'failed'; error: string };

/** Columns a caller may write. Anything else in the payload is ignored. */
const WRITABLE = [
  'event_id', 'scanned_by', 'entity', 'brand', 'client_scan_id',
  'raw_payload', 'payload_hash', 'barcode_format', 'parser_version',
  'parse_confidence', 'badge_id', 'salutation', 'first_name', 'last_name',
  'title', 'company', 'email', 'phone', 'city', 'state', 'postal_code',
  'country', 'attendee_type', 'fields', 'notes', 'crm_status', 'crm_error',
  'webhook_status', 'scanned_at',
] as const;

/** Parsed contact columns a user may correct after the fact. */
const EDITABLE = [
  'badge_id', 'salutation', 'first_name', 'last_name', 'title', 'company',
  'email', 'phone', 'city', 'state', 'postal_code', 'country',
  'attendee_type', 'notes',
] as const;

const MAX_CRM_ATTEMPTS = 5;
const MAX_WEBHOOK_ATTEMPTS = 5;
/**
 * A freshly stored scan is delivered straight from the create route; the
 * sweep must not race that attempt and send the same scan twice, so a
 * never-attempted row is only claimable once it is old enough for the
 * immediate attempt to have settled or died with the process.
 */
const WEBHOOK_IMMEDIATE_GRACE = "interval '2 minutes'";

export class BadgeScanRepository extends BaseRepository<BadgeScan> {
  protected tableName = 'badge_scans';

  async upsert(data: Partial<BadgeScan>): Promise<BadgeScan> {
    if (!data.raw_payload) {
      throw new Error('BadgeScanRepository.upsert: raw_payload is required and is never discarded');
    }
    const cols = WRITABLE.filter((c) => data[c] !== undefined);
    const params = cols.map((c) => data[c]);

    // Re-scanning a badge updates the decoded fields but must not erase a
    // human-authored note, so notes coalesce rather than overwrite. Nor does
    // it reset webhook_status: the partner already received this badge, and
    // a rescan is not a new lead.
    const updates = cols
      .filter((c) => !['event_id', 'entity', 'payload_hash', 'client_scan_id', 'notes', 'webhook_status'].includes(c))
      .map((c) => `${c} = EXCLUDED.${c}`);

    // Always preserve existing notes, even if not explicitly updated.
    // When no note is supplied, COALESCE(NULL, badge_scans.notes) preserves the existing one.
    updates.push('notes = COALESCE(EXCLUDED.notes, badge_scans.notes)');
    updates.push('updated_at = CURRENT_TIMESTAMP');

    const result = await this.executeQuery<BadgeScan>(
      `INSERT INTO badge_scans (${cols.join(', ')})
       VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})
       ON CONFLICT (event_id, entity, payload_hash)
       DO UPDATE SET ${updates.join(', ')}
       RETURNING *`,
      params as any[]
    );
    return result.rows[0];
  }

  async findByClientScanId(clientScanId: string): Promise<BadgeScan | null> {
    const result = await this.executeQuery<BadgeScan>(
      'SELECT * FROM badge_scans WHERE client_scan_id = $1',
      [clientScanId]
    );
    return result.rows[0] || null;
  }

  async search(filters: BadgeScanFilters): Promise<BadgeScan[]> {
    const where: string[] = [];
    const params: unknown[] = [];

    if (filters.eventId) { params.push(filters.eventId); where.push(`event_id = $${params.length}`); }
    if (filters.entity) { params.push(filters.entity); where.push(`entity = $${params.length}`); }
    if (filters.crmStatus) { params.push(filters.crmStatus); where.push(`crm_status = $${params.length}`); }
    if (filters.q) {
      params.push(`%${filters.q}%`);
      where.push(`(first_name ILIKE $${params.length} OR last_name ILIKE $${params.length}
                   OR company ILIKE $${params.length} OR email ILIKE $${params.length})`);
    }

    const result = await this.executeQuery<BadgeScan>(
      `SELECT * FROM badge_scans
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY scanned_at DESC`,
      params as any[]
    );
    return result.rows;
  }

  async updateFields(id: string, data: Partial<BadgeScan>): Promise<BadgeScan> {
    const cols = EDITABLE.filter((c) => data[c] !== undefined);
    if (cols.length === 0) {
      const existing = await this.findById(id);
      if (!existing) throw new Error(`Badge scan ${id} not found`);
      return existing;
    }
    const params = cols.map((c) => data[c]);
    params.push(id);
    const result = await this.executeQuery<BadgeScan>(
      `UPDATE badge_scans
          SET ${cols.map((c, i) => `${c} = $${i + 1}`).join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE id = $${params.length}
        RETURNING *`,
      params as any[]
    );
    return result.rows[0];
  }

  /**
   * Scans eligible for a CRM push, newest brand-grouped work first. 'skipped'
   * rows are deliberately excluded: they have no destination by design, and
   * claiming them would burn retry attempts against a CRM that will never
   * exist for that company.
   */
  async claimPendingByBrand(limit: number): Promise<BadgeScan[]> {
    const result = await this.executeQuery<BadgeScan>(
      `SELECT * FROM badge_scans
        WHERE brand IS NOT NULL
          AND (
            crm_status = 'pending'
            OR (
              crm_status = 'failed'
              AND crm_attempts < ${MAX_CRM_ATTEMPTS}
              AND (
                crm_last_attempt_at IS NULL
                OR crm_last_attempt_at < now() - (interval '1 minute' * power(3, crm_attempts))
              )
            )
          )
        ORDER BY brand, scanned_at ASC
        LIMIT $1`,
      [limit]
    );
    return result.rows;
  }

  /**
   * Hand a scan back to the push worker. Attempts reset to zero: a human
   * asking for a retry usually means the cause was fixed (a token minted, a
   * field mapping corrected), so the old backoff is no longer meaningful.
   */
  async requeue(id: string): Promise<BadgeScan> {
    const result = await this.executeQuery<BadgeScan>(
      `UPDATE badge_scans
          SET crm_status = 'pending', crm_error = NULL, crm_attempts = 0,
              crm_last_attempt_at = NULL, crm_failure_notified_at = NULL,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *`,
      [id]
    );
    return result.rows[0];
  }

  async markPushResult(id: string, result: PushResult): Promise<void> {
    if (result.status === 'synced') {
      await this.executeQuery(
        `UPDATE badge_scans
            SET crm_status = 'synced', crm_record_id = $1, crm_error = NULL,
                crm_attempts = crm_attempts + 1,
                crm_last_attempt_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE id = $2`,
        [result.crmRecordId ?? null, id]
      );
      return;
    }
    await this.executeQuery(
      `UPDATE badge_scans
          SET crm_status = 'failed', crm_error = $1,
              crm_attempts = ${result.terminal ? MAX_CRM_ATTEMPTS : 'crm_attempts + 1'},
              crm_last_attempt_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2`,
      [result.error ?? 'Unknown CRM error', id]
    );
  }

  /**
   * Scans that have used every CRM attempt and whose scanner has not been
   * told yet. Marking and returning happen in one statement, so two passes
   * can never both pick up the same scan.
   */
  async claimExhaustedForNotification(): Promise<ExhaustedScan[]> {
    const result = await this.executeQuery<ExhaustedScan>(
      `UPDATE badge_scans
          SET crm_failure_notified_at = CURRENT_TIMESTAMP
        WHERE crm_status = 'failed'
          AND crm_attempts >= ${MAX_CRM_ATTEMPTS}
          AND crm_failure_notified_at IS NULL
        RETURNING id, scanned_by, first_name, last_name, company`
    );
    return result.rows;
  }

  /**
   * Scans owed to a partner webhook: never-attempted rows past the immediate
   * attempt's grace, plus failed rows whose backoff has elapsed. 'skipped'
   * rows are not targets by design and 'delivered' rows are done.
   */
  async claimPendingWebhook(limit: number): Promise<BadgeScan[]> {
    const result = await this.executeQuery<BadgeScan>(
      `SELECT * FROM badge_scans
        WHERE brand IS NOT NULL
          AND (
            (
              webhook_status = 'pending'
              AND webhook_last_attempt_at IS NULL
              AND created_at < now() - ${WEBHOOK_IMMEDIATE_GRACE}
            )
            OR (
              webhook_status = 'failed'
              AND webhook_attempts < ${MAX_WEBHOOK_ATTEMPTS}
              AND webhook_last_attempt_at < now() - (interval '1 minute' * power(3, webhook_attempts))
            )
          )
        ORDER BY scanned_at ASC
        LIMIT $1`,
      [limit]
    );
    return result.rows;
  }

  async markWebhookResult(id: string, result: WebhookResult): Promise<void> {
    if (result.status === 'delivered') {
      await this.executeQuery(
        `UPDATE badge_scans
            SET webhook_status = 'delivered', webhook_error = NULL,
                webhook_attempts = webhook_attempts + 1,
                webhook_last_attempt_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE id = $1`,
        [id]
      );
      return;
    }
    await this.executeQuery(
      `UPDATE badge_scans
          SET webhook_status = 'failed', webhook_error = $1,
              webhook_attempts = webhook_attempts + 1,
              webhook_last_attempt_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2`,
      [result.error, id]
    );
  }
}

export const badgeScanRepository = new BadgeScanRepository();
