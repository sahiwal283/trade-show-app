import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('axios', () => ({ default: { post: vi.fn() } }));
vi.mock('../../src/database/repositories/UserRepository', () => ({
  userRepository: { findById: vi.fn() },
}));
vi.mock('../../src/database/repositories/BadgeScanRepository', () => ({
  badgeScanRepository: {
    claimPendingWebhook: vi.fn(async () => []),
    markWebhookResult: vi.fn(async () => undefined),
  },
}));

import axios from 'axios';
import { userRepository } from '../../src/database/repositories/UserRepository';
import { badgeScanRepository } from '../../src/database/repositories/BadgeScanRepository';
import { BadgeWebhookService } from '../../src/services/badge/BadgeWebhookService';

const URL = 'https://www.zohoapis.test/crm/v7/functions/scannacs/actions/execute?auth_type=apikey&zapikey=SECRET-KEY';
const BADGE = '123456-789|Jane|Doe|Example Company|Atlanta|GA|30301|United States|50542|Buyer|Ms.|jane@example.com|DP';

function scan(overrides: Record<string, unknown> = {}) {
  return {
    id: 'scan-1',
    brand: 'nirvana_kulture',
    raw_payload: 'A1B2C3\tJane\tDoe\tjane@example.com',
    webhook_status: 'pending',
    ...overrides,
  } as any;
}

