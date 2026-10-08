import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';

vi.mock('../../../../utils/networkDetection', () => {
  const networkMonitor = { isOnline: () => true, getState: () => ({ status: 'online', isOnline: true }), addListener: () => () => undefined };
  return { networkMonitor, default: networkMonitor };
});
vi.mock('../../../../utils/api', () => ({
  api: {
    USE_SERVER: true,
    getEvents: vi.fn(),
    checklist: { getChecklist: vi.fn(async () => ({ id: 1, event_id: 1, flights: [], hotels: [], carRentals: [], boothShipping: [], customItems: [] })) },
  },
}));
vi.mock('../../../../utils/sampleRequestApi', async (orig) => {
  const actual = await orig<typeof import('../../../../utils/sampleRequestApi')>();
  return { ...actual, sampleRequestApi: { getEventAccess: vi.fn(async () => ({ canView: true, canEdit: true })) } };
});
vi.mock('../SamplesPanel', () => ({ SamplesPanel: (p: any) => <div data-testid="samples-panel" data-event={p.eventId} /> }));
vi.mock('../../BookingBoard', () => ({
  BookingBoard: (p: any) => <div data-testid="board" data-event={p.event.id} data-tab={p.requestedTab ?? ''} />,
}));

import { UserChecklist } from '../../UserChecklist';
import { TradeShowChecklist } from '../../TradeShowChecklist';
import { api } from '../../../../utils/api';
import { sampleRequestApi } from '../../../../utils/sampleRequestApi';

const rep = { id: 'u-1', name: 'Rep', username: 'r', email: 'r@x.com', role: 'salesperson' } as any;
const admin = { id: 'adm', name: 'Admin', username: 'a', email: 'a@x.com', role: 'admin' } as any;
const ev = (id: string) => ({ id, name: `Show ${id}`, startDate: '2099-01-01', endDate: '2099-01-02', showStartDate: '2099-01-01', showEndDate: '2099-01-02', participants: [{ id: 'u-1' }] });

const go = (hash: string) => act(() => { window.location.hash = hash; window.dispatchEvent(new HashChangeEvent('hashchange')); });

describe('checklist #event hash links (shared sample request)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    history.replaceState(null, '', window.location.pathname);
    vi.mocked(api.getEvents).mockResolvedValue([ev('ev-1'), ev('ev-2')] as any);
    vi.mocked(sampleRequestApi.getEventAccess).mockResolvedValue({ canView: true, canEdit: true });
  });

  it('a rep sees the Samples panel for the selected show and follows a tab=samples link', async () => {
    render(<UserChecklist user={rep} />);
    expect(await screen.findByTestId('samples-panel')).toHaveAttribute('data-event', 'ev-1');
    expect(screen.getByRole('tab', { name: 'Samples' })).toBeInTheDocument();
    go('#event=ev-2&tab=samples');
    await waitFor(() => expect(screen.getByTestId('samples-panel')).toHaveAttribute('data-event', 'ev-2'));
    expect(window.location.hash).toBe('');
  });

  it('a rep cold-loading #event=ev-2&tab=samples gets that show and the hash is cleared', async () => {
    window.location.hash = '#event=ev-2&tab=samples';
    render(<UserChecklist user={rep} />);
    expect(await screen.findByTestId('samples-panel')).toHaveAttribute('data-event', 'ev-2');
    expect(window.location.hash).toBe('');
  });

  it('a rep link to an unknown show keeps the current show and clears the hash', async () => {
    render(<UserChecklist user={rep} />);
    expect(await screen.findByTestId('samples-panel')).toHaveAttribute('data-event', 'ev-1');
    go('#event=nope&tab=samples');
    expect(window.location.hash).toBe('');
    expect(screen.getByTestId('samples-panel')).toHaveAttribute('data-event', 'ev-1');
  });

  it('a rep cold link to an unknown show falls back to the first show and clears the hash', async () => {
    window.location.hash = '#event=nope&tab=samples';
    render(<UserChecklist user={rep} />);
    expect(await screen.findByTestId('samples-panel')).toHaveAttribute('data-event', 'ev-1');
    expect(window.location.hash).toBe('');
  });

  it('hides the Samples block when the rep cannot view that show', async () => {
    let resolveAccess!: (v: { canView: boolean; canEdit: boolean }) => void;
    vi.mocked(sampleRequestApi.getEventAccess).mockReturnValue(new Promise((r) => { resolveAccess = r; }));
    render(<UserChecklist user={rep} />);
    await waitFor(() => expect(sampleRequestApi.getEventAccess).toHaveBeenCalledWith('ev-1'));
    await act(async () => { resolveAccess({ canView: false, canEdit: false }); await Promise.resolve(); });
    expect(screen.queryByTestId('samples-panel')).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Samples' })).not.toBeInTheDocument();
  });

  it('an embedded My Checklist shows no Samples panel and leaves tab=samples links alone', async () => {
    render(<UserChecklist user={admin} embedded />);
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(2));
    await waitFor(() => expect(api.checklist.getChecklist).toHaveBeenCalled());
    expect(screen.queryByTestId('samples-panel')).not.toBeInTheDocument();
    go('#event=ev-2&tab=samples');
    expect(window.location.hash).toBe('#event=ev-2&tab=samples');
  });

  it('an admin opening a tab=samples link lands on the board with the Samples tab requested', async () => {
    window.location.hash = '#event=ev-2&tab=samples';
    render(<TradeShowChecklist user={admin} />);
    const board = await screen.findByTestId('board');
    expect(board).toHaveAttribute('data-event', 'ev-2');
    expect(board).toHaveAttribute('data-tab', 'samples');
    expect(screen.queryByRole('button', { name: 'Samples' })).not.toBeInTheDocument();
    expect(window.location.hash).toBe('');
  });

  it('the privileged toggle has exactly two options', async () => {
    render(<TradeShowChecklist user={admin} />);
    await screen.findByTestId('board');
    expect(screen.getAllByRole('button').filter((b) => b.className.includes('seg-tab')).map((b) => b.textContent))
      .toEqual(['Admin Checklist', 'My Checklist']);
  });

  it('a rep gets My Checklist straight away with no access round-trip at the page level', async () => {
    render(<TradeShowChecklist user={rep} />);
    expect(await screen.findByTestId('samples-panel')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Admin Checklist' })).not.toBeInTheDocument();
  });
});
