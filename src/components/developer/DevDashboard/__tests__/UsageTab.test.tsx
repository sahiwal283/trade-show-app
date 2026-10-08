import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import fixture from '../../../../utils/__fixtures__/devDashboard/usage.json';
import { UsageTab } from '../UsageTab';
import type { Usage } from '../types';

const data = fixture as Usage;

describe('UsageTab', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-08T16:00:00.000Z')); });
  afterEach(() => { vi.useRealTimers(); });

  it('shows total views and how many people', () => {
    render(<UsageTab data={data} />);
    const totals = screen.getByRole('region', { name: 'Totals' });
    expect(within(totals).getByText('186')).toBeInTheDocument();
    expect(within(totals).getByText('5')).toBeInTheDocument();
  });

  it('lists each screen with views, people and a daily trend', () => {
    render(<UsageTab data={data} />);
    const rows = within(screen.getByRole('table', { name: 'Screens' })).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('expenses');
    expect(rows[0]).toHaveTextContent('92');
    expect(within(rows[0]).getByRole('img', { name: 'Daily views of expenses' }).querySelectorAll('rect[data-bar]')).toHaveLength(2);
  });

  it('lists each person with last seen, device split and top screens', () => {
    render(<UsageTab data={data} />);
    const row = within(screen.getByRole('table', { name: 'People' })).getByRole('row', { name: /Seri Vira/ });
    expect(row).toHaveTextContent('40m ago');
    expect(row).toHaveTextContent('64');
    expect(row).toHaveTextContent('60 mobile, 4 desktop');
    expect(row).toHaveTextContent('expenses (41), leads (23)');
  });

  it('shows someone who has never opened the app, plainly', () => {
    render(<UsageTab data={data} />);
    const row = within(screen.getByRole('table', { name: 'People' })).getByRole('row', { name: /Rita Example/ });
    expect(row).toHaveTextContent('never');
    expect(row).toHaveTextContent('No activity');
  });

  it('keeps the people list when no screens were viewed in the range', () => {
    render(<UsageTab data={{ ...data, totals: { views: 0, uniqueUsers: 0 }, screens: [] }} />);
    expect(screen.getByText('No screen views in this range.')).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Screens' })).not.toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'People' })).toBeInTheDocument();
  });
});
