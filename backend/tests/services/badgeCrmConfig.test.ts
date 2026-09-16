import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getBrandCrmConfig, isBrandCrmConfigured } from '../../src/services/badge/badgeCrmConfig';

const ENV_KEYS = [
  'HAUTE_BRANDS_ZOHO_CRM_REFRESH_TOKEN', 'HAUTE_BRANDS_ZOHO_CRM_MODULE',
  'NIRVANA_KULTURE_ZOHO_CRM_REFRESH_TOKEN',
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

  it('falls back to the shared token so the existing read sync keeps working', () => {
    process.env.ZOHO_CRM_REFRESH_TOKEN = 'shared-token';
    expect(getBrandCrmConfig('nirvana_kulture')!.refreshToken).toBe('shared-token');
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
    process.env.ZOHO_CRM_REFRESH_TOKEN = 'shared-token';
    expect(getBrandCrmConfig('not_a_brand')).toBeNull();
  });
});
