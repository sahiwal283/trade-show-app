import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';

vi.mock('../../../utils/networkDetection', () => {
  const networkMonitor = { isOnline: () => true, getState: () => ({ status: 'online', isOnline: true }), addListener: () => () => undefined };
  return { networkMonitor, default: networkMonitor };
});
vi.mock('../../../utils/api', () => ({
  api: { USE_SERVER: true, getEvents: vi.fn(), checklist: { getChecklist: vi.fn() } },
}));
const reloads: Record<string, () => void> = {};
vi.mock('../BookingBoard', () => ({
  BookingBoard: (p: any) => { reloads[p.event.id] = p.onReload; return <div data-testid="board" data-event={p.event.id} />; },
}));

import { TradeShowChecklist } from '../TradeShowChecklist';
import { api } from '../../../utils/api';

const admin = { id: 'adm', name: 'Admin', username: 'a', email: 'a@x.com', role: 'admin' } as any;
const ev = (id: string, start: string, end: string) => ({ id, name: `Show ${id}`, startDate: start, endDate: end, showStartDate: start, showEndDate: end, participants: [] });
const data = { id: 1, event_id: 1, flights: [], hotels: [], carRentals: [], boothShipping: [], customItems: [] };

describe('stale background reload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    history.replaceState(null, '', window.location.pathname);
    vi.mocked(api.getEvents).mockResolvedValue([ev('ev-1', '2000-01-01', '2099-12-31'), ev('ev-2', '2099-01-01', '2099-01-02')] as any);
  });

  it('a reload fired for show A after switching to B cannot strand the page on a spinner', async () => {
    vi.mocked(api.checklist.getChecklist).mockResolvedValue(data as any);
    render(<TradeShowChecklist user={admin} />);
    await waitFor(() => expect(screen.getByTestId('board')).toHaveAttribute('data-event', 'ev-1'));
    const reloadA = reloads['ev-1'];

    let resolveB!: (v: any) => void;
    let resolveA!: (v: any) => void;
    vi.mocked(api.checklist.getChecklist).mockImplementation(((id: string) =>
      new Promise((r) => { if (id === 'ev-2') resolveB = r; else resolveA = r; })) as any);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'ev-2' } });
    await waitFor(() => expect(api.checklist.getChecklist).toHaveBeenCalledWith('ev-2'));
    await act(async () => { reloadA(); });
    // Whatever A's reload does, its response lands before B's.
    await act(async () => { resolveA?.(data); });
    await act(async () => { resolveB(data); });
    await waitFor(() => expect(screen.getByTestId('board')).toHaveAttribute('data-event', 'ev-2'));
  });
});
