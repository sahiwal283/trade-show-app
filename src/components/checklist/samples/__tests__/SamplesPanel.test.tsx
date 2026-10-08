// src/components/checklist/samples/__tests__/SamplesPanel.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const makeHook = () => ({
  status: 'ready',
  catalog: {
    lines: [{ id: 'l-1', brand: 'boomin_brands', name: 'Peelz', position: 1, is_active: true }, { id: 'l-2', brand: 'haute_brands', name: 'Oh! Mit', position: 1, is_active: true }],
    products: [{ id: 'p-1', product_line_id: 'l-1', name: 'Mango', position: 1, is_active: true }, { id: 'p-2', product_line_id: 'l-2', name: 'Blue Razz', position: 1, is_active: true }],
    materials: [{ id: 'm-1', name: 'Banner', position: 1, is_active: true }],
  },
  view: {
    request: { id: 'r', eventId: 'ev-1', status: 'draft', submittedAt: null, submittedBy: null, lastEditedAt: null, lastEditedBy: null, items: [], materials: [] },
    window: { opensAt: null, closesAt: '2099-01-01T05:00:00Z', isOpen: true }, canEdit: true,
  } as any,
  items: new Map(), materials: new Map(), dirtyCount: 0, saving: false, submitting: false, closed: false, override: false,
  setOverride: vi.fn(), canEdit: true, canSubmit: true, isOffline: false, error: null as string | null, updatedBy: null as { name: string; at: string } | null,
  setItem: vi.fn(), setMaterial: vi.fn(), submit: vi.fn(), refresh: vi.fn(), retry: vi.fn(),
});
let hook = makeHook();
vi.mock('../useEventSampleRequest', () => ({ useEventSampleRequest: () => hook }));
vi.mock('../SampleHistory', () => ({ SampleHistory: (p: any) => <div data-testid="history" data-key={p.refreshKey} /> }));

import { SamplesPanel } from '../SamplesPanel';

const INPUTS = ['Mango singles', 'Mango displays', 'Mango empty displays', 'Blue Razz singles', 'Banner qty', 'Banner notes'];
const expectAllDisabled = () => { for (const label of INPUTS) expect(screen.getByLabelText(label)).toBeDisabled(); };

