import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const post = vi.fn();
vi.mock('../../utils/apiClient', () => ({ apiClient: { post: (...args: unknown[]) => post(...args) } }));

import { usePageViewTracking } from '../usePageViewTracking';

const setWidth = (width: number) => {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
};

describe('usePageViewTracking', () => {
  beforeEach(() => { post.mockReset(); post.mockResolvedValue(undefined); setWidth(1280); });

  it('sends nothing while signed out', () => {
    renderHook(() => usePageViewTracking('dashboard', undefined));
    expect(post).not.toHaveBeenCalled();
  });

  it('sends the first screen once signed in', () => {
    renderHook(() => usePageViewTracking('dashboard', 'u1'));
    expect(post).toHaveBeenCalledWith('/page-views', { page: 'dashboard', device: 'desktop' });
  });

  it('sends each screen change once, and not on unrelated re-renders', () => {
    const { rerender } = renderHook(({ page }) => usePageViewTracking(page, 'u1'), {
      initialProps: { page: 'dashboard' },
    });
    rerender({ page: 'dashboard' });
    rerender({ page: 'expenses' });
    expect(post.mock.calls.map((c) => (c[1] as { page: string }).page)).toEqual(['dashboard', 'expenses']);
  });

  it('reports mobile under 768px', () => {
    setWidth(390);
    renderHook(() => usePageViewTracking('leads', 'u1'));
    expect(post).toHaveBeenCalledWith('/page-views', { page: 'leads', device: 'mobile' });
  });

  it('swallows a failed send', () => {
    post.mockRejectedValue(new Error('offline'));
    expect(() => renderHook(() => usePageViewTracking('dashboard', 'u1'))).not.toThrow();
  });

  it('sends the current screen again after signing out and back in', () => {
    const { rerender } = renderHook(({ id }: { id: string | undefined }) => usePageViewTracking('dashboard', id), {
      initialProps: { id: 'u1' as string | undefined },
    });
    rerender({ id: undefined });
    rerender({ id: 'u2' });
    expect(post).toHaveBeenCalledTimes(2);
  });
});
