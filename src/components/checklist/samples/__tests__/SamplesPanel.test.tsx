// src/components/checklist/samples/__tests__/SamplesPanel.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

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

  describe('print form', () => {
    const printBtn = () => screen.queryByRole('button', { name: 'Print form' });
    const sheet = () => document.body.querySelector('.sample-print-sheet');

    it('is offered to the puller and to override roles, not to other attendees', () => {
      const { unmount } = render(<SamplesPanel eventId="ev-1" userId="rep" role="salesperson" />);
      expect(printBtn()).not.toBeInTheDocument();
      unmount();
      hook.view.isPuller = true;
      const second = render(<SamplesPanel eventId="ev-1" userId="puller" role="salesperson" />);
      expect(printBtn()).toBeInTheDocument();
      second.unmount();
      hook.view.isPuller = false;
      render(<SamplesPanel eventId="ev-1" userId="admin" role="admin" />);
      expect(printBtn()).toBeInTheDocument();
    });

    it('stays available to the puller after the form has closed', () => {
      hook.view.isPuller = true; hook.view.canEdit = false; hook.canEdit = false; hook.closed = true;
      hook.view.window = { opensAt: null, closesAt: '2020-01-01T05:00:00Z', isOpen: false };
      render(<SamplesPanel eventId="ev-1" userId="puller" role="salesperson" />);
      expect(printBtn()).toBeInTheDocument();
    });

    it('prints the request as it stands: show, status, every product, quantities, notes and tick boxes for requested lines', () => {
      hook.view.isPuller = true;
      hook.view.event = { name: 'MJBizCon', venue: 'LVCC', city: 'Las Vegas', state: 'NV', showStartDate: '2026-12-01', showEndDate: '2026-12-03' };
      hook.view.request = { ...hook.view.request, status: 'submitted', submittedAt: '2026-10-14T15:00:00Z', submittedBy: { id: 'u', name: 'Rita' }, lastEditedAt: '2026-10-14T14:00:00Z', lastEditedBy: { id: 'u', name: 'Rita' } };
      hook.items = new Map([['p-1', { productId: 'p-1', singles: 24, displays: 2, emptyDisplays: 0 }]]);
      hook.materials = new Map([['m-1', { materialId: 'm-1', qty: 3, notes: '2 large' }]]);
      let captured = '';
      const print = vi.fn(() => { captured = sheet()?.textContent ?? ''; expect(document.body.classList.contains('printing-sample-sheet')).toBe(true); });
      vi.stubGlobal('print', print);
      render(<SamplesPanel eventId="ev-1" userId="puller" role="salesperson" />);
      expect(sheet()).toBeNull();

      fireEvent.click(printBtn()!);
      expect(print).toHaveBeenCalledTimes(1);
      for (const text of ['MJBizCon', 'LVCC · Las Vegas, NV', 'Dec 1, 2026 – Dec 3, 2026', 'Submitted by Rita', 'Mango', 'Blue Razz', 'Banner', '2 large', '1 product · 24 singles · 2 displays · 0 empty displays', 'Pulled by']) {
        expect(captured).toContain(text);
      }
      const mangoRow = [...sheet()!.querySelectorAll('tr')].find((r) => r.textContent?.startsWith('Mango'))!;
      expect([...mangoRow.querySelectorAll('td')].map((c) => c.textContent)).toEqual(['Mango', '24', '2', '', '']);
      expect(mangoRow.querySelector('td:last-child span')).not.toBeNull();        // a box to tick
      const blueRow = [...sheet()!.querySelectorAll('tr')].find((r) => r.textContent?.startsWith('Blue Razz'))!;
      expect(blueRow.querySelector('td:last-child span')).toBeNull();             // nothing requested, nothing to tick

      fireEvent(window, new Event('afterprint'));
      expect(sheet()).toBeNull();
      expect(document.body.classList.contains('printing-sample-sheet')).toBe(false);
      vi.unstubAllGlobals();
    });

    it('marks a draft on the sheet so an unsubmitted list is not pulled by mistake', () => {
      hook.view.isPuller = true;
      let captured = '';
      vi.stubGlobal('print', vi.fn(() => { captured = sheet()?.textContent ?? ''; }));
      render(<SamplesPanel eventId="ev-1" userId="puller" role="salesperson" />);
      fireEvent.click(printBtn()!);
      expect(captured).toContain('DRAFT: this request has not been submitted');
      fireEvent(window, new Event('afterprint'));
      vi.unstubAllGlobals();
    });
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

  describe('what was not saved stays visible when the form turns read-only', () => {
    it('window closed with dirty fields and a read-only view: the not-saved line shows and there is no Submit', () => {
      hook.closed = true; hook.canEdit = false; hook.canSubmit = false; hook.view.canEdit = false; hook.dirtyCount = 2;
      hook.view.window.isOpen = false;
      render(<SamplesPanel eventId="ev-1" userId="u-1" role="salesperson" />);
      expect(screen.getByText('These changes were not saved.')).toBeInTheDocument();
      expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /submit/i })).not.toBeInTheDocument();
      expectAllDisabled();
    });

    it('removed from the roster mid-edit: the hook error stays visible on a read-only view, with no Submit', () => {
      hook.view.canEdit = false; hook.canEdit = false; hook.canSubmit = false;
      hook.error = 'Your changes were not accepted. Refresh to see the current list.';
      render(<SamplesPanel eventId="ev-1" userId="u-1" role="salesperson" />);
      expect(screen.getByText('Your changes were not accepted. Refresh to see the current list.')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /submit/i })).not.toBeInTheDocument();
    });

    it('a read-only view with nothing unsaved and no error shows no save-state line', () => {
      hook.view.canEdit = false; hook.canEdit = false; hook.canSubmit = false;
      render(<SamplesPanel eventId="ev-1" userId="puller" role="salesperson" />);
      expect(screen.queryByText('All changes saved')).not.toBeInTheDocument();
      expect(screen.queryByText('These changes were not saved.')).not.toBeInTheDocument();
    });

    it('closed by a 409 while the view still says editable: not-saved line, Submit shown but disabled', () => {
      hook.closed = true; hook.canEdit = false; hook.canSubmit = false; hook.dirtyCount = 1;
      render(<SamplesPanel eventId="ev-1" userId="u-1" role="salesperson" />);
      expect(screen.getByText('These changes were not saved.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Submit sample request' })).toBeDisabled();
    });

    it('offline with dirty fields still reads Unsaved changes: they are sent on reconnect', () => {
      hook.isOffline = true; hook.canEdit = false; hook.canSubmit = false; hook.dirtyCount = 1;
      render(<SamplesPanel eventId="ev-1" userId="u-1" role="salesperson" />);
      expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    });
  });

  describe('retired catalog rows', () => {
    const LABEL = 'no longer offered';
    const rowOf = (name: string) => screen.getByText(name).closest('tr') as HTMLElement;
    const item = (productId: string) => [productId, { productId, singles: 1, displays: 0, emptyDisplays: 0 }] as const;
    beforeEach(() => {
      hook.catalog.lines.push({ id: 'l-3', brand: 'haute_brands', name: 'Old Line', position: 2, is_active: false });
      hook.catalog.products.push(
        { id: 'p-3', product_line_id: 'l-1', name: 'Retired Kiwi', position: 2, is_active: false },
        { id: 'p-4', product_line_id: 'l-3', name: 'Orphan Lime', position: 1, is_active: true },
      );
      hook.catalog.materials.push({ id: 'm-2', name: 'Old Flyer', position: 2, is_active: false });
    });

    it('a retired product on the request renders with the label; active rows carry none', () => {
      hook.items = new Map([item('p-3')]);
      render(<SamplesPanel eventId="ev-1" userId="u-1" role="salesperson" />);
      expect(within(rowOf('Retired Kiwi')).getByText(LABEL)).toBeInTheDocument();
      expect(within(rowOf('Mango')).queryByText(LABEL)).not.toBeInTheDocument();
    });

    it('a retired product not on the request does not render', () => {
      render(<SamplesPanel eventId="ev-1" userId="u-1" role="salesperson" />);
      expect(screen.queryByText('Retired Kiwi')).not.toBeInTheDocument();
      expect(screen.queryByText(LABEL)).not.toBeInTheDocument();
    });

    it('an active product under a retired line renders, labelled, only when it is on the request', () => {
      const { unmount } = render(<SamplesPanel eventId="ev-1" userId="u-1" role="salesperson" />);
      expect(screen.queryByText('Orphan Lime')).not.toBeInTheDocument();
      expect(screen.queryByText('Old Line')).not.toBeInTheDocument();
      unmount();
      hook.items = new Map([item('p-4')]);
      render(<SamplesPanel eventId="ev-1" userId="u-1" role="salesperson" />);
      expect(screen.getByRole('heading', { level: 5, name: 'Old Line' })).toBeInTheDocument();
      expect(within(rowOf('Orphan Lime')).getByText(LABEL)).toBeInTheDocument();
      expect(screen.getAllByText(LABEL)).toHaveLength(1);
    });

    it('a retired material renders with the label when on the request, and not at all otherwise', () => {
      const { unmount } = render(<SamplesPanel eventId="ev-1" userId="u-1" role="salesperson" />);
      expect(screen.queryByText('Old Flyer')).not.toBeInTheDocument();
      unmount();
      hook.materials = new Map([['m-2', { materialId: 'm-2', qty: 1, notes: null }]]);
      render(<SamplesPanel eventId="ev-1" userId="u-1" role="salesperson" />);
      expect(within(rowOf('Old Flyer')).getByText(LABEL)).toBeInTheDocument();
      expect(within(rowOf('Banner')).queryByText(LABEL)).not.toBeInTheDocument();
    });
  });

  it('does not call onStatusChange again for the same status when the callback identity changes', () => {
    const first = vi.fn(); const second = vi.fn();
    const { rerender } = render(<SamplesPanel eventId="ev-1" userId="u-1" role="salesperson" onStatusChange={first} />);
    expect(first).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledWith('draft');
    rerender(<SamplesPanel eventId="ev-1" userId="u-1" role="salesperson" onStatusChange={second} />);
    rerender(<SamplesPanel eventId="ev-1" userId="u-1" role="salesperson" onStatusChange={() => second('draft')} />);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
    hook.view = { ...hook.view, request: { ...hook.view.request, status: 'submitted', submittedAt: '2026-10-14T16:00:00Z' } };
    rerender(<SamplesPanel eventId="ev-1" userId="u-1" role="salesperson" onStatusChange={second} />);
    expect(second).toHaveBeenCalledTimes(1);                         // the status changed: the current callback hears it
    expect(second).toHaveBeenCalledWith('submitted');
    expect(first).toHaveBeenCalledTimes(1);
  });

  describe('past the deadline on this clock, override role', () => {
    beforeEach(() => { hook.view.window.closesAt = '2020-01-01T05:00:00Z'; hook.view.canEdit = true; hook.canEdit = true; });

    it('with Edit anyway on: inputs enabled and Submit shown', () => {
      hook.override = true;
      render(<SamplesPanel eventId="ev-1" userId="adm" role="admin" />);
      for (const label of INPUTS) expect(screen.getByLabelText(label)).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Submit sample request' })).toBeEnabled();
      expect(screen.getByLabelText(/Edit anyway/)).toBeChecked();
    });

    it('with Edit anyway off: inputs disabled', () => {
      hook.override = false;
      render(<SamplesPanel eventId="ev-1" userId="adm" role="admin" />);
      expectAllDisabled();
      expect(screen.getByRole('button', { name: 'Submit sample request' })).toBeDisabled();
      expect(screen.getByLabelText(/Edit anyway/)).not.toBeChecked();
    });
  });
});
