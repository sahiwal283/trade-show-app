import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../../utils/badgeApi', () => ({
  badgeApi: {
    listScans: vi.fn(async () => []),
    createScan: vi.fn(async () => ({ id: 'scan-1' })),
    updateScan: vi.fn(async () => ({ id: 'scan-1' })),
    exportUrl: (eventId: string, format: string) => `/api/badge-scans/export?eventId=${eventId}&format=${format}`,
    downloadExport: vi.fn(async () => undefined),
  },
}));
vi.mock('../../../contexts/PicklistContext', () => ({
  usePicklists: () => ({
    companies: [
      { name: 'Haute Brands', zohoEnabled: true, sortOrder: 1 },
      { name: 'Summitt Labs', zohoEnabled: false, sortOrder: 2 },
    ],
    isUnavailable: false,
  }),
}));
vi.mock('../../../utils/api', () => ({
  api: { getEvents: vi.fn(async () => [{ id: 'ev-1', name: 'NACS Show 2026', status: 'active' }]) },
}));
vi.mock('../BadgeScanner', () => ({
  BadgeScanner: ({ entity }: any) => <div data-testid="scanner">scanning for {entity}</div>,
}));

import { LeadsPage } from '../LeadsPage';

const user = { id: 'u1', name: 'Rep', username: 'rep', email: 'r@x.com', role: 'salesperson' } as any;

describe('LeadsPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('will not start a scan until a company is chosen', async () => {
    // An unnoticed default sends leads to the wrong CRM, which is a failure
    // you only discover after the show.
    render(<LeadsPage user={user} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /scan badge/i })).toBeDisabled());
  });

  it('enables scanning once an event and a company are selected', async () => {
    render(<LeadsPage user={user} />);
    await waitFor(() => screen.getByLabelText(/company/i));
    fireEvent.change(screen.getByLabelText(/event/i), { target: { value: 'ev-1' } });
    fireEvent.change(screen.getByLabelText(/company/i), { target: { value: 'Haute Brands' } });
    await waitFor(() => expect(screen.getByRole('button', { name: /scan badge/i })).toBeEnabled());
  });

  it('opens the scanner carrying the chosen company', async () => {
    render(<LeadsPage user={user} />);
    await waitFor(() => screen.getByLabelText(/company/i));
    fireEvent.change(screen.getByLabelText(/event/i), { target: { value: 'ev-1' } });
    fireEvent.change(screen.getByLabelText(/company/i), { target: { value: 'Haute Brands' } });
    fireEvent.click(screen.getByRole('button', { name: /scan badge/i }));
    expect(screen.getByTestId('scanner')).toHaveTextContent('Haute Brands');
  });

  it('warns that a non-Zoho company still captures leads but will not sync', async () => {
    render(<LeadsPage user={user} />);
    await waitFor(() => screen.getByLabelText(/company/i));
    fireEvent.change(screen.getByLabelText(/event/i), { target: { value: 'ev-1' } });
    fireEvent.change(screen.getByLabelText(/company/i), { target: { value: 'Summitt Labs' } });
    expect(screen.getByText(/will not sync to zoho crm/i)).toBeInTheDocument();
  });

  it('exports through the authenticated download, not a bare link navigation', async () => {
    // A plain <a href> carries no Authorization header and 401s. The button
    // must call the api-client helper that fetches with the token.
    const { badgeApi } = await import('../../../utils/badgeApi');
    render(<LeadsPage user={user} />);
    await waitFor(() => screen.getByLabelText(/event/i));
    fireEvent.change(screen.getByLabelText(/event/i), { target: { value: 'ev-1' } });
    fireEvent.click(screen.getByRole('button', { name: /export/i }));
    await waitFor(() => expect(badgeApi.downloadExport).toHaveBeenCalledWith('ev-1', 'xlsx'));
  });
});
