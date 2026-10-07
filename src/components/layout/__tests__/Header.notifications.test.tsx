import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../../utils/api', () => ({
  api: { USE_SERVER: true, getExpenses: vi.fn(async () => []) },
}));
vi.mock('../../../utils/apiClient', () => ({
  apiClient: { get: vi.fn(async () => ({ notifications: [] })) },
}));
vi.mock('../../../utils/notificationsApi', () => ({
  notificationsApi: {
    listUnread: vi.fn(),
    markRead: vi.fn(async () => ({ updated: 1 })),
    markAllRead: vi.fn(async () => ({ updated: 1 })),
  },
}));

import { Header } from '../Header';
import { notificationsApi } from '../../../utils/notificationsApi';

const user = { id: 'u-1', name: 'Ana', username: 'ana', email: 'a@x.com', role: 'salesperson' as const };

const row = (over: Record<string, unknown> = {}) => ({
  id: 'n-1',
  kind: 'sample_request.open',
  title: 'Sample request open · Expo',
  body: 'Closes Oct 23',
  link: { page: 'checklist', eventId: 'ev-1' },
  read_at: null,
  created_at: '2026-10-07T00:00:00Z',
  ...over,
});

const mockRows = (rows: unknown[]) =>
  vi.mocked(notificationsApi.listUnread).mockResolvedValue({ notifications: rows } as never);

const renderHeader = (onNavigate = vi.fn()) =>
  render(<Header user={user} onLogout={vi.fn()} onToggleMobileMenu={vi.fn()} onNavigate={onNavigate} />);

describe('Header general notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.location.hash = '';
    mockRows([row()]);
  });
  afterEach(() => vi.useRealTimers());

  it('lists the row, marks it read on click, and deep-links to the checklist', async () => {
    const onNavigate = vi.fn();
    renderHeader(onNavigate);
    await waitFor(() => expect(notificationsApi.listUnread).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }));
    fireEvent.click(await screen.findByText('Sample request open · Expo'));
    await waitFor(() => expect(notificationsApi.markRead).toHaveBeenCalledWith(['n-1']));
    expect(window.location.hash).toBe('#event=ev-1&tab=my');
    expect(onNavigate).toHaveBeenCalledWith('checklist');
    expect(screen.queryByText('Sample request open · Expo')).not.toBeInTheDocument();
  });

  it('deep-links a samples row to the samples tab', async () => {
    mockRows([row({ link: { page: 'samples', eventId: 'ev-2' } })]);
    const onNavigate = vi.fn();
    renderHeader(onNavigate);
    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }));
    fireEvent.click(await screen.findByText('Sample request open · Expo'));
    expect(window.location.hash).toBe('#event=ev-2&tab=samples');
    expect(onNavigate).toHaveBeenCalledWith('checklist');
  });

  it('a row without a link only marks read and closes the panel', async () => {
    mockRows([row({ link: null })]);
    const onNavigate = vi.fn();
    renderHeader(onNavigate);
    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }));
    fireEvent.click(await screen.findByText('Sample request open · Expo'));
    await waitFor(() => expect(notificationsApi.markRead).toHaveBeenCalledWith(['n-1']));
    expect(onNavigate).not.toHaveBeenCalled();
    expect(window.location.hash).toBe('');
    expect(screen.queryByText('Closes Oct 23')).not.toBeInTheDocument();
  });

  it('mark all read clears the list', async () => {
    renderHeader();
    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }));
    await screen.findByText('Sample request open · Expo');
    fireEvent.click(screen.getByRole('button', { name: /Mark all read/ }));
    await waitFor(() => expect(notificationsApi.markAllRead).toHaveBeenCalled());
    expect(screen.queryByText('Sample request open · Expo')).not.toBeInTheDocument();
  });

  it('lights the unread dot for app notifications alone', async () => {
    const { container } = renderHeader();
    await waitFor(() => expect(container.querySelector('.animate-ping')).not.toBeNull());
  });

  it('polls every 60s and stops after unmount', async () => {
    vi.useFakeTimers();
    const { unmount } = renderHeader();
    await vi.advanceTimersByTimeAsync(0);
    const initial = vi.mocked(notificationsApi.listUnread).mock.calls.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(vi.mocked(notificationsApi.listUnread).mock.calls.length).toBe(initial + 1);
    unmount();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(vi.mocked(notificationsApi.listUnread).mock.calls.length).toBe(initial + 1);
  });
});
