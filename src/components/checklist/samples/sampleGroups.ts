/** Which product lines and products a brand shows: active ones, plus retired ones already on the request. */
import type { SampleBrand, SampleCatalog, SampleProduct, SampleProductLine, SampleMaterial, SampleRequestItem, SampleRequestMaterial } from '../../../utils/sampleRequestApi';

export interface ProductGroup {
  line: SampleProductLine;
  products: SampleProduct[];
}

export function brandGroups(catalog: SampleCatalog, items: Map<string, SampleRequestItem>, brand: SampleBrand): ProductGroup[] {
  const onRequest = (lineId: string) => catalog.products.some((p) => p.product_line_id === lineId && items.has(p.id));
  return catalog.lines
    .filter((l) => l.brand === brand && (l.is_active || onRequest(l.id)))
    .sort((a, b) => a.position - b.position)
    .map((line) => ({
      line,
      products: catalog.products
        .filter((p) => p.product_line_id === line.id && ((p.is_active && line.is_active) || items.has(p.id)))
        .sort((a, b) => a.position - b.position),
    }))
    .filter((g) => g.products.length > 0);
}

export function visibleMaterials(catalog: SampleCatalog, values: Map<string, SampleRequestMaterial>): SampleMaterial[] {
  return catalog.materials.filter((m) => m.is_active || values.has(m.id)).sort((a, b) => a.position - b.position);
}

export const isRequested = (i: SampleRequestItem | undefined): boolean => !!i && (i.singles > 0 || i.displays > 0 || i.emptyDisplays > 0);
