import { ValidationError } from '../../utils/errors';
import {
  SampleCatalog, SampleRequestPayload, SampleRequestPatch, SampleRequestItemPatch, SampleRequestMaterialPatch,
} from './types';

export const MAX_SAMPLE_QTY = 10000;

const nonNegInt = (v: unknown, field: string): number => {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
    throw new ValidationError(`${field} must be a non-negative integer`);
  }
  if (v > MAX_SAMPLE_QTY) throw new ValidationError(`${field} must be between 0 and ${MAX_SAMPLE_QTY}`);
  return v;
};

/**
 * Shape + referential checks. The catalog passed in must INCLUDE inactive
 * rows: a retired product already on a request stays valid so a rep's old
 * numbers are never silently dropped on save.
 */
export function validateSamplePayload(body: unknown, catalog: SampleCatalog): SampleRequestPayload {
  if (!body || typeof body !== 'object') throw new ValidationError('items and materials are required');
  const { items, materials } = body as { items?: unknown; materials?: unknown };
  if (!Array.isArray(items)) throw new ValidationError('items must be an array');
  if (!Array.isArray(materials)) throw new ValidationError('materials must be an array');

  const productIds = new Set(catalog.products.map((p) => p.id));
  const materialIds = new Set(catalog.materials.map((m) => m.id));
  const seenP = new Set<string>();
  const seenM = new Set<string>();

  const outItems = items.map((raw: any, idx: number) => {
    const productId = typeof raw?.productId === 'string' ? raw.productId : '';
    if (!productIds.has(productId)) throw new ValidationError(`items[${idx}]: unknown product`);
    if (seenP.has(productId)) throw new ValidationError(`items[${idx}]: duplicate product`);
    seenP.add(productId);
    return {
      productId,
      singles: nonNegInt(raw.singles, `items[${idx}].singles`),
      displays: nonNegInt(raw.displays, `items[${idx}].displays`),
      emptyDisplays: nonNegInt(raw.emptyDisplays, `items[${idx}].emptyDisplays`),
    };
  });

  const outMaterials = materials.map((raw: any, idx: number) => {
    const materialId = typeof raw?.materialId === 'string' ? raw.materialId : '';
    if (!materialIds.has(materialId)) throw new ValidationError(`materials[${idx}]: unknown material`);
    if (seenM.has(materialId)) throw new ValidationError(`materials[${idx}]: duplicate material`);
    seenM.add(materialId);
    const notes = typeof raw.notes === 'string' ? raw.notes.trim().slice(0, 500) : '';
    return { materialId, qty: nonNegInt(raw.qty, `materials[${idx}].qty`), notes: notes.length > 0 ? notes : null };
  });

  return { items: outItems, materials: outMaterials };
}

const ITEM_PATCH_FIELDS = ['singles', 'displays', 'emptyDisplays'] as const;

/**
 * Field-level patch: each row carries only the fields the client changed, and
 * an absent field stays absent (never defaulted) so the repository leaves the
 * stored value alone. Same catalog rule as above: inactive rows are valid.
 */
export function validateSamplePatch(body: unknown, catalog: SampleCatalog): SampleRequestPatch {
  if (!body || typeof body !== 'object') throw new ValidationError('items and materials are required');
  const { items, materials } = body as { items?: unknown; materials?: unknown };
  if (!Array.isArray(items)) throw new ValidationError('items must be an array');
  if (!Array.isArray(materials)) throw new ValidationError('materials must be an array');

  const productIds = new Set(catalog.products.map((p) => p.id));
  const materialIds = new Set(catalog.materials.map((m) => m.id));
  const seenP = new Set<string>();
  const seenM = new Set<string>();

  const outItems = items.map((raw: any, idx: number) => {
    const productId = typeof raw?.productId === 'string' ? raw.productId : '';
    if (!productIds.has(productId)) throw new ValidationError(`items[${idx}]: unknown product`);
    if (seenP.has(productId)) throw new ValidationError(`items[${idx}]: duplicate product`);
    seenP.add(productId);
    const out: SampleRequestItemPatch = { productId };
    for (const f of ITEM_PATCH_FIELDS) {
      if (raw[f] !== undefined) out[f] = nonNegInt(raw[f], `items[${idx}].${f}`);
    }
    if (Object.keys(out).length === 1) throw new ValidationError(`items[${idx}]: no fields to change`);
    return out;
  });

  const outMaterials = materials.map((raw: any, idx: number) => {
    const materialId = typeof raw?.materialId === 'string' ? raw.materialId : '';
    if (!materialIds.has(materialId)) throw new ValidationError(`materials[${idx}]: unknown material`);
    if (seenM.has(materialId)) throw new ValidationError(`materials[${idx}]: duplicate material`);
    seenM.add(materialId);
    const out: SampleRequestMaterialPatch = { materialId };
    if (raw.qty !== undefined) out.qty = nonNegInt(raw.qty, `materials[${idx}].qty`);
    if (raw.notes !== undefined) {
      if (raw.notes !== null && typeof raw.notes !== 'string') {
        throw new ValidationError(`materials[${idx}].notes must be a string or null`);
      }
      const notes = (raw.notes ?? '').trim().slice(0, 500);
      out.notes = notes.length > 0 ? notes : null;
    }
    if (Object.keys(out).length === 1) throw new ValidationError(`materials[${idx}]: no fields to change`);
    return out;
  });

  return { items: outItems, materials: outMaterials };
}
