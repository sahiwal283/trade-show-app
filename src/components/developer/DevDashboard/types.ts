/**
 * Response shapes of /api/dev-dashboard/*. The JSON files in
 * src/utils/__fixtures__/devDashboard/ are the contract: backend tests assert
 * each service returns exactly those keys, and the tab tests render from them.
 */
export type TimeRange = '1h' | '24h' | '7d' | '30d';

export interface HealthCheck {
  id: string;
  label: string;
  status: 'pass' | 'warn' | 'fail';
  value: string;
  threshold: string;
}

export interface Overview {
  version: { frontend: string; backend: string; node: string; environment: string; uptimeSeconds: number };
  system: {
    memory: { usedBytes: number; totalBytes: number };
    cpu: { load1: number; cores: number };
    disk: { usedBytes: number; totalBytes: number } | null;
  };
  database: {
    sizeBytes: number;
    connections: number;
    maxConnections: number;
    tables: Array<{ name: string; sizeBytes: number }>;
  };
  checks: HealthCheck[];
}

export interface ApiAnalytics {
  totals: { requests: number; errors: number; errorRate: number; p50Ms: number; p95Ms: number };
  buckets: Array<{ start: string; requests: number; errors: number }>;
  endpoints: Array<{
    method: string; endpoint: string; calls: number; avgMs: number; p95Ms: number; maxMs: number; errors: number;
  }>;
  slowest: Array<{ method: string; endpoint: string; calls: number; avgMs: number; maxMs: number }>;
  recentErrors: Array<{
    id: string; createdAt: string; method: string; endpoint: string; statusCode: number;
    userName: string | null; errorMessage: string | null;
  }>;
}

export interface Usage {
  totals: { views: number; uniqueUsers: number };
  screens: Array<{ page: string; views: number; uniqueUsers: number; daily: Array<{ day: string; views: number }> }>;
  users: Array<{
    userId: string; name: string; role: string; lastSeen: string | null;
    views: number; mobileViews: number; desktopViews: number;
    topPages: Array<{ page: string; views: number }>;
  }>;
}

export interface SessionsPayload {
  users: Array<{
    userId: string;
    name: string;
    role: string;
    status: 'active' | 'idle' | 'away';
    lastActivity: string;
    sessionCount: number;
    sessions: Array<{
      id: string; ipAddress: string | null; userAgent: string | null;
      createdAt: string; lastActivity: string; expiresAt: string;
    }>;
  }>;
}

export interface AuditLogPage {
  logs: Array<{
    id: string; createdAt: string; userName: string | null; userRole: string | null; action: string;
    method: string | null; path: string | null; status: string; ipAddress: string | null; errorMessage: string | null;
  }>;
  total: number;
}

export interface AuditFilters {
  user: string;
  method: '' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'auth';
  status: '' | 'success' | 'warning' | 'failure';
  search: string;
  timeRange: TimeRange;
  limit: number;
  offset: number;
}
