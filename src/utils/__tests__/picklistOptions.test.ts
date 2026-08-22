/**
 * Builders that turn picklist records into SearchableSelect options.
 *
 * Four forms render these same two dropdowns. They previously each built their
 * own option strings, and disagreed: one wrote `Label (...1234)` unconditionally
 * while formatCardUsed omits the parenthetical for a card with no last four.
 * Building them in one place is what keeps the stored `cardUsed` string
 * consistent with what the backend parsers expect.
 */

import { describe, it, expect } from 'vitest';
import { toCategoryOptions, toCardOptions, toLegacyCardOptions } from '../picklistOptions';

describe('toCategoryOptions', () => {
  it('uses the category name as both value and label', () => {
    const options = toCategoryOptions([
      { id: 'c1', name: 'Parking Fees', description: null },
    ]);

    expect(options).toEqual([{ value: 'Parking Fees', label: 'Parking Fees', searchText: '' }]);
  });

  it('makes the description searchable without showing it', () => {
    const options = toCategoryOptions([
      { id: 'c1', name: 'Model', description: 'Booth models and talent' },
    ]);

    expect(options[0].label).toBe('Model');
    expect(options[0].searchText).toBe('Booth models and talent');
  });

  it('accepts the bare-string category shape', () => {
    expect(toCategoryOptions(['Gas / Fuel'])).toEqual([
      { value: 'Gas / Fuel', label: 'Gas / Fuel', searchText: '' },
    ]);
  });

  it('drops entries with no name', () => {
    const options = toCategoryOptions([
      { id: 'c1', name: '', description: null },
      { id: 'c2', name: 'Valid', description: null },
    ]);

    expect(options.map((o) => o.value)).toEqual(['Valid']);
  });
});

describe('toCardOptions', () => {
  const AMEX = {
    id: 'pm-1',
    label: 'Haute Amex',
    lastFour: '1002',
    company: 'Haute Brands',
    requiresReimbursement: false,
    zohoPaymentAccountId: null,
  };

  it('formats the value as the canonical cardUsed string', () => {
    expect(toCardOptions([AMEX])[0].value).toBe('Haute Amex (...1002)');
  });

  it('omits the parenthetical when a card has no last four', () => {
    const personal = { ...AMEX, id: 'pm-2', label: 'Personal', lastFour: '' };

    expect(toCardOptions([personal])[0].value).toBe('Personal');
  });

  it('makes the last four searchable so receipt digits find the card', () => {
    expect(toCardOptions([AMEX])[0].searchText).toContain('1002');
  });

  it('makes the company searchable', () => {
    expect(toCardOptions([AMEX])[0].searchText).toContain('Haute Brands');
  });

  it('drops cards with no label', () => {
    const nameless = { ...AMEX, id: 'pm-3', label: '' };

    expect(toCardOptions([nameless, AMEX]).map((o) => o.label)).toEqual(['Haute Amex (...1002)']);
  });
});

describe('toLegacyCardOptions', () => {
  // The OCR flow holds cards as {name, lastFour, entity} because that shape is
  // also what the OCR hook matches against. It still has to produce the same
  // cardUsed string as every other form.
  const LEGACY = [{ name: 'Haute PNC', lastFour: '3490', entity: 'Haute Brands' }];

  it('produces the same value string as the picklist builder', () => {
    const legacy = toLegacyCardOptions(LEGACY);
    const canonical = toCardOptions([
      {
        id: 'pm-1',
        label: 'Haute PNC',
        lastFour: '3490',
        company: 'Haute Brands',
        requiresReimbursement: false,
        zohoPaymentAccountId: null,
      },
    ]);

    expect(legacy).toEqual(canonical);
  });

  it('omits the parenthetical for a card with no last four', () => {
    // The old inline template wrote "Personal (...)" here, which no backend
    // parser matches.
    expect(toLegacyCardOptions([{ name: 'Personal', lastFour: '' }])[0].value).toBe('Personal');
  });

  it('makes the last four searchable', () => {
    expect(toLegacyCardOptions(LEGACY)[0].searchText).toContain('3490');
  });
});
