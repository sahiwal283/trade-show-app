import { describe, it, expect } from 'vitest';
import {
  leadEventPhase, leadEventStatus, leadEventSummary, sortLeadEvents, isOpenForLeads,
} from '../leadEvents';

const NOW = new Date(2026, 9, 6, 15, 0); // Oct 6, 2026, mid-afternoon
const ev = (name: string, showStartDate: string, showEndDate: string, extra: object = {}) =>
  ({ id: name, name, showStartDate, showEndDate, ...extra });

describe('leadEventPhase', () => {
  it('is live on every show day, first and last included', () => {
    expect(leadEventPhase(ev('a', '2026-10-06', '2026-10-09'), NOW)).toBe('live');
    expect(leadEventPhase(ev('a', '2026-10-03', '2026-10-06'), NOW)).toBe('live');
  });

  it('stays open for two weeks after the show so reps can finish entering leads', () => {
    expect(leadEventPhase(ev('a', '2026-09-20', '2026-09-22'), NOW)).toBe('wrapping'); // 14 days
    expect(leadEventPhase(ev('a', '2026-09-19', '2026-09-21'), NOW)).toBe('closed'); // 15 days
  });

  it('closes a show from January, and one from last year', () => {
    expect(leadEventPhase(ev('a', '2026-01-18', '2026-01-20'), NOW)).toBe('closed');
    expect(leadEventPhase(ev('a', '2025-10-14', '2025-10-17'), NOW)).toBe('closed');
  });

  it('appears two weeks ahead of the show, not months ahead', () => {
    expect(leadEventPhase(ev('a', '2026-10-20', '2026-10-22'), NOW)).toBe('soon'); // 14 days
    expect(leadEventPhase(ev('a', '2026-10-21', '2026-10-23'), NOW)).toBe('upcoming');
  });

  it('falls back to the legacy dates, and keeps an undated event open', () => {
    expect(leadEventPhase({ id: 'a', name: 'a', startDate: '2026-10-05', endDate: '2026-10-07' }, NOW)).toBe('live');
    expect(leadEventPhase({ id: 'a', name: 'a' }, NOW)).toBe('live');
    expect(leadEventPhase({ id: 'a', name: 'a', showStartDate: 'soon', showEndDate: '' }, NOW)).toBe('live');
  });

  it('reads ISO timestamps as the calendar day they name', () => {
    expect(leadEventPhase(ev('a', '2026-10-06T00:00:00.000Z', '2026-10-06T00:00:00.000Z'), NOW)).toBe('live');
  });
});

describe('isOpenForLeads', () => {
  it('opens live, just-ended and about-to-start shows only', () => {
    expect(['live', 'wrapping', 'soon', 'upcoming', 'closed'].map((p) => isOpenForLeads(p as never)))
      .toEqual([true, true, true, false, false]);
  });
});

describe('leadEventStatus', () => {
  it('says where the show is relative to today', () => {
    expect(leadEventStatus(ev('a', '2026-10-06', '2026-10-09'), NOW)).toBe('Live now');
    expect(leadEventStatus(ev('a', '2026-10-07', '2026-10-09'), NOW)).toBe('Starts tomorrow');
    expect(leadEventStatus(ev('a', '2026-10-10', '2026-10-12'), NOW)).toBe('Starts in 4 days');
    expect(leadEventStatus(ev('a', '2026-10-03', '2026-10-05'), NOW)).toBe('Ended yesterday');
    expect(leadEventStatus(ev('a', '2026-09-28', '2026-10-01'), NOW)).toBe('Ended 5 days ago');
    expect(leadEventStatus({ id: 'a', name: 'a' }, NOW)).toBe('');
  });
});

describe('leadEventSummary', () => {
  it('shows the show dates and the place', () => {
    expect(leadEventSummary(ev('a', '2026-10-06', '2026-10-09', { city: 'Las Vegas', state: 'NV' })))
      .toBe('Oct 6 – 9, 2026 · Las Vegas, NV');
    expect(leadEventSummary(ev('a', '2026-09-30', '2026-10-02'))).toBe('Sep 30 – Oct 2, 2026');
    expect(leadEventSummary(ev('a', '2026-10-06', '2026-10-06'))).toBe('Oct 6, 2026');
    expect(leadEventSummary({ id: 'a', name: 'a' })).toBe('');
  });
});

describe('sortLeadEvents', () => {
  it('puts the show happening now first and old shows last, newest of those first', () => {
    const sorted = sortLeadEvents([
      ev('last year', '2025-10-14', '2025-10-17'),
      ev('next month', '2026-11-10', '2026-11-12'),
      ev('january', '2026-01-18', '2026-01-20'),
      ev('next week', '2026-10-13', '2026-10-15'),
      ev('just ended', '2026-09-28', '2026-10-01'),
      ev('live', '2026-10-06', '2026-10-09'),
    ], NOW);
    expect(sorted.map((e) => e.name)).toEqual([
      'live', 'just ended', 'next week', 'next month', 'january', 'last year',
    ]);
  });
});
