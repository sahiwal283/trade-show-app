import React, { useMemo } from 'react';
import { PieChart, Check, X } from 'lucide-react';
import { Expense } from '../../App';
import { UNASSIGNED_ENTITY } from '../../utils/reportUtils';

interface WhoPaidBreakdownProps {
  /** Expenses under the event/entity/period filters — drives the category list */
  baseExpenses: Expense[];
  /** Expenses after category selection too — drives the donut */
  filteredExpenses: Expense[];
  entityColorMap: Record<string, string>;
  entityOrder: string[];
  selectedCategories: string[];
  onToggleCategory: (category: string) => void;
  onClearCategories: () => void;
}

const formatAmount = (amount: number): string =>
  '$' + amount.toLocaleString(undefined, { maximumFractionDigits: 0 });

const polarPoint = (cx: number, cy: number, r: number, angleDeg: number) => {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
};

const donutSlicePath = (
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  startAngle: number,
  endAngle: number
): string => {
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  const o1 = polarPoint(cx, cy, rOuter, startAngle);
  const o2 = polarPoint(cx, cy, rOuter, endAngle);
  const i1 = polarPoint(cx, cy, rInner, endAngle);
  const i2 = polarPoint(cx, cy, rInner, startAngle);
  return [
    `M ${o1.x} ${o1.y}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${o2.x} ${o2.y}`,
    `L ${i1.x} ${i1.y}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 0 ${i2.x} ${i2.y}`,
    'Z',
  ].join(' ');
};

