import React, { useMemo } from 'react';
import { Table2, Download } from 'lucide-react';
import { Expense } from '../../App';
import { calculateEntityCategoryMatrix } from '../../utils/reportUtils';
import { getTodayLocalDateString } from '../../utils/dateUtils';

interface EntityCategoryMatrixProps {
  expenses: Expense[];
  entityColorMap: Record<string, string>;
  entityOrder: string[];
}

const formatCell = (amount: number): string =>
  amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const csvField = (value: string): string =>
  /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

export const EntityCategoryMatrix: React.FC<EntityCategoryMatrixProps> = ({
  expenses,
  entityColorMap,
  entityOrder,
}) => {
  const matrix = useMemo(
    () => calculateEntityCategoryMatrix(expenses, entityOrder),
    [expenses, entityOrder]
  );

  if (matrix.rows.length === 0) return null;

  const handleExportSummary = () => {
    const header = ['Category', ...matrix.entities, 'Total'];
    const rows = matrix.rows.map((row) => [
      row.category,
      ...matrix.entities.map((entity) => (row.byEntity[entity] || 0).toFixed(2)),
      row.total.toFixed(2),
    ]);
    const totalsRow = [
      'Total',
      ...matrix.entities.map((entity) => (matrix.columnTotals[entity] || 0).toFixed(2)),
      matrix.grandTotal.toFixed(2),
    ];
    const csvContent = [header, ...rows, totalsRow]
      .map((row) => row.map(csvField).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `expense-summary-by-entity-${getTodayLocalDateString()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-stone-200/80 bg-stone-50/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4">
        <div className="flex items-center space-x-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-100">
            <Table2 className="w-4 h-4" />
          </span>
          <div>
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">
              Category × Company Summary
            </h3>
            <p className="text-xs text-stone-500">
              Exact amounts per paying company • For selected filters
            </p>
          </div>
        </div>
        <button
          onClick={handleExportSummary}
          className="btn-secondary min-h-[36px] self-start px-3 py-1.5 text-xs sm:self-auto"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export Summary CSV</span>
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-stone-50/80">
            <tr>
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400 sm:px-6">
                Category
              </th>
              {matrix.entities.map((entity) => (
                <th
                  key={entity}
                  className="whitespace-nowrap px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-500"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      aria-hidden="true"
                      className="h-2 w-2 rounded-sm"
                      style={{ backgroundColor: entityColorMap[entity] }}
                    />
                    {entity}
                  </span>
                </th>
              ))}
              <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400 sm:px-6">
                Total
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100 bg-white">
            {matrix.rows.map((row) => (
              <tr
                key={row.category}
                className="transition-colors duration-150 hover:bg-brand-50/40"
              >
                <td className="px-4 py-2.5 text-sm font-medium text-stone-900 sm:px-6">
                  {row.category}
                </td>
                {matrix.entities.map((entity) => (
                  <td
                    key={entity}
                    className="whitespace-nowrap px-4 py-2.5 text-right text-sm tabular-nums text-stone-700"
                  >
                    {row.byEntity[entity] ? (
                      `$${formatCell(row.byEntity[entity])}`
                    ) : (
                      <span className="text-stone-300">—</span>
                    )}
                  </td>
                ))}
                <td className="whitespace-nowrap px-4 py-2.5 text-right text-sm font-semibold tabular-nums text-stone-900 sm:px-6">
                  ${formatCell(row.total)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-stone-200 bg-stone-50/80">
            <tr>
              <td className="px-4 py-3 text-sm font-semibold text-stone-900 sm:px-6">Total</td>
              {matrix.entities.map((entity) => (
                <td
                  key={entity}
                  className="whitespace-nowrap px-4 py-3 text-right text-sm font-semibold tabular-nums text-stone-900"
                >
                  ${formatCell(matrix.columnTotals[entity] || 0)}
                </td>
              ))}
              <td className="whitespace-nowrap px-4 py-3 text-right font-display text-sm font-bold tabular-nums text-stone-900 sm:px-6">
                ${formatCell(matrix.grandTotal)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};
