/**
 * Enhanced API Client
 * Improved version with better error handling, typing, and interceptors
 * @version 0.8.0
 */

import { AppError } from './errorHandler';
import { API_CONFIG, STORAGE_KEYS } from '../constants/appConstants';
import { sessionManager } from './sessionManager';

// ========== Types ==========
export interface ApiResponse<T = unknown> {
  data: T | unknown;
  status: number;
  headers: Headers;
}

export interface ApiError {
  message: string;
  status?: number;
  code?: string;
  details?: unknown;
}

export interface RequestConfig extends RequestInit {
  params?: Record<string, string | number | boolean>;
  timeout?: number;
  skipAuth?: boolean;
}

// ========== Token Management ==========
class TokenManager {
  private static readonly TOKEN_KEY = STORAGE_KEYS.AUTH_TOKEN;

  static getToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  static setToken(token: string): void {
    localStorage.setItem(this.TOKEN_KEY, token);
  }

  static removeToken(): void {
    localStorage.removeItem(this.TOKEN_KEY);
  }

  static hasToken(): boolean {
    return !!this.getToken();
  }
}

// ========== API Client ==========
class ApiClient {
  private baseURL: string;
  private defaultTimeout: number;
  private onUnauthorized: (() => void) | null = null;

  constructor() {
    this.baseURL = API_CONFIG.BASE_URL;
    this.defaultTimeout = API_CONFIG.TIMEOUT;
    
    // Log API base URL in development mode for debugging
    // @ts-ignore - Vite provides this at build time
    if (import.meta.env.DEV) {
      console.log('[API Client] Initialized with base URL:', this.baseURL);
      // @ts-ignore - Vite provides this at build time
      console.log('[API Client] Environment variable VITE_API_BASE_URL:', import.meta.env.VITE_API_BASE_URL || '(not set, using default /api)');
    }
  }

  /**
   * Get the base URL for API requests
   */
  getBaseURL(): string {
    return this.baseURL;
  }

  /**
   * Set callback for unauthorized (401/403) responses
   */
  setUnauthorizedCallback(callback: () => void): void {
    this.onUnauthorized = callback;
  }

