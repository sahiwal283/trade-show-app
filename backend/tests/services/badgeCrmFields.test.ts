import { describe, it, expect, beforeEach, vi } from 'vitest';
import axios from 'axios';

vi.mock('axios', () => ({ default: { get: vi.fn() } }));
vi.mock('../../src/config/database', () => ({ query: vi.fn(async () => ({ rows: [] })) }));

import { getFieldMap, clearFieldMapCache } from '../../src/services/badge/badgeCrmFields';
import { query } from '../../src/config/database';

const fieldsResponse = (names: string[]) => ({
  data: { fields: names.map((api_name) => ({ api_name, field_label: api_name })) },
});

beforeEach(() => {
  vi.clearAllMocks();
  clearFieldMapCache();
  process.env.HAUTE_BRANDS_ZOHO_CRM_REFRESH_TOKEN = 't';
  process.env.ZOHO_CLIENT_ID = 'cid';
  process.env.ZOHO_CLIENT_SECRET = 'csec';
});

describe('getFieldMap', () => {
  it('maps our field names onto the module names the org actually has', async () => {
    vi.mocked(axios.get).mockResolvedValue(fieldsResponse(['Last_Name', 'Email', 'Account_Name']) as any);
    const map = await getFieldMap('haute_brands', 'at');
    expect(map.last_name).toBe('Last_Name');
    expect(map.email).toBe('Email');
    // Account_Name is this org's company field; the default would be 'Company'.
    expect(map.company).toBe('Account_Name');
  });

  it('falls back to the standard name when the module has no match', async () => {
    vi.mocked(axios.get).mockResolvedValue(fieldsResponse(['Last_Name']) as any);
    const map = await getFieldMap('haute_brands', 'at');
    expect(map.email).toBe('Email');
  });

  it('caches per brand so the push does not re-discover on every batch', async () => {
    vi.mocked(axios.get).mockResolvedValue(fieldsResponse(['Last_Name']) as any);
    await getFieldMap('haute_brands', 'at');
    await getFieldMap('haute_brands', 'at');
    expect(axios.get).toHaveBeenCalledTimes(1);
  });

  it('returns the defaults rather than throwing when discovery fails', async () => {
    // A discovery outage must not stop the push; the standard names are a
    // reasonable guess and any per-record rejection is visible in the UI.
    vi.mocked(axios.get).mockRejectedValue(new Error('403 OAUTH_SCOPE_MISMATCH'));
    const map = await getFieldMap('haute_brands', 'at');
    expect(map.last_name).toBe('Last_Name');
  });

  it('persists the discovered map to app_settings for the existing sync to read', async () => {
    vi.mocked(axios.get).mockResolvedValue(fieldsResponse(['Last_Name', 'Account_Name']) as any);
    await getFieldMap('haute_brands', 'at');
    const sql = vi.mocked(query).mock.calls.map(([s]) => String(s)).join(' ');
    expect(sql).toContain('app_settings');
  });
});
