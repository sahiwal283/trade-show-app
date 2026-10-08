import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import fixture from '../../../../utils/__fixtures__/devDashboard/sessions.json';
import { SessionsTab } from '../SessionsTab';
import type { SessionsPayload } from '../types';

const data = fixture as SessionsPayload;

describe('SessionsTab', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-08T16:00:00.000Z')); });
  afterEach(() => { vi.useRealTimers(); });

  it('shows one row per person, not one per session', () => {
    render(<SessionsTab data={data} />);
    expect(screen.getAllByRole('row')).toHaveLength(2); // header + Digi
    const row = screen.getByRole('row', { name: /Digi/ });
    expect(row).toHaveTextContent('Active');
    expect(row).toHaveTextContent('2m ago');
    expect(row).toHaveTextContent('Safari · iOS');
    expect(row).toHaveTextContent('203.0.113.9');
    expect(row).toHaveTextContent('2 sessions');
  });

  it('expands to the individual sessions and collapses again', () => {
    render(<SessionsTab data={data} />);
    const toggle = screen.getByRole('button', { name: 'Show sessions for Digi' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const detail = screen.getByRole('list', { name: 'Sessions for Digi' });
    expect(within(detail).getAllByRole('listitem')).toHaveLength(2);
    expect(within(detail).getByText(/Unknown browser/)).toBeInTheDocument();
    expect(within(detail).getByText(/No address recorded/)).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.queryByRole('list', { name: 'Sessions for Digi' })).not.toBeInTheDocument();
  });

  it('has no expand control for someone with a single session', () => {
    const single = { users: [{ ...data.users[0], sessionCount: 1, sessions: [data.users[0].sessions[0]] }] };
    render(<SessionsTab data={single} />);
    expect(screen.queryByRole('button', { name: /Show sessions/ })).not.toBeInTheDocument();
    expect(screen.getByRole('row', { name: /Digi/ })).toHaveTextContent('1 session');
  });

  it('counts people by state above the table', () => {
    const users = [
      data.users[0],
      { ...data.users[0], userId: 'u2', name: 'Sasha', status: 'away' as const },
      { ...data.users[0], userId: 'u3', name: 'Seri', status: 'idle' as const },
    ];
    render(<SessionsTab data={{ users }} />);
    expect(screen.getByText('3 people signed in: 1 active, 1 idle, 1 away')).toBeInTheDocument();
  });

  it('says so when nobody is signed in', () => {
    render(<SessionsTab data={{ users: [] }} />);
    expect(screen.getByText('Nobody is signed in.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
