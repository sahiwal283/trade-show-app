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
export interface UserRef { id: string; name: string }
export interface EventSampleRequest {
  id: string; eventId: string; status: SampleRequestStatus;
  submittedAt: string | null; submittedBy: UserRef | null;
  lastEditedAt: string | null; lastEditedBy: UserRef | null;
  items: SampleRequestItem[]; materials: SampleRequestMaterial[];
}
export interface EventSampleRequestView { request: EventSampleRequest; window: SampleWindow; canEdit: boolean }
export interface SampleRequestItemPatch { productId: string; singles?: number; displays?: number; emptyDisplays?: number }
export interface SampleRequestMaterialPatch { materialId: string; qty?: number; notes?: string | null }
/** Only the fields the client changed, per row. The server merges them into the current row. */
export interface SampleRequestPatch { items: SampleRequestItemPatch[]; materials: SampleRequestMaterialPatch[] }
export type SampleChangeField = 'singles' | 'displays' | 'empty_displays' | 'qty' | 'notes';
export interface SampleChangeRow {
  id: string; userId: string | null; userName: string | null; kind: 'item' | 'material'; targetId: string; targetName: string;
  lineName: string | null; brand: SampleBrand | null; field: SampleChangeField; oldValue: string | null; newValue: string | null; changedAt: string;
}
export interface OpenSampleRequest { eventId: string; eventName: string; closesAt: string; status: 'none' | SampleRequestStatus; submittedAt: string | null }

const base = '/sample-requests';

export const sampleRequestApi = {
  getCatalog: (includeInactive = false) =>
    apiClient.get<SampleCatalog>(includeInactive ? `${base}/catalog?includeInactive=1` : `${base}/catalog`),
  listMine: () => apiClient.get<{ requests: OpenSampleRequest[] }>(`${base}/mine`),
  getEventAccess: (eventId: string) => apiClient.get<{ canView: boolean; canEdit: boolean }>(`${base}/${eventId}/access`),
  getEvent: (eventId: string) => apiClient.get<EventSampleRequestView>(`${base}/${eventId}`),
  patchEvent: (eventId: string, patch: SampleRequestPatch) => apiClient.patch<EventSampleRequestView>(`${base}/${eventId}`, patch),
  submitEvent: (eventId: string) => apiClient.post<EventSampleRequestView>(`${base}/${eventId}/submit`),
  getHistory: (eventId: string) => apiClient.get<{ changes: SampleChangeRow[] }>(`${base}/${eventId}/history`),

  createLine: (brand: SampleBrand, name: string) => apiClient.post<SampleProductLine>(`${base}/catalog/lines`, { brand, name }),
  updateLine: (id: string, patch: { name?: string; isActive?: boolean }) => apiClient.put<SampleProductLine>(`${base}/catalog/lines/${id}`, patch),
  createProduct: (productLineId: string, name: string) => apiClient.post<SampleProduct>(`${base}/catalog/products`, { productLineId, name }),
  updateProduct: (id: string, patch: { name?: string; isActive?: boolean }) => apiClient.put<SampleProduct>(`${base}/catalog/products/${id}`, patch),
  createMaterial: (name: string) => apiClient.post<SampleMaterial>(`${base}/catalog/materials`, { name }),
  updateMaterial: (id: string, patch: { name?: string; isActive?: boolean }) => apiClient.put<SampleMaterial>(`${base}/catalog/materials/${id}`, patch),
  reorder: (kind: 'lines' | 'products' | 'materials', orderedIds: string[]) => apiClient.put<{ ok: true }>(`${base}/catalog/reorder`, { kind, orderedIds }),
};
