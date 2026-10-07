import { apiClient } from './apiClient';

export type SampleBrand = 'haute_brands' | 'boomin_brands';
export const SAMPLE_BRAND_LABELS: Record<SampleBrand, string> = { haute_brands: 'Haute Brands', boomin_brands: 'Coolioh' };
export const SAMPLE_BRAND_ORDER: SampleBrand[] = ['haute_brands', 'boomin_brands'];
/** Per-field quantity cap; the server rejects anything above it. */
export const MAX_SAMPLE_QTY = 10000;

export interface SampleProductLine { id: string; brand: SampleBrand; name: string; position: number; is_active: boolean }
export interface SampleProduct { id: string; product_line_id: string; name: string; position: number; is_active: boolean }
export interface SampleMaterial { id: string; name: string; position: number; is_active: boolean }
export interface SampleCatalog { lines: SampleProductLine[]; products: SampleProduct[]; materials: SampleMaterial[] }

export interface SampleRequestItem { productId: string; singles: number; displays: number; emptyDisplays: number }
export interface SampleRequestMaterial { materialId: string; qty: number; notes: string | null }
export interface SampleRequestPayload { items: SampleRequestItem[]; materials: SampleRequestMaterial[] }

export type SampleRequestStatus = 'draft' | 'submitted';
export interface SampleWindow { opensAt: string | null; closesAt: string | null; isOpen: boolean }
export interface SampleRequestView {
  request: { id: string; event_id: string; user_id: string; status: SampleRequestStatus; submitted_at: string | null; items: SampleRequestItem[]; materials: SampleRequestMaterial[] };
  window: SampleWindow;
}
export interface OpenSampleRequest { eventId: string; eventName: string; closesAt: string; status: 'none' | SampleRequestStatus; submittedAt: string | null }

export interface SummaryByUser { userId: string; name: string; status: SampleRequestStatus; singles: number; displays: number; emptyDisplays: number }
export interface SummaryProduct { productId: string; productName: string; lineId: string; lineName: string; brand: SampleBrand; isActive: boolean; singles: number; displays: number; emptyDisplays: number; byUser: SummaryByUser[] }
export interface SummaryMaterialByUser { userId: string; name: string; status: SampleRequestStatus; qty: number; notes: string | null }
export interface SummaryMaterial { materialId: string; materialName: string; isActive: boolean; qty: number; byUser: SummaryMaterialByUser[] }
export interface SummaryParticipant { userId: string; name: string; status: 'none' | SampleRequestStatus; submittedAt: string | null }
export interface EventSampleSummary { eventId: string; eventName: string; window: SampleWindow; pullerUserId: string | null; participants: SummaryParticipant[]; products: SummaryProduct[]; materials: SummaryMaterial[] }

const base = '/sample-requests';

export const sampleRequestApi = {
  getCatalog: (includeInactive = false) =>
    apiClient.get<SampleCatalog>(includeInactive ? `${base}/catalog?includeInactive=1` : `${base}/catalog`),
  listMine: () => apiClient.get<{ requests: OpenSampleRequest[] }>(`${base}/mine`),
  getAccess: () => apiClient.get<{ canViewSummary: boolean }>(`${base}/access`),
  getMine: (eventId: string) => apiClient.get<SampleRequestView>(`${base}/${eventId}/mine`),
  saveMine: (eventId: string, payload: SampleRequestPayload) => apiClient.put<SampleRequestView>(`${base}/${eventId}/mine`, payload),
  submitMine: (eventId: string) => apiClient.post<SampleRequestView>(`${base}/${eventId}/mine/submit`),
  getForUser: (eventId: string, userId: string) => apiClient.get<SampleRequestView>(`${base}/${eventId}/users/${userId}`),
  saveForUser: (eventId: string, userId: string, payload: SampleRequestPayload) => apiClient.put<SampleRequestView>(`${base}/${eventId}/users/${userId}`, payload),
  submitForUser: (eventId: string, userId: string) => apiClient.post<SampleRequestView>(`${base}/${eventId}/users/${userId}/submit`),
  getSummary: (eventId: string) => apiClient.get<EventSampleSummary>(`${base}/${eventId}/summary`),

  createLine: (brand: SampleBrand, name: string) => apiClient.post<SampleProductLine>(`${base}/catalog/lines`, { brand, name }),
  updateLine: (id: string, patch: { name?: string; isActive?: boolean }) => apiClient.put<SampleProductLine>(`${base}/catalog/lines/${id}`, patch),
  createProduct: (productLineId: string, name: string) => apiClient.post<SampleProduct>(`${base}/catalog/products`, { productLineId, name }),
  updateProduct: (id: string, patch: { name?: string; isActive?: boolean }) => apiClient.put<SampleProduct>(`${base}/catalog/products/${id}`, patch),
  createMaterial: (name: string) => apiClient.post<SampleMaterial>(`${base}/catalog/materials`, { name }),
  updateMaterial: (id: string, patch: { name?: string; isActive?: boolean }) => apiClient.put<SampleMaterial>(`${base}/catalog/materials/${id}`, patch),
  reorder: (kind: 'lines' | 'products' | 'materials', orderedIds: string[]) => apiClient.put<{ ok: true }>(`${base}/catalog/reorder`, { kind, orderedIds }),
};
