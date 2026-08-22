/**
 * Which categories will silently mis-book if an expense uses them.
 *
 * With PICKLIST_SOURCE=midas the dropdown offers whatever Midas serves, while
 * Trade Show still posts to Zoho using the account IDs in app_settings. A
 * category can therefore be perfectly selectable and have nowhere to book to.
 * This is the worklist that makes that gap visible in Admin Settings.
 */

import { describe, it, expect } from 'vitest';
import { findUnmappedCategories } from '../categoryMapping';

const MAPPED = {
  name: 'Meal and Entertainment',
  zohoExpenseAccountIds: { haute_brands: '111', boomin_brands: null, nirvana_kulture: null },
};
const NO_IDS = { name: 'Parking Fees', zohoExpenseAccountIds: null };

describe('findUnmappedCategories', () => {
  it('reports a picklist category with no row in the mapping table', () => {
    expect(findUnmappedCategories(['Stationaries'], [MAPPED])).toEqual(['Stationaries']);
  });

  it('reports a category whose row carries no Zoho account id', () => {
    expect(findUnmappedCategories(['Parking Fees'], [NO_IDS])).toEqual(['Parking Fees']);
  });

  it('does not report a category mapped for at least one brand', () => {
    expect(findUnmappedCategories(['Meal and Entertainment'], [MAPPED])).toEqual([]);
  });

  it('matches the mapping table case-insensitively, as Zoho resolution does', () => {
    expect(findUnmappedCategories(['meal and entertainment'], [MAPPED])).toEqual([]);
  });

  it('ignores mapping rows with no matching picklist category', () => {
    // A retired category still in app_settings is not a submission risk.
    expect(findUnmappedCategories([], [NO_IDS])).toEqual([]);
  });

  it('preserves picklist order and reports every gap', () => {
    const result = findUnmappedCategories(
      ['Stationaries', 'Meal and Entertainment', 'Parking Fees'],
      [MAPPED, NO_IDS]
    );

    expect(result).toEqual(['Stationaries', 'Parking Fees']);
  });

  it('reports nothing when the picklist is empty', () => {
    expect(findUnmappedCategories([], [])).toEqual([]);
  });
});
