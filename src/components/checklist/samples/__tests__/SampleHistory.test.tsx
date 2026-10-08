// src/components/checklist/samples/__tests__/SampleHistory.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../../../utils/sampleRequestApi', async (orig) => {
  const actual = await orig<typeof import('../../../../utils/sampleRequestApi')>();
  return { ...actual, sampleRequestApi: { getHistory: vi.fn() } };
});
import { SampleHistory } from '../SampleHistory';
import { sampleRequestApi } from '../../../../utils/sampleRequestApi';

const change = { id: 'c-1', userId: 'u-2', userName: 'Sameer', kind: 'item', targetId: 'p-1', targetName: 'Mango', lineName: 'Peelz', brand: 'boomin_brands', field: 'singles', oldValue: '2', newValue: '4', changedAt: new Date(Date.now() - 5 * 60_000).toISOString() };

describe('SampleHistory', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads only when opened and lists changes newest first as given', async () => {
    vi.mocked(sampleRequestApi.getHistory).mockResolvedValue({ changes: [change] } as any);
    render(<SampleHistory eventId="ev-1" refreshKey="a" />);
    expect(sampleRequestApi.getHistory).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /History/ }));
    expect(await screen.findByText(/Sameer changed Peelz · Mango singles 2 → 4/)).toBeInTheDocument();
    expect(screen.getByText(/5 min ago/)).toBeInTheDocument();
  });

  it('reloads when refreshKey changes while open, and shows the empty and failure states', async () => {
    vi.mocked(sampleRequestApi.getHistory).mockResolvedValueOnce({ changes: [] } as any);
    const { rerender } = render(<SampleHistory eventId="ev-1" refreshKey="a" />);
    fireEvent.click(screen.getByRole('button', { name: /History/ }));
    expect(await screen.findByText(/No changes yet/)).toBeInTheDocument();
    vi.mocked(sampleRequestApi.getHistory).mockRejectedValueOnce(new Error('x'));
    rerender(<SampleHistory eventId="ev-1" refreshKey="b" />);
    await waitFor(() => expect(sampleRequestApi.getHistory).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/History unavailable/)).toBeInTheDocument();
  });
});
