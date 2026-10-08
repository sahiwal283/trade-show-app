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
  checklistRepository: {
    findById: vi.fn(), updateMainFields: vi.fn(), createBoothShipping: vi.fn(),
    getBoothShippingById: vi.fn(), updateBoothShipping: vi.fn(),
  },
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
import { NotFoundError } from '../../src/utils/errors';

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

  describe('PUT /booth-shipping/:shippingId', () => {
    const putShipping = routeHandler(router, 'put', '/booth-shipping/:shippingId');
    const row = (shipped: boolean) => ({ id: 3, checklist_id: 7, shipped, carrier_name: 'FedEx', tracking_number: '1Z' });
    const req = (body: Record<string, unknown>) => ({ user, params: { shippingId: '3' }, body });

    it('notifies when a shipment goes from not shipped to shipped', async () => {
      repo.getBoothShippingById.mockResolvedValueOnce(row(false));
      repo.updateBoothShipping.mockResolvedValueOnce(row(true));
      const res = mockRes();
      await putShipping(req({ shipped: true }), res);
      expect(repo.getBoothShippingById).toHaveBeenCalledWith(3);
      expect(res.json).toHaveBeenCalledWith(row(true));
      expect(boothNotifications.shipped).toHaveBeenCalledWith(7, row(true), 'adm');
    });

    it('stays silent when the shipment was already shipped', async () => {
      repo.getBoothShippingById.mockResolvedValueOnce(row(true));
      repo.updateBoothShipping.mockResolvedValueOnce(row(true));
      await putShipping(req({ shipped: true, notes: 'left at dock' }), mockRes());
      expect(boothNotifications.shipped).not.toHaveBeenCalled();
    });

    it('stays silent when a shipment is un-shipped', async () => {
      repo.getBoothShippingById.mockResolvedValueOnce(row(true));
      repo.updateBoothShipping.mockResolvedValueOnce(row(false));
      await putShipping(req({ shipped: false }), mockRes());
      expect(boothNotifications.shipped).not.toHaveBeenCalled();
    });

    it('stays silent, and still saves, when the before-read fails', async () => {
      repo.getBoothShippingById.mockRejectedValueOnce(new Error('db blip'));
      repo.updateBoothShipping.mockResolvedValueOnce(row(true));
      const res = mockRes();
      await putShipping(req({ shipped: true }), res);
      expect(res.json).toHaveBeenCalledWith(row(true));
      expect(boothNotifications.shipped).not.toHaveBeenCalled();
    });

    it('passes only the fields the body carries, so a bare toggle blanks nothing', async () => {
      repo.getBoothShippingById.mockResolvedValueOnce(row(false));
      repo.updateBoothShipping.mockResolvedValueOnce(row(true));
      await putShipping(req({ shipped: true }), mockRes());
      expect(repo.updateBoothShipping).toHaveBeenLastCalledWith(3, { shipped: true });

      repo.getBoothShippingById.mockResolvedValueOnce(row(false));
      repo.updateBoothShipping.mockResolvedValueOnce(row(false));
      await putShipping(req({
        shippingMethod: 'carrier', carrierName: 'UPS', trackingNumber: null,
        shippingDate: '2026-11-01', deliveryDate: '2026-11-04', notes: null, shipped: false,
      }), mockRes());
      expect(repo.updateBoothShipping).toHaveBeenLastCalledWith(3, {
        shipping_method: 'carrier', carrier_name: 'UPS', tracking_number: null,
        shipping_date: '2026-11-01', delivery_date: '2026-11-04', notes: null, shipped: false,
      });
    });

    it('answers 404 for a shipment that does not exist', async () => {
      repo.getBoothShippingById.mockResolvedValueOnce(null);
      const res = mockRes();
      await putShipping(req({ shipped: true }), res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Booth shipping entry not found' });
      expect(repo.updateBoothShipping).not.toHaveBeenCalled();

      // Before-read failed, and the update itself finds no row.
      repo.getBoothShippingById.mockRejectedValueOnce(new Error('db blip'));
      repo.updateBoothShipping.mockRejectedValueOnce(new NotFoundError('BoothShipping', '3'));
      const res2 = mockRes();
      await putShipping(req({ shipped: true }), res2);
      expect(res2.status).toHaveBeenCalledWith(404);
      expect(boothNotifications.shipped).not.toHaveBeenCalled();
    });

    it('a rejecting notifier never fails the save', async () => {
      repo.getBoothShippingById.mockResolvedValueOnce(row(false));
      repo.updateBoothShipping.mockResolvedValueOnce(row(true));
      vi.mocked(boothNotifications.shipped).mockRejectedValueOnce(new Error('boom'));
      const res = mockRes();
      await putShipping(req({ shipped: true }), res);
      await new Promise((r) => setImmediate(r));
      expect(res.status).not.toHaveBeenCalled();
    });
  });
});
