// backend/tests/routes/midasPing.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';

vi.mock('../../src/services/midas/MidasEventScanner', () => ({
  midasEventScanner: { trigger: vi.fn() },
}));

import { verifyPing, handleEventsPing } from '../../src/routes/midasPing';
import { midasEventScanner } from '../../src/services/midas/MidasEventScanner';

const SECRET = 'shh';
const NOW = 1_760_000_000;
const sign = (ts: string, secret = SECRET) => crypto.createHmac('sha256', secret).update(ts).digest('hex');

describe('verifyPing', () => {
  const ts = String(NOW);
  it('accepts a correctly signed, fresh timestamp', () => {
    expect(verifyPing({ timestamp: ts, signature: sign(ts), secret: SECRET, nowSeconds: NOW })).toBe(true);
  });
  it('accepts up to 300 seconds of clock difference either way, and no more', () => {
    for (const offset of [-300, 300]) {
      const t = String(NOW + offset);
      expect(verifyPing({ timestamp: t, signature: sign(t), secret: SECRET, nowSeconds: NOW })).toBe(true);
    }
    for (const offset of [-301, 301]) {
      const t = String(NOW + offset);
      expect(verifyPing({ timestamp: t, signature: sign(t), secret: SECRET, nowSeconds: NOW })).toBe(false);
    }
  });
  it('rejects a signature made with another secret', () => {
    expect(verifyPing({ timestamp: ts, signature: sign(ts, 'other'), secret: SECRET, nowSeconds: NOW })).toBe(false);
  });
  it('rejects a signature for a different timestamp (replay with a fresh time)', () => {
    expect(verifyPing({ timestamp: ts, signature: sign(String(NOW - 10)), secret: SECRET, nowSeconds: NOW })).toBe(false);
  });
  it('rejects missing, malformed and wrong-length values without throwing', () => {
    expect(verifyPing({ timestamp: undefined, signature: sign(ts), secret: SECRET, nowSeconds: NOW })).toBe(false);
    expect(verifyPing({ timestamp: ts, signature: undefined, secret: SECRET, nowSeconds: NOW })).toBe(false);
    expect(verifyPing({ timestamp: 'soon', signature: sign('soon'), secret: SECRET, nowSeconds: NOW })).toBe(false);
    expect(verifyPing({ timestamp: ts, signature: 'abc', secret: SECRET, nowSeconds: NOW })).toBe(false);
    expect(verifyPing({ timestamp: ts, signature: 'zz'.repeat(32), secret: SECRET, nowSeconds: NOW })).toBe(false);
    expect(verifyPing({ timestamp: [ts], signature: sign(ts), secret: SECRET, nowSeconds: NOW })).toBe(false);
  });
  it('rejects everything when no secret is configured', () => {
    expect(verifyPing({ timestamp: ts, signature: sign(ts, ''), secret: undefined, nowSeconds: NOW })).toBe(false);
    expect(verifyPing({ timestamp: ts, signature: sign(ts, ''), secret: '', nowSeconds: NOW })).toBe(false);
  });
});

describe('POST /api/midas/events-ping', () => {
  const mockRes = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), end: vi.fn() }) as any;
  const req = (headers: Record<string, string>) => ({ get: (name: string) => headers[name.toLowerCase()] }) as any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW * 1000));
    process.env.MIDAS_EVENTS_PING_SECRET = SECRET;
  });
  afterEach(() => {
    vi.useRealTimers();
    delete process.env.MIDAS_EVENTS_PING_SECRET;
  });

  it('answers 202 and triggers a scan for a valid ping', () => {
    const res = mockRes();
    const ts = String(NOW);
    handleEventsPing(req({ 'x-midas-timestamp': ts, 'x-midas-signature': sign(ts) }), res);
    expect(res.status).toHaveBeenCalledWith(202);
    expect(midasEventScanner.trigger).toHaveBeenCalledTimes(1);
  });

  it('answers 401 and does nothing for a bad signature', () => {
    const res = mockRes();
    handleEventsPing(req({ 'x-midas-timestamp': String(NOW), 'x-midas-signature': 'nope' }), res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(midasEventScanner.trigger).not.toHaveBeenCalled();
  });

  it('answers 401 when the secret is not configured', () => {
    delete process.env.MIDAS_EVENTS_PING_SECRET;
    const res = mockRes();
    const ts = String(NOW);
    handleEventsPing(req({ 'x-midas-timestamp': ts, 'x-midas-signature': sign(ts) }), res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(midasEventScanner.trigger).not.toHaveBeenCalled();
  });
});
