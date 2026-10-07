import { describe, it, expect } from 'vitest';
import { computeSampleWindow, endOfDayEastern } from '../../src/services/sampleRequests/sampleRequestWindow';

const base = { created_at: '2026-10-01T12:00:00.000Z' };

describe('endOfDayEastern', () => {
  it('is 23:59:59 EDT in summer (UTC-4)', () => {
    expect(endOfDayEastern('2026-07-10').toISOString()).toBe('2026-07-11T03:59:59.000Z');
  });
  it('is 23:59:59 EST in winter (UTC-5)', () => {
    expect(endOfDayEastern('2026-01-10').toISOString()).toBe('2026-01-11T04:59:59.000Z');
  });
  it('handles the fall-back DST day without an off-by-one hour', () => {
    // 2026-11-01 is the day clocks fall back; end of day is already EST.
    expect(endOfDayEastern('2026-11-01').toISOString()).toBe('2026-11-02T04:59:59.000Z');
  });
  it('accepts a Date (pg DATE columns parse to local midnight)', () => {
    expect(endOfDayEastern(new Date(2026, 6, 10)).toISOString()).toBe('2026-07-11T03:59:59.000Z');
  });
});

describe('computeSampleWindow', () => {
  it('closes 7 days before travel start, end of day Eastern', () => {
    const w = computeSampleWindow({ ...base, travel_start_date: '2026-10-20' }, new Date('2026-10-05T00:00:00Z'));
    expect(w.closesAt).toBe('2026-10-14T03:59:59.000Z'); // Oct 13 23:59:59 EDT
    expect(w.opensAt).toBe('2026-10-01T12:00:00.000Z');
    expect(w.isOpen).toBe(true);
  });
  it('falls back to show start when travel start is null', () => {
    const w = computeSampleWindow({ ...base, travel_start_date: null, show_start_date: '2026-10-20' }, new Date('2026-10-05T00:00:00Z'));
    expect(w.closesAt).toBe('2026-10-14T03:59:59.000Z');
  });
  it('prefers travel start over show start when both are present', () => {
    const w = computeSampleWindow({ ...base, travel_start_date: '2026-10-18', show_start_date: '2026-10-20' }, new Date('2026-10-05T00:00:00Z'));
    expect(w.closesAt).toBe('2026-10-12T03:59:59.000Z');
  });
  it('has no window when neither date exists', () => {
    const w = computeSampleWindow({ ...base, travel_start_date: null, show_start_date: null });
    expect(w).toEqual({ opensAt: '2026-10-01T12:00:00.000Z', closesAt: null, isOpen: false });
  });
  it('is closed one second after closesAt and open one second before', () => {
    const ev = { ...base, travel_start_date: '2026-10-20' };
    expect(computeSampleWindow(ev, new Date('2026-10-14T03:59:58Z')).isOpen).toBe(true);
    expect(computeSampleWindow(ev, new Date('2026-10-14T04:00:00Z')).isOpen).toBe(false);
  });
  it('is closed before opensAt', () => {
    const w = computeSampleWindow({ ...base, travel_start_date: '2026-10-20' }, new Date('2026-09-30T00:00:00Z'));
    expect(w.isOpen).toBe(false);
  });
  it('is already closed for a show booked inside the 7-day window', () => {
    const w = computeSampleWindow({ created_at: '2026-10-15T00:00:00Z', travel_start_date: '2026-10-20' }, new Date('2026-10-15T01:00:00Z'));
    expect(w.isOpen).toBe(false);
  });
});
