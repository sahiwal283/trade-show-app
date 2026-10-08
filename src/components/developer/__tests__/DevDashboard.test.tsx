import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import overview from '../../../utils/__fixtures__/devDashboard/overview.json';
import apiAnalytics from '../../../utils/__fixtures__/devDashboard/apiAnalytics.json';
import usage from '../../../utils/__fixtures__/devDashboard/usage.json';
import sessions from '../../../utils/__fixtures__/devDashboard/sessions.json';
import auditLogs from '../../../utils/__fixtures__/devDashboard/auditLogs.json';

const calls = {
  getOverview: vi.fn(),
  getApiAnalytics: vi.fn(),
  getUsage: vi.fn(),
  getSessions: vi.fn(),
  getAuditLogs: vi.fn(),
};
vi.mock('../../../utils/api', () => ({
  api: {
    devDashboard: {
      getOverview: () => calls.getOverview(),
      getApiAnalytics: (range: string) => calls.getApiAnalytics(range),
      getUsage: (range: string) => calls.getUsage(range),
      getSessions: () => calls.getSessions(),
      getAuditLogs: (filters: unknown) => calls.getAuditLogs(filters),
    },
  },
}));

import { DevDashboard } from '../DevDashboard';
import { clearDashboardCache } from '../DevDashboard/useDashboardResource';

const openTab = (name: string) => fireEvent.click(screen.getByRole('tab', { name }));

describe('DevDashboard', () => {
  beforeEach(() => {
    clearDashboardCache();
    Object.values(calls).forEach((mock) => mock.mockReset());
    calls.getOverview.mockResolvedValue(overview);
    calls.getApiAnalytics.mockResolvedValue(apiAnalytics);
    calls.getUsage.mockResolvedValue(usage);
    calls.getSessions.mockResolvedValue(sessions);
    calls.getAuditLogs.mockResolvedValue(auditLogs);
  });

  it('has exactly five tabs and opens on Overview', async () => {
    render(<DevDashboard />);
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Overview', 'API', 'Usage', 'Sessions', 'Audit Log',
    ]);
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => expect(screen.getByRole('region', { name: 'Health checks' })).toBeInTheDocument());
  });

  it('loads only the open tab', async () => {
    render(<DevDashboard />);
    await waitFor(() => expect(calls.getOverview).toHaveBeenCalledTimes(1));
    expect(calls.getApiAnalytics).not.toHaveBeenCalled();
    expect(calls.getUsage).not.toHaveBeenCalled();
    expect(calls.getSessions).not.toHaveBeenCalled();
    expect(calls.getAuditLogs).not.toHaveBeenCalled();
  });

  it('shows the range picker only where a range applies', async () => {
    render(<DevDashboard />);
    expect(screen.queryByLabelText('Time range')).not.toBeInTheDocument();
    openTab('API');
    expect(screen.getByLabelText('Time range')).toHaveValue('24h');
    openTab('Sessions');
    expect(screen.queryByLabelText('Time range')).not.toBeInTheDocument();
    openTab('Usage');
    expect(screen.getByLabelText('Time range')).toBeInTheDocument();
    openTab('Audit Log');
    expect(screen.getByLabelText('Time range')).toBeInTheDocument();
  });

  it('refetches the open tab when the range changes, and keeps the range across tabs', async () => {
    render(<DevDashboard />);
    openTab('API');
    await waitFor(() => expect(calls.getApiAnalytics).toHaveBeenCalledWith('24h'));
    fireEvent.change(screen.getByLabelText('Time range'), { target: { value: '7d' } });
    await waitFor(() => expect(calls.getApiAnalytics).toHaveBeenCalledWith('7d'));
    openTab('Usage');
    await waitFor(() => expect(calls.getUsage).toHaveBeenCalledWith('7d'));
  });

  it('shows a tab it has already loaded without a loading state', async () => {
    render(<DevDashboard />);
    await waitFor(() => expect(screen.getByRole('region', { name: 'Health checks' })).toBeInTheDocument());
    openTab('Sessions');
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());
    openTab('Overview');
    expect(screen.getByRole('region', { name: 'Health checks' })).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Loading' })).not.toBeInTheDocument();
  });

  it('Refresh refetches the open tab only', async () => {
    render(<DevDashboard />);
    await waitFor(() => expect(calls.getOverview).toHaveBeenCalledTimes(1));
    openTab('Sessions');
    await waitFor(() => expect(calls.getSessions).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(calls.getSessions).toHaveBeenCalledTimes(2));
    expect(calls.getOverview).toHaveBeenCalledTimes(1);
  });

  it('keeps the other tabs usable when one fails', async () => {
    calls.getOverview.mockRejectedValue(new Error('overview exploded'));
    render(<DevDashboard />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('overview exploded'));
    openTab('Sessions');
    await waitFor(() => expect(screen.getByRole('row', { name: /Digi/ })).toBeInTheDocument());
  });
});
