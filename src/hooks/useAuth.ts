import { useState, useEffect, useCallback } from 'react';
import { User } from '../App';
import { api, TokenManager } from '../utils/api';
import { apiClient } from '../utils/apiClient';
import { normalizeLoginPassword, normalizeLoginUsername } from '../utils/loginCredentials';

// Demo user credentials
const DEMO_CREDENTIALS = {
  admin: 'admin',
  sarah: 'password',
  mike: 'password',
  lisa: 'password'
};

/** Response from GET /api/auth/platform/session */
interface PlatformSessionResponse {
  supported?: boolean;
  authenticated?: boolean;
  requiresLogin?: boolean;
  detail?: string;
  message?: string;
  user?: User;
}

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [bootstrapDone, setBootstrapDone] = useState(false);

  // Try platform SSO first, then fall back to localStorage (external login)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiClient.get<PlatformSessionResponse>('/auth/platform/session', {
          skipAuth: true,
          credentials: 'include',
        } as RequestInit);
        if (cancelled) return;
        if (data?.user) {
          // Platform SSO is authoritative. Clear any stale local JWT so it
          // cannot override cookie-based platform auth on subsequent API calls.
          TokenManager.removeToken();
          setUser(data.user);
          setBootstrapDone(true);
          return;
        }
        if (data?.supported === false || data?.authenticated === false || data?.requiresLogin === true) {
          // No platform user; restore from localStorage (external login)
          const savedUser = localStorage.getItem('tradeshow_current_user');
          if (savedUser) setUser(JSON.parse(savedUser));
        }
      } catch {
        // Network or other error: fall back to localStorage
        if (!cancelled) {
          const savedUser = localStorage.getItem('tradeshow_current_user');
          if (savedUser) setUser(JSON.parse(savedUser));
        }
      } finally {
        if (!cancelled) setBootstrapDone(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const login = useCallback(async (username: string, password: string): Promise<boolean> => {
    try {
      const userNorm = normalizeLoginUsername(username);
      const passNorm = normalizeLoginPassword(password);
      if (api.USE_SERVER) {
        const data = await api.login(userNorm, passNorm) as { user?: User; token?: string };
        const serverUser = data?.user;
        if (data?.token && serverUser) {
          TokenManager.setToken(data.token);
          setUser(serverUser);
          localStorage.setItem('tradeshow_current_user', JSON.stringify(serverUser));
          return true;
        }
        return false;
      }

      // Fallback demo mode (case-insensitive username match)
      const demoKey = Object.keys(DEMO_CREDENTIALS).find(
        (k) => k.toLowerCase() === userNorm.toLowerCase()
      ) as keyof typeof DEMO_CREDENTIALS | undefined;
      if (!demoKey || DEMO_CREDENTIALS[demoKey] !== passNorm) return false;
      const users = JSON.parse(localStorage.getItem('tradeshow_users') || '[]');
      const foundUser = users.find(
        (u: User) => u.username.toLowerCase() === userNorm.toLowerCase()
      );
      if (!foundUser) return false;
      setUser(foundUser);
      localStorage.setItem('tradeshow_current_user', JSON.stringify(foundUser));
      return true;
    } catch (error: unknown) {
      // Log error for debugging
      console.error('[useAuth] Login error:', error);
      
      // Re-throw error so calling component can display appropriate message
      // This allows LoginForm to distinguish between network errors and auth failures
      throw error;
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem('tradeshow_current_user');
    TokenManager.removeToken(); // Also clear JWT token
  }, []);

  return { user, login, logout, bootstrapDone };
};