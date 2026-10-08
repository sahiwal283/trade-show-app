import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

vi.mock('../../src/database/repositories/NotificationRepository', () => ({ notificationRepository: {} }));
vi.mock('../../src/services/PushService', () => ({ pushService: {} }));

import { linkToUrl } from '../../src/services/NotificationService';

const cases: Array<{ link: any; url: string }> = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../../src/utils/__fixtures__/notificationLinks.json'), 'utf8')
);

describe('linkToUrl (shared fixture with the frontend)', () => {
  it.each(cases)('maps $link to $url', ({ link, url }) => {
    expect(linkToUrl(link)).toBe(url);
  });
});
