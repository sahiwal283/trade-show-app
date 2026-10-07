export type SampleBrand = 'haute_brands' | 'boomin_brands';
export const SAMPLE_BRANDS: readonly SampleBrand[] = ['haute_brands', 'boomin_brands'];
export const SAMPLE_BRAND_LABELS: Record<SampleBrand, string> = {
  haute_brands: 'Haute Brands',
  boomin_brands: 'Coolioh',
};

export interface SampleProductLine {
  id: string; brand: SampleBrand; name: string; position: number; is_active: boolean;
}
export interface SampleProduct {
  id: string; product_line_id: string; name: string; position: number; is_active: boolean;
}
export interface SampleMaterial {
  id: string; name: string; position: number; is_active: boolean;
}
export interface SampleCatalog {
  lines: SampleProductLine[]; products: SampleProduct[]; materials: SampleMaterial[];
}

export interface SampleRequestItemInput {
  productId: string; singles: number; displays: number; emptyDisplays: number;
}
export interface SampleRequestMaterialInput {
  materialId: string; qty: number; notes: string | null;
}
export interface SampleRequestPayload {
  items: SampleRequestItemInput[]; materials: SampleRequestMaterialInput[];
}

export type SampleRequestStatus = 'draft' | 'submitted';

export interface SampleRequestRow {
  id: string; event_id: string; user_id: string; status: SampleRequestStatus;
  submitted_at: string | null; created_at: string; updated_at: string;
}
export interface SampleRequestDetail extends SampleRequestRow {
  items: SampleRequestItemInput[]; materials: SampleRequestMaterialInput[];
}

export interface SampleWindow {
  opensAt: string | null; closesAt: string | null; isOpen: boolean;
}
export interface SampleRequestView {
  request: SampleRequestDetail; window: SampleWindow;
}

/** One dashboard action row. */
export interface OpenSampleRequest {
  eventId: string; eventName: string; closesAt: string;
  status: 'none' | SampleRequestStatus; submittedAt: string | null;
}

export interface SummaryByUser {
  userId: string; name: string; status: SampleRequestStatus;
  singles: number; displays: number; emptyDisplays: number;
}
export interface SummaryProduct {
  productId: string; productName: string; lineId: string; lineName: string; brand: SampleBrand;
  isActive: boolean; singles: number; displays: number; emptyDisplays: number; byUser: SummaryByUser[];
}
export interface SummaryMaterialByUser {
  userId: string; name: string; status: SampleRequestStatus; qty: number; notes: string | null;
}
export interface SummaryMaterial {
  materialId: string; materialName: string; isActive: boolean; qty: number; byUser: SummaryMaterialByUser[];
}
export interface SummaryParticipant {
  userId: string; name: string; status: 'none' | SampleRequestStatus; submittedAt: string | null;
}
export interface EventSampleSummary {
  eventId: string; eventName: string; window: SampleWindow; pullerUserId: string | null;
  participants: SummaryParticipant[]; products: SummaryProduct[]; materials: SummaryMaterial[];
}

/** Roles that may edit any rep's request, including after close. */
export const SAMPLE_OVERRIDE_ROLES = ['admin', 'coordinator', 'developer'] as const;
export const canOverrideSampleWindow = (role: string | undefined): boolean =>
  !!role && (SAMPLE_OVERRIDE_ROLES as readonly string[]).includes(role);
