import { ValidationError } from '../../utils/errors';
import { SampleCatalog, SampleRequestPayload } from './types';

const nonNegInt = (v: unknown, field: string): number => {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
    throw new ValidationError(`${field} must be a non-negative integer`);
  }
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
