import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadgeScanRepository } from '../../src/database/repositories/BadgeScanRepository';
import { query as dbQuery } from '../../src/config/database';

vi.mock('../../src/config/database', () => ({ query: vi.fn() }));

const row = (over = {}) => ({
  id: 'scan-1', event_id: 'ev-1', entity: 'Haute Brands', brand: 'haute_brands',
  raw_payload: 'RAW', payload_hash: 'hash-1', crm_status: 'pending',
  crm_attempts: 0, ...over,
});

const ok = (rows: any[]) =>
  ({ rows, command: 'SELECT', rowCount: rows.length, oid: 0, fields: [] } as any);

describe('BadgeScanRepository', () => {
  let repo: BadgeScanRepository;
  beforeEach(() => { repo = new BadgeScanRepository(); vi.clearAllMocks(); });

  describe('upsert', () => {
    it('conflicts on all three dedupe columns, not just the payload hash', async () => {
      vi.mocked(dbQuery).mockResolvedValue(ok([row()]));
      await repo.upsert({ event_id: 'ev-1', entity: 'Haute Brands', raw_payload: 'RAW', payload_hash: 'hash-1' });
      const sql = vi.mocked(dbQuery).mock.calls[0][0] as string;
      expect(sql).toContain('ON CONFLICT (event_id, entity, payload_hash)');
    });

    it('preserves notes already on the row when the same badge is re-scanned', async () => {
      // A rep re-scans a badge they already noted. Overwriting the note with
      // NULL would silently destroy the only human-authored field on the lead.
      vi.mocked(dbQuery).mockResolvedValue(ok([row({ notes: 'wants samples' })]));
      await repo.upsert({ event_id: 'ev-1', entity: 'Haute Brands', raw_payload: 'RAW', payload_hash: 'hash-1' });
      const sql = vi.mocked(dbQuery).mock.calls[0][0] as string;
      expect(sql).toContain('notes = COALESCE(EXCLUDED.notes, badge_scans.notes)');
    });

    it('never writes a row without its raw payload', async () => {
      await expect(
        repo.upsert({ event_id: 'ev-1', entity: 'Haute Brands', payload_hash: 'h' } as any)
      ).rejects.toThrow(/raw_payload/i);
      expect(dbQuery).not.toHaveBeenCalled();
    });

    it('emits exactly one notes assignment when notes is in the payload', async () => {
      // If the repository emits BOTH a generic 'notes = EXCLUDED.notes' and the
      // COALESCE form, Postgres rejects with "multiple assignments to same column".
      // This test would have caught the bug where notes was not filtered out.
      vi.mocked(dbQuery).mockResolvedValue(ok([row({ notes: 'user note' })]));
      await repo.upsert({
        event_id: 'ev-1', entity: 'Haute Brands', raw_payload: 'RAW',
        payload_hash: 'hash-1', notes: 'user note'
      });
      const sql = vi.mocked(dbQuery).mock.calls[0][0] as string;
      expect(sql.match(/notes =/g)).toHaveLength(1);
      expect(sql).toContain('notes = COALESCE(EXCLUDED.notes, badge_scans.notes)');
      expect(sql).not.toContain('notes = EXCLUDED.notes');
    });
  });

  describe('upsert re-arming the CRM failure notification', () => {
    it('clears crm_failure_notified_at when the re-scan resets crm_status', async () => {
      // Otherwise a re-scan puts the lead back to pending, the retried push
      // fails for good, and the scanner is never told a second time.
      vi.mocked(dbQuery).mockResolvedValue(ok([row()]));
      await repo.upsert({
        event_id: 'ev-1', entity: 'Haute Brands', raw_payload: 'RAW', payload_hash: 'hash-1', crm_status: 'pending',
      });
      const sql = vi.mocked(dbQuery).mock.calls[0][0] as string;
      expect(sql).toContain('crm_status = EXCLUDED.crm_status');
      expect(sql).toContain('crm_failure_notified_at = NULL');
    });

    it('leaves crm_failure_notified_at alone when crm_status is not written', async () => {
      vi.mocked(dbQuery).mockResolvedValue(ok([row()]));
      await repo.upsert({ event_id: 'ev-1', entity: 'Haute Brands', raw_payload: 'RAW', payload_hash: 'hash-1' });
      expect(vi.mocked(dbQuery).mock.calls[0][0] as string).not.toContain('crm_failure_notified_at');
    });
  });

  describe('claimPendingByBrand', () => {
    it('claims pending and retry-eligible scans but never skipped ones', async () => {
      vi.mocked(dbQuery).mockResolvedValue(ok([row()]));
      await repo.claimPendingByBrand(100);
      const sql = vi.mocked(dbQuery).mock.calls[0][0] as string;
      expect(sql).toContain("crm_status = 'pending'");
      expect(sql).toContain("crm_status = 'failed'");
      expect(sql).not.toContain("'skipped'");
      expect(sql).toContain('brand IS NOT NULL');
    });

    it('stops retrying after 5 attempts', async () => {
      vi.mocked(dbQuery).mockResolvedValue(ok([]));
      await repo.claimPendingByBrand(100);
      const sql = vi.mocked(dbQuery).mock.calls[0][0] as string;
      expect(sql).toContain('crm_attempts < 5');
    });
  });

  describe('search', () => {
    it('filters by event and company with parameterized values', async () => {
      vi.mocked(dbQuery).mockResolvedValue(ok([row()]));
      await repo.search({ eventId: 'ev-1', entity: 'Haute Brands' });
      const [sql, params] = vi.mocked(dbQuery).mock.calls[0] as [string, any[]];
      expect(sql).toContain('event_id = $1');
      expect(sql).toContain('entity = $2');
      expect(params).toEqual(['ev-1', 'Haute Brands']);
    });
  });

  describe('markPushResult', () => {
    it('spends one attempt on an ordinary failure, leaving room to retry', async () => {
      vi.mocked(dbQuery).mockResolvedValue(ok([]));
      await repo.markPushResult('scan-1', { status: 'failed', error: 'INVALID_DATA' });
      const sql = vi.mocked(dbQuery).mock.calls[0][0] as string;
      expect(sql).toContain('crm_attempts = crm_attempts + 1');
    });

    it('burns the whole attempt budget on a terminal failure so it never auto-retries', async () => {
      // An emailless lead whose push outcome Zoho never confirmed: retrying
      // is how you end up with two CRM records for one attendee. claimPending
      // filters on crm_attempts < 5, so this row stops being reclaimed while
      // the manual retry button (which resets attempts) still works.
      vi.mocked(dbQuery).mockResolvedValue(ok([]));
      await repo.markPushResult('scan-1', { status: 'failed', error: 'timeout', terminal: true });
      const sql = vi.mocked(dbQuery).mock.calls[0][0] as string;
      expect(sql).toContain('crm_attempts = 5');
      expect(sql).not.toContain('crm_attempts + 1');
    });
  });

  describe('CRM failure notifications', () => {
    it('claims exhausted, un-notified scans in one statement and returns them', async () => {
      vi.mocked(dbQuery).mockResolvedValue(ok([{ id: 'scan-1', scanned_by: 'u-1', first_name: 'A', last_name: 'B', company: 'C' }]));
      const claimed = await repo.claimExhaustedForNotification();
      expect(claimed).toHaveLength(1);
      const sql = vi.mocked(dbQuery).mock.calls[0][0] as string;
      expect(sql).toMatch(/UPDATE badge_scans\s+SET crm_failure_notified_at = CURRENT_TIMESTAMP/);
      expect(sql).toContain("crm_status = 'failed'");
      expect(sql).toContain('crm_attempts >= 5');
      expect(sql).toContain('crm_failure_notified_at IS NULL');
      expect(sql).toContain('RETURNING id, scanned_by, first_name, last_name, company');
    });

    it('a manual retry re-arms the notification', async () => {
      vi.mocked(dbQuery).mockResolvedValue(ok([row()]));
      await repo.requeue('scan-1');
      expect(vi.mocked(dbQuery).mock.calls[0][0] as string).toContain('crm_failure_notified_at = NULL');
    });
  });
});
