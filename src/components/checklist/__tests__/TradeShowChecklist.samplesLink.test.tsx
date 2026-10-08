import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';

vi.mock('../../../utils/api', () => ({
  api: {
    USE_SERVER: true,
    getEvents: vi.fn(),
    checklist: {
      getChecklist: vi.fn(async () => ({ id: 1, event_id: 1, flights: [], hotels: [], carRentals: [], boothShipping: [], customItems: [] })),
    },
  },
}));
vi.mock('../../../utils/sampleRequestApi', async (orig) => {
  const actual = await orig<typeof import('../../../utils/sampleRequestApi')>();
  return {
    ...actual,
    sampleRequestApi: {
      getEvent: vi.fn(async () => ({ request: { status: 'draft' }, window: {}, canEdit: true })),
      getEventAccess: vi.fn(async () => ({ canView: true, canEdit: true })),
    },
  };
});
vi.mock('../samples/SamplesPanel', () => ({
  SamplesPanel: (p: any) => <div data-testid="samples-panel" data-event={p.eventId} />,
}));

import { TradeShowChecklist } from '../TradeShowChecklist';
import { api } from '../../../utils/api';

const admin = { id: 'adm', name: 'Admin', username: 'a', email: 'a@x.com', role: 'admin' } as any;
// ev-1 is live, so it is the default selection.
const ev = (id: string, start: string, end: string) => ({ id, name: `Show ${id}`, startDate: start, endDate: end, showStartDate: start, showEndDate: end, participants: [] });
const events = [ev('ev-1', '2000-01-01', '2099-12-31'), ev('ev-2', '2099-01-01', '2099-01-02')];

const go = (hash: string) => act(() => { window.location.hash = hash; window.dispatchEvent(new HashChangeEvent('hashchange')); });
const samplesTab = () => screen.getByRole('tab', { name: /^Samples/ });
const select = () => screen.getByRole('combobox') as HTMLSelectElement;

describe('TradeShowChecklist samples deep links (real board)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    history.replaceState(null, '', window.location.pathname);
    vi.mocked(api.getEvents).mockResolvedValue(events as any);
  });

  it('(a) cold #event=ev-2&tab=samples opens the Samples tab for ev-2 and clears the hash', async () => {
    window.location.hash = '#event=ev-2&tab=samples';
    render(<TradeShowChecklist user={admin} />);
    await waitFor(() => expect(samplesTab()).toHaveAttribute('aria-selected', 'true'));
    expect(screen.getByTestId('samples-panel')).toHaveAttribute('data-event', 'ev-2');
    expect(window.location.hash).toBe('');
  });

  it('(b)(c) warm links to another show land on Samples, also after the board tab was changed', async () => {
    render(<TradeShowChecklist user={admin} />);
    await waitFor(() => expect(screen.getByRole('tab', { name: /^Booth/ })).toHaveAttribute('aria-selected', 'true'));
    expect(select().value).toBe('ev-1');

    go('#event=ev-2&tab=samples');
    await waitFor(() => expect(select().value).toBe('ev-2'));
    await waitFor(() => expect(samplesTab()).toHaveAttribute('aria-selected', 'true'));
    expect(screen.getByTestId('samples-panel')).toHaveAttribute('data-event', 'ev-2');
    expect(window.location.hash).toBe('');

    fireEvent.click(screen.getByRole('tab', { name: /^Booth/ }));
    expect(screen.getByRole('tab', { name: /^Booth/ })).toHaveAttribute('aria-selected', 'true');

    go('#event=ev-1&tab=samples');
    await waitFor(() => expect(select().value).toBe('ev-1'));
    await waitFor(() => expect(samplesTab()).toHaveAttribute('aria-selected', 'true'));
    expect(screen.getByTestId('samples-panel')).toHaveAttribute('data-event', 'ev-1');
  });

  it('(d) a warm link to an unknown show stays on the current show and tab and clears the hash', async () => {
    render(<TradeShowChecklist user={admin} />);
    await waitFor(() => expect(screen.getByRole('tab', { name: /^Booth/ })).toHaveAttribute('aria-selected', 'true'));
    go('#event=nope&tab=samples');
    expect(window.location.hash).toBe('');
    expect(select().value).toBe('ev-1');
    expect(screen.getByRole('tab', { name: /^Booth/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByTestId('samples-panel')).not.toBeInTheDocument();
  });

  it('(d2) a cold link to an unknown show falls back to the default show on Booth', async () => {
    window.location.hash = '#event=nope&tab=samples';
    render(<TradeShowChecklist user={admin} />);
    await waitFor(() => expect(screen.getByRole('tab', { name: /^Booth/ })).toHaveAttribute('aria-selected', 'true'));
    expect(select().value).toBe('ev-1');
    expect(window.location.hash).toBe('');
  });

  it('(e) a warm bare #event=ev-2 does not pull the admin off My Checklist', async () => {
    window.location.hash = '#tab=my';
    render(<TradeShowChecklist user={admin} />);
    await waitFor(() => expect(api.getEvents).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'My Checklist' }).className).toContain('seg-tab-active');
    go('#event=ev-2');
    expect(screen.getByRole('button', { name: 'My Checklist' }).className).toContain('seg-tab-active');
    expect(screen.getByRole('button', { name: 'Admin Checklist' }).className).not.toContain('seg-tab-active');
  });
});
