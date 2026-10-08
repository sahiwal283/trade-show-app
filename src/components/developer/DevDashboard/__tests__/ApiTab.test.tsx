import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import fixture from '../../../../utils/__fixtures__/devDashboard/apiAnalytics.json';
import { ApiTab, bucketLabel } from '../ApiTab';
import type { ApiAnalytics } from '../types';

const data = fixture as ApiAnalytics;

const endpointOrder = () =>
  within(screen.getByRole('table', { name: 'Endpoints' }))
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[0].textContent);

describe('ApiTab', () => {
  it('shows the headline numbers', () => {
    render(<ApiTab data={data} timeRange="24h" />);
    const totals = screen.getByRole('region', { name: 'Totals' });
    expect(within(totals).getByText('4,210')).toBeInTheDocument();
    expect(within(totals).getByText('0.81%')).toBeInTheDocument();
    expect(within(totals).getByText('34 errors')).toBeInTheDocument();
    expect(within(totals).getByText('24ms')).toBeInTheDocument();
    expect(within(totals).getByText('180ms')).toBeInTheDocument();
  });

  it('draws one bar per bucket, including empty ones', () => {
    render(<ApiTab data={data} timeRange="24h" />);
    const chart = screen.getByRole('img', { name: 'Requests over time, errors in red' });
    expect(chart.querySelectorAll('rect[data-bar]')).toHaveLength(3);
    expect(chart.querySelectorAll('rect[data-bar]')[1].getAttribute('height')).toBe('0');
  });

  it('lists endpoints busiest first, with max time filled in', () => {
    render(<ApiTab data={data} timeRange="24h" />);
    expect(endpointOrder()).toEqual(['/api/expense-messages/unread', '/api/expenses']);
    const row = screen.getAllByRole('row').find((r) => r.textContent?.includes('/api/expenses') && r.textContent.includes('47'))!;
    expect(row).toHaveTextContent('137ms');
    expect(row).toHaveTextContent('301ms');
    expect(row).toHaveTextContent('349ms');
  });

  it('re-sorts when a column header is pressed, and flips on a second press', () => {
    render(<ApiTab data={data} timeRange="24h" />);
    const header = screen.getByRole('columnheader', { name: /Avg/ });
    fireEvent.click(within(header).getByRole('button'));
    expect(endpointOrder()).toEqual(['/api/expenses', '/api/expense-messages/unread']);
    expect(header).toHaveAttribute('aria-sort', 'descending');
    fireEvent.click(within(header).getByRole('button'));
    expect(endpointOrder()).toEqual(['/api/expense-messages/unread', '/api/expenses']);
    expect(header).toHaveAttribute('aria-sort', 'ascending');
  });

  it('shows the slowest endpoints with their max time', () => {
    render(<ApiTab data={data} timeRange="24h" />);
    const slowest = screen.getByRole('region', { name: 'Slowest endpoints' });
    expect(within(slowest).getByText('/api/expenses')).toBeInTheDocument();
    expect(within(slowest).getByText('349ms')).toBeInTheDocument();
  });

  it('lists recent errors with who hit them and why', () => {
    render(<ApiTab data={data} timeRange="24h" />);
    const errors = within(screen.getByRole('region', { name: 'Recent errors' })).getAllByRole('listitem');
    expect(errors).toHaveLength(2);
    expect(errors[0]).toHaveTextContent('404');
    expect(errors[0]).toHaveTextContent('/api/session/properties');
    expect(errors[0]).toHaveTextContent('Sahil Khatri');
    expect(errors[0]).toHaveTextContent('Not found');
    expect(errors[1]).toHaveTextContent('500');
    expect(errors[1]).toHaveTextContent('Not signed in');
  });

  it('says so when there is no traffic at all', () => {
    const empty: ApiAnalytics = {
      totals: { requests: 0, errors: 0, errorRate: 0, p50Ms: 0, p95Ms: 0 },
      buckets: data.buckets.map((b) => ({ ...b, requests: 0, errors: 0 })),
      endpoints: [], slowest: [], recentErrors: [],
    };
    render(<ApiTab data={empty} timeRange="1h" />);
    expect(screen.getByText('No requests in this range.')).toBeInTheDocument();
    expect(screen.getByText('No errors in this range.')).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Endpoints' })).not.toBeInTheDocument();
  });
});

describe('bucketLabel', () => {
  it('labels daily buckets by their UTC date', () => {
    expect(bucketLabel('2026-10-08T00:00:00.000Z', '7d')).toBe('Oct 8');
    expect(bucketLabel('2026-10-08T00:00:00.000Z', '30d')).toBe('Oct 8');
  });

  it('labels shorter buckets by time of day', () => {
    expect(bucketLabel('2026-10-08T14:00:00.000Z', '24h')).toMatch(/\d{1,2}:\d{2}/);
  });
});
