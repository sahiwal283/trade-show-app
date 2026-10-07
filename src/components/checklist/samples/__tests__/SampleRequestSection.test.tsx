import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const hook = {
  status: 'ready', catalog: {
    lines: [{ id: 'l-1', brand: 'boomin_brands', name: 'Peelz', position: 1, is_active: true },
            { id: 'l-2', brand: 'haute_brands', name: 'Oh! Mit', position: 1, is_active: true }],
    products: [{ id: 'p-1', product_line_id: 'l-1', name: 'Mango', position: 1, is_active: true },
               { id: 'p-2', product_line_id: 'l-2', name: 'Blue Razz', position: 1, is_active: true },
               { id: 'p-old', product_line_id: 'l-1', name: 'Gone', position: 9, is_active: false }],
    materials: [{ id: 'm-1', name: 'Banner', position: 1, is_active: true }],
  },
  view: { request: { id: 'r', event_id: 'ev-1', user_id: 'u-1', status: 'draft', submitted_at: null, items: [], materials: [] },
          window: { opensAt: null, closesAt: '2099-01-01T05:00:00Z', isOpen: true } },
  items: new Map([['p-old', { productId: 'p-old', singles: 1, displays: 0, emptyDisplays: 0 }]]),
  materials: new Map(), dirty: false, saving: false, submitting: false, closed: false, override: false,
  setOverride: vi.fn(), canEdit: true, canSubmit: true, error: null, setItem: vi.fn(), setMaterial: vi.fn(), submit: vi.fn(),
};
vi.mock('../useSampleRequest', () => ({ useSampleRequest: () => hook }));

import { SampleRequestSection } from '../SampleRequestSection';

describe('SampleRequestSection', () => {
  beforeEach(() => { vi.clearAllMocks(); hook.closed = false; hook.view.request.status = 'draft'; hook.canSubmit = true; hook.status = 'ready'; });

  it('renders both brands, the countdown, and a Submit button', () => {
    render(<SampleRequestSection eventId="ev-1" userId="u-1" role="salesperson" />);
    expect(screen.getByText('Coolioh')).toBeInTheDocument();
    expect(screen.getByText('Haute Brands')).toBeInTheDocument();
    expect(screen.getByText(/Closes in/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Submit/ })).toBeEnabled();
  });

  it('shows a retired product that is on the request, labeled', () => {
    render(<SampleRequestSection eventId="ev-1" userId="u-1" role="salesperson" />);
    expect(screen.getByText('Gone')).toBeInTheDocument();
    expect(screen.getByText(/no longer offered/i)).toBeInTheDocument();
  });

  it('shows a retired line only when one of its products is on the request', () => {
    const saved = { lines: hook.catalog.lines, products: hook.catalog.products };
    hook.catalog.lines = [...saved.lines,
      { id: 'l-ret', brand: 'boomin_brands', name: 'Old Line', position: 2, is_active: false },
      { id: 'l-ret2', brand: 'boomin_brands', name: 'Dead Line', position: 3, is_active: false }];
    hook.catalog.products = [...saved.products,
      { id: 'p-ret', product_line_id: 'l-ret', name: 'Old Flavor', position: 1, is_active: false },
      { id: 'p-act', product_line_id: 'l-ret', name: 'Active Under Retired', position: 2, is_active: true },
      { id: 'p-dead', product_line_id: 'l-ret2', name: 'Dead Flavor', position: 1, is_active: true }];
    const savedItems = hook.items;
    hook.items = new Map([...savedItems, ['p-ret', { productId: 'p-ret', singles: 2, displays: 0, emptyDisplays: 0 }]]);
    try {
      render(<SampleRequestSection eventId="ev-1" userId="u-1" role="salesperson" />);
      expect(screen.getByText('Old Line')).toBeInTheDocument();
      expect(screen.getByText('Old Flavor')).toBeInTheDocument();
      expect(screen.getAllByText(/no longer offered/i).length).toBeGreaterThanOrEqual(2);
      expect(screen.queryByText('Active Under Retired')).not.toBeInTheDocument();
      expect(screen.queryByText('Dead Line')).not.toBeInTheDocument();
      expect(screen.queryByText('Dead Flavor')).not.toBeInTheDocument();
    } finally {
      hook.catalog.lines = saved.lines; hook.catalog.products = saved.products; hook.items = savedItems;
    }
  });

  it('calls setItem with a parsed integer', () => {
    render(<SampleRequestSection eventId="ev-1" userId="u-1" role="salesperson" />);
    const input = screen.getByLabelText('Mango singles');
    fireEvent.change(input, { target: { value: '4' } });
    expect(hook.setItem).toHaveBeenCalledWith('p-1', 'singles', 4);
  });

  it('reads "Resubmit changes" after a submission and disables when unchanged', () => {
    hook.view.request.status = 'submitted';
    hook.canSubmit = false;
    render(<SampleRequestSection eventId="ev-1" userId="u-1" role="salesperson" />);
    expect(screen.getByRole('button', { name: /Resubmit changes/ })).toBeDisabled();
    expect(screen.getByText('Submitted')).toBeInTheDocument();
  });

  it('is read-only with a banner when closed, and offers Edit anyway to an admin', () => {
    hook.closed = true;
    hook.canEdit = false;
    const { rerender } = render(<SampleRequestSection eventId="ev-1" userId="u-1" role="salesperson" />);
    expect(screen.getByText(/closed on/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Mango singles')).toBeDisabled();
    expect(screen.queryByText(/Edit anyway/)).not.toBeInTheDocument();
    rerender(<SampleRequestSection eventId="ev-1" userId="u-1" role="admin" />);
    expect(screen.getByText(/Edit anyway/)).toBeInTheDocument();
    hook.canEdit = true;
  });

  it('shows the offline note', () => {
    hook.status = 'offline';
    render(<SampleRequestSection eventId="ev-1" userId="u-1" role="salesperson" />);
    expect(screen.getByText(/reconnect to edit/i)).toBeInTheDocument();
  });
});