describe('SamplesPanel', () => {
  beforeEach(() => { hook = makeHook(); });

  it('shows not-yet-submitted, both brands (Haute first), the countdown, Submit and History', () => {
    render(<SamplesPanel eventId="ev-1" userId="u-1" role="salesperson" />);
    expect(screen.getByText('Not yet submitted')).toBeInTheDocument();
    const headings = screen.getAllByRole('heading', { level: 4 }).map((h) => h.textContent);
    expect(headings.indexOf('Haute Brands')).toBeLessThan(headings.indexOf('Coolioh'));
    expect(headings).toEqual(['Haute Brands', 'Coolioh', 'Marketing & booth supplies']);   // line names are level 5
    expect(screen.getByText(/Closes in/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit sample request' })).toBeEnabled();
    expect(screen.getByTestId('history')).toBeInTheDocument();
    for (const label of INPUTS) expect(screen.getByLabelText(label)).toBeEnabled();
  });

  it('shows who submitted and who last edited, and Resubmit changes', () => {
    hook.view.request = { ...hook.view.request, status: 'submitted', submittedAt: '2026-10-14T16:00:00Z', submittedBy: { id: 'u-5', name: 'Rita' },
      lastEditedAt: new Date(Date.now() - 5 * 60_000).toISOString(), lastEditedBy: { id: 'u-2', name: 'Sameer' } };
    hook.canSubmit = false;
    const onStatusChange = vi.fn();
    render(<SamplesPanel eventId="ev-1" userId="u-1" role="salesperson" onStatusChange={onStatusChange} />);
    expect(screen.getByText(/Submitted by Rita on Oct 14 · last edited by Sameer 5 min ago/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resubmit changes' })).toBeDisabled();
    expect(onStatusChange).toHaveBeenCalledWith('submitted');
    expect(screen.getByTestId('history')).toHaveAttribute('data-key', hook.view.request.lastEditedAt);
  });

  it('edits through setItem and setMaterial, one field at a time, and submits through submit', () => {
    render(<SamplesPanel eventId="ev-1" userId="u-1" role="salesperson" />);
    fireEvent.change(screen.getByLabelText('Mango singles'), { target: { value: '4' } });
    expect(hook.setItem).toHaveBeenCalledWith('p-1', 'singles', 4);
    fireEvent.change(screen.getByLabelText('Banner qty'), { target: { value: '2' } });
    expect(hook.setMaterial).toHaveBeenLastCalledWith('m-1', { qty: 2 });
    fireEvent.change(screen.getByLabelText('Banner notes'), { target: { value: 'big one' } });
    expect(hook.setMaterial).toHaveBeenLastCalledWith('m-1', { notes: 'big one' });
    fireEvent.click(screen.getByRole('button', { name: 'Submit sample request' }));
    expect(hook.submit).toHaveBeenCalledTimes(1);
  });

  it('shows the updated-by note', () => {
    hook.updatedBy = { name: 'Sameer', at: new Date().toISOString() };
    render(<SamplesPanel eventId="ev-1" userId="u-1" role="salesperson" />);
    expect(screen.getByText(/Updated by Sameer just now/)).toBeInTheDocument();
  });

  it('shows the save state, and the hook error in its place', () => {
    hook.dirtyCount = 1;
    const { rerender } = render(<SamplesPanel eventId="ev-1" userId="u-1" role="salesperson" />);
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    hook = makeHook(); hook.error = 'Your changes were not accepted. Refresh to see the current list.';
    rerender(<SamplesPanel eventId="ev-1" userId="u-1" role="salesperson" />);
    expect(screen.getByText(/Your changes were not accepted/)).toBeInTheDocument();
    expect(screen.queryByText('All changes saved')).not.toBeInTheDocument();
  });

  it('is view-only for someone who cannot edit while the window is open', () => {
    hook.view.canEdit = false; hook.canEdit = false; hook.canSubmit = false;
    render(<SamplesPanel eventId="ev-1" userId="puller" role="salesperson" />);
    expect(screen.getByText(/View only/)).toBeInTheDocument();
    expect(screen.getByLabelText('Mango singles')).toBeDisabled();
    expectAllDisabled();
    expect(screen.queryByRole('button', { name: /Submit sample request/ })).not.toBeInTheDocument();
  });

  it('shows no Submit button to someone who cannot edit once the window has closed either', () => {
    hook.view.canEdit = false; hook.canEdit = false; hook.canSubmit = false; hook.closed = true;
    hook.view.request = { ...hook.view.request, status: 'submitted', submittedAt: '2026-10-14T16:00:00Z' };
    render(<SamplesPanel eventId="ev-1" userId="puller" role="salesperson" />);
    expectAllDisabled();
    expect(screen.queryByRole('button', { name: /submit/i })).not.toBeInTheDocument();
  });

  it('closed: banner, disabled inputs, Edit anyway only for override roles', () => {
    hook.closed = true; hook.canEdit = false;
    const { rerender } = render(<SamplesPanel eventId="ev-1" userId="u-1" role="salesperson" />);
    expect(screen.getByText(/closed on/i)).toBeInTheDocument();
    expect(screen.queryByText(/Edit anyway/)).not.toBeInTheDocument();
    expectAllDisabled();
    expect(screen.getByRole('button', { name: 'Submit sample request' })).toBeDisabled();
    expect(screen.queryByText(/Closes in/)).not.toBeInTheDocument();
    rerender(<SamplesPanel eventId="ev-1" userId="adm" role="admin" />);
    expectAllDisabled();
    fireEvent.click(screen.getByLabelText(/Edit anyway/));
    expect(hook.setOverride).toHaveBeenCalledWith(true);
  });

  it('follows the hook once an override role has switched Edit anyway on', () => {
    hook.closed = true; hook.override = true; hook.canEdit = true;
    render(<SamplesPanel eventId="ev-1" userId="adm" role="admin" />);
    expect(screen.getByLabelText('Mango singles')).toBeEnabled();
    expect(screen.getByLabelText(/Edit anyway/)).toBeChecked();
  });

  it('keeps inputs disabled past the deadline even before the server has said closed', () => {
    hook.view.window.closesAt = '2020-01-01T05:00:00Z';
    render(<SamplesPanel eventId="ev-1" userId="u-1" role="salesperson" />);
    expect(screen.getByText(/closed on/i)).toBeInTheDocument();
    expectAllDisabled();
    expect(screen.getByRole('button', { name: 'Submit sample request' })).toBeDisabled();
  });

  it('renders nothing when forbidden, and the offline note when offline', () => {
    hook.status = 'forbidden';
    const { container, rerender } = render(<SamplesPanel eventId="ev-1" userId="u-9" role="salesperson" />);
    expect(container).toBeEmptyDOMElement();
    hook = makeHook(); hook.isOffline = true; hook.canEdit = false;
    rerender(<SamplesPanel eventId="ev-1" userId="u-1" role="salesperson" />);
    expect(screen.getByText(/You're offline/)).toBeInTheDocument();
    expectAllDisabled();
    expect(screen.getByRole('button', { name: 'Submit sample request' })).toBeDisabled();
  });

  it('while loading shows no inputs and no Submit', () => {
    hook.status = 'loading'; hook.catalog = null as any; hook.view = null; hook.canEdit = false; hook.canSubmit = false;
    render(<SamplesPanel eventId="ev-1" userId="u-1" role="salesperson" />);
    expect(screen.getByText(/Loading sample request/)).toBeInTheDocument();
    expect(screen.queryAllByRole('spinbutton')).toHaveLength(0);
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /submit/i })).not.toBeInTheDocument();
  });

  it.each([['error', /Couldn't load the sample request/], ['offline', /You're offline/]])('a failed load (%s) offers Retry, wired to the hook', (status, message) => {
    hook.status = status; hook.catalog = null as any; hook.view = null; hook.canEdit = false; hook.canSubmit = false;
    render(<SamplesPanel eventId="ev-1" userId="u-1" role="salesperson" />);
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.queryAllByRole('spinbutton')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(hook.retry).toHaveBeenCalledTimes(1);
  });
});
