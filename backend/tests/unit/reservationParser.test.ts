import { describe, it, expect } from 'vitest';
import { parseReservation, parseLooseDate } from '../../src/services/ocr/ReservationParser';

describe('parseLooseDate', () => {
  it('parses numeric dates', () => {
    expect(parseLooseDate('06/24/2026')).toBe('2026-06-24');
    expect(parseLooseDate('6-24-26')).toBe('2026-06-24');
  });

  it('parses month-name dates both orders', () => {
    expect(parseLooseDate('June 24, 2026')).toBe('2026-06-24');
    expect(parseLooseDate('24 Jun 2026')).toBe('2026-06-24');
  });

  it('returns null when no date present', () => {
    expect(parseLooseDate('Sahara Las Vegas')).toBeNull();
  });
});

describe('parseReservation', () => {
  it('extracts a hotel confirmation document', () => {
    const text = [
      'Sahara Las Vegas Hotel & Casino',
      'Reservation Confirmation',
      'Confirmation Number: 88231KQZ',
      'Guest: Brett Pommerenck',
      'Check-in: Tuesday, August 25, 2026',
      'Check-out: Friday, August 28, 2026',
      'Total: $454.12',
    ].join('\n');

    const r = parseReservation(text);
    expect(r.confirmationNumber).toBe('88231KQZ');
    expect(r.propertyName).toContain('Sahara');
    expect(r.checkInDate).toBe('2026-08-25');
    expect(r.checkOutDate).toBe('2026-08-28');
  });

  it('extracts an airline itinerary', () => {
    const text = [
      'Southwest Airlines',
      'Itinerary # CLBP5F',
      'Departure: 08/24/2026',
    ].join('\n');

    const r = parseReservation(text);
    expect(r.confirmationNumber).toBe('CLBP5F');
    expect(r.carrier).toContain('Southwest');
  });

  it('finds dates on the following line (tabular layouts)', () => {
    const text = ['Check-In Date', 'June 24, 2026'].join('\n');
    expect(parseReservation(text).checkInDate).toBe('2026-06-24');
  });

  it('returns all nulls for empty or receipt-like text', () => {
    const r = parseReservation('COFFEE SHOP\nLATTE 5.00\nTOTAL 5.00');
    expect(r.confirmationNumber).toBeNull();
    expect(r.propertyName).toBeNull();
    expect(r.checkInDate).toBeNull();
  });
});

describe('parseReservation — layout variants', () => {
  it('finds column-layout dates two lines below the header', () => {
    const text = ['Check-In          Check-Out', 'Room 1', '06/24/2026', '06/27/2026'].join('\n');
    const r = parseReservation(text);
    expect(r.checkInDate).toBe('2026-06-24');
  });

  it('falls back to a plain date range with no labels', () => {
    const r = parseReservation('Sahara Las Vegas\nJune 24 – 27, 2026\nTotal $454.12');
    expect(r.checkInDate).toBe('2026-06-24');
    expect(r.checkOutDate).toBe('2026-06-27');
  });

  it('handles full-date ranges separated by "to"', () => {
    const r = parseReservation('Stay: 06/24/2026 to 06/27/2026');
    expect(r.checkInDate).toBe('2026-06-24');
    expect(r.checkOutDate).toBe('2026-06-27');
  });
});