let service: BadgeWebhookService;
let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(userRepository.findById).mockReset();
  process.env.NIRVANA_KULTURE_SCAN_WEBHOOK_URL = URL;
  service = new BadgeWebhookService();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  delete process.env.NIRVANA_KULTURE_SCAN_WEBHOOK_URL;
  service.stop();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('BadgeWebhookService.deliver', () => {
  it('appends the authenticated scanner email as field 14 without changing the saved badge', async () => {
    vi.mocked(userRepository.findById).mockResolvedValue({ email: ' Rep@Example.com ' } as any);
    vi.mocked(axios.post).mockResolvedValue({ status: 200, data: { code: 'success' } });
    const row = scan({ raw_payload: BADGE, scanned_by: 'user-1' });
    await service.deliver(row);
    expect(userRepository.findById).toHaveBeenCalledWith('user-1');
    expect(vi.mocked(axios.post).mock.calls[0][1]).toEqual({ data: `${BADGE}|rep@example.com` });
    expect(row.raw_payload).toBe(BADGE);
  });

  it.each([null, 'missing-user'])('keeps an empty field 14 when scanner %s cannot be resolved', async (scanned_by) => {
    vi.mocked(userRepository.findById).mockResolvedValue(null);
    vi.mocked(axios.post).mockResolvedValue({ status: 200, data: { code: 'success' } });
    await service.deliver(scan({ raw_payload: BADGE, scanned_by }));
    expect(vi.mocked(axios.post).mock.calls[0][1]).toEqual({ data: `${BADGE}|` });
    if (scanned_by === null) expect(userRepository.findById).not.toHaveBeenCalled();
  });

  it.each(['', 'rep@example.com|other', 'rep@example.com\nextra', 'unknown'])('does not append unsafe or missing email %j', async (email) => {
    vi.mocked(userRepository.findById).mockResolvedValue({ email } as any);
    vi.mocked(axios.post).mockResolvedValue({ status: 200, data: { code: 'success' } });
    await service.deliver(scan({ raw_payload: BADGE, scanned_by: 'user-1' }));
    expect(vi.mocked(axios.post).mock.calls[0][1]).toEqual({ data: `${BADGE}|` });
  });

  it('preserves blank badge fields and their positions', async () => {
    vi.mocked(userRepository.findById).mockResolvedValue({ email: 'rep@example.com' } as any);
    vi.mocked(axios.post).mockResolvedValue({ status: 200, data: { code: 'success' } });
    const raw = BADGE.split('|').map((value, index) => index === 9 || index === 12 ? '' : value).join('|');
    await service.deliver(scan({ raw_payload: raw, scanned_by: 'user-1' }));
    const body = vi.mocked(axios.post).mock.calls[0][1] as { data: string };
    expect(body.data.split('|')).toEqual([...raw.split('|'), 'rep@example.com']);
  });

  it('records lookup outages for retry without posting an ownerless payload', async () => {
    vi.mocked(userRepository.findById).mockRejectedValue(new Error('db unavailable'));
    await expect(service.deliver(scan({ raw_payload: BADGE, scanned_by: 'user-1' }))).resolves.toBeUndefined();
    expect(axios.post).not.toHaveBeenCalled();
    expect(badgeScanRepository.markWebhookResult).toHaveBeenCalledWith('scan-1', {
      status: 'failed', error: 'db unavailable',
    });
  });

  it.each(['https://example.com/badge/123', '{"firstName":"Jane"}', `${BADGE}|existing@example.com`])('leaves unsupported payload %s unchanged', async (raw_payload) => {
    vi.mocked(axios.post).mockResolvedValue({ status: 200, data: { code: 'success' } });
    await service.deliver(scan({ raw_payload, scanned_by: 'user-1' }));
    expect(userRepository.findById).not.toHaveBeenCalled();
    expect(vi.mocked(axios.post).mock.calls[0][1]).toEqual({ data: raw_payload });
  });

  it('POSTs the raw payload as the JSON string field "data" and marks the row delivered', async () => {
    vi.mocked(axios.post).mockResolvedValue({ status: 200, data: { code: 'success' } });

    await service.deliver(scan());

    expect(axios.post).toHaveBeenCalledTimes(1);
    const [url, body, options] = vi.mocked(axios.post).mock.calls[0];
    expect(url).toBe(URL);
    // The receiver parses the badge itself: the body is exactly the raw
    // barcode string under "data", never our parsed fields.
    expect(body).toEqual({ data: 'A1B2C3\tJane\tDoe\tjane@example.com' });
    expect(options?.headers).toMatchObject({ 'Content-Type': 'application/json' });
    expect(badgeScanRepository.markWebhookResult).toHaveBeenCalledWith('scan-1', { status: 'delivered' });
  });

  it('leaves a target brand\'s scan pending when its URL is not configured', async () => {
    delete process.env.NIRVANA_KULTURE_SCAN_WEBHOOK_URL;
    await service.deliver(scan());
    expect(axios.post).not.toHaveBeenCalled();
    expect(badgeScanRepository.markWebhookResult).not.toHaveBeenCalled();
  });

  it('never sends another brand\'s scan, even when a webhook is configured', async () => {
    await service.deliver(scan({ brand: 'haute_brands' }));
    await service.deliver(scan({ brand: null }));
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('does not re-send a scan that is already delivered or skipped (offline replays hit this path)', async () => {
    await service.deliver(scan({ webhook_status: 'delivered' }));
    await service.deliver(scan({ webhook_status: 'skipped' }));
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('records an HTTP failure on the row with the status code and never throws', async () => {
    const error = Object.assign(new Error('Request failed with status code 401'), {
      response: { status: 401, data: { code: 'INVALID_TOKEN', message: 'invalid api key' } },
    });
    vi.mocked(axios.post).mockRejectedValue(error);

    await expect(service.deliver(scan())).resolves.toBeUndefined();

    expect(badgeScanRepository.markWebhookResult).toHaveBeenCalledWith('scan-1', {
      status: 'failed',
      error: expect.stringContaining('401'),
    });
    const recorded = vi.mocked(badgeScanRepository.markWebhookResult).mock.calls[0][1] as any;
    expect(recorded.error).toContain('invalid api key');
  });

  it('treats a 200 whose body reports a non-success code as a failure', async () => {
    vi.mocked(axios.post).mockResolvedValue({
      status: 200,
      data: { code: 'error', message: 'function scannacs not found' },
    });
    await service.deliver(scan());
    expect(badgeScanRepository.markWebhookResult).toHaveBeenCalledWith('scan-1', {
      status: 'failed',
      error: expect.stringContaining('function scannacs not found'),
    });
  });

  it('never writes the API key to the log', async () => {
    vi.mocked(axios.post).mockRejectedValue(new Error(`connect ECONNREFUSED ${URL}`));
    await service.deliver(scan());
    const logged = warn.mock.calls.flat().map(String).join('\n');
    expect(logged).not.toContain('SECRET-KEY');
    expect(logged).toContain('scan-1');
  });

  it('survives a repository failure after a successful POST rather than crashing the request', async () => {
    vi.mocked(axios.post).mockResolvedValue({ status: 200, data: { code: 'success' } });
    vi.mocked(badgeScanRepository.markWebhookResult).mockRejectedValueOnce(new Error('db down'));
    await expect(service.deliver(scan())).resolves.toBeUndefined();
  });
});

describe('BadgeWebhookService.sweepOnce', () => {
  it('includes scanner email on retries without appending twice', async () => {
    vi.mocked(userRepository.findById).mockResolvedValue({ email: 'rep@example.com' } as any);
    const row = scan({ raw_payload: BADGE, scanned_by: 'user-1', webhook_status: 'failed' });
    vi.mocked(badgeScanRepository.claimPendingWebhook).mockResolvedValue([row]);
    vi.mocked(axios.post).mockResolvedValue({ status: 200, data: { code: 'success' } });
    await service.sweepOnce();
    await service.sweepOnce();
    for (const call of vi.mocked(axios.post).mock.calls) {
      expect(call[1]).toEqual({ data: `${BADGE}|rep@example.com` });
    }
    expect(row.raw_payload).toBe(BADGE);
    vi.mocked(badgeScanRepository.claimPendingWebhook).mockResolvedValue([]);
  });

  it('claims pending and retryable scans and delivers each one', async () => {
    vi.mocked(badgeScanRepository.claimPendingWebhook).mockResolvedValue([
      scan({ id: 'a' }),
      scan({ id: 'b', webhook_status: 'failed' }),
    ]);
    vi.mocked(axios.post)
      .mockResolvedValueOnce({ status: 200, data: { code: 'success' } })
      .mockRejectedValueOnce(new Error('timeout of 15000ms exceeded'));

    const summary = await service.sweepOnce();

    expect(summary).toEqual({ attempted: 2, delivered: 1, failed: 1 });
    expect(badgeScanRepository.markWebhookResult).toHaveBeenCalledWith('a', { status: 'delivered' });
    expect(badgeScanRepository.markWebhookResult).toHaveBeenCalledWith('b', {
      status: 'failed',
      error: expect.stringContaining('timeout'),
    });
  });

  it('does nothing when no brand has a webhook configured', async () => {
    delete process.env.NIRVANA_KULTURE_SCAN_WEBHOOK_URL;
    const summary = await service.sweepOnce();
    expect(summary).toEqual({ attempted: 0, delivered: 0, failed: 0 });
    expect(badgeScanRepository.claimPendingWebhook).not.toHaveBeenCalled();
  });

  it('skips a tick while the previous sweep is still running', async () => {
    let release!: () => void;
    vi.mocked(badgeScanRepository.claimPendingWebhook).mockReturnValueOnce(
      new Promise((resolve) => { release = () => resolve([]); })
    );
    const first = service.sweepOnce();
    const second = await service.sweepOnce();
    expect(second).toEqual({ attempted: 0, delivered: 0, failed: 0 });
    expect(badgeScanRepository.claimPendingWebhook).toHaveBeenCalledTimes(1);
    release();
    await first;
  });
});

describe('BadgeWebhookService.start', () => {
  it('stays idle when no webhook is configured', () => {
    vi.useFakeTimers();
    delete process.env.NIRVANA_KULTURE_SCAN_WEBHOOK_URL;
    service.start();
    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(badgeScanRepository.claimPendingWebhook).not.toHaveBeenCalled();
  });

  it('sweeps after the startup delay and then on an interval', async () => {
    vi.useFakeTimers();
    service.start();
    await vi.advanceTimersByTimeAsync(46 * 1000);
    expect(badgeScanRepository.claimPendingWebhook).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(badgeScanRepository.claimPendingWebhook).toHaveBeenCalledTimes(2);
  });
});
