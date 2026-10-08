import { describe, it, expect, vi } from 'vitest';

const { sendNotification } = vi.hoisted(() => {
  process.env.VAPID_PUBLIC_KEY = 'test-public-key';
  process.env.VAPID_PRIVATE_KEY = 'test-private-key';
  return { sendNotification: vi.fn(async () => ({ statusCode: 201 })) };
});

vi.mock('web-push', () => ({ default: { setVapidDetails: vi.fn(), sendNotification } }));
vi.mock('../../src/config/database', () => ({
  query: vi.fn(async () => ({ rows: [{ id: 1, user_id: 'u-1', endpoint: 'https://push.example/1', p256dh: 'p', auth: 'a' }] })),
}));

import { pushService } from '../../src/services/PushService';

describe('PushService.sendToUser', () => {
  it('gives every push request a timeout so a hung push service cannot hold a worker', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await pushService.sendToUser('u-1', { title: 't', body: 'b' });
    expect(sendNotification).toHaveBeenCalledWith(
      { endpoint: 'https://push.example/1', keys: { p256dh: 'p', auth: 'a' } },
      JSON.stringify({ title: 't', body: 'b' }),
      { timeout: 10_000 }
    );
  });
});
