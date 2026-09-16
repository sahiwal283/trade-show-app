/**
 * Badge Scan API Client
 *
 * Feature-scoped, following boothApi.ts — src/utils/api.ts is already a large
 * object literal and this feature does not belong in it.
 *
 * apiClient's convenience methods (get/post/patch/...) already unwrap the
 * response to the parsed JSON body (see apiClient.ts request()/handleResponse()
 * — they return result.data, not {data: ...}), so callers here use the
 * resolved value directly rather than reaching for a `.data` property, same
 * as every other call site of apiClient in this codebase (boothApi, api.ts,
 * pushNotifications.ts).
 */

import { apiClient } from './apiClient';
import { API_CONFIG, STORAGE_KEYS } from '../constants/appConstants';

export interface BadgeScanRecord {
  id: string;
  event_id: string;
  scanned_by: string | null;
  entity: string;
  brand: string | null;
  raw_payload: string;
  parser_version: string | null;
  parse_confidence: string | null;
  badge_id: string | null;
  salutation: string | null;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  attendee_type: string | null;
  notes: string | null;
  crm_status: 'pending' | 'synced' | 'failed' | 'skipped';
  crm_error: string | null;
  scanned_at: string;
}

export interface CreateScanPayload {
  eventId: string;
  entity: string;
  rawPayload: string;
  clientScanId?: string;
  scannedAt?: string;
  parserVersion?: string;
  parseConfidence?: number;
  fields?: unknown;
  notes?: string;
  contact?: Record<string, string>;
}

export interface ListScansParams {
  eventId: string;
  entity?: string;
  crmStatus?: string;
  q?: string;
}

/** The envelope the server sends for GET /api/badge-scans (Task 5/6). */
interface ListScansResponse {
  scans?: BadgeScanRecord[];
  count?: number;
}

export const badgeApi = {
  async createScan(input: CreateScanPayload): Promise<BadgeScanRecord> {
    return apiClient.post<BadgeScanRecord>('/badge-scans', input);
  },

  async listScans(params: ListScansParams): Promise<BadgeScanRecord[]> {
    const query = new URLSearchParams({ eventId: params.eventId });
    if (params.entity) query.set('entity', params.entity);
    if (params.crmStatus) query.set('crmStatus', params.crmStatus);
    if (params.q) query.set('q', params.q);
    const response = await apiClient.get<ListScansResponse>(`/badge-scans?${query.toString()}`);
    return response?.scans ?? [];
  },

  async updateScan(id: string, patch: Partial<BadgeScanRecord>): Promise<BadgeScanRecord> {
    return apiClient.patch<BadgeScanRecord>(`/badge-scans/${id}`, patch);
  },

  async retryPush(id: string): Promise<BadgeScanRecord> {
    return apiClient.post<BadgeScanRecord>(`/badge-scans/${id}/push`, {});
  },

  /**
   * Absolute URL of the export endpoint, API base path included.
   *
   * The bare `/badge-scans/...` path resolves against the SPA origin and is
   * served the index document, not the API — every API call in this codebase
   * goes through API_CONFIG.BASE_URL.
   */
  exportUrl(eventId: string, format: 'csv' | 'xlsx' = 'csv'): string {
    return `${API_CONFIG.BASE_URL}/badge-scans/export?eventId=${encodeURIComponent(eventId)}&format=${format}`;
  },

  /**
   * Download the lead export.
   *
   * This cannot be a plain <a href>: the export route is authenticated and a
   * link navigation carries no Authorization header, so the server answers
   * 401. Fetch with the token, then hand the blob to a programmatic download
   * — the same pattern as reports/ShowComparison.tsx.
   *
   * Export is the whole fallback for companies with no CRM configured, which
   * on day one is all of them, so it has to actually work.
   */
  async downloadExport(eventId: string, format: 'csv' | 'xlsx' = 'csv'): Promise<void> {
    const token = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
    const response = await fetch(badgeApi.exportUrl(eventId, format), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) throw new Error(`Export failed (${response.status})`);

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    try {
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `leads-${new Date().toISOString().slice(0, 10)}.${format}`;
      link.click();
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  },
};
