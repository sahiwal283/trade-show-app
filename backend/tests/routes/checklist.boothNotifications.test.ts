import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';

vi.mock('../../src/config/database', () => ({ query: vi.fn() }));
vi.mock('../../src/config/upload', () => ({
  uploadBoothMap: { single: () => (_req: any, _res: any, cb: any) => cb() },
}));
vi.mock('../../src/middleware/auth', () => ({
  authorize: () => (_req: any, _res: any, next: any) => next(),
}));
vi.mock('../../src/services/PushService', () => ({ pushService: { sendToUser: vi.fn(async () => undefined) } }));
vi.mock('../../src/database/repositories', () => ({
  checklistRepository: { findById: vi.fn(), updateMainFields: vi.fn(), createBoothShipping: vi.fn() },
}));
vi.mock('../../src/services/notifications', () => ({
  boothNotifications: {
    ordered: vi.fn(async () => undefined), shipped: vi.fn(async () => undefined), mapUploaded: vi.fn(async () => undefined),
  },
  travelNotifications: {},
  logNotifyError: () => () => undefined,
}));

import router from '../../src/routes/checklist';
import { checklistRepository } from '../../src/database/repositories';
import { boothNotifications } from '../../src/services/notifications';
import { routeHandler } from '../helpers/routeHandler';

const repo = vi.mocked(checklistRepository) as any;
const mockRes = () => ({ json: vi.fn().mockReturnThis(), status: vi.fn().mockReturnThis() }) as any;
const user = { id: 'adm', role: 'admin' };

describe('checklist routes -> booth notifications', () => {
  beforeEach(() => vi.clearAllMocks());
  const put = routeHandler(router, 'put', '/:checklistId');
  const putReq = (boothOrdered: boolean) => ({ user, params: { checklistId: '7' }, body: { boothOrdered } });

  it('notifies when the booth flag goes from off to on', async () => {
    repo.findById.mockResolvedValueOnce({ id: 7, booth_ordered: false });
    repo.updateMainFields.mockResolvedValueOnce({ id: 7, booth_ordered: true });
    await put(putReq(true), mockRes());
    expect(boothNotifications.ordered).toHaveBeenCalledWith(7, 'adm');
  });

  it('stays silent when the booth was already ordered, or is being un-ordered', async () => {
    repo.findById.mockResolvedValueOnce({ id: 7, booth_ordered: true });
    repo.updateMainFields.mockResolvedValueOnce({ id: 7, booth_ordered: true });
    await put(putReq(true), mockRes());
    repo.findById.mockResolvedValueOnce({ id: 7, booth_ordered: true });
    repo.updateMainFields.mockResolvedValueOnce({ id: 7, booth_ordered: false });
    await put(putReq(false), mockRes());
    expect(boothNotifications.ordered).not.toHaveBeenCalled();
  });

  it('stays silent, and still saves, when the before-read fails', async () => {
    repo.findById.mockRejectedValueOnce(new Error('db blip'));
    repo.updateMainFields.mockResolvedValueOnce({ id: 7, booth_ordered: true });
    const res = mockRes();
    await put(putReq(true), res);
    expect(res.json).toHaveBeenCalledWith({ id: 7, booth_ordered: true });
    expect(boothNotifications.ordered).not.toHaveBeenCalled();
  });

  it('a rejecting notifier never fails the save', async () => {
    repo.findById.mockResolvedValueOnce({ id: 7, booth_ordered: false });
    repo.updateMainFields.mockResolvedValueOnce({ id: 7, booth_ordered: true });
    vi.mocked(boothNotifications.ordered).mockRejectedValueOnce(new Error('boom'));
    const res = mockRes();
    await put(putReq(true), res);
    await new Promise((r) => setImmediate(r));
    expect(res.status).not.toHaveBeenCalled();
  });

  it('notifies when a shipment is saved as shipped, not when it is only planned', async () => {
    const post = routeHandler(router, 'post', '/:checklistId/booth-shipping');
    const shippedRow = { id: 1, checklist_id: 7, shipped: true, carrier_name: 'FedEx', tracking_number: '1Z' };
    repo.createBoothShipping.mockResolvedValueOnce(shippedRow);
    await post({ user, params: { checklistId: '7' }, body: { shipped: true } }, mockRes());
    expect(boothNotifications.shipped).toHaveBeenCalledWith(7, shippedRow, 'adm');

    repo.createBoothShipping.mockResolvedValueOnce({ id: 2, checklist_id: 7, shipped: false });
    await post({ user, params: { checklistId: '7' }, body: {} }, mockRes());
    expect(boothNotifications.shipped).toHaveBeenCalledTimes(1);
  });

  it('notifies when a booth map is uploaded', async () => {
    const post = routeHandler(router, 'post', '/:checklistId/booth-map');
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    repo.updateMainFields.mockResolvedValueOnce({ id: 7, booth_map_url: '/uploads/booth-maps/m.png' });
    const res = mockRes();
    await post({
      user, params: { checklistId: '7' },
      file: { path: '/tmp/m.png', filename: 'm.png', originalname: 'm.png', mimetype: 'image/png', size: 10 },
    }, res);
    expect(res.json).toHaveBeenCalledWith({ mapUrl: '/uploads/booth-maps/m.png' });
    expect(boothNotifications.mapUploaded).toHaveBeenCalledWith(7, 'adm');
  });
});
