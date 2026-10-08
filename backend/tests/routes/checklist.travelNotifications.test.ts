import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/config/database', () => ({ query: vi.fn() }));
vi.mock('../../src/config/upload', () => ({ uploadBoothMap: { single: () => (_r: any, _s: any, cb: any) => cb() } }));
vi.mock('../../src/middleware/auth', () => ({ authorize: () => (_req: any, _res: any, next: any) => next() }));
vi.mock('../../src/database/repositories', () => ({
  checklistRepository: {
    createFlight: vi.fn(), getFlightById: vi.fn(), updateFlight: vi.fn(), deleteFlight: vi.fn(async () => true),
    createHotel: vi.fn(), getHotelById: vi.fn(), updateHotel: vi.fn(), deleteHotel: vi.fn(async () => true),
    createCarRental: vi.fn(), getCarRentalById: vi.fn(), updateCarRental: vi.fn(), deleteCarRental: vi.fn(async () => true),
  },
}));
vi.mock('../../src/services/notifications', () => ({
  boothNotifications: {},
  travelNotifications: {
    flightSaved: vi.fn(async () => undefined), hotelSaved: vi.fn(async () => undefined), carRentalSaved: vi.fn(async () => undefined),
  },
  logNotifyError: () => () => undefined,
}));

import router from '../../src/routes/checklist';
import { checklistRepository } from '../../src/database/repositories';
import { travelNotifications } from '../../src/services/notifications';
import { routeHandler } from '../helpers/routeHandler';

const repo = vi.mocked(checklistRepository) as any;
const mockRes = () => ({ json: vi.fn().mockReturnThis(), status: vi.fn().mockReturnThis() }) as any;
const user = { id: 'adm', role: 'admin' };
const BEFORE = { id: 1, checklist_id: 7, booked: true, confirmation_number: 'A' };
const AFTER = { id: 1, checklist_id: 7, booked: true, confirmation_number: 'B' };

const KINDS = [
  { name: 'flight', create: '/:checklistId/flights', item: '/flights/:flightId', param: 'flightId',
    createFn: 'createFlight', getFn: 'getFlightById', updateFn: 'updateFlight', saved: 'flightSaved' },
  { name: 'hotel', create: '/:checklistId/hotels', item: '/hotels/:hotelId', param: 'hotelId',
    createFn: 'createHotel', getFn: 'getHotelById', updateFn: 'updateHotel', saved: 'hotelSaved' },
  { name: 'car rental', create: '/:checklistId/car-rentals', item: '/car-rentals/:rentalId', param: 'rentalId',
    createFn: 'createCarRental', getFn: 'getCarRentalById', updateFn: 'updateCarRental', saved: 'carRentalSaved' },
] as const;

describe.each(KINDS)('checklist $name routes -> travel notifications', (k) => {
  beforeEach(() => vi.clearAllMocks());
  const saved = () => vi.mocked((travelNotifications as any)[k.saved]);

  it('create passes (null, created row, actor)', async () => {
    repo[k.createFn].mockResolvedValueOnce(AFTER);
    const res = mockRes();
    await routeHandler(router, 'post', k.create)({ user, params: { checklistId: '7' }, body: {} }, res);
    expect(res.json).toHaveBeenCalledWith(AFTER);
    expect(saved()).toHaveBeenCalledWith(null, AFTER, 'adm');
  });

  it('update passes (row before, row after, actor)', async () => {
    repo[k.getFn].mockResolvedValueOnce(BEFORE);
    repo[k.updateFn].mockResolvedValueOnce(AFTER);
    await routeHandler(router, 'put', k.item)({ user, params: { [k.param]: '1' }, body: {} }, mockRes());
    expect(repo[k.getFn]).toHaveBeenCalledWith(1);
    expect(saved()).toHaveBeenCalledWith(BEFORE, AFTER, 'adm');
  });

  it('update still saves, silently, when the before-read fails', async () => {
    repo[k.getFn].mockRejectedValueOnce(new Error('db blip'));
    repo[k.updateFn].mockResolvedValueOnce(AFTER);
    const res = mockRes();
    await routeHandler(router, 'put', k.item)({ user, params: { [k.param]: '1' }, body: {} }, res);
    expect(res.json).toHaveBeenCalledWith(AFTER);
    expect(saved()).not.toHaveBeenCalled();
  });

  it('delete passes (row before, null, actor)', async () => {
    repo[k.getFn].mockResolvedValueOnce(BEFORE);
    const res = mockRes();
    await routeHandler(router, 'delete', k.item)({ user, params: { [k.param]: '1' } }, res);
    expect(res.json).toHaveBeenCalledWith({ success: true });
    expect(saved()).toHaveBeenCalledWith(BEFORE, null, 'adm');
  });

  it('delete of a row that was not there says nothing', async () => {
    repo[k.getFn].mockResolvedValueOnce(null);
    await routeHandler(router, 'delete', k.item)({ user, params: { [k.param]: '1' } }, mockRes());
    expect(saved()).not.toHaveBeenCalled();
  });

  it('a rejecting notifier never fails the save', async () => {
    repo[k.createFn].mockResolvedValueOnce(AFTER);
    saved().mockRejectedValueOnce(new Error('boom'));
    const res = mockRes();
    await routeHandler(router, 'post', k.create)({ user, params: { checklistId: '7' }, body: {} }, res);
    await new Promise((r) => setImmediate(r));
    expect(res.status).not.toHaveBeenCalled();
  });
});
