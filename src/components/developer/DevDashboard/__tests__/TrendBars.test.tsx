import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TrendBars } from '../TrendBars';

describe('TrendBars', () => {
  it('draws one bar per value, scaled to the largest', () => {
    render(<TrendBars values={[0, 5, 10]} labels={['a', 'b', 'c']} ariaLabel="Requests" height={40} />);
    const bars = screen.getByRole('img', { name: 'Requests' }).querySelectorAll('rect[data-bar]');
    expect(bars).toHaveLength(3);
    expect(bars[0].getAttribute('height')).toBe('0');
    expect(bars[1].getAttribute('height')).toBe('20');
    expect(bars[2].getAttribute('height')).toBe('40');
  });

  it('names each bar for hover', () => {
    render(<TrendBars values={[3]} labels={['2pm']} ariaLabel="Requests" />);
    expect(screen.getByText('2pm: 3')).toBeInTheDocument();
  });

  it('draws flat bars rather than dividing by zero when every value is 0', () => {
    render(<TrendBars values={[0, 0]} labels={['a', 'b']} ariaLabel="Requests" />);
    const bars = screen.getByRole('img').querySelectorAll('rect[data-bar]');
    expect([...bars].map((b) => b.getAttribute('height'))).toEqual(['0', '0']);
  });

  it('overlays a highlight series on the same scale', () => {
    render(<TrendBars values={[10, 10]} highlights={[5, 0]} labels={['a', 'b']} ariaLabel="Requests" height={40} />);
    const marks = screen.getByRole('img').querySelectorAll('rect[data-highlight]');
    expect([...marks].map((m) => m.getAttribute('height'))).toEqual(['20', '0']);
  });

  it('says so when there is nothing to draw', () => {
    render(<TrendBars values={[]} labels={[]} ariaLabel="Requests" />);
    expect(screen.getByText('No data')).toBeInTheDocument();
  });
});
