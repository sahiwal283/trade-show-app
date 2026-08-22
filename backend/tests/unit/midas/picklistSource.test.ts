/**
 * PICKLIST_SOURCE resolution.
 *
 * Production needs Midas's real category and card lists while its expenses
 * still live locally, so the picklist source has to be settable independently
 * of EXPENSE_BACKEND. The default is `auto`, which reproduces the old coupling
 * exactly — no existing deployment changes behaviour by upgrading.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { getPicklistSource } from '../../../src/services/midas';

afterEach(() => {
  delete process.env.PICKLIST_SOURCE;
});

describe('getPicklistSource', () => {
  it('defaults to auto when unset', () => {
    expect(getPicklistSource()).toBe('auto');
  });

  it('honours an explicit midas setting', () => {
    process.env.PICKLIST_SOURCE = 'midas';
    expect(getPicklistSource()).toBe('midas');
  });

  it('honours an explicit settings setting', () => {
    process.env.PICKLIST_SOURCE = 'settings';
    expect(getPicklistSource()).toBe('settings');
  });

  it('is case-insensitive', () => {
    process.env.PICKLIST_SOURCE = 'MiDaS';
    expect(getPicklistSource()).toBe('midas');
  });

  // A typo must not silently swap the source of accounting picklists.
  it('falls back to auto on an unrecognised value', () => {
    process.env.PICKLIST_SOURCE = 'zoho';
    expect(getPicklistSource()).toBe('auto');
  });
});
