import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';

const setEventFilterSpy = vi.fn();

vi.mock('../ExpenseSubmission/hooks/useExpenses', () => ({
  useExpenses: () => ({ expenses: [], setExpenses: vi.fn(), events: [], users: [], entityOptions: [], engine: { reviewInMidas: false, poweredByMidas: false }, loading: false, reload: vi.fn() }),
}));
vi.mock('../ExpenseSubmission/hooks/usePendingSync', () => ({ usePendingSync: () => ({ pendingCount: 0 }) }));
vi.mock('../ExpenseSubmission/hooks/useExpenseFilters', async (orig) => {
  const actual = await orig<typeof import('../ExpenseSubmission/hooks/useExpenseFilters')>();
  return {
    useExpenseFilters: (expenses: Parameters<typeof actual.useExpenseFilters>[0]) => {
      const r = actual.useExpenseFilters(expenses);
      return { ...r, setEventFilter: (v: string) => { setEventFilterSpy(v); r.setEventFilter(v); } };
    },
  };
});

import { ExpenseSubmission } from '../ExpenseSubmission';

const user = { id: 'u-1', name: 'Ana', username: 'ana', email: 'a@x.test', role: 'salesperson' } as any;

describe('ExpenseSubmission #event deep link', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn(() => new Promise(() => undefined))); });
  afterEach(() => { history.replaceState(null, '', '/'); vi.unstubAllGlobals(); });

  it('filters to the event id from a hash that carries extra params', () => {
    history.replaceState(null, '', '/#event=abc&tab=my');
    render(<ExpenseSubmission user={user} />);
    expect(setEventFilterSpy).toHaveBeenCalledWith('abc');
    expect(window.location.hash).toBe(''); // consumed, as before
  });
});
