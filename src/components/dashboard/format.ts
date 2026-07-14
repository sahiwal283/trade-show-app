/**
 * Dashboard display formatters — hero numerals read as whole dollars;
 * cents only appear on individual ledger lines (via formatCurrency).
 */

export function money(amount: number): string {
  return `$${Math.round(amount).toLocaleString('en-US')}`;
}
