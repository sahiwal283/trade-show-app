import { describe, it, expect } from 'vitest';
import { validateSamplePayload } from '../../src/services/sampleRequests/validateSamplePayload';

const catalog = {
  lines: [], materials: [{ id: 'm-1', name: 'Banner', position: 1, is_active: true }],
  products: [{ id: 'p-1', product_line_id: 'l-1', name: 'Mango', position: 1, is_active: true },
             { id: 'p-old', product_line_id: 'l-1', name: 'Gone', position: 2, is_active: false }],
};

describe('validateSamplePayload', () => {
  it('accepts a well-formed payload and coerces notes', () => {
    const out = validateSamplePayload({
      items: [{ productId: 'p-1', singles: 2, displays: 0, emptyDisplays: 1 }],
      materials: [{ materialId: 'm-1', qty: 1, notes: '  two  ' }],
    }, catalog);
    expect(out.items).toEqual([{ productId: 'p-1', singles: 2, displays: 0, emptyDisplays: 1 }]);
    expect(out.materials).toEqual([{ materialId: 'm-1', qty: 1, notes: 'two' }]);
  });
  it('rejects a product not in the catalog', () => {
    expect(() => validateSamplePayload({ items: [{ productId: 'nope', singles: 1, displays: 0, emptyDisplays: 0 }], materials: [] }, catalog))
      .toThrow(/unknown product/i);
  });
  it('keeps a retired product that is already on the request', () => {
    const out = validateSamplePayload({ items: [{ productId: 'p-old', singles: 1, displays: 0, emptyDisplays: 0 }], materials: [] }, catalog);
    expect(out.items[0].productId).toBe('p-old');
  });
  it('rejects negatives and non-integers', () => {
    expect(() => validateSamplePayload({ items: [{ productId: 'p-1', singles: -1, displays: 0, emptyDisplays: 0 }], materials: [] }, catalog)).toThrow(/non-negative integer/i);
    expect(() => validateSamplePayload({ items: [{ productId: 'p-1', singles: 1.5, displays: 0, emptyDisplays: 0 }], materials: [] }, catalog)).toThrow(/non-negative integer/i);
    expect(() => validateSamplePayload({ items: [], materials: [{ materialId: 'm-1', qty: '3' as any, notes: null }] }, catalog)).toThrow(/non-negative integer/i);
  });
  it('rejects quantities above 10000 with a 400', () => {
    const big = () => validateSamplePayload({ items: [{ productId: 'p-1', singles: 10001, displays: 0, emptyDisplays: 0 }], materials: [] }, catalog);
    expect(big).toThrow(/items\[0\]\.singles must be between 0 and 10000/);
    try { big(); } catch (e: any) { expect(e.statusCode).toBe(400); }
    expect(() => validateSamplePayload({ items: [], materials: [{ materialId: 'm-1', qty: 10001, notes: null }] }, catalog)).toThrow(/must be between 0 and 10000/);
    expect(validateSamplePayload({ items: [{ productId: 'p-1', singles: 10000, displays: 0, emptyDisplays: 0 }], materials: [] }, catalog).items[0].singles).toBe(10000);
  });
  it('rejects a non-object body and missing arrays', () => {
    expect(() => validateSamplePayload(null, catalog)).toThrow(/items/i);
    expect(() => validateSamplePayload({ items: 'x', materials: [] }, catalog)).toThrow(/items/i);
  });
  it('rejects duplicate product ids', () => {
    expect(() => validateSamplePayload({
      items: [{ productId: 'p-1', singles: 1, displays: 0, emptyDisplays: 0 }, { productId: 'p-1', singles: 2, displays: 0, emptyDisplays: 0 }], materials: [],
    }, catalog)).toThrow(/duplicate/i);
  });
});
