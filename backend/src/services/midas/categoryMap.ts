/**
 * Trade Show category names seeded in Midas (exact).
 */

export const TRADE_SHOW_CATEGORY_NAMES = [
  'Booth / Marketing / Tools',
  'Travel - Flight',
  'Accommodation - Hotel',
  'Transportation - Uber / Lyft / Others',
  'Parking Fees',
  'Rental - Car / U-haul',
  'Meal and Entertainment',
  'Gas / Fuel',
  'Shipping Charges',
  'Show Allowances - Per Diem',
  'Travel Expenses',
  'Model',
  'Other',
] as const;

export type TradeShowCategoryName = (typeof TRADE_SHOW_CATEGORY_NAMES)[number];

/** Resolve a free-text / OCR category to a seeded Midas category name. */
export function resolveCategoryName(input: string | null | undefined): string {
  if (!input || !input.trim()) return 'Other';
  const trimmed = input.trim();
  const exact = TRADE_SHOW_CATEGORY_NAMES.find((n) => n === trimmed);
  if (exact) return exact;

  const lower = trimmed.toLowerCase();
  const rules: Array<[RegExp, string]> = [
    [/meal|restaurant|entertainment/i, 'Meal and Entertainment'],
    [/flight|airfare/i, 'Travel - Flight'],
    [/hotel|accommodation/i, 'Accommodation - Hotel'],
    [/uber|lyft|taxi|transport/i, 'Transportation - Uber / Lyft / Others'],
    [/parking/i, 'Parking Fees'],
    [/rental|u-?haul|car rental/i, 'Rental - Car / U-haul'],
    [/gas|fuel/i, 'Gas / Fuel'],
    [/booth|marketing/i, 'Booth / Marketing / Tools'],
    [/ship/i, 'Shipping Charges'],
    [/per\s*diem|allowance/i, 'Show Allowances - Per Diem'],
    [/travel expense/i, 'Travel Expenses'],
    [/^model$/i, 'Model'],
  ];
  for (const [re, name] of rules) {
    if (re.test(lower)) return name;
  }
  return 'Other';
}