export const WhoPaidBreakdown: React.FC<WhoPaidBreakdownProps> = ({
  baseExpenses,
  filteredExpenses,
  entityColorMap,
  entityOrder,
  selectedCategories,
  onToggleCategory,
  onClearCategories,
}) => {
  // Donut: entity share of the currently selected transactions
  const entityShare = useMemo(() => {
    const totals: Record<string, number> = {};
    filteredExpenses.forEach((expense) => {
      const entity = expense.zohoEntity || UNASSIGNED_ENTITY;
      totals[entity] = (totals[entity] || 0) + expense.amount;
    });
    return entityOrder
      .filter((entity) => totals[entity])
      .map((entity) => ({ entity, amount: totals[entity] }));
  }, [filteredExpenses, entityOrder]);

  const donutTotal = entityShare.reduce((sum, s) => sum + s.amount, 0);

  // Category rows: always show every category under the base filters so
  // unselected categories stay clickable
  const categoryRows = useMemo(() => {
    const rows: Record<string, { total: number; byEntity: Record<string, number> }> = {};
    baseExpenses.forEach((expense) => {
      const entity = expense.zohoEntity || UNASSIGNED_ENTITY;
      if (!rows[expense.category]) {
        rows[expense.category] = { total: 0, byEntity: {} };
      }
      rows[expense.category].total += expense.amount;
      rows[expense.category].byEntity[entity] =
        (rows[expense.category].byEntity[entity] || 0) + expense.amount;
    });
    return Object.entries(rows)
      .map(([category, data]) => ({ category, ...data }))
      .sort((a, b) => b.total - a.total);
  }, [baseExpenses]);

  const maxCategoryTotal = Math.max(...categoryRows.map((row) => row.total), 1);
  const hasSelection = selectedCategories.length > 0;

  const donutSlices = useMemo(() => {
    let cursor = 0;
    return entityShare.map(({ entity, amount }) => {
      const start = (cursor / donutTotal) * 360;
      cursor += amount;
      // Cap just under 360° so a single-entity slice still renders as an arc
      const end = Math.min((cursor / donutTotal) * 360, start + 359.98);
      return { entity, amount, start, end };
    });
  }, [entityShare, donutTotal]);

  if (categoryRows.length === 0) {
    return (
      <div className="card p-8 text-center">
        <PieChart className="w-12 h-12 text-stone-300 mx-auto mb-3" />
        <p className="text-stone-500 text-sm">No expense data for the selected filters</p>
      </div>
    );
  }

  return (
    <div className="card p-3 sm:p-5 md:p-6">
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">
            Who Paid for What
          </h3>
          <p className="mt-1 text-xs text-stone-500">
            Each bar is split by paying company • Click categories to filter transactions
          </p>
        </div>
        {hasSelection && (
          <button
            onClick={onClearCategories}
            className="btn-ghost min-h-[36px] self-start px-3 py-1.5 text-xs sm:self-auto"
          >
            <X className="w-3.5 h-3.5" />
            <span>
              Clear {selectedCategories.length} categor
              {selectedCategories.length === 1 ? 'y' : 'ies'}
            </span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
        {/* Entity share donut — reflects the current category selection */}
        <div className="flex flex-col items-center gap-4">
          <div className="relative h-44 w-44">
            <svg
              viewBox="0 0 200 200"
              className="h-full w-full"
              role="img"
              aria-label="Company share of selected expenses"
            >
              {donutSlices.map(({ entity, amount, start, end }) => (
                <path
                  key={entity}
                  d={donutSlicePath(100, 100, 90, 58, start, end)}
                  fill={entityColorMap[entity]}
                  stroke="#ffffff"
                  strokeWidth={2}
                >
                  <title>
                    {`${entity}: ${formatAmount(amount)} (${((amount / donutTotal) * 100).toFixed(1)}%)`}
                  </title>
                </path>
              ))}
            </svg>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[9px] font-semibold uppercase tracking-[0.15em] text-stone-400">
                {hasSelection ? 'Selected' : 'Total'}
              </span>
              <span className="font-display text-lg font-bold tracking-tight tabular-nums text-stone-900">
                {formatAmount(donutTotal)}
              </span>
            </div>
          </div>

          {/* Legend doubles as the exact-number readout */}
          <div className="w-full space-y-1.5">
            {entityShare.map(({ entity, amount }) => (
              <div key={entity} className="flex items-center gap-2 text-sm">
                <span
                  aria-hidden="true"
                  className="h-2.5 w-2.5 flex-shrink-0 rounded-sm"
                  style={{ backgroundColor: entityColorMap[entity] }}
                />
                <span className="min-w-0 flex-1 truncate text-stone-700" title={entity}>
                  {entity}
                </span>
                <span className="font-semibold tabular-nums text-stone-900">
                  {formatAmount(amount)}
                </span>
                <span className="w-11 text-right text-xs tabular-nums text-stone-400">
                  {((amount / donutTotal) * 100).toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Category rows — stacked by entity, click to filter */}
        <div className="space-y-1">
          {categoryRows.map(({ category, total, byEntity }) => {
            const isSelected = selectedCategories.includes(category);
            const isDimmed = hasSelection && !isSelected;
            const barWidth = (total / maxCategoryTotal) * 100;
            const segments = entityOrder
              .filter((entity) => byEntity[entity])
              .map((entity) => ({ entity, amount: byEntity[entity] }));

            return (
              <div
                key={category}
                onClick={() => onToggleCategory(category)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onToggleCategory(category);
                  }
                }}
                role="button"
                tabIndex={0}
                aria-pressed={isSelected}
                className={`group cursor-pointer rounded-lg border p-2.5 transition-all duration-150 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1 ${
                  isSelected
                    ? 'border-brand-300 bg-brand-50/50 shadow-elevation-1'
                    : 'border-transparent hover:border-stone-200 hover:bg-stone-50'
                } ${isDimmed ? 'opacity-50' : ''}`}
              >
                <div className="mb-1.5 flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border transition-colors ${
                      isSelected
                        ? 'border-brand-600 bg-brand-600 text-white'
                        : 'border-stone-300 bg-white group-hover:border-brand-400'
                    }`}
                  >
                    {isSelected && <Check className="h-3 w-3" strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-stone-900">
                    {category}
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-stone-900">
                    {formatAmount(total)}
                  </span>
                </div>
                {/* Bar length = category size; segments = entity split */}
                <div className="ml-6">
                  <div
                    className="flex h-3 overflow-hidden rounded-sm"
                    style={{ width: `${barWidth}%`, minWidth: '2rem' }}
                  >
                    {segments.map(({ entity, amount }, index) => (
                      <div
                        key={entity}
                        className="h-full transition-all duration-300"
                        style={{
                          width: `${(amount / total) * 100}%`,
                          backgroundColor: entityColorMap[entity],
                          marginLeft: index > 0 ? '2px' : undefined,
                        }}
                        title={`${entity}: ${formatAmount(amount)} (${((amount / total) * 100).toFixed(1)}%)`}
                      />
                    ))}
                  </div>
                  {/* Exact split appears when the row is selected */}
                  {isSelected && segments.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                      {segments.map(({ entity, amount }) => (
                        <span
                          key={entity}
                          className="flex items-center gap-1.5 text-xs text-stone-600"
                        >
                          <span
                            aria-hidden="true"
                            className="h-2 w-2 rounded-sm"
                            style={{ backgroundColor: entityColorMap[entity] }}
                          />
                          {entity}:
                          <span className="font-semibold tabular-nums text-stone-900">
                            {formatAmount(amount)}
                          </span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
