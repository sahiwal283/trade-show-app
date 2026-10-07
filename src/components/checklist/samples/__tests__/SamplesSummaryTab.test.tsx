import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

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

const sectionProps = vi.fn();
vi.mock('../SampleRequestSection', () => ({
  SampleRequestSection: (props: any) => { sectionProps(props); return <div data-testid="embedded-section" />; },
}));

import { SamplesSummaryTab } from '../SamplesSummaryTab';
import { sampleRequestApi } from '../../../../utils/sampleRequestApi';

describe('SamplesSummaryTab', () => {
  it('shows totals, who has submitted, and per-rep rows on expand', async () => {
    render(<SamplesSummaryTab eventId="ev-1" actorId="adm-1" actorRole="salesperson" />);
    expect(await screen.findByText('Mango')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();     // singles total
    expect(screen.getByText(/1 of 2 submitted/)).toBeInTheDocument();
    expect(screen.getByText(/No sample puller set/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Mango/ }));
    expect(screen.getByText('Cy')).toBeInTheDocument();
    expect(screen.getByText('draft')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Banner/ }));
    expect(screen.getByText('big one')).toBeInTheDocument();
  });

  it('lets an admin open a rep\'s request from the participant chip, and refreshes after a change', async () => {
    render(<SamplesSummaryTab eventId="ev-1" actorId="adm-1" actorRole="admin" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit sample request for Bo' }));
    expect(screen.getByText("Editing Bo's request")).toBeInTheDocument();
    expect(screen.getByTestId('embedded-section')).toBeInTheDocument();
    const props = sectionProps.mock.calls.at(-1)![0];
    expect(props).toMatchObject({ eventId: 'ev-1', userId: 'u-2', actorId: 'adm-1', role: 'admin' });
    const before = vi.mocked(sampleRequestApi.getSummary).mock.calls.length;
    await act(async () => { props.onChanged(); });
    expect(vi.mocked(sampleRequestApi.getSummary).mock.calls.length).toBe(before + 1);
    expect(screen.getByTestId('embedded-section')).toBeInTheDocument(); // editor stays mounted across the refresh
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByTestId('embedded-section')).not.toBeInTheDocument();
  });

  it('renders plain chips (not buttons) for a non-override role', async () => {
    render(<SamplesSummaryTab eventId="ev-1" actorId="u-1" actorRole="salesperson" />);
    expect(await screen.findByText(/Bo · not started/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Edit sample request for/ })).not.toBeInTheDocument();
  });
});
