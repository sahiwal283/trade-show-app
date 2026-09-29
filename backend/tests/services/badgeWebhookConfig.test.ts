import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getScanWebhookUrl,
  isScanWebhookBrand,
  configuredWebhookBrands,
} from '../../src/services/badge/badgeWebhookConfig';

const ENV_KEYS = ['NIRVANA_KULTURE_SCAN_WEBHOOK_URL'];
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('badgeWebhookConfig', () => {
  it('reads the Nirvana Kulture webhook URL from its brand-prefixed variable', () => {
    process.env.NIRVANA_KULTURE_SCAN_WEBHOOK_URL = 'https://example.test/hook?zapikey=abc';
    expect(getScanWebhookUrl('nirvana_kulture')).toBe('https://example.test/hook?zapikey=abc');
  });

  it('is unconfigured when the variable is absent or blank', () => {
    expect(getScanWebhookUrl('nirvana_kulture')).toBeNull();
    process.env.NIRVANA_KULTURE_SCAN_WEBHOOK_URL = '   ';
    expect(getScanWebhookUrl('nirvana_kulture')).toBeNull();
  });

  it('never targets a brand that has no webhook — other brands\' leads stay home', () => {
    process.env.NIRVANA_KULTURE_SCAN_WEBHOOK_URL = 'https://example.test/hook';
    expect(getScanWebhookUrl('haute_brands')).toBeNull();
    expect(getScanWebhookUrl('boomin_brands')).toBeNull();
    expect(isScanWebhookBrand('haute_brands')).toBe(false);
    expect(isScanWebhookBrand(null)).toBe(false);
  });

  it('marks Nirvana Kulture as a webhook brand even before the URL is set, so its scans wait as pending', () => {
    expect(isScanWebhookBrand('nirvana_kulture')).toBe(true);
    expect(configuredWebhookBrands()).toEqual([]);
    process.env.NIRVANA_KULTURE_SCAN_WEBHOOK_URL = 'https://example.test/hook';
    expect(configuredWebhookBrands()).toEqual(['nirvana_kulture']);
  });
});
