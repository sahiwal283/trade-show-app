/**
 * Resolves an expense category to its Zoho Books expense account.
 *
 * The mapping table lives in `app_settings.categoryOptions` and is maintained
 * by hand in Admin Settings. Once picklists are sourced from Midas
 * (PICKLIST_SOURCE=midas) the dropdown can offer categories that table has
 * never heard of, and those book to the brand default account.
 *
 * That fallback is kept — refusing to post an expense over a missing mapping
 * would be worse — but it is reported, both in the return value and in a log
 * line that names the category, so a mis-booked expense is distinguishable
 * from a correctly booked one.
 */

export interface CategoryAccountOption {
  name: string;
  zohoExpenseAccountIds?: {
    haute_brands?: string | null;
    boomin_brands?: string | null;
    nirvana_kulture?: string | null;
  } | null;
}

export interface ExpenseAccountResolution {
  accountId: string;
  /** False means the brand default was used because no mapping existed. */
  mapped: boolean;
}

export function resolveExpenseAccountId(
  category: string,
  categoryOptions: CategoryAccountOption[],
  brand: string,
  defaultAccountId: string
): ExpenseAccountResolution {
  const matched = category
    ? categoryOptions.find((cat) => cat.name?.toLowerCase() === category.toLowerCase())
    : undefined;

  const brandKey = brand as keyof NonNullable<CategoryAccountOption['zohoExpenseAccountIds']>;
  const accountId = matched?.zohoExpenseAccountIds?.[brandKey];

  if (accountId) {
    return { accountId, mapped: true };
  }

  console.warn(
    `[ZohoClient] UNMAPPED category "${category}" for brand ${brand} — ` +
      `booking to the brand default account ${defaultAccountId || 'NONE'}. ` +
      'Add a Zoho expense account ID for this category in Admin Settings.'
  );

  return { accountId: defaultAccountId, mapped: false };
}
