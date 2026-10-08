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
  id: string; event_id: string; created_by: string | null; status: SampleRequestStatus;
  submitted_at: string | null; submitted_by: string | null;
  last_edited_at: string | null; last_edited_by: string | null;
  created_at: string; updated_at: string;
}

export interface UserRef { id: string; name: string }

export interface EventSampleRequest {
  id: string; eventId: string; status: SampleRequestStatus;
  submittedAt: string | null; submittedBy: UserRef | null;
  lastEditedAt: string | null; lastEditedBy: UserRef | null;
  items: SampleRequestItemInput[]; materials: SampleRequestMaterialInput[];
}

export interface SampleWindow { opensAt: string | null; closesAt: string | null; isOpen: boolean }

export interface EventSampleRequestView { request: EventSampleRequest; window: SampleWindow; canEdit: boolean }

export interface SampleRequestItemPatch { productId: string; singles?: number; displays?: number; emptyDisplays?: number }
export interface SampleRequestMaterialPatch { materialId: string; qty?: number; notes?: string | null }
/** Only the fields the client changed, per row. */
export interface SampleRequestPatch { items: SampleRequestItemPatch[]; materials: SampleRequestMaterialPatch[] }

export type SampleChangeField = 'singles' | 'displays' | 'empty_displays' | 'qty' | 'notes';

export interface SampleChangeRow {
  id: string; userId: string | null; userName: string | null;
  kind: 'item' | 'material'; targetId: string; targetName: string;
  lineName: string | null; brand: SampleBrand | null;
  field: SampleChangeField; oldValue: string | null; newValue: string | null; changedAt: string;
}

/** One dashboard action row. */
export interface OpenSampleRequest {
  eventId: string; eventName: string; closesAt: string;
  status: 'none' | SampleRequestStatus; submittedAt: string | null;
}

/** Roles that may edit any rep's request, including after close. */
export const SAMPLE_OVERRIDE_ROLES = ['admin', 'coordinator', 'developer'] as const;
export const canOverrideSampleWindow = (role: string | undefined): boolean =>
  !!role && (SAMPLE_OVERRIDE_ROLES as readonly string[]).includes(role);
