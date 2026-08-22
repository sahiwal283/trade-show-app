/**
 * Finds categories that can be selected but cannot be booked.
 *
 * Trade Show posts expenses to Zoho using the per-brand account IDs kept in
 * `app_settings.categoryOptions`. When picklists come from Midas
 * (PICKLIST_SOURCE=midas) that table is no longer the source of the dropdown,
 * so the two can drift: a category is offered, an expense is filed against it,
 * and it books to the brand default account with nothing on screen to say so.
 *
 * This produces the backfill worklist Admin Settings shows.
 */

export interface CategoryMappingRow {
  name: string;
  zohoExpenseAccountIds?: {
    haute_brands?: string | null;
    boomin_brands?: string | null;
    nirvana_kulture?: string | null;
  } | null;
}

/** A row counts as mapped once any one brand has an account ID — the others
 *  fall back to their brand default by design. */
function hasAnyAccountId(row: CategoryMappingRow): boolean {
  const ids = row.zohoExpenseAccountIds;
  if (!ids) return false;
  return Boolean(ids.haute_brands || ids.boomin_brands || ids.nirvana_kulture);
}

export function findUnmappedCategories(
  picklistCategoryNames: string[],
  mappingRows: CategoryMappingRow[]
): string[] {
  // Case-insensitive, matching how resolveExpenseAccountId looks names up.
  const mapped = new Set(
    mappingRows.filter(hasAnyAccountId).map((row) => row.name?.toLowerCase())
  );

  return picklistCategoryNames.filter((name) => !mapped.has(name.toLowerCase()));
}
