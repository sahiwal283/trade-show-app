import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';

vi.mock('../../../../utils/api', () => ({
  api: {
    USE_SERVER: true,
    getEvents: vi.fn(),
    checklist: { getChecklist: vi.fn(), updateChecklist: vi.fn() },
  },
}));
vi.mock('../SampleRequestSection', () => ({ SampleRequestSection: () => null }));
vi.mock('../../../../utils/sampleRequestApi', async (orig) => ({
  ...(await orig<typeof import('../../../../utils/sampleRequestApi')>()),
  sampleRequestApi: { getAccess: vi.fn() },
}));

import { api } from '../../../../utils/api';
import { sampleRequestApi } from '../../../../utils/sampleRequestApi';
import { UserChecklist } from '../../UserChecklist';
import { TradeShowChecklist } from '../../TradeShowChecklist';

const user = { id: 'u-1', name: 'Ana', username: 'ana', email: 'a@x.test', role: 'salesperson' } as any;
const ev = (id: string, name: string) => ({ id, name, startDate: '2026-11-01', endDate: '2026-11-03', participants: [{ id: 'u-1' }] });

describe('checklist #event hash links', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getEvents).mockResolvedValue([ev('ev-1', 'Expo One'), ev('ev-2', 'Expo Two')] as any);
    vi.mocked(api.checklist.getChecklist).mockResolvedValue({ flights: [], hotels: [], carRentals: [] } as any);
  });
  afterEach(() => { history.replaceState(null, '', '/'); });

  it('UserChecklist selects the linked show on hashchange and clears the hash', async () => {
    render(<UserChecklist user={user} />);
    const select = await screen.findByRole('combobox');
    await waitFor(() => expect((select as HTMLSelectElement).value).toBe('ev-1'));
    act(() => {
      history.replaceState(null, '', '/#event=ev-2&tab=my');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    await waitFor(() => expect((select as HTMLSelectElement).value).toBe('ev-2'));
    expect(window.location.hash).toBe('');
  });

  it('a rep does not mount UserChecklist until access is known, so a cold tab=my link lands on that show', async () => {
    let resolveAccess!: (v: { canViewSummary: boolean }) => void;
    vi.mocked(sampleRequestApi.getAccess).mockReturnValue(new Promise((r) => { resolveAccess = r; }) as any);
    history.replaceState(null, '', '/#event=ev-2&tab=my');
    render(<TradeShowChecklist user={user} />);
    expect(screen.getByText(/Loading your itinerary/)).toBeInTheDocument();
    expect(api.getEvents).not.toHaveBeenCalled();
    await act(async () => { resolveAccess({ canViewSummary: false }); });
    const select = await screen.findByRole('combobox');
    await waitFor(() => expect((select as HTMLSelectElement).value).toBe('ev-2'));
  });
});
