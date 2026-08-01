/**
 * LeadConversionService unit tests — the pure matching layer only: email
 * normalization, company-name normalization, contact indexing/matching, and
 * invoice revenue aggregation. No network, no database: the pg query layer
 * is mocked so importing the service module never opens a connection.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/config/database', () => ({
  query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
}));

import {
  normalizeEmail,
  normalizeCompany,
  buildContactIndex,
  matchLead,
  sumRevenueByCustomer,
  mapContactRecord,
  mapInvoiceRecord,
  APPLY_MATCHES_SQL,
  BooksContact,
  BooksInvoice,
} from '../../src/services/LeadConversionService';

const contact = (overrides: Partial<BooksContact>): BooksContact => ({
  customerId: 'c-1',
  customerName: 'Acme Distribution',
  email: 'buyer@acme.com',
  companyName: 'Acme Distribution LLC',
  ...overrides,
});

describe('normalizeEmail (exact lowercase matcher key)', () => {
  it('lowercases and trims', () => {
    expect(normalizeEmail('  Buyer@Acme.COM ')).toBe('buyer@acme.com');
  });

  it('returns null for empty/missing values', () => {
    expect(normalizeEmail('')).toBeNull();
    expect(normalizeEmail('   ')).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
    expect(normalizeEmail(undefined)).toBeNull();
  });
});

describe('normalizeCompany (punctuation + corporate suffix stripping)', () => {
  it('lowercases, strips punctuation, collapses whitespace', () => {
    expect(normalizeCompany('  Acme,  Distribution!  ')).toBe('acme distribution');
  });

  it('strips llc/inc/co/corp/dba/ltd suffix tokens', () => {
    expect(normalizeCompany('Acme Distribution LLC')).toBe('acme distribution');
    expect(normalizeCompany('Acme, Inc.')).toBe('acme');
    expect(normalizeCompany('Acme Trading Co')).toBe('acme trading');
    expect(normalizeCompany('Acme Corp')).toBe('acme');
    expect(normalizeCompany('Acme Ltd')).toBe('acme');
    expect(normalizeCompany('Smokey DBA Acme')).toBe('smokey acme');
  });

  it('matches the same key across suffix/punctuation variants', () => {
    expect(normalizeCompany('ACME DISTRIBUTION, L.L.C.')).toBe(
      normalizeCompany('Acme Distribution')
    );
  });

  it('keeps the raw tokens when stripping would erase the whole name', () => {
    expect(normalizeCompany('CO LLC')).toBe('co llc');
  });

  it('returns null for empty/missing values', () => {
    expect(normalizeCompany('')).toBeNull();
    expect(normalizeCompany('!!!')).toBeNull();
    expect(normalizeCompany(null)).toBeNull();
    expect(normalizeCompany(undefined)).toBeNull();
  });
});

describe('buildContactIndex + matchLead', () => {
  const contacts = [
    contact({ customerId: 'c-1' }),
    contact({
      customerId: 'c-2',
      customerName: 'Bloom Vapes',
      email: 'orders@bloomvapes.com',
      companyName: null, // display name carries the company
    }),
  ];
  const index = buildContactIndex(contacts);

  it('matches by exact lowercased email first', () => {
    const match = matchLead({ email: 'BUYER@ACME.COM', company: 'Totally Different' }, index);
    expect(match?.contact.customerId).toBe('c-1');
    expect(match?.matchedBy).toBe('email');
  });

  it('falls back to normalized company when email misses', () => {
    const match = matchLead({ email: 'other@nowhere.com', company: 'ACME DISTRIBUTION, INC.' }, index);
    expect(match?.contact.customerId).toBe('c-1');
    expect(match?.matchedBy).toBe('company');
  });

  it('indexes the customer display name when company_name is absent', () => {
    const match = matchLead({ email: null, company: 'Bloom Vapes LLC' }, index);
    expect(match?.contact.customerId).toBe('c-2');
    expect(match?.matchedBy).toBe('company');
  });

  it('returns null when nothing matches or the lead is blank', () => {
    expect(matchLead({ email: 'no@match.com', company: 'No Match Co' }, index)).toBeNull();
    expect(matchLead({ email: null, company: null }, index)).toBeNull();
  });

  it('keeps the first contact on duplicate keys (deterministic re-runs)', () => {
    const dupIndex = buildContactIndex([
      contact({ customerId: 'first' }),
      contact({ customerId: 'second' }),
    ]);
    expect(dupIndex.byEmail.get('buyer@acme.com')?.customerId).toBe('first');
    expect(dupIndex.byCompany.get('acme distribution')?.customerId).toBe('first');
  });
});

describe('sumRevenueByCustomer (invoice totals, draft/void excluded)', () => {
  const invoice = (overrides: Partial<BooksInvoice>): BooksInvoice => ({
    customerId: 'c-1',
    status: 'paid',
    total: 100,
    ...overrides,
  });

  it('sums totals per customer', () => {
    const totals = sumRevenueByCustomer([
      invoice({ total: 100 }),
      invoice({ total: 250.5, status: 'sent' }),
      invoice({ customerId: 'c-2', total: 75, status: 'overdue' }),
    ]);
    expect(totals.get('c-1')).toBeCloseTo(350.5);
    expect(totals.get('c-2')).toBe(75);
  });

  it('excludes draft and void invoices (case-insensitive)', () => {
    const totals = sumRevenueByCustomer([
      invoice({ total: 100 }),
      invoice({ total: 999, status: 'draft' }),
      invoice({ total: 999, status: 'Void' }),
    ]);
    expect(totals.get('c-1')).toBe(100);
  });

  it('ignores invoices without a customer or a finite total', () => {
    const totals = sumRevenueByCustomer([
      invoice({ customerId: '', total: 50 }),
      invoice({ total: Number.NaN }),
      invoice({ total: 40 }),
    ]);
    expect(totals.get('c-1')).toBe(40);
    expect(totals.size).toBe(1);
  });

  it('returns an empty map for no invoices', () => {
    expect(sumRevenueByCustomer([]).size).toBe(0);
  });
});

describe('proxy record mapping', () => {
  it('maps Books contact records (contact_id/contact_name/email/company_name)', () => {
    const mapped = mapContactRecord({
      contact_id: '5254962000000000001',
      contact_name: 'Acme Distribution',
      company_name: 'Acme Distribution LLC',
      email: 'buyer@acme.com',
    });
    expect(mapped).toEqual({
      customerId: '5254962000000000001',
      customerName: 'Acme Distribution',
      email: 'buyer@acme.com',
      companyName: 'Acme Distribution LLC',
    });
  });

  it('maps Books invoice records and tolerates missing fields', () => {
    expect(
      mapInvoiceRecord({ customer_id: 'c-9', status: 'paid', total: 1234.56 })
    ).toEqual({ customerId: 'c-9', status: 'paid', total: 1234.56 });
    expect(mapInvoiceRecord({})).toEqual({ customerId: '', status: '', total: 0 });
  });
});

describe('APPLY_MATCHES_SQL (batched reconcile write phase)', () => {
  it('writes all matches in one UPDATE ... FROM unnest over parallel arrays', () => {
    // one statement replaces the old per-lead UPDATE loop (N+1)
    expect(APPLY_MATCHES_SQL).toMatch(/UPDATE crm_leads AS l/);
    expect(APPLY_MATCHES_SQL).toMatch(/FROM unnest\(/);
    expect(APPLY_MATCHES_SQL).toMatch(
      /\$1::int\[\], \$2::text\[\], \$3::text\[\], \$4::numeric\[\], \$5::text\[\]/
    );
    expect(APPLY_MATCHES_SQL).toMatch(/WHERE l\.id = m\.id/);
  });

  it('sets the full auto-conversion state', () => {
    expect(APPLY_MATCHES_SQL).toMatch(/converted = true/);
    expect(APPLY_MATCHES_SQL).toMatch(/converted_source = 'auto'/);
    expect(APPLY_MATCHES_SQL).toMatch(/converted_at = now\(\)/);
  });

  it('re-checks manual ownership at write time (manual rows never rewritten)', () => {
    expect(APPLY_MATCHES_SQL).toMatch(/l\.converted_source IS DISTINCT FROM 'manual'/);
  });
});
