import { describe, it, expect } from 'vitest';
import { SCAN_ROLES, VIEW_ALL_ROLES } from '../../src/config/badgeScanRoles';

describe('badgeScanRoles', () => {
  it('lets the people who actually stand in the booth scan', () => {
    expect(SCAN_ROLES).toContain('salesperson');
    expect(SCAN_ROLES).toContain('coordinator');
    expect(SCAN_ROLES).toContain('admin');
    expect(SCAN_ROLES).toContain('developer');
  });

  it('keeps accountants out — they never work the floor', () => {
    expect(SCAN_ROLES).not.toContain('accountant');
  });

  it('keeps temporary staff out of lead capture', () => {
    // Temps do booth setup (booths/checklist), not customer lead capture.
    expect(SCAN_ROLES).not.toContain('temporary');
  });

  it('restricts cross-event visibility to admins and developers', () => {
    expect(VIEW_ALL_ROLES).toEqual(expect.arrayContaining(['admin', 'developer']));
    expect(VIEW_ALL_ROLES).not.toContain('salesperson');
  });
});
