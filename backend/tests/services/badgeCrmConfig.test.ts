import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getBrandCrmConfig,
  isBrandCrmConfigured,
  configuredBrands,
} from '../../src/services/badge/badgeCrmConfig';

const ENV_KEYS = [
  'HAUTE_BRANDS_ZOHO_CRM_REFRESH_TOKEN', 'HAUTE_BRANDS_ZOHO_CRM_MODULE',
  'NIRVANA_KULTURE_ZOHO_CRM_REFRESH_TOKEN', 'BOOMIN_BRANDS_ZOHO_CRM_REFRESH_TOKEN',
  'ZOHO_CRM_REFRESH_TOKEN', 'ZOHO_CRM_CLIENT_ID', 'ZOHO_CRM_CLIENT_SECRET',
  'ZOHO_CLIENT_ID', 'ZOHO_CLIENT_SECRET', 'ZOHO_CRM_TRADESHOWS_MODULE',
];
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
  process.env.ZOHO_CLIENT_ID = 'cid';
  process.env.ZOHO_CLIENT_SECRET = 'csec';
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('badgeCrmConfig', () => {
  it('prefers the brand-specific refresh token', () => {
    process.env.HAUTE_BRANDS_ZOHO_CRM_REFRESH_TOKEN = 'haute-token';
    process.env.ZOHO_CRM_REFRESH_TOKEN = 'shared-token';
    expect(getBrandCrmConfig('haute_brands')!.refreshToken).toBe('haute-token');
  });

  it('never falls back to the shared token — that token names ONE org', () => {
    // Production already sets ZOHO_CRM_REFRESH_TOKEN for the read-only lead
    // sync. Honouring it here would report every brand as configured and push
    // all three brands' leads through one org's token: read-only means every
    // lead strands as 'failed'; write-scoped means Nirvana Kulture's leads are
    // silently filed into Haute Brands' CRM.
    process.env.ZOHO_CRM_REFRESH_TOKEN = 'shared-token';
    expect(getBrandCrmConfig('nirvana_kulture')).toBeNull();
    expect(isBrandCrmConfigured('nirvana_kulture')).toBe(false);
  });

  it('reports only brands with their own token, even with the global token set', () => {
    process.env.ZOHO_CRM_REFRESH_TOKEN = 'shared-token';
    process.env.HAUTE_BRANDS_ZOHO_CRM_REFRESH_TOKEN = 'haute-token';
    expect(configuredBrands()).toEqual(['haute_brands']);
  });

  it('still shares the OAuth client id/secret, which identify the app not the org', () => {
    // These are safe to share: the app registration is the same everywhere.
    process.env.HAUTE_BRANDS_ZOHO_CRM_REFRESH_TOKEN = 'haute-token';
    const config = getBrandCrmConfig('haute_brands')!;
    expect(config.clientId).toBe('cid');
    expect(config.clientSecret).toBe('csec');
  });

  it('reports a brand as unconfigured when no token exists anywhere', () => {
    expect(getBrandCrmConfig('boomin_brands')).toBeNull();
    expect(isBrandCrmConfigured('boomin_brands')).toBe(false);
  });

  it('allows a per-brand module name, because brands need not share one', () => {
    process.env.HAUTE_BRANDS_ZOHO_CRM_REFRESH_TOKEN = 't';
    process.env.HAUTE_BRANDS_ZOHO_CRM_MODULE = 'Tradeshows';
    process.env.ZOHO_CRM_TRADESHOWS_MODULE = 'CustomModule1';
    expect(getBrandCrmConfig('haute_brands')!.module).toBe('Tradeshows');
  });

  it('defaults the module to the existing global setting', () => {
    process.env.NIRVANA_KULTURE_ZOHO_CRM_REFRESH_TOKEN = 't';
    process.env.ZOHO_CRM_TRADESHOWS_MODULE = 'CustomModule1';
    expect(getBrandCrmConfig('nirvana_kulture')!.module).toBe('CustomModule1');
  });

  it('never treats an unknown brand as configured', () => {
    process.env.NOT_A_BRAND_ZOHO_CRM_REFRESH_TOKEN = 'token';
    expect(getBrandCrmConfig('not_a_brand')).toBeNull();
    delete process.env.NOT_A_BRAND_ZOHO_CRM_REFRESH_TOKEN;
  });
});
