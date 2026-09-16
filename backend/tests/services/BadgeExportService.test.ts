import { describe, it, expect } from 'vitest';
import { badgeExportService } from '../../src/services/badge/BadgeExportService';

const scan = (over = {}) => ({
  id: 'scan-1', entity: 'Haute Brands', brand: 'haute_brands',
  first_name: 'Shamsher', last_name: 'Jessani', company: 'Virginia Trade Association',
  title: 'President', email: 'sjessani@aol.com', city: 'Glen Allen', state: 'VA',
  postal_code: '23059-8006', country: 'United States', badge_id: '124649-907',
  notes: null, crm_status: 'pending', crm_error: null,
  scanned_at: '2026-09-16T14:00:00.000Z', ...over,
}) as any;

describe('BadgeExportService.toCsv', () => {
  it('includes the company, so a mixed-brand export is still attributable', () => {
    const csv = badgeExportService.toCsv([scan()]);
    expect(csv.split('\n')[0]).toContain('Company Represented');
    expect(csv).toContain('Haute Brands');
  });

  it('escapes commas and quotes rather than corrupting the row', () => {
    // "Jessani, Inc" would silently become two columns unquoted, shifting
    // every field after it in that row.
    const csv = badgeExportService.toCsv([scan({ company: 'Smith, Jones & Co "The Firm"' })]);
    expect(csv).toContain('"Smith, Jones & Co ""The Firm"""');
    expect(csv.trim().split('\n')).toHaveLength(2);
  });

  it('renders a skipped scan with its reason instead of a blank status', () => {
    const csv = badgeExportService.toCsv([
      scan({ crm_status: 'skipped', crm_error: 'No Zoho CRM is configured for "Summitt Labs"' }),
    ]);
    expect(csv).toContain('skipped');
    expect(csv).toContain('No Zoho CRM is configured');
  });

  it('never emits a raw newline inside a field', () => {
    const csv = badgeExportService.toCsv([scan({ notes: 'line one\nline two' })]);
    expect(csv.trim().split('\n')).toHaveLength(2);
  });
});

describe('BadgeExportService.toXlsx', () => {
  it('produces a non-empty workbook buffer', async () => {
    const buf = await badgeExportService.toXlsx([scan()]);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(0);
  });
});
