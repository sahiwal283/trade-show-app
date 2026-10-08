import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import fixture from '../../../../utils/__fixtures__/devDashboard/overview.json';
import { OverviewTab } from '../OverviewTab';
import type { Overview } from '../types';

const data = fixture as Overview;

describe('OverviewTab', () => {
  it('shows what is running', () => {
    render(<OverviewTab data={data} />);
    const version = screen.getByRole('region', { name: 'Version' });
    expect(within(version).getAllByText('2.34.0')).toHaveLength(2);
    expect(within(version).getByText('production')).toBeInTheDocument();
    expect(within(version).getByText('1d 2h 3m')).toBeInTheDocument();
  });

  it('shows memory, load and disk with real numbers', () => {
    render(<OverviewTab data={data} />);
    const system = screen.getByRole('region', { name: 'System' });
    expect(within(system).getByText('30%')).toBeInTheDocument();
    expect(within(system).getByText('1.2 GB of 4 GB')).toBeInTheDocument();
    expect(within(system).getByText('0.42')).toBeInTheDocument();
    expect(within(system).getByText('4 cores')).toBeInTheDocument();
    expect(within(system).getByText('40%')).toBeInTheDocument();
    expect(within(system).getByText('20 GB of 50 GB')).toBeInTheDocument();
  });

  it('says disk is unavailable instead of showing 0%', () => {
    render(<OverviewTab data={{ ...data, system: { ...data.system, disk: null } }} />);
    expect(within(screen.getByRole('region', { name: 'System' })).getByText('Unavailable')).toBeInTheDocument();
  });

  it('shows database size, connections and the largest tables', () => {
    render(<OverviewTab data={data} />);
    const database = screen.getByRole('region', { name: 'Database' });
    expect(within(database).getByText('178.8 MB')).toBeInTheDocument();
    expect(within(database).getByText('7 of 100')).toBeInTheDocument();
    expect(within(database).getByText('api_requests')).toBeInTheDocument();
    expect(within(database).getByText('94 MB')).toBeInTheDocument();
  });

  it('lists every check with its state, measured value and threshold', () => {
    render(<OverviewTab data={data} />);
    const checks = screen.getByRole('region', { name: 'Health checks' });
    const rows = within(checks).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('Repeated server errors');
    expect(rows[0]).toHaveTextContent('Failing');
    expect(rows[0]).toHaveTextContent('POST /api/events failed 6 times');
    expect(rows[1]).toHaveTextContent('Warning');
    expect(rows[2]).toHaveTextContent('OK');
    expect(rows[2]).toHaveTextContent('under 10% in the last hour');
  });

  it('writes "Warning" in a shade that passes contrast on white', () => {
    render(<OverviewTab data={data} />);
    const warning = within(screen.getByRole('region', { name: 'Health checks' })).getByText('Warning');
    expect(warning.closest('.text-amber-700')).not.toBeNull();
    expect(warning.closest('.text-amber-600')).toBeNull();
  });

  it('summarises the checks in one line', () => {
    render(<OverviewTab data={data} />);
    expect(screen.getByText('1 failing, 1 warning, 1 passing')).toBeInTheDocument();
  });

  it('says all clear when every check passes', () => {
    const passing = data.checks.map((c) => ({ ...c, status: 'pass' as const }));
    render(<OverviewTab data={{ ...data, checks: passing }} />);
    expect(screen.getByText('All 3 checks passing')).toBeInTheDocument();
  });
});
