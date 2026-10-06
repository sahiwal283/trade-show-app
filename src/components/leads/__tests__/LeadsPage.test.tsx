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
  BadgeScanner: ({ entity, onCaptured }: any) => (
    <div data-testid="scanner">
      scanning for {entity}
      <button
        onClick={() => onCaptured({
          rawPayload: 'https://reg.example.com/attendee/1',
          format: 'QRCode',
          parsed: { fields: {}, tokens: [], confidence: 0, parserVersion: 'v2' },
        })}
      >
        simulate capture
      </button>
    </div>
  ),
}));

import { LeadsPage } from '../LeadsPage';
import { api } from '../../../utils/api';

/** Open a picker by its visible label and choose an option by its name. */
const choose = (label: RegExp, option: RegExp | string) => {
  fireEvent.click(screen.getByRole('combobox', { name: label }));
  fireEvent.click(screen.getByRole('option', { name: option }));
};
const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

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
    await screen.findByRole('combobox', { name: /^event.*NACS Show 2026/i });
    choose(/^event/i, /NACS Show 2026/);
    choose(/company/i, /Haute Brands/);
    await waitFor(() => expect(screen.getByRole('button', { name: /scan badge/i })).toBeEnabled());
  });

  it('opens the scanner carrying the chosen company', async () => {
    render(<LeadsPage user={user} />);
    await screen.findByRole('combobox', { name: /^event.*NACS Show 2026/i });
    choose(/^event/i, /NACS Show 2026/);
    choose(/company/i, /Haute Brands/);
    fireEvent.click(screen.getByRole('button', { name: /scan badge/i }));
    expect(screen.getByTestId('scanner')).toHaveTextContent('Haute Brands');
  });

  it('warns that a non-Zoho company still captures leads but will not sync', async () => {
    render(<LeadsPage user={user} />);
    await screen.findByRole('combobox', { name: /^event.*NACS Show 2026/i });
    choose(/^event/i, /NACS Show 2026/);
    choose(/company/i, /Summitt Labs/);
    expect(screen.getByText(/will not sync to zoho crm/i)).toBeInTheDocument();
  });

  it('exports through the authenticated download, not a bare link navigation', async () => {
    // A plain <a href> carries no Authorization header and 401s. The button
    // must call the api-client helper that fetches with the token.
    const { badgeApi } = await import('../../../utils/badgeApi');
    render(<LeadsPage user={user} />);
    await screen.findByRole('combobox', { name: /^event.*NACS Show 2026/i });
    choose(/^event/i, /NACS Show 2026/);
    fireEvent.click(screen.getByRole('button', { name: /export/i }));
    await waitFor(() => expect(badgeApi.downloadExport).toHaveBeenCalledWith('ev-1', 'xlsx'));
  });
});

describe('LeadsPage — barcode format', () => {
  it('records which symbology the lead came from', async () => {
    // Without it every QR lead is stored as PDF417 (the column default), and
    // the parser cannot be tuned per format from the data later.
    const { badgeApi } = await import('../../../utils/badgeApi');
    render(<LeadsPage user={user} />);
    await screen.findByRole('combobox', { name: /^event.*NACS Show 2026/i });
    choose(/^event/i, /NACS Show 2026/);
    choose(/company/i, /Haute Brands/);
    fireEvent.click(screen.getByRole('button', { name: /scan badge/i }));
    fireEvent.click(screen.getByRole('button', { name: /simulate capture/i }));
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() => expect(badgeApi.createScan).toHaveBeenCalledWith(
      expect.objectContaining({ barcodeFormat: 'QRCode', rawPayload: 'https://reg.example.com/attendee/1' })
    ));
  });
});

describe('LeadsPage — event picker', () => {
  const EVENTS = [
    { id: 'old', name: 'NACS 2025', showStartDate: day(-360), showEndDate: day(-357) },
    { id: 'jan', name: 'Winter Fancy Faire 2026', showStartDate: day(-260), showEndDate: day(-258) },
    { id: 'live', name: 'NACS Show 2026', showStartDate: day(-1), showEndDate: day(2), city: 'Las Vegas', state: 'NV' },
    { id: 'recent', name: 'Champs Chicago 2026', showStartDate: day(-9), showEndDate: day(-7) },
    { id: 'far', name: 'ASD Marketweek 2027', showStartDate: day(120), showEndDate: day(123) },
  ];
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getEvents).mockResolvedValue(EVENTS as any);
  });
  const openEventPicker = async () => {
    const picker = await screen.findByRole('combobox', { name: /^event/i });
    await waitFor(() => expect(api.getEvents).toHaveBeenCalled());
    fireEvent.click(picker);
    return screen.getAllByRole('option').map((o) => o.textContent);
  };

  it('offers only shows that can still take leads, the live one first', async () => {
    render(<LeadsPage user={user} />);
    await screen.findByRole('button', { name: /show all events \(3 more\)/i });
    const options = await openEventPicker();
    expect(options).toHaveLength(2);
    expect(options[0]).toMatch(/NACS Show 2026.*Las Vegas, NV.*Live now/);
    expect(options[1]).toMatch(/Champs Chicago 2026.*Ended 7 days ago/);
  });

  it('does not pick an event for the rep when more than one is open', async () => {
    render(<LeadsPage user={user} />);
    await screen.findByRole('button', { name: /show all events/i });
    expect(screen.getByRole('combobox', { name: /^event/i })).toHaveTextContent('Select an event');
  });

  it('picks the event when exactly one show is open, but never the company', async () => {
    vi.mocked(api.getEvents).mockResolvedValue(EVENTS.filter((e) => e.id !== 'recent') as any);
    render(<LeadsPage user={user} />);
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: /^event/i })).toHaveTextContent('NACS Show 2026'));
    expect(screen.getByRole('combobox', { name: /company/i })).toHaveTextContent('Select a company');
    expect(screen.getByRole('button', { name: /scan badge/i })).toBeDisabled();
  });

  it('keeps old shows reachable for viewing and export, but not for scanning', async () => {
    const { badgeApi } = await import('../../../utils/badgeApi');
    render(<LeadsPage user={user} />);
    fireEvent.click(await screen.findByRole('button', { name: /show all events/i }));
    choose(/^event/i, /NACS 2025/);
    choose(/company/i, /Haute Brands/);
    expect(screen.getByText(/closed for new leads/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /scan badge/i })).toBeDisabled();
    await waitFor(() => expect(badgeApi.listScans).toHaveBeenCalledWith(expect.objectContaining({ eventId: 'old' })));
    expect(screen.getByRole('button', { name: /export/i })).toBeEnabled();
  });

  it('keeps a chosen old show in the list after hiding the others again', async () => {
    render(<LeadsPage user={user} />);
    fireEvent.click(await screen.findByRole('button', { name: /show all events/i }));
    choose(/^event/i, /NACS 2025/);
    fireEvent.click(screen.getByRole('button', { name: /show open events only/i }));
    fireEvent.click(screen.getByRole('combobox', { name: /^event/i }));
    expect(screen.getAllByRole('option').map((o) => o.textContent).join('|')).toMatch(/NACS 2025/);
    expect(screen.getAllByRole('option')).toHaveLength(3);
  });

  it('says so when no show is open for leads', async () => {
    vi.mocked(api.getEvents).mockResolvedValue(EVENTS.filter((e) => e.id === 'old') as any);
    render(<LeadsPage user={user} />);
    await screen.findByRole('button', { name: /show all events \(1 more\)/i });
    fireEvent.click(screen.getByRole('combobox', { name: /^event/i }));
    expect(screen.getByText(/no shows are open for leads right now/i)).toBeInTheDocument();
  });
});
