/**
 * ZohoCrmLeadsService unit tests — pure record mapping (tag → show_key,
 * conversion heuristics) and the crm_leads upsert SQL shape. No network,
 * no database: the pg query layer is mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/config/database', () => ({
  query: vi.fn().mockResolvedValue({ rows: [] }),
}));

import { query } from '../../src/config/database';
import {
  mapLeadRecord,
  extractTagName,
  detectConverted,
  upsertLead,
  UPSERT_LEAD_SQL,
} from '../../src/services/ZohoCrmLeadsService';

const mockedQuery = vi.mocked(query);

const baseRecord = {
  id: '5254962000012345678',
  Company_Name: 'Acme Distribution',
  Email: 'buyer@acme.com',
  First_Name: 'Jane',
  Last_Name: 'Doe',
  Created_Time: '2025-06-29T10:15:00-04:00',
  Tag: [{ name: 'Summer Fancy Food Show' }],
  Owner: { name: 'Brett Pommerenck', id: '1' },
  Email_Opened: true,
  Email_Bounced: false,
};

describe('tag → show_key mapping', () => {
  it('maps a tag through showKey + aliasKey (Fancy Food alias)', () => {
    const lead = mapLeadRecord(baseRecord);
    expect(lead.showTag).toBe('Summer Fancy Food Show');
    expect(lead.showKey).toBe('fancy food');
  });

  it('keeps non-aliased shows as their normalized key', () => {
    const lead = mapLeadRecord({ ...baseRecord, Tag: [{ name: 'Champs Chicago' }] });
    expect(lead.showKey).toBe('champs chicago');
  });

  it('folds year tokens and known variants onto canonical keys', () => {
    expect(mapLeadRecord({ ...baseRecord, Tag: [{ name: 'TPE 2026' }] }).showKey).toBe('tpe');
    expect(
      mapLeadRecord({ ...baseRecord, Tag: [{ name: 'Champs Las Vegas Summer 2025' }] }).showKey
    ).toBe('champs summer lv');
  });

  it('folds Champs Winter onto the workbook Champs Winter/Spring LV key', () => {
    expect(mapLeadRecord({ ...baseRecord, Tag: [{ name: 'Champs Winter 2025' }] }).showKey).toBe(
      'champs spring lv'
    );
    // anchored alias must NOT swallow the distinct Winter Faire show
    expect(mapLeadRecord({ ...baseRecord, Tag: [{ name: 'Winter Faire 2025' }] }).showKey).toBe(
      'winter faire'
    );
  });

  it('uses the first tag when several are present', () => {
    const lead = mapLeadRecord({
      ...baseRecord,
      Tag: [{ name: 'Champs Chicago' }, { name: 'VIP' }],
    });
    expect(lead.showTag).toBe('Champs Chicago');
    expect(lead.showKey).toBe('champs chicago');
  });

  it('leaves show fields null when the record has no tags', () => {
    const lead = mapLeadRecord({ ...baseRecord, Tag: [] });
    expect(lead.showTag).toBeNull();
    expect(lead.showKey).toBeNull();
    expect(extractTagName({ id: '1' })).toBeNull();
  });
});

describe('record field mapping', () => {
  it('derives year from Created_Time and maps person/company fields', () => {
    const lead = mapLeadRecord(baseRecord);
    expect(lead.crmRecordId).toBe('5254962000012345678');
    expect(lead.year).toBe(2025);
    expect(lead.company).toBe('Acme Distribution');
    expect(lead.email).toBe('buyer@acme.com');
    expect(lead.firstName).toBe('Jane');
    expect(lead.lastName).toBe('Doe');
    expect(lead.owner).toBe('Brett Pommerenck');
    expect(lead.emailOpened).toBe(true);
    expect(lead.emailBounced).toBe(false);
  });

  it('tolerates missing optional fields', () => {
    const lead = mapLeadRecord({ id: '99', Tag: [{ name: 'NACS 2025' }] });
    expect(lead.showKey).toBe('nacs');
    expect(lead.year).toBeNull();
    expect(lead.company).toBeNull();
    expect(lead.emailOpened).toBe(false);
  });
});

describe('conversion detection (best-effort heuristic)', () => {
  it('honors explicit Converted booleans', () => {
    expect(detectConverted({ Converted: true })).toBe(true);
    expect(detectConverted({ Converted: false })).toBe(false);
  });

  it('reads converted-style Lead_Status values', () => {
    expect(detectConverted({ Lead_Status: 'Converted' })).toBe(true);
    expect(detectConverted({ Lead_Status: 'Closed Won' })).toBe(true);
    expect(detectConverted({ Lead_Status: 'New' })).toBe(false);
  });

  it('defaults to false when no conversion-ish field exists', () => {
    expect(detectConverted(baseRecord)).toBe(false);
  });
});

describe('upsert SQL shape', () => {
  beforeEach(() => {
    mockedQuery.mockClear();
  });

  it('inserts into crm_leads with ON CONFLICT (crm_record_id) DO UPDATE', async () => {
    await upsertLead(baseRecord);

    expect(mockedQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = mockedQuery.mock.calls[0];
    expect(sql).toBe(UPSERT_LEAD_SQL);
    expect(sql).toMatch(/INSERT INTO crm_leads/);
    expect(sql).toMatch(/ON CONFLICT \(crm_record_id\) DO UPDATE/);
    expect(sql).toMatch(/synced_at = now\(\)/);

    // 14 bound params: all columns except id and the now() synced_at
    expect(params).toHaveLength(14);
    expect(params?.[0]).toBe('5254962000012345678'); // crm_record_id
    expect(params?.[1]).toBe('Summer Fancy Food Show'); // show_tag (raw)
    expect(params?.[2]).toBe('fancy food'); // show_key (aliased)
    expect(params?.[3]).toBe(2025); // year
    // payload is the full record json
    expect(JSON.parse(params?.[13] as string)).toMatchObject({ id: '5254962000012345678' });
  });
});
