/**
 * Session Manager with Sliding Expiry Timer
 * 
 * Features:
 * - 15-minute inactivity timeout
 * - Activity tracking (mouse, keyboard, form input, navigation, API calls)
 * - Modern event listeners (keydown/keyup instead of deprecated keypress)
 * - Form field activity tracking (input, change events)
 * - Warning popup 5 minutes before logout
 * - Token refresh during activity
 * - Auto-logout and redirect on timeout
 */

import { STORAGE_KEYS } from '../constants/appConstants';

const INACTIVITY_TIMEOUT = 15 * 60 * 1000; // 15 minutes in milliseconds
const WARNING_TIME = 5 * 60 * 1000; // 5 minutes before logout
const TOKEN_REFRESH_INTERVAL = 10 * 60 * 1000; // Refresh token every 10 minutes

export class SessionManager {
  private static instance: SessionManager;
  private inactivityTimer: NodeJS.Timeout | null = null;
  private warningTimer: NodeJS.Timeout | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;
  private lastActivity: number = Date.now();
  private onWarning: (() => void) | null = null;
  private onLogout: (() => void) | null = null;
  private isWarningActive: boolean = false;
  private hasLoggedOut: boolean = false; // Prevent duplicate logout notifications
  private boundHandleActivity: (() => void) | null = null; // Store bound function reference

  private constructor() {}

