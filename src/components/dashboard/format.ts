/**
 * Dashboard display formatters — hero numerals read as whole dollars;
 * cents only appear on individual ledger lines (via formatCurrency).
 */

// Near-miss of reports/roiData fmtMoneyFull kept on purpose: dashboard stays
// independent of the reports module and pins the en-US locale for hero numerals.
export function money(amount: number): string {
  return `$${Math.round(amount).toLocaleString('en-US')}`;
}
