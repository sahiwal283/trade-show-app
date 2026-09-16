import { describe, it, expect } from 'vitest';
import { zohoIntegrationClient } from '../../src/services/zohoIntegrationClient';

describe('zohoIntegrationClient.resolveBrand', () => {
  it('maps known company names to their brand key', () => {
    expect(zohoIntegrationClient.resolveBrand('Haute Brands')).toBe('haute_brands');
    expect(zohoIntegrationClient.resolveBrand('Nirvana Kulture')).toBe('nirvana_kulture');
    expect(zohoIntegrationClient.resolveBrand('Boomin Brands')).toBe('boomin_brands');
  });

  it('is case- and whitespace-insensitive, because picklist values are hand-entered', () => {
    expect(zohoIntegrationClient.resolveBrand('  haute brands  ')).toBe('haute_brands');
  });

  it('returns null for a company with no Zoho destination', () => {
    // Summitt Labs is a real, selectable picklist company with zohoEnabled
    // false. Leads for it are captured and marked skipped, never rejected.
    expect(zohoIntegrationClient.resolveBrand('Summitt Labs')).toBeNull();
  });
});
