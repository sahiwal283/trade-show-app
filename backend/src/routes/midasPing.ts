// backend/src/routes/midasPing.ts
/**
 * Midas's "you have events" ping — /api/midas/events-ping
 *
 * Not a session route: Midas calls it server to server. It carries no data.
 * A valid ping only makes the event scanner pull now instead of waiting for
 * its timer, so the worst a forged one could do is cause a pull that would
 * have happened anyway; it is still signed so it cannot be used to make this
 * server call Midas on demand.
 */
import crypto from 'crypto';
import express, { Request, Response } from 'express';
import { midasEventScanner } from '../services/midas/MidasEventScanner';

/** How far Midas's clock and ours may disagree, and how long a captured ping stays usable. */
const MAX_SKEW_SECONDS = 300;

export function verifyPing(i: {
  timestamp: unknown; signature: unknown; secret: string | undefined; nowSeconds: number;
}): boolean {
  if (!i.secret) return false;
  if (typeof i.timestamp !== 'string' || !/^\d{1,12}$/.test(i.timestamp)) return false;
  if (typeof i.signature !== 'string' || !/^[0-9a-f]{64}$/i.test(i.signature)) return false;
  if (Math.abs(i.nowSeconds - Number(i.timestamp)) > MAX_SKEW_SECONDS) return false;

  const expected = crypto.createHmac('sha256', i.secret).update(i.timestamp).digest();
  const given = Buffer.from(i.signature, 'hex');
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

export function handleEventsPing(req: Request, res: Response): void {
  const ok = verifyPing({
    timestamp: req.get('X-Midas-Timestamp'),
    signature: req.get('X-Midas-Signature'),
    secret: process.env.MIDAS_EVENTS_PING_SECRET,
    nowSeconds: Math.floor(Date.now() / 1000),
  });
  if (!ok) {
    res.status(401).json({ error: 'Invalid ping signature' });
    return;
  }
  midasEventScanner.trigger();
  res.status(202).json({ accepted: true });
}

const router = express.Router();
router.post('/events-ping', handleEventsPing);

export default router;
