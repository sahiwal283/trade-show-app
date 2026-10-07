import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ActionQueue } from '../ActionQueue';

const base = { canManage: false, pendingCount: 0, ocrReviewCount: 0, zohoQueueCount: 0 };

describe('ActionQueue sample request rows', () => {
  it('renders one row per open, unsubmitted show with a countdown', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-20T12:00:00Z'));
    render(<ActionQueue {...base} onPageChange={vi.fn()} sampleRequests={[
      { eventId: 'ev-1', eventName: 'Expo West', closesAt: '2026-10-24T03:59:59Z', status: 'draft', submittedAt: null },
    ]} />);
    expect(screen.getByText(/Sample request for Expo West closes in 3d 15h/)).toBeInTheDocument();
    vi.useRealTimers();
  });

  it('deep-links to the checklist My tab for that show', () => {
    const onPageChange = vi.fn();
    render(<ActionQueue {...base} onPageChange={onPageChange} sampleRequests={[
      { eventId: 'ev-1', eventName: 'Expo', closesAt: '2099-01-01T00:00:00Z', status: 'none', submittedAt: null },
    ]} />);
    fireEvent.click(screen.getByRole('button', { name: /Sample request for Expo/ }));
    expect(window.location.hash).toBe('#event=ev-1&tab=my');
    expect(onPageChange).toHaveBeenCalledWith('checklist');
  });

  it('shows all clear with no rows', () => {
    render(<ActionQueue {...base} onPageChange={vi.fn()} sampleRequests={[]} />);
    expect(screen.getByText(/All clear/)).toBeInTheDocument();
  });
});
