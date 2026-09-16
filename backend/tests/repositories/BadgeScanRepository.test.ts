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
});
