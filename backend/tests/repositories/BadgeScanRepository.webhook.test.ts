import { describe, it, expect, beforeEach, vi } from 'vitest';
import { query as dbQuery } from '../../src/config/database';
import { BadgeScanRepository } from '../../src/database/repositories/BadgeScanRepository';

vi.mock('../../src/config/database', () => ({ query: vi.fn() }));

const repo = new BadgeScanRepository();
const sqlOf = (call = 0) => (vi.mocked(dbQuery).mock.calls[call][0] as string).replace(/\s+/g, ' ');

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(dbQuery).mockResolvedValue({ rows: [{ id: 'scan-1' }], rowCount: 1 } as any);
});

describe('BadgeScanRepository — webhook bookkeeping', () => {
  it('writes webhook_status on insert but never resets it when a badge is rescanned', async () => {
    await repo.upsert({
      event_id: 'ev-1', entity: 'Nirvana Kulture', payload_hash: 'h', raw_payload: 'RAW',
      webhook_status: 'pending',
    } as any);
    const sql = sqlOf();
    expect(sql).toMatch(/INSERT INTO badge_scans \([^)]*webhook_status/);
    expect(sql).not.toContain('webhook_status = EXCLUDED.webhook_status');
  });

  it('claims only never-attempted rows past the grace window and failed rows within the attempt budget', async () => {
    await repo.claimPendingWebhook(50);
    const sql = sqlOf();
    expect(sql).toContain("webhook_status = 'pending' AND webhook_last_attempt_at IS NULL AND created_at < now() - interval '2 minutes'");
    expect(sql).toContain("webhook_status = 'failed' AND webhook_attempts < 5");
    expect(sql).not.toContain("'skipped'");
    expect(vi.mocked(dbQuery).mock.calls[0][1]).toEqual([50]);
  });

  it('records a delivery as delivered with the error cleared', async () => {
    await repo.markWebhookResult('scan-1', { status: 'delivered' });
    expect(sqlOf()).toContain("webhook_status = 'delivered', webhook_error = NULL");
    expect(vi.mocked(dbQuery).mock.calls[0][1]).toEqual(['scan-1']);
  });

  it('records a failure with its reason and counts the attempt', async () => {
    await repo.markWebhookResult('scan-1', { status: 'failed', error: 'HTTP 503' });
    expect(sqlOf()).toContain("webhook_status = 'failed', webhook_error = $1, webhook_attempts = webhook_attempts + 1");
    expect(vi.mocked(dbQuery).mock.calls[0][1]).toEqual(['HTTP 503', 'scan-1']);
  });
});
