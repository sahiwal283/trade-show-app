import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ActionQueue } from '../ActionQueue';

const base = { canManage: false, pendingCount: 0, ocrReviewCount: 0, zohoQueueCount: 0 };

describe('ActionQueue sample request rows', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders one row per open, unsubmitted show with a countdown', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-20T12:00:00Z'));
    render(<ActionQueue {...base} onPageChange={vi.fn()} sampleRequests={[
      { eventId: 'ev-1', eventName: 'Expo West', closesAt: '2026-10-24T03:59:59Z', status: 'draft', submittedAt: null },
    ]} />);
    expect(screen.getByText(/Sample request for Expo West closes in 3d 15h/)).toBeInTheDocument();
  });

  it('deep-links to the checklist Samples view for that show', () => {
    const onPageChange = vi.fn();
    render(<ActionQueue {...base} onPageChange={onPageChange} sampleRequests={[
      { eventId: 'ev-1', eventName: 'Expo', closesAt: '2099-01-01T00:00:00Z', status: 'none', submittedAt: null },
    ]} />);
    fireEvent.click(screen.getByRole('button', { name: /Sample request for Expo/ }));
    expect(window.location.hash).toBe('#event=ev-1&tab=samples');
    expect(onPageChange).toHaveBeenCalledWith('checklist');
  });

  it('shows a quieter row for a submitted show and still links to the Samples view', () => {
    const onPageChange = vi.fn();
    render(<ActionQueue {...base} onPageChange={onPageChange} sampleRequests={[
      { eventId: 'ev-2', eventName: 'IGES', closesAt: '2099-10-24T03:59:59Z', status: 'submitted', submittedAt: '2099-10-01T00:00:00Z' },
    ]} />);
    const row = screen.getByRole('button', { name: /Sample request for IGES submitted · edit until Oct 23, 11:59 PM ET/ });
    expect(row.className).toMatch(/stone/);
    expect(row.textContent).toContain('Open');
    fireEvent.click(row);
    expect(window.location.hash).toBe('#event=ev-2&tab=samples');
    expect(onPageChange).toHaveBeenCalledWith('checklist');
  });

  it('labels the action Start with no draft and Finish with a draft', () => {
    render(<ActionQueue {...base} onPageChange={vi.fn()} sampleRequests={[
      { eventId: 'a', eventName: 'A', closesAt: '2099-01-01T00:00:00Z', status: 'none', submittedAt: null },
      { eventId: 'b', eventName: 'B', closesAt: '2099-01-01T00:00:00Z', status: 'draft', submittedAt: null },
    ]} />);
    expect(screen.getByRole('button', { name: /Sample request for A/ }).textContent).toContain('Start');
    expect(screen.getByRole('button', { name: /Sample request for B/ }).textContent).toContain('Finish');
  });

  it('renders two rows for two shows with the same name', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<ActionQueue {...base} onPageChange={vi.fn()} sampleRequests={[
      { eventId: 'x1', eventName: 'Same', closesAt: '2099-01-01T00:00:00Z', status: 'none', submittedAt: null },
      { eventId: 'x2', eventName: 'Same', closesAt: '2099-01-01T00:00:00Z', status: 'none', submittedAt: null },
    ]} />);
    expect(screen.getAllByRole('button', { name: /Sample request for Same/ })).toHaveLength(2);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('shows all clear with no rows', () => {
    render(<ActionQueue {...base} onPageChange={vi.fn()} sampleRequests={[]} />);
    expect(screen.getByText(/All clear/)).toBeInTheDocument();
  });
});
