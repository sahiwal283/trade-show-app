import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../badgeApi', () => ({
  badgeApi: { createScan: vi.fn(async () => ({ id: 'server-1' })) },
}));

import { syncManager } from '../syncManager';
import { badgeApi } from '../badgeApi';

describe('syncManager — badgeScan entity', () => {
  beforeEach(() => vi.clearAllMocks());

  it('replays a queued scan through badgeApi and returns the server id', async () => {
    const remoteId = await (syncManager as any).syncBadgeScan({
      id: 'queue-1',
      localId: 'local-1',
      data: {
        eventId: 'ev-1', entity: 'Haute Brands', rawPayload: 'RAW',
        parserVersion: 'v1', parseConfidence: 0.9, fields: [], contact: {},
        scannedAt: '2026-09-16T14:00:00.000Z',
      },
      idempotencyKey: 'idem-1',
    });
    expect(remoteId).toBe('server-1');
  });

  it('sends the queue idempotency key as clientScanId so a replay is not a duplicate', async () => {
    // Without this, a flaky connection that retries the same queued item
    // creates a second lead for the same badge.
    await (syncManager as any).syncBadgeScan({
      id: 'queue-1', localId: 'local-1', idempotencyKey: 'idem-1',
      data: { eventId: 'ev-1', entity: 'Haute Brands', rawPayload: 'RAW' },
    });
    expect(badgeApi.createScan).toHaveBeenCalledWith(
      expect.objectContaining({ clientScanId: 'idem-1' })
    );
  });
});
