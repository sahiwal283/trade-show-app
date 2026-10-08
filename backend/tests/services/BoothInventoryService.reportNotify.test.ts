import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/config/database', () => ({ query: vi.fn() }));
vi.mock('../../src/services/booth/BoothMovementService', () => ({
  boothMovementService: { withTransaction: vi.fn(async () => ({ id: 'mv-1' })) },
}));
vi.mock('../../src/services/notifications', () => ({
  boothNotifications: { componentReported: vi.fn(async () => undefined) },
  logNotifyError: () => () => undefined,
}));

import { boothInventoryService } from '../../src/services/booth/BoothInventoryService';
import { boothMovementService } from '../../src/services/booth/BoothMovementService';
import { boothNotifications } from '../../src/services/notifications';

describe('BoothInventoryService.reportComponent -> notification', () => {
  beforeEach(() => vi.clearAllMocks());
  const req = { kind: 'damage' as const, notes: 'torn', performedBy: 'u-9' };

  it('notifies after the transaction returns, and still returns the movement', async () => {
    const result = await boothInventoryService.reportComponent('c-1', req);
    expect(result).toEqual({ id: 'mv-1' });
    expect(boothNotifications.componentReported).toHaveBeenCalledWith(
      { componentId: 'c-1', kind: 'damage', notes: 'torn' }, 'u-9'
    );
    expect(vi.mocked(boothMovementService.withTransaction).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(boothNotifications.componentReported).mock.invocationCallOrder[0]);
  });

  it('does not notify when the report fails', async () => {
    vi.mocked(boothMovementService.withTransaction).mockRejectedValueOnce(new Error('not found'));
    await expect(boothInventoryService.reportComponent('c-x', req)).rejects.toThrow('not found');
    expect(boothNotifications.componentReported).not.toHaveBeenCalled();
  });

  it('a rejecting notifier does not fail the report', async () => {
    vi.mocked(boothNotifications.componentReported).mockRejectedValueOnce(new Error('boom'));
    await expect(boothInventoryService.reportComponent('c-1', req)).resolves.toEqual({ id: 'mv-1' });
  });
});
