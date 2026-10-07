import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';

const filterArgs = vi.fn();
const setSelectedEventSpy = vi.fn();

vi.mock('../hooks/useReportsData', () => ({
  useReportsData: () => ({ expenses: [], events: [], entityOptions: [], loading: false, reload: vi.fn(), setExpenses: vi.fn() }),
}));
vi.mock('../hooks/useShowSummaries', () => ({ useShowSummaries: () => ({ rows: [], loading: false }) }));
vi.mock('../hooks/useCrmLeads', async (orig) => ({
  ...(await orig<typeof import('../hooks/useCrmLeads')>()),
  useCrmLeads: () => ({ rows: [] }),
  useCrmLeadOwners: () => ({ rows: [] }),
}));
vi.mock('../hooks/useReportsFilters', async (orig) => {
  const actual = await orig<typeof import('../hooks/useReportsFilters')>();
  return {
    useReportsFilters: (args: Parameters<typeof actual.useReportsFilters>[0]) => {
      filterArgs(args);
      const r = actual.useReportsFilters(args);
      return { ...r, setSelectedEvent: (v: string) => { setSelectedEventSpy(v); r.setSelectedEvent(v); } };
    },
  };
});

vi.mock('../../../utils/apiClient', async (orig) => {
  const empty = vi.fn(() => Promise.resolve([]));
  return { ...(await orig<typeof import('../../../utils/apiClient')>()), apiClient: { get: empty, post: empty, put: empty, delete: empty, patch: empty } };
});

import { Reports } from '../Reports';

const user = { id: 'u-1', name: 'Ana', username: 'ana', email: 'a@x.test', role: 'admin' } as any;

describe('Reports #event deep link', () => {
  afterEach(() => { history.replaceState(null, '', '/'); });

  it('reads the event id from a hash that carries extra params', () => {
    history.replaceState(null, '', '/#event=abc&tab=my');
    render(<Reports user={user} />);
    expect(filterArgs).toHaveBeenCalledWith(expect.objectContaining({ initialEvent: 'abc', initialReportType: 'detailed' }));
  });

  it('reads the event id on hashchange when extra params are present', () => {
    render(<Reports user={user} />);
    act(() => {
      history.replaceState(null, '', '/#event=abc&tab=my');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(setSelectedEventSpy).toHaveBeenCalledWith('abc');
  });
});
