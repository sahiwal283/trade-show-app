import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import fixture from '../../../../utils/__fixtures__/devDashboard/auditLogs.json';

const getAuditLogs = vi.fn();
vi.mock('../../../../utils/api', () => ({
  api: { devDashboard: { getAuditLogs: (filters: unknown) => getAuditLogs(filters) } },
}));

import { AuditLogTab } from '../AuditLogTab';
import { clearDashboardCache } from '../useDashboardResource';

const lastFilters = () => getAuditLogs.mock.calls[getAuditLogs.mock.calls.length - 1][0];
const rows = () => within(screen.getByRole('table', { name: 'Audit log' })).getAllByRole('row').slice(1);

describe('AuditLogTab', () => {
  beforeEach(() => {
    clearDashboardCache();
    getAuditLogs.mockReset();
    getAuditLogs.mockResolvedValue(fixture);
  });

  it('asks for the first page of the selected range with no filters', async () => {
    render(<AuditLogTab timeRange="24h" />);
    await waitFor(() => expect(rows()).toHaveLength(2));
    expect(getAuditLogs).toHaveBeenCalledWith({
      user: '', method: '', status: '', search: '', timeRange: '24h', limit: 50, offset: 0,
    });
  });

  it('shows who did what, where from, and how it went', async () => {
    render(<AuditLogTab timeRange="24h" />);
    await waitFor(() => expect(rows()).toHaveLength(2));
    const [write, login] = rows();
    expect(write).toHaveTextContent('sahil');
    expect(write).toHaveTextContent('PUT');
    expect(write).toHaveTextContent('/api/events/0b5f1c7e-1111-2222-3333-444455556666');
    expect(write).toHaveTextContent('Success');
    expect(write).toHaveTextContent('203.0.113.9');
    expect(login).toHaveTextContent('digi');
    expect(login).toHaveTextContent('Sign-in');
    expect(login).toHaveTextContent('login_failed');
    expect(login).toHaveTextContent('Failed');
    expect(login).toHaveTextContent('Invalid password');
  });

  it('applies the search box on submit, from the first page', async () => {
    render(<AuditLogTab timeRange="24h" />);
    await waitFor(() => expect(rows()).toHaveLength(2));
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'events' } });
    expect(lastFilters().search).toBe('');
    fireEvent.submit(screen.getByRole('search'));
    await waitFor(() => expect(lastFilters()).toMatchObject({ search: 'events', offset: 0 }));
  });

  it('applies a dropdown filter as soon as it changes', async () => {
    render(<AuditLogTab timeRange="24h" />);
    await waitFor(() => expect(rows()).toHaveLength(2));
    fireEvent.change(screen.getByLabelText('Action type'), { target: { value: 'auth' } });
    await waitFor(() => expect(lastFilters().method).toBe('auth'));
    fireEvent.change(screen.getByLabelText('Outcome'), { target: { value: 'failure' } });
    await waitFor(() => expect(lastFilters()).toMatchObject({ method: 'auth', status: 'failure' }));
  });

  it('pages forward and back', async () => {
    getAuditLogs.mockResolvedValue({ ...fixture, total: 120 });
    render(<AuditLogTab timeRange="24h" />);
    await waitFor(() => expect(screen.getByText('1–2 of 120')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(lastFilters().offset).toBe(50));
    await waitFor(() => expect(screen.getByText('51–52 of 120')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Previous page' }));
    await waitFor(() => expect(lastFilters().offset).toBe(0));
  });

  it('disables Next on the last page', async () => {
    render(<AuditLogTab timeRange="24h" />);
    await waitFor(() => expect(screen.getByText('1–2 of 37')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
  });

  it('returns to the first page when a filter changes', async () => {
    getAuditLogs.mockResolvedValue({ ...fixture, total: 120 });
    render(<AuditLogTab timeRange="24h" />);
    await waitFor(() => expect(rows()).toHaveLength(2));
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(lastFilters().offset).toBe(50));
    fireEvent.change(screen.getByLabelText('Outcome'), { target: { value: 'failure' } });
    await waitFor(() => expect(lastFilters()).toMatchObject({ status: 'failure', offset: 0 }));
  });

  it('returns to the first page when the time range changes', async () => {
    getAuditLogs.mockResolvedValue({ ...fixture, total: 120 });
    const { rerender } = render(<AuditLogTab timeRange="24h" />);
    await waitFor(() => expect(rows()).toHaveLength(2));
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(lastFilters().offset).toBe(50));
    rerender(<AuditLogTab timeRange="7d" />);
    await waitFor(() => expect(lastFilters()).toMatchObject({ timeRange: '7d', offset: 0 }));
  });

  it('says so when nothing matches, and keeps the filters on screen', async () => {
    getAuditLogs.mockResolvedValue({ logs: [], total: 0 });
    render(<AuditLogTab timeRange="24h" />);
    await waitFor(() => expect(screen.getByText('No audit entries match.')).toBeInTheDocument());
    expect(screen.getByLabelText('Search')).toBeInTheDocument();
  });

  it('shows the real error when the log cannot be read', async () => {
    getAuditLogs.mockRejectedValue(new Error('permission denied for table audit_logs'));
    render(<AuditLogTab timeRange="24h" />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('permission denied for table audit_logs'));
  });
});
