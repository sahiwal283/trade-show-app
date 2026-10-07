import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../../../../utils/sampleRequestApi', async (orig) => {
  const actual = await orig<typeof import('../../../../utils/sampleRequestApi')>();
  return {
    ...actual,
    sampleRequestApi: {
      getSummary: vi.fn(async () => ({
        eventId: 'ev-1', eventName: 'Expo', pullerUserId: null,
        window: { opensAt: null, closesAt: '2026-10-24T03:59:59Z', isOpen: true },
        participants: [
          { userId: 'u-1', name: 'Ana', status: 'submitted', submittedAt: '2026-10-06T00:00:00Z' },
          { userId: 'u-2', name: 'Bo', status: 'none', submittedAt: null },
        ],
        products: [{ productId: 'p-1', productName: 'Mango', lineId: 'l-1', lineName: 'Peelz', brand: 'boomin_brands', isActive: true,
          singles: 3, displays: 1, emptyDisplays: 2,
          byUser: [{ userId: 'u-1', name: 'Ana', status: 'submitted', singles: 2, displays: 1, emptyDisplays: 0 },
                   { userId: 'u-3', name: 'Cy', status: 'draft', singles: 1, displays: 0, emptyDisplays: 2 }] }],
        materials: [{ materialId: 'm-1', materialName: 'Banner', isActive: true, qty: 2,
          byUser: [{ userId: 'u-1', name: 'Ana', status: 'submitted', qty: 2, notes: 'big one' }] }],
      })),
    },
  };
});

import { SamplesSummaryTab } from '../SamplesSummaryTab';

describe('SamplesSummaryTab', () => {
  it('shows totals, who has submitted, and per-rep rows on expand', async () => {
    render(<SamplesSummaryTab eventId="ev-1" />);
    expect(await screen.findByText('Mango')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();     // singles total
    expect(screen.getByText(/1 of 2 submitted/)).toBeInTheDocument();
    expect(screen.getByText(/No sample puller set/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Mango/ }));
    expect(screen.getByText('Cy')).toBeInTheDocument();
    expect(screen.getByText('draft')).toBeInTheDocument();
    expect(screen.getByText('big one')).toBeInTheDocument();
  });
});
