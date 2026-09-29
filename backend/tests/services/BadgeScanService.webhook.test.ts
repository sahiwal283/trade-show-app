import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/database/repositories/BadgeScanRepository', () => ({
  badgeScanRepository: {
    findByClientScanId: vi.fn(async () => null),
    upsert: vi.fn(async (row: any) => ({ id: 'scan-1', ...row })),
  },
}));
vi.mock('../../src/services/picklists/PicklistService', () => ({
  getPicklists: vi.fn(async () => ({
    companies: [
      { name: 'Nirvana Kulture', zohoEnabled: true },
      { name: 'Haute Brands', zohoEnabled: true },
      { name: 'Summitt Labs', zohoEnabled: false },
    ],
  })),
}));
vi.mock('../../src/services/EventParticipantService', () => ({ isEventParticipant: vi.fn() }));

import { badgeScanRepository } from '../../src/database/repositories/BadgeScanRepository';
import { BadgeScanService } from '../../src/services/badge/BadgeScanService';

const service = new BadgeScanService();
const stored = () => vi.mocked(badgeScanRepository.upsert).mock.calls[0][0] as any;

beforeEach(() => vi.clearAllMocks());

describe('BadgeScanService.create — partner webhook status', () => {
  it('stores a Nirvana Kulture scan as owed to the webhook', async () => {
    await service.create({ eventId: 'ev-1', entity: 'Nirvana Kulture', rawPayload: 'RAW' }, 'user-1');
    expect(stored().webhook_status).toBe('pending');
  });

  it('marks every other company\'s scan skipped so it is never sent to the partner', async () => {
    await service.create({ eventId: 'ev-1', entity: 'Haute Brands', rawPayload: 'RAW' }, 'user-1');
    expect(stored().webhook_status).toBe('skipped');
    vi.clearAllMocks();
    await service.create({ eventId: 'ev-1', entity: 'Summitt Labs', rawPayload: 'RAW' }, 'user-1');
    expect(stored().webhook_status).toBe('skipped');
  });
});
