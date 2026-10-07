import { describe, it, expect, vi, afterEach } from 'vitest';
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

// Module init of the network monitor pings the health endpoint, so stub it out.
vi.mock('../../../utils/networkDetection', () => {
  const networkMonitor = { isOnline: () => true, getState: () => ({ status: 'online', isOnline: true }), addListener: () => () => undefined };
  return { networkMonitor, default: networkMonitor };
});
vi.mock('../../../utils/apiClient', async (orig) => {
  const empty = vi.fn(() => Promise.resolve([]));
  return { ...(await orig<typeof import('../../../utils/apiClient')>()), apiClient: { get: empty, post: empty, put: empty, delete: empty, patch: empty } };
});

import { ExpenseSubmission } from '../ExpenseSubmission';

const user = { id: 'u-1', name: 'Ana', username: 'ana', email: 'a@x.test', role: 'salesperson' } as any;

describe('ExpenseSubmission #event deep link', () => {
  afterEach(() => { history.replaceState(null, '', '/'); });

  it('filters to the event id from a hash that carries extra params', () => {
    history.replaceState(null, '', '/#event=abc&tab=my');
    render(<ExpenseSubmission user={user} />);
    expect(setEventFilterSpy).toHaveBeenCalledWith('abc');
    expect(window.location.hash).toBe(''); // consumed, as before
  });
});
