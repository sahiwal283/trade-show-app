import { describe, it, expect } from 'vitest';
import { validateSamplePayload, validateSamplePatch } from '../../src/services/sampleRequests/validateSamplePayload';

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

describe('validateSamplePatch', () => {
  const bad = (body: unknown, re: RegExp) => {
    expect(() => validateSamplePatch(body, catalog)).toThrow(re);
    try { validateSamplePatch(body, catalog); } catch (e: any) { expect(e.statusCode).toBe(400); }
  };

  it('passes a single-field row and leaves the absent fields undefined', () => {
    const out = validateSamplePatch({ items: [{ productId: 'p-1', singles: 3 }], materials: [{ materialId: 'm-1', qty: 2 }] }, catalog);
    expect(out).toEqual({ items: [{ productId: 'p-1', singles: 3 }], materials: [{ materialId: 'm-1', qty: 2 }] });
    expect(out.items[0].displays).toBeUndefined();
    expect(out.items[0].emptyDisplays).toBeUndefined();
    expect('displays' in out.items[0]).toBe(false);
    expect('notes' in out.materials[0]).toBe(false);
  });
  it('accepts empty items and materials', () => {
    expect(validateSamplePatch({ items: [], materials: [] }, catalog)).toEqual({ items: [], materials: [] });
  });
  it('keeps an explicit zero (it is a change, not a default)', () => {
    expect(validateSamplePatch({ items: [{ productId: 'p-1', displays: 0 }], materials: [] }, catalog).items)
      .toEqual([{ productId: 'p-1', displays: 0 }]);
  });
  it('trims notes, blanks become null, an absent notes key stays absent', () => {
    const notes = (v: unknown) => validateSamplePatch({ items: [], materials: [{ materialId: 'm-1', notes: v }] }, catalog).materials[0];
    expect(notes('  x  ')).toEqual({ materialId: 'm-1', notes: 'x' });
    expect(notes('')).toEqual({ materialId: 'm-1', notes: null });
    expect(notes('   ')).toEqual({ materialId: 'm-1', notes: null });
    expect(notes(null)).toEqual({ materialId: 'm-1', notes: null });
    expect(notes('y'.repeat(600)).notes).toHaveLength(500);
    const qtyOnly = validateSamplePatch({ items: [], materials: [{ materialId: 'm-1', qty: 1 }] }, catalog).materials[0];
    expect('notes' in qtyOnly).toBe(false);
  });
  it('rejects notes that are neither a string nor null', () => {
    bad({ items: [], materials: [{ materialId: 'm-1', notes: 5 }] }, /materials\[0\]\.notes/);
  });
  it('rejects a row with only an id', () => {
    bad({ items: [{ productId: 'p-1' }], materials: [] }, /items\[0\]: no fields to change/);
    bad({ items: [], materials: [{ materialId: 'm-1' }] }, /materials\[0\]: no fields to change/);
    bad({ items: [{ productId: 'p-1', bogus: 1 }], materials: [] }, /no fields to change/);
  });
  it('rejects an unknown id', () => {
    bad({ items: [{ productId: 'nope', singles: 1 }], materials: [] }, /items\[0\]: unknown product/);
    bad({ items: [], materials: [{ materialId: 'nope', qty: 1 }] }, /materials\[0\]: unknown material/);
  });
  it('rejects a duplicate id', () => {
    bad({ items: [{ productId: 'p-1', singles: 1 }, { productId: 'p-1', displays: 2 }], materials: [] }, /items\[1\]: duplicate product/);
    bad({ items: [], materials: [{ materialId: 'm-1', qty: 1 }, { materialId: 'm-1', notes: 'x' }] }, /materials\[1\]: duplicate material/);
  });
  it('rejects negative, fractional, oversized and string quantities', () => {
    bad({ items: [{ productId: 'p-1', singles: -1 }], materials: [] }, /items\[0\]\.singles must be a non-negative integer/);
    bad({ items: [{ productId: 'p-1', displays: 1.5 }], materials: [] }, /items\[0\]\.displays must be a non-negative integer/);
    bad({ items: [{ productId: 'p-1', emptyDisplays: 10001 }], materials: [] }, /items\[0\]\.emptyDisplays must be between 0 and 10000/);
    bad({ items: [], materials: [{ materialId: 'm-1', qty: '3' }] }, /materials\[0\]\.qty must be a non-negative integer/);
    bad({ items: [{ productId: 'p-1', singles: null }], materials: [] }, /non-negative integer/);
    expect(validateSamplePatch({ items: [{ productId: 'p-1', singles: 10000 }], materials: [] }, catalog).items[0].singles).toBe(10000);
  });
  it('accepts an inactive product', () => {
    expect(validateSamplePatch({ items: [{ productId: 'p-old', singles: 1 }], materials: [] }, catalog).items[0].productId).toBe('p-old');
  });
  it('ignores unknown extra keys', () => {
    expect(validateSamplePatch({ items: [{ productId: 'p-1', singles: 1, hacked: true }], materials: [], extra: 1 }, catalog))
      .toEqual({ items: [{ productId: 'p-1', singles: 1 }], materials: [] });
  });
  it('rejects a non-object body and non-array items / materials', () => {
    bad(null, /items/i);
    bad('x', /items/i);
    bad({ items: 'x', materials: [] }, /items must be an array/);
    bad({ items: [], materials: {} }, /materials must be an array/);
    bad({ items: [null], materials: [] }, /items\[0\]: unknown product/);
  });
});
