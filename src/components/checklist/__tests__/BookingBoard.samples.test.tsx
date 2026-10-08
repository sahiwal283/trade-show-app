// src/components/checklist/__tests__/BookingBoard.samples.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';

let lastPanelProps: any = null;
vi.mock('../../../utils/networkDetection', () => {
  const networkMonitor = { isOnline: () => true, getState: () => ({ status: 'online', isOnline: true }), addListener: () => () => undefined };
  return { networkMonitor, default: networkMonitor };
});
vi.mock('../samples/SamplesPanel', () => ({
  SamplesPanel: (p: any) => { lastPanelProps = p; return <div data-testid="samples-panel" data-event={p.eventId} />; },
}));
vi.mock('../../../utils/sampleRequestApi', async (orig) => {
  const actual = await orig<typeof import('../../../utils/sampleRequestApi')>();
  return { ...actual, sampleRequestApi: { getEvent: vi.fn(async () => ({ request: { status: 'draft' }, window: {}, canEdit: true })) } };
});

import { BookingBoard } from '../BookingBoard';
import { sampleRequestApi } from '../../../utils/sampleRequestApi';

const user = { id: 'adm', name: 'Admin', username: 'a', email: 'a@x.com', role: 'admin' } as any;
const event = { id: 'ev-1', name: 'Expo', participants: [] } as any;
const checklist = { id: 1, event_id: 1, booth_ordered: false, booth_notes: null, booth_map_url: null, electricity_ordered: false, electricity_notes: null, flights: [], hotels: [], carRentals: [], boothShipping: [], customItems: [] } as any;
const props = { checklist, user, event, saving: false, onUpdate: vi.fn(async () => undefined), onReload: vi.fn() };

describe('BookingBoard samples tab', () => {
  beforeEach(() => { vi.clearAllMocks(); lastPanelProps = null; });

  it('has a Samples tab after Tasks showing 0/1, and opens it when requested', async () => {
    const handled = vi.fn();
    render(<BookingBoard {...props} requestedTab="samples" onRequestedTabHandled={handled} />);
    const tabs = screen.getAllByRole('tab').map((t) => t.textContent);
    expect(tabs[tabs.length - 1]).toMatch(/^Samples/);
    expect(screen.getByRole('tab', { name: /Samples/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /Samples/ }).textContent).toContain('0/1');
    expect(screen.getByTestId('samples-panel')).toHaveAttribute('data-event', 'ev-1');
    expect(lastPanelProps).toMatchObject({ eventId: 'ev-1', userId: 'adm', role: 'admin' });
    await waitFor(() => expect(handled).toHaveBeenCalled());
  });

  it('counts 1/1 once the event request is submitted, from the fetch or from the panel', async () => {
    vi.mocked(sampleRequestApi.getEvent).mockResolvedValueOnce({ request: { status: 'submitted' }, window: {}, canEdit: true } as any);
    const { unmount } = render(<BookingBoard {...props} requestedTab="samples" />);
    await waitFor(() => expect(screen.getByRole('tab', { name: /Samples/ }).textContent).toContain('1/1'));
    unmount();
    render(<BookingBoard {...props} requestedTab="samples" />);
    await waitFor(() => expect(sampleRequestApi.getEvent).toHaveBeenCalledTimes(2));
    await act(async () => { await Promise.resolve(); });   // let the board's own status fetch settle first
    act(() => lastPanelProps.onStatusChange('submitted'));
    expect(screen.getByRole('tab', { name: /Samples/ }).textContent).toContain('1/1');
  });

  it('a panel-reported status is not overwritten by a later-arriving board fetch', async () => {
    let resolveFetch!: (v: any) => void;
    vi.mocked(sampleRequestApi.getEvent).mockReturnValueOnce(new Promise((r) => { resolveFetch = r; }) as any);
    render(<BookingBoard {...props} requestedTab="samples" />);
    act(() => lastPanelProps.onStatusChange('submitted'));
    expect(screen.getByRole('tab', { name: /Samples/ }).textContent).toContain('1/1');
    await act(async () => { resolveFetch({ request: { status: 'draft' }, window: {}, canEdit: true }); await Promise.resolve(); });
    expect(screen.getByRole('tab', { name: /Samples/ }).textContent).toContain('1/1');
  });

  it('after switching shows a fresh fetch result is applied again', async () => {
    const { rerender } = render(<BookingBoard {...props} requestedTab="samples" />);
    await act(async () => { await Promise.resolve(); });
    act(() => lastPanelProps.onStatusChange('submitted'));
    vi.mocked(sampleRequestApi.getEvent).mockResolvedValueOnce({ request: { status: 'submitted' }, window: {}, canEdit: true } as any);
    rerender(<BookingBoard {...props} event={{ ...event, id: 'ev-2' }} />);
    await waitFor(() => expect(screen.getByRole('tab', { name: /Samples/ }).textContent).toContain('1/1'));
  });
});