  public static getInstance(): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager();
    }
    return SessionManager.instance;
  }

  /**
   * Initialize session manager with callbacks
   */
  public init(onWarning: () => void, onLogout: () => void): void {
    console.log('[SessionManager] Initializing with 15-minute inactivity timeout');
    
    // Cleanup any existing timers/listeners first (safety check)
    this.cleanup();
    
    this.onWarning = onWarning;
    this.onLogout = onLogout;
    this.hasLoggedOut = false; // Reset logout flag
    this.lastActivity = Date.now(); // Reset activity timestamp
    this.setupActivityListeners();
    this.resetTimer();
    this.startTokenRefresh();
  }

  /**
   * Setup event listeners for user activity
   */
  private setupActivityListeners(): void {
    // Create bound reference ONCE and store it
    this.boundHandleActivity = this.handleActivity.bind(this);

    const events = [
      'mousedown',
      'mousemove',
      'keydown',      // Modern replacement for keypress
      'keyup',        // Catch key releases too
      'input',        // Catch input field changes
      'change',       // Catch form field changes
      'scroll',
      'touchstart',
      'touchmove',
      'click',
    ];

    events.forEach(event => {
      document.addEventListener(event, this.boundHandleActivity!, true);
    });

    // Track navigation/routing changes
    window.addEventListener('popstate', this.boundHandleActivity!);
    
    console.log('[SessionManager] Activity listeners registered (modern events)');
  }

  /**
   * Handle user activity - reset timers
   */
  private handleActivity = (): void => {
    const now = Date.now();
    const timeSinceLastActivity = now - this.lastActivity;

    // Only reset if more than 1 second has passed (debounce)
    if (timeSinceLastActivity > 1000) {
      this.lastActivity = now;
      this.resetTimer();

      // If warning was active, dismiss it
      if (this.isWarningActive) {
        console.log('[SessionManager] User activity detected, dismissing warning');
        this.isWarningActive = false;
      }
    }
  };

  /**
   * Reset inactivity and warning timers
   */
  public resetTimer(): void {
    // Clear existing timers
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
    }
    if (this.warningTimer) {
      clearTimeout(this.warningTimer);
    }

    // Set warning timer (10 minutes after activity)
    this.warningTimer = setTimeout(() => {
      this.showWarning();
    }, INACTIVITY_TIMEOUT - WARNING_TIME);

    // Set logout timer (15 minutes after activity)
    this.inactivityTimer = setTimeout(() => {
      this.logout();
    }, INACTIVITY_TIMEOUT);
  }

  /**
   * Show warning popup
   */
  private showWarning(): void {
    if (!this.isWarningActive && this.onWarning) {
      console.log('[SessionManager] Showing inactivity warning (5 minutes until logout)');
      this.isWarningActive = true;
      this.onWarning();
    }
  }

  /**
   * Perform logout
   */
  private logout(): void {
    // Prevent duplicate logout notifications
    if (this.hasLoggedOut) {
      console.log('[SessionManager] Logout already triggered, skipping duplicate');
      return;
    }

    console.log('[SessionManager] Inactivity timeout reached, logging out user');
    this.hasLoggedOut = true;
    this.cleanup();
    
    if (this.onLogout) {
      this.onLogout();
    }
  }

  /**
   * Start token refresh interval
   */
  private startTokenRefresh(): void {
    this.refreshTimer = setInterval(() => {
      this.refreshToken();
    }, TOKEN_REFRESH_INTERVAL);
    
    console.log('[SessionManager] Token refresh interval started (every 10 minutes)');
  }

  /**
   * Refresh authentication token
   */
  private async refreshToken(): Promise<void> {
    try {
      // Must match TokenManager's storage key (apiClient) — this previously
      // read a nonexistent 'jwt_token' key, so tokens never refreshed and
      // every session died with an unexpected 401 mid-work.
      const token = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
      if (!token) {
        console.log('[SessionManager] No token found, skipping refresh');
        return;
      }

      console.log('[SessionManager] Refreshing authentication token');
      
      // Get API base URL from environment or use default
      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api';
      const refreshUrl = `${apiBaseUrl}/auth/refresh`;
      
      // Call refresh endpoint with proper base URL
      const response = await fetch(refreshUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.token) {
          localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, data.token);
          console.log('[SessionManager] Token refreshed successfully');
        } else {
          console.warn('[SessionManager] Token refresh response missing token');
        }
      } else {
        console.error('[SessionManager] Token refresh failed, status:', response.status);
        // If refresh fails with 401, token is already expired - let normal logout flow handle it
        if (response.status === 401) {
          console.error('[SessionManager] Token expired and cannot be refreshed');
        }
      }
    } catch (error) {
      console.error('[SessionManager] Error refreshing token:', error);
      // Network errors during refresh shouldn't crash the session
    }
  }

  /**
   * Manual refresh - called on API requests
   */
  public notifyApiCall(): void {
    this.handleActivity();
  }

  /**
   * Dismiss warning manually
   */
  public dismissWarning(): void {
    this.isWarningActive = false;
    this.resetTimer();
  }

  /**
   * Cleanup timers and listeners
   */
  public cleanup(): void {
    console.log('[SessionManager] Cleaning up timers and listeners');
    
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
    }
    
    if (this.warningTimer) {
      clearTimeout(this.warningTimer);
      this.warningTimer = null;
    }

    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }

    // Remove listeners using the SAME bound reference
    if (this.boundHandleActivity) {
      const events = [
        'mousedown',
        'mousemove',
        'keydown',
        'keyup',
        'input',
        'change',
        'scroll',
        'touchstart',
        'touchmove',
        'click',
      ];

      events.forEach(event => {
        document.removeEventListener(event, this.boundHandleActivity!, true);
      });

      window.removeEventListener('popstate', this.boundHandleActivity!);
      this.boundHandleActivity = null;
      
      console.log('[SessionManager] Activity listeners removed successfully');
    }
  }

  /**
   * Get time remaining until logout (in seconds)
   */
  public getTimeRemaining(): number {
    const elapsed = Date.now() - this.lastActivity;
    const remaining = INACTIVITY_TIMEOUT - elapsed;
    return Math.max(0, Math.floor(remaining / 1000));
  }

  /**
   * Destroy instance (for cleanup)
   */
  public static destroy(): void {
    if (SessionManager.instance) {
      SessionManager.instance.cleanup();
      SessionManager.instance = null as any;
    }
  }
}

export const sessionManager = SessionManager.getInstance();