  /**
   * Build URL with query parameters
   */
  private buildURL(path: string, params?: Record<string, string | number | boolean>): string {
    const url = `${this.baseURL}${path}`;
    
    if (!params || Object.keys(params).length === 0) {
      return url;
    }

    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      searchParams.append(key, String(value));
    });

    return `${url}?${searchParams.toString()}`;
  }

  /**
   * Build headers for request
   */
  private buildHeaders(config: RequestConfig): HeadersInit {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((config.headers as Record<string, string>) || {}),
    };

    if (!config.skipAuth) {
      const token = TokenManager.getToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }

    return headers;
  }

  /**
   * Handle fetch with timeout
   */
  private async fetchWithTimeout(
    url: string,
    config: RequestConfig
  ): Promise<Response> {
    const timeout = config.timeout || this.defaultTimeout;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...config,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response;
    } catch (error: unknown) {
      clearTimeout(timeoutId);
      
      // Handle timeout
      if (error instanceof Error && error.name === 'AbortError') {
        throw new AppError('Request timeout. Please check your connection and try again.', 'TIMEOUT', 408);
      }
      
      // Handle network errors (CORS, connection refused, DNS failure, etc.)
      if (error instanceof Error) {
        const errorMessage = error.message.toLowerCase();
        const errorName = error.name.toLowerCase();
        
        if (
          errorMessage.includes('failed to fetch') ||
          errorMessage.includes('networkerror') ||
          errorMessage.includes('network error') ||
          errorMessage.includes('load failed') ||
          errorMessage.includes('connection refused') ||
          errorMessage.includes('cors') ||
          errorName === 'typeerror' ||
          errorName === 'networkerror'
        ) {
          console.error('[API] Network error detected:', {
            url,
            message: error.message,
            name: error.name,
          });
          throw new AppError(
            'Network error. Please check your connection and ensure the API server is running.',
            'NETWORK_ERROR',
            0 // No HTTP status for network errors
          );
        }
      }
      
      // Re-throw other errors as-is
      throw error;
    }
  }

  /**
   * Handle response
   */
  private async handleResponse<T>(response: Response): Promise<ApiResponse<T>> {
    const contentType = response.headers.get('content-type') || '';
    const isJSON = contentType.includes('application/json');

    let data: unknown;
    try {
      data = isJSON ? await response.json() : await response.text();
    } catch (error) {
      data = null;
    }

    if (!response.ok) {
      const errorData = data as Record<string, unknown> | null;
      const errorMessage = (errorData?.error || errorData?.message || response.statusText) as string;
      throw new AppError(
        errorMessage,
        'API_ERROR',
        response.status,
        errorData
      );
    }

    return {
      data: data as unknown as T,
      status: response.status,
      headers: response.headers,
    };
  }

  /**
   * Main request method
   */
  async request<T = any>(
    path: string,
    config: RequestConfig = {}
  ): Promise<T> {
    // Notify session manager of API activity (resets inactivity timer)
    try {
      sessionManager.notifyApiCall();
    } catch (error) {
      // Silently fail - don't break API calls if session manager isn't initialized
      console.debug('[API] Session manager notification skipped');
    }

    try {
      const url = this.buildURL(path, config.params);
      const headers = this.buildHeaders(config);

      // Log request in development mode for debugging
      // @ts-ignore - Vite provides this at build time
      if (import.meta.env.DEV) {
        const headersObj = headers as Record<string, string>;
        console.log('[API] Request:', {
          method: config.method || 'GET',
          url,
          hasAuth: !!headersObj['Authorization'],
        });
      }

      const response = await this.fetchWithTimeout(url, {
        ...config,
        headers,
      });

      const result = await this.handleResponse<T>(response);
      // Type assertion needed because data comes from JSON parsing
      return (result.data as unknown) as T;
    } catch (error: unknown) {
      // Handle authentication errors
      // 401 = Token expired/invalid (from backend auth middleware)
      // 403 = Permission denied (user authenticated but lacks permission) - DON'T logout
      // Skip session-expiry flow for login endpoint: 401 there means invalid credentials, not expired token
      if (error instanceof AppError && error.statusCode === 401) {
        const isLoginPath = path.includes('/auth/login');
        if (!isLoginPath) {
          console.error('[API] 401 Unauthorized - Session expired, logging out');
          TokenManager.removeToken();

          if (this.onUnauthorized) {
            console.log('[API] Triggering unauthorized callback');
            this.onUnauthorized();
          } else {
            console.warn('[API] Unauthorized callback not set, forcing reload');
            setTimeout(() => {
              window.location.href = '/';
            }, 100);
          }
        }
      }
      // Note: 403 errors (permission denied) are NOT handled here - they should show error message but not logout

      throw error;
    }
  }

  // ========== Convenience Methods ==========
  get<T = unknown>(path: string, config?: RequestConfig): Promise<T> {
    return this.request<T>(path, { ...config, method: 'GET' });
  }

  post<T = unknown>(path: string, data?: unknown, config?: RequestConfig): Promise<T> {
    return this.request<T>(path, {
      ...config,
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  put<T = unknown>(path: string, data?: unknown, config?: RequestConfig): Promise<T> {
    return this.request<T>(path, {
      ...config,
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  patch<T = unknown>(path: string, data?: unknown, config?: RequestConfig): Promise<T> {
    return this.request<T>(path, {
      ...config,
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  delete<T = any>(path: string, config?: RequestConfig): Promise<T> {
    return this.request<T>(path, { ...config, method: 'DELETE' });
  }

  /**
   * Upload file with form data
   */
  async upload<T = any>(
    path: string,
    data: Record<string, any>,
    file: File,
    fileFieldName: string = 'file',
    method: 'POST' | 'PUT' = 'POST'
  ): Promise<T> {
    try {
      const formData = new FormData();
      
      // Add form fields
      Object.entries(data).forEach(([key, value]) => {
        formData.append(key, String(value));
      });
      
      // Add file
      formData.append(fileFieldName, file);

      const token = TokenManager.getToken();
      const headers: HeadersInit = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${this.baseURL}${path}`, {
        method,
        headers,
        body: formData,
      });

      const result = await this.handleResponse<T>(response);
      // Type assertion needed because data comes from JSON parsing
      return (result.data as unknown) as T;
    } catch (error: unknown) {
      // Handle authentication errors
      // 401 = Token expired/invalid - force logout
      // 403 = Permission denied - DON'T logout (show error instead)
      if (error instanceof AppError && error.statusCode === 401) {
        console.error('[API] 401 Unauthorized in upload - Session expired, logging out');
        TokenManager.removeToken();
        
        // Trigger logout callback if set
        if (this.onUnauthorized) {
          console.log('[API] Triggering unauthorized callback from upload');
          this.onUnauthorized();
        } else {
          // Fallback: force reload to login page
          console.warn('[API] Unauthorized callback not set in upload, forcing reload');
          setTimeout(() => {
            window.location.href = '/';
          }, 100);
        }
      }

      throw error;
    }
  }
}

// ========== Export Singleton Instance ==========
export const apiClient = new ApiClient();
export { TokenManager };

