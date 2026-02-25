/**
 * Platform SSO bootstrap tests for useAuth.
 * Covers: platform session returns user → auto sign-in; requiresLogin / authenticated false → show login; external login unchanged.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useAuth } from '../useAuth';

vi.mock('../../utils/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

vi.mock('../../utils/api', () => ({
  api: { USE_SERVER: true, login: vi.fn() },
  TokenManager: {
    setToken: vi.fn(),
    removeToken: vi.fn(),
    getToken: vi.fn(() => null),
  },
}));

import { apiClient } from '../../utils/apiClient';

describe('useAuth platform session bootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('sets user when platform session returns user (SSO auto sign-in)', async () => {
    const platformUser = {
      id: 'local-1',
      username: 'alice',
      name: 'Alice',
      email: 'alice@example.com',
      role: 'coordinator' as const,
    };
    vi.mocked(apiClient.get).mockResolvedValue({ user: platformUser });

    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.bootstrapDone).toBe(true);
    });

    expect(result.current.user).toEqual(platformUser);
    expect(apiClient.get).toHaveBeenCalledWith(
      '/auth/platform/session',
      expect.objectContaining({ skipAuth: true, credentials: 'include' })
    );
  });

  it('leaves user null when platform session returns requiresLogin (fallback to login screen)', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      requiresLogin: true,
      detail: 'no_local_user',
      message: 'Please sign in to link your account.',
    });

    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.bootstrapDone).toBe(true);
    });

    expect(result.current.user).toBeNull();
  });

  it('leaves user null when platform session returns authenticated false', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ authenticated: false });

    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.bootstrapDone).toBe(true);
    });

    expect(result.current.user).toBeNull();
  });

  it('restores user from localStorage when platform returns no user (external login preserved)', async () => {
    const savedUser = {
      id: 'saved-1',
      username: 'bob',
      name: 'Bob',
      email: 'bob@example.com',
      role: 'admin' as const,
    };
    localStorage.setItem('tradeshow_current_user', JSON.stringify(savedUser));
    vi.mocked(apiClient.get).mockResolvedValue({ authenticated: false });

    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.bootstrapDone).toBe(true);
    });

    expect(result.current.user).toEqual(savedUser);
  });

  it('handles platform session fetch error by falling back to localStorage', async () => {
    const savedUser = {
      id: 'saved-1',
      username: 'bob',
      name: 'Bob',
      email: 'bob@example.com',
      role: 'admin' as const,
    };
    localStorage.setItem('tradeshow_current_user', JSON.stringify(savedUser));
    vi.mocked(apiClient.get).mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.bootstrapDone).toBe(true);
    });

    expect(result.current.user).toEqual(savedUser);
  });
});
